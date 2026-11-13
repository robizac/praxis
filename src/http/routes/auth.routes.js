'use strict';

const express = require('express');
const { config } = require('../../config/env');
const authService = require('../../services/authService');
const { authLimiter } = require('../middleware/security');
const { ensureCsrfToken, CSRF_COOKIE } = require('../middleware/cookies');
const {
  requireAuth,
  setSessionCookie,
  clearSessionCookie,
  requestIp
} = require('../middleware/auth');

const router = express.Router();

// Endpoints de autenticação sofrem rate limit dedicado contra força bruta.
router.use(authLimiter);

// Emite/renova o cookie CSRF (double-submit) para o SPA.
router.get('/csrf', (req, res) => {
  const token = ensureCsrfToken(req, res);
  res.json({ csrfToken: token, cookie: CSRF_COOKIE });
});

router.post('/register', async (req, res, next) => {
  try {
    const result = await authService.register({
      name: req.body?.name,
      email: req.body?.email,
      password: req.body?.password,
      timezone: req.body?.timezone,
      acceptedTerms: req.body?.acceptedTerms ?? req.body?.consent ?? req.body?.terms,
      ip: requestIp(req),
      userAgent: req.headers['user-agent']
    });
    setSessionCookie(res, result.session.token);
    res.status(201).json({
      user: result.user,
      expiresAt: result.session.expiresAt,
      ...(result.devVerificationToken ? { devVerificationToken: result.devVerificationToken } : {})
    });
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const result = await authService.login({
      email: req.body?.email,
      password: req.body?.password,
      ip: requestIp(req),
      userAgent: req.headers['user-agent']
    });
    setSessionCookie(res, result.session.token);
    res.json({ user: result.user, expiresAt: result.session.expiresAt });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    await authService.logout({
      tokenHash: req.sessionTokenHash,
      userId: req.user?.id,
      ip: requestIp(req)
    });
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json(authService.me(req.user, req.user.plan || 'free'));
});

router.post('/verify-email', async (req, res, next) => {
  try {
    const user = await authService.verifyEmail(req.body?.token);
    res.json({ ok: true, user });
  } catch (error) {
    next(error);
  }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const result = await authService.forgotPassword({
      email: req.body?.email,
      ip: requestIp(req)
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const result = await authService.resetPassword({
      token: req.body?.token,
      password: req.body?.password,
      ip: requestIp(req)
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Google OAuth 2.0 (opcional — requer GOOGLE_CLIENT_ID/SECRET).
router.get('/google/status', (req, res) => {
  res.json({ configured: Boolean(config.google.clientId && config.google.clientSecret) });
});

router.get('/google', (req, res) => {
  if (!config.google.clientId || !config.google.clientSecret) {
    return res
      .status(503)
      .json({ error: { code: 'google_not_configured', message: 'Google OAuth não configurado.' } });
  }
  const state = require('crypto').randomBytes(16).toString('hex');
  res.cookie('praxis_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000
  });
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account'
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get('/google/callback', async (req, res, next) => {
  try {
    if (!config.google.clientId || !config.google.clientSecret) {
      return res.status(503).send('Google OAuth não configurado.');
    }
    const { code, state } = req.query;
    if (!code || !state || state !== req.cookies?.praxis_oauth_state) {
      return res.status(400).send('Estado OAuth inválido.');
    }
    res.clearCookie('praxis_oauth_state');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: config.google.redirectUri,
        grant_type: 'authorization_code'
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error('Falha ao obter token do Google.');
    }

    const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const profile = await userRes.json();
    if (!userRes.ok || !profile.email) {
      throw new Error('Falha ao obter perfil do Google.');
    }

    const result = await authService.googleLogin({
      email: profile.email,
      name: profile.name || profile.email,
      emailVerified: profile.email_verified !== false,
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent']
    });

    setSessionCookie(res, result.session.token);
    res.redirect('/app');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
