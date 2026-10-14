'use strict';

const express = require('express');
const billingService = require('../../services/billingService');
const telegramService = require('../../services/telegramService');
const { config } = require('../../config/env');
const logger = require('../../lib/logger');

const router = express.Router();

/**
 * Webhook da Stripe (fonte da verdade — docs/10, 10.4).
 * Fora de `/api` (sem CSRF/sessão); corpo bruto preservado por `req.rawBody`.
 * Assinatura inválida → 400. Idempotente por `event.id`.
 */
router.post('/webhooks/stripe', async (req, res, next) => {
  try {
    const signature = req.get('stripe-signature');
    const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});
    const result = await billingService.handleWebhook(raw, signature);
    res.json({ received: true, duplicate: Boolean(result.duplicate) });
  } catch (error) {
    next(error);
  }
});

/**
 * Webhook do Telegram: vincula o chat ao usuário via `/start <código>`.
 * Sempre responde 200 (para não gerar reenvios); valida o secret token se configurado.
 */
router.post('/webhooks/telegram', async (req, res) => {
  if (config.telegram.webhookSecret) {
    const token = req.get('x-telegram-bot-api-secret-token');
    if (token !== config.telegram.webhookSecret) {
      res.status(401).json({ ok: false });
      return;
    }
  }

  try {
    const message = req.body?.message || req.body?.edited_message;
    if (message?.chat?.id) {
      const linked = await telegramService.handleIncomingMessage({
        chatId: message.chat.id,
        username: message.from?.username || null,
        text: message.text || ''
      });
      if (!linked) {
        logger.info({ chatId: message.chat.id }, '[telegram] mensagem sem vínculo válido');
      }
    }
  } catch (error) {
    logger.error({ error: error.message }, '[telegram] falha ao processar webhook');
  }

  res.json({ ok: true });
});

module.exports = router;
