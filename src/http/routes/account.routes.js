'use strict';

const express = require('express');
const accountService = require('../../services/accountService');
const authService = require('../../services/authService');
const { clearSessionCookie } = require('../middleware/auth');

const router = express.Router();

router.get('/account/profile', async (req, res, next) => {
  try {
    res.json(await authService.updateProfile(req.user.id, {}));
  } catch (error) {
    next(error);
  }
});

router.patch('/account/profile', async (req, res, next) => {
  try {
    const updated = await authService.updateProfile(req.user.id, {
      name: req.body?.name,
      timezone: req.body?.timezone
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.post('/account/change-password', async (req, res, next) => {
  try {
    const result = await authService.changePassword(req.user.id, {
      currentPassword: req.body?.currentPassword,
      newPassword: req.body?.newPassword
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/** Exporta os dados pessoais do usuário (LGPD — portabilidade). */
router.get('/account/export', async (req, res, next) => {
  try {
    const data = await accountService.exportData(req.user.id, { ip: req.ip });
    res.setHeader('Content-Disposition', 'attachment; filename="praxis-dados.json"');
    res.json(data);
  } catch (error) {
    next(error);
  }
});

/** Exclui a conta e todos os dados (LGPD — eliminação). */
router.delete('/account', async (req, res, next) => {
  try {
    const result = await accountService.deleteAccount(req.user.id, {
      confirm: req.body?.confirm
    });
    clearSessionCookie(res);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
