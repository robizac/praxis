'use strict';

const express = require('express');
const settingsService = require('../../services/settingsService');

const router = express.Router();

/** Preferências do usuário (Fase 7: lembrete default ao criar ação). */
router.get('/settings', async (req, res, next) => {
  try {
    const reminderDefault = await settingsService.getReminderSettings(req.user.id);
    res.json({ reminderDefault });
  } catch (error) {
    next(error);
  }
});

router.put('/settings', async (req, res, next) => {
  try {
    // Aceita o corpo plano ou aninhado em `reminderDefault`.
    const payload = req.body?.reminderDefault || req.body || {};
    const reminderDefault = await settingsService.updateReminderSettings(req.user.id, payload);
    res.json({ reminderDefault });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
