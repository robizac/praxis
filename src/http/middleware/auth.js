'use strict';

const authService = require('../../services/authService');
const billingService = require('../../services/billingService');
const { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } = require('./cookies');
const { UnauthorizedError, ForbiddenError } = require('../../domain');
const { hashToken } = require('../../lib/tokens');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function requestIp(req) {
  return req.ip || req.socket?.remoteAddress || null;
}

/**
 * Resolve o usuário autenticado a partir do cookie de sessão.
 * Sempre executa; apenas popula `req.user`/`req.session` quando há sessão válida.
 */
async function attachUser(req, _res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) {
      next();
      return;
    }

    const resolved = await authService.resolveUserFromSession(token);
    if (resolved) {
      req.user = resolved.user;
      req.session = resolved.session;
      req.sessionTokenHash = hashToken(token);
      req.authToken = token;
      // Plano efetivo (assinatura ativa/trial ⇒ plano do preço; senão free).
      try {
        req.user.plan = await billingService.resolvePlanId(req.user.id);
      } catch (_error) {
        req.user.plan = 'free';
      }
    }
    next();
  } catch (error) {
    next(error);
  }
}

/** Exige autenticação. */
function requireAuth(req, _res, next) {
  if (!req.user) {
    next(new UnauthorizedError('Faça login para continuar.'));
    return;
  }
  next();
}

/** Exige um papel específico (ex.: `admin`). */
function requireRole(role) {
  return (req, _res, next) => {
    if (!req.user) {
      next(new UnauthorizedError('Faça login para continuar.'));
      return;
    }
    if (req.user.role !== role) {
      next(new ForbiddenError('Você não tem permissão para esta ação.'));
      return;
    }
    next();
  };
}

/** Define o cookie de sessão a partir de um token recém-criado. */
function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { ...SESSION_COOKIE_OPTIONS, maxAge: undefined });
}

module.exports = {
  SAFE_METHODS,
  requestIp,
  attachUser,
  requireAuth,
  requireRole,
  setSessionCookie,
  clearSessionCookie
};
