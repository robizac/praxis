'use strict';

const { config } = require('../config/env');
const email = require('../integrations/email');
const logger = require('../lib/logger');
const metrics = require('../lib/metrics');

/**
 * Alertas operacionais (Fase 8).
 *
 * Todo alerta é sempre registrado no log estruturado (`alert: true`), o que
 * permite ao coletor de logs do host disparar notificações próprias. Se
 * `ALERT_EMAIL` estiver configurado **e** houver provider de e-mail, também
 * enviamos um e-mail para quem opera o serviço.
 *
 * O cooldown é em memória e por processo (`ALERT_COOLDOWN_MINUTES`, padrão 60):
 * evita uma enxurrada de e-mails quando um incidente gera muitos eventos.
 * Com múltiplas instâncias web, cada uma pode enviar um alerta — aceitável
 * para o volume atual; se virar problema, mover o cooldown para o banco.
 */

const cooldownMs = Math.max(0, config.alerts.cooldownMinutes) * 60 * 1000;
const lastRaisedAt = new Map();

function isCoolingDown(key, now = Date.now()) {
  const last = lastRaisedAt.get(key);
  return last !== undefined && now - last < cooldownMs;
}

function formatDetails(metadata) {
  return Object.entries(metadata || {})
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
}

/**
 * Dispara um alerta.
 * Retorna `{ raised, emailed, reason? }`; nunca lança (alerta não pode
 * derrubar o fluxo que o originou).
 */
async function raise(key, message, metadata = {}, { severity = 'warning' } = {}) {
  const log = severity === 'critical' ? logger.error.bind(logger) : logger.warn.bind(logger);
  log.call(logger, { alert: true, alertKey: key, severity, ...metadata }, `[alert] ${message}`);

  metrics.increment('alerts_total', 'Alertas operacionais disparados, por chave e severidade.', {
    key,
    severity
  });

  const result = { raised: true, emailed: false };

  if (isCoolingDown(key)) {
    return { ...result, reason: 'cooldown' };
  }
  if (!config.alerts.email) {
    return { ...result, reason: 'no_alert_email' };
  }
  if (!email.isConfigured()) {
    return { ...result, reason: 'email_not_configured' };
  }

  // Marca antes do envio: uma falha de e-mail não deve gerar retry em cascata.
  lastRaisedAt.set(key, Date.now());

  try {
    const details = formatDetails(metadata);
    await email.send({
      to: config.alerts.email,
      subject: `[PRAXIS][${severity}] ${key}`,
      text: details ? `${message}\n\n${details}` : message
    });
    return { ...result, emailed: true };
  } catch (error) {
    logger.error(
      { err: error.message, alertKey: key },
      '[alert] falha ao enviar alerta por e-mail'
    );
    return { ...result, reason: 'email_failed' };
  }
}

/** Zera os cooldowns (usado nos testes para isolar casos). */
function reset() {
  lastRaisedAt.clear();
}

module.exports = { raise, reset, isCoolingDown };
