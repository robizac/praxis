'use strict';

const { config } = require('../config/env');
const logger = require('../lib/logger');

function isConfigured() {
  return Boolean(config.email.provider && config.email.apiKey);
}

/**
 * Envia e-mail transacional.
 * Sem provider configurado (dev), apenas registra no log e não falha.
 */
async function send({ to, subject, text, html }) {
  if (!isConfigured()) {
    logger.info({ to, subject }, '[email] provider não configurado — e-mail não enviado (dev)');
    return { delivered: false };
  }

  if (config.email.provider === 'resend') {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.email.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: config.email.from, to, subject, text, html })
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error({ status: response.status, body }, '[email] falha ao enviar via Resend');
      throw new Error('Falha ao enviar e-mail.');
    }

    return { delivered: true };
  }

  logger.warn({ provider: config.email.provider }, '[email] provider desconhecido');
  return { delivered: false };
}

module.exports = { send, isConfigured };
