'use strict';

const express = require('express');
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
      ip: requestIp(req),
      userAgent: req.headers['user-agent']
    });
    setSessionCookie(res, result.session.token);
    res.status(201).json({
      user: result.user,
      expiresAt: result.session.expiresAt,
      ...(result.devVerificationToken
        ? { devVerificationToken: result.devVerificationToken }
        : {})
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

module.exports = router;
