'use strict';

const express = require('express');
const reminderService = require('../../services/reminderService');
const { requireEntitlement } = require('../middleware/entitlements');
const { BadRequestError } = require('../../domain');

const router = express.Router();

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id)) {
    throw new BadRequestError('ID inválido.');
  }
  return id;
}

router.post('/remind/:id', requireEntitlement('reminders'), async (req, res, next) => {
  try {
    const praxisId = parseId(req.params.id);
    const remindAtIso = String(req.body?.remind_at_iso || '').trim();
    const channel = String(req.body?.channel || 'telegram').trim();
    const reminder = await reminderService.create({
      userId: req.user.id,
      praxisId,
      remindAtIso,
      channel
    });
    res.status(201).json(reminder);
  } catch (error) {
    next(error);
  }
});

router.get('/browser-reminders', async (req, res, next) => {
  try {
    res.json(await reminderService.dueByChannel('browser', req.user.id));
  } catch (error) {
    next(error);
  }
});

router.post('/browser-reminders/:id/sent', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    await reminderService.markSent(id, req.user.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
