'use strict';

const { config } = require('../config/env');
const usersRepo = require('../repositories/users.repo');
const sessionsRepo = require('../repositories/sessions.repo');
const authTokensRepo = require('../repositories/authTokens.repo');
const auditService = require('./auditService');
const password = require('../lib/password');
const { randomToken, hashToken, addMinutes } = require('../lib/tokens');
const { SESSION_TTL_DAYS } = require('../config/constants');
const logger = require('../lib/logger');
const email = require('../integrations/email');
const {
  normalizeEmail,
  assertValidEmail,
  assertValidPassword,
  assertValidName,
  getPlan,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  BadRequestError
} = require('../domain');

const VERIFICATION_TTL_MINUTES = 60 * 24;
const RESET_TTL_MINUTES = 60;

function isDev() {
  return config.nodeEnv !== 'production';
}

function publicUser(user) {
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    email_verified: Boolean(user.email_verified_at),
    timezone: user.timezone,
    created_at: user.created_at
  };
}

async function createSession(user, { ip, userAgent } = {}) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await sessionsRepo.create({
    userId: user.id,
    tokenHash: hashToken(token),
    userAgent,
    ip,
    expiresAt
  });
  return { token, expiresAt };
}

async function issueEmailVerification(user) {
  const token = randomToken(32);
  await authTokensRepo.createVerification({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: addMinutes(VERIFICATION_TTL_MINUTES)
  });

  const link = `${config.appUrl}/#/verificar-email?token=${token}`;
  try {
    await email.send({
      to: user.email,
      subject: 'Confirme seu e-mail no PRAXIS',
      text: `Confirme seu e-mail: ${link}`,
      html: `<p>Confirme seu e-mail clicando <a href="${link}">aqui</a>.</p>`
    });
  } catch (error) {
    // Falha de e-mail não deve impedir o cadastro; o usuário pode pedir reenvio.
    logger.warn({ err: error, userId: user.id }, '[auth] falha ao enviar verificação de e-mail');
  }

  return token;
}

async function register({
  name,
  email: rawEmail,
  password: rawPassword,
  timezone,
  acceptedTerms,
  ip,
  userAgent
}) {
  const emailAddr = normalizeEmail(rawEmail);
  assertValidName(name);
  assertValidEmail(emailAddr);
  assertValidPassword(rawPassword);
  if (
    acceptedTerms !== true &&
    String(acceptedTerms).toLowerCase() !== 'true' &&
    acceptedTerms !== 1 &&
    acceptedTerms !== '1'
  ) {
    throw new BadRequestError(
      'É necessário aceitar os Termos de Uso e a Política de Privacidade.',
      'terms_not_accepted'
    );
  }

  const existing = await usersRepo.findByEmail(emailAddr);
  if (existing) {
    throw new ConflictError('E-mail já cadastrado.', 'email_taken');
  }

  const passwordHash = await password.hash(rawPassword);
  const user = await usersRepo.create({
    email: emailAddr,
    passwordHash,
    name: String(name).trim(),
    timezone,
    termsAcceptedAt: new Date().toISOString()
  });

  const verificationToken = await issueEmailVerification(user);
  const session = await createSession(user, { ip, userAgent });
  await auditService.record({
    userId: user.id,
    action: 'auth.register',
    entity: 'user',
    entityId: user.id,
    ip
  });

  return {
    user: publicUser(user),
    session,
    devVerificationToken: isDev() && !email.isConfigured() ? verificationToken : undefined
  };
}

async function login({ email: rawEmail, password: rawPassword, ip, userAgent }) {
  const emailAddr = normalizeEmail(rawEmail);
  const user = await usersRepo.findByEmail(emailAddr);
  const valid =
    user && user.password_hash ? await password.verify(rawPassword, user.password_hash) : false;

  if (!valid) {
    await auditService.record({
      userId: user ? user.id : null,
      action: 'auth.login_failed',
      entity: 'user',
      ip,
      metadata: { email: emailAddr }
    });
    // Mensagem genérica para não revelar existência de conta.
    throw new UnauthorizedError('E-mail ou senha inválidos.');
  }

  if (user.status !== 'active') {
    throw new ForbiddenError('Conta desativada.');
  }

  const session = await createSession(user, { ip, userAgent });
  await auditService.record({ userId: user.id, action: 'auth.login', ip });
  return { user: publicUser(user), session };
}

async function logout({ tokenHash, userId, ip }) {
  if (tokenHash) {
    await sessionsRepo.revokeByTokenHash(tokenHash);
  }
  if (userId) {
    await auditService.record({ userId, action: 'auth.logout', ip });
  }
}

async function resolveUserFromSession(token) {
  if (!token) {
    return null;
  }

  const session = await sessionsRepo.findByTokenHash(hashToken(token));
  if (!session || session.revoked_at) {
    return null;
  }
  if (new Date(session.expires_at).getTime() < Date.now()) {
    return null;
  }

  const user = await usersRepo.findById(session.user_id);
  if (!user || user.status !== 'active') {
    return null;
  }

  return { user, session };
}

function me(user, planId = 'free') {
  const plan = getPlan(planId);
  return {
    user: publicUser(user),
    plan,
    entitlements: {
      aiGenerationsPerMonth: plan.aiGenerationsPerMonth,
      byok: plan.byok,
      reminders: plan.reminders,
      history: plan.history,
      weeklyReview: plan.weeklyReview
    }
  };
}

async function verifyEmail(token) {
  const record = await authTokensRepo.findVerificationByHash(hashToken(token));
  if (!record || record.used_at) {
    throw new BadRequestError('Token de verificação inválido.');
  }
  if (new Date(record.expires_at).getTime() < Date.now()) {
    throw new BadRequestError('Token de verificação expirado.');
  }

  await authTokensRepo.markVerificationUsed(record.id);
  await usersRepo.markEmailVerified(record.user_id);
  await auditService.record({ userId: record.user_id, action: 'auth.email_verified' });

  return publicUser(await usersRepo.findById(record.user_id));
}

async function forgotPassword({ email: rawEmail, ip }) {
  const emailAddr = normalizeEmail(rawEmail);
  const user = await usersRepo.findByEmail(emailAddr);
  let devToken;

  if (user) {
    const token = randomToken(32);
    await authTokensRepo.createReset({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: addMinutes(RESET_TTL_MINUTES)
    });

    const link = `${config.appUrl}/#/redefinir-senha?token=${token}`;
    try {
      await email.send({
        to: user.email,
        subject: 'Redefinição de senha do PRAXIS',
        text: `Redefina sua senha: ${link}`,
        html: `<p>Redefina sua senha clicando <a href="${link}">aqui</a>.</p>`
      });
    } catch (error) {
      logger.warn({ err: error, userId: user.id }, '[auth] falha ao enviar e-mail de reset');
    }

    if (isDev() && !email.isConfigured()) {
      devToken = token;
    }

    await auditService.record({ userId: user.id, action: 'auth.password_reset_requested', ip });
  }

  // Resposta idêntica exista ou não a conta (evita enumeração de e-mails).
  return { ok: true, devToken };
}

async function resetPassword({ token, password: rawPassword, ip }) {
  assertValidPassword(rawPassword);

  const record = await authTokensRepo.findResetByHash(hashToken(token));
  if (!record || record.used_at) {
    throw new BadRequestError('Token de redefinição inválido.');
  }
  if (new Date(record.expires_at).getTime() < Date.now()) {
    throw new BadRequestError('Token de redefinição expirado.');
  }

  const passwordHash = await password.hash(rawPassword);
  await usersRepo.updatePassword(record.user_id, passwordHash);
  await authTokensRepo.markResetUsed(record.id);
  await sessionsRepo.revokeAllForUser(record.user_id);
  await auditService.record({ userId: record.user_id, action: 'auth.password_reset', ip });

  return { ok: true };
}

module.exports = {
  SESSION_TTL_DAYS,
  publicUser,
  createSession,
  register,
  login,
  logout,
  resolveUserFromSession,
  me,
  verifyEmail,
  forgotPassword,
  resetPassword
};
