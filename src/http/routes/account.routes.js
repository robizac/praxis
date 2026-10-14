'use strict';

const express = require('express');
const accountService = require('../../services/accountService');
const { clearSessionCookie } = require('../middleware/auth');

const router = express.Router();

/** Exporta os dados pessoais do usuário (LGPD — portabilidade). */
router.get('/account/export', async (req, res, next) => {
  try {
    const data = await accountService.exportData(req.user.id);
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
