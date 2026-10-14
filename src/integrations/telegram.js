'use strict';

const { config } = require('../config/env');

function isConfigured() {
  return Boolean(config.telegram.botToken);
}

/**
 * Envia uma mensagem para um chat do Telegram.
 * `chatId` é opcional: sem ele, usa o chat global de `TELEGRAM_CHAT_ID` (legado);
 * com ele, o destino é o chat pareado pelo usuário (Fase 7).
 */
async function sendMessage(message, chatId = null) {
  const { botToken } = config.telegram;
  const target = chatId || config.telegram.chatId;
  if (!botToken || !target) {
    return false;
  }

  const fetch = globalThis.fetch;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: target, text: message })
  });

  return response.ok;
}

module.exports = { sendMessage, isConfigured };
