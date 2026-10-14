'use strict';

const express = require('express');
const telegramService = require('../../services/telegramService');

const router = express.Router();

/** Status do vínculo do Telegram do usuário. */
router.get('/telegram', async (req, res, next) => {
  try {
    res.json(await telegramService.getStatus(req.user.id));
  } catch (error) {
    next(error);
  }
});

/** Gera um código de pareamento (o usuário envia `/start <código>` ao bot). */
router.post('/telegram/link-code', async (req, res, next) => {
  try {
    res.status(201).json(await telegramService.generateLinkCode(req.user.id));
  } catch (error) {
    next(error);
  }
});

/** Desvincula o Telegram do usuário. */
router.delete('/telegram/link', async (req, res, next) => {
  try {
    res.json(await telegramService.unlink(req.user.id));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
