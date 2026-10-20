'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../../db');
const metrics = require('../../lib/metrics');
const { config } = require('../../config/env');

const router = express.Router();

router.get('/health', (_req, res) => {
  // `ai` expõe apenas se o provider gerenciado tem chave configurada — nunca
  // o valor da chave. Sem isso, uma IA quebrada por configuração (chave
  // ausente/inválida) fica invisível: o app responde 200 e a geração só
  // falha quando alguém tenta usar.
  const ai = {
    provider: config.ai.provider,
    managedKeyConfigured: Boolean(
      config.ai.managedKeys?.[config.ai.provider] || config.ai.managedOpenaiKey
    ),
    defaultModel: config.ai.defaultModel
  };
  res.json({ status: 'ok', uptime: Math.round(process.uptime()), ai });
});

router.get('/ready', async (_req, res) => {
  try {
    await db.get('SELECT 1 AS ok');
    res.json({ status: 'ready', db: db.dialect });
  } catch (error) {
    res.status(503).json({ status: 'not_ready', error: error.message });
  }
});

/**
 * Métricas no formato de exposição do Prometheus (Fase 8).
 * Fica fora de `/api` (como os webhooks) para um coletor poder raspá-la
 * sem sessão; não expõe dados do usuário, só contadores agregados.
 * Com `METRICS_TOKEN` definido, exige `Authorization: Bearer <token>`.
 */
function isMetricsAuthorized(req) {
  if (!config.metricsToken) {
    return true;
  }
  const header = req.get('authorization') || '';
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) {
    return false;
  }
  const provided = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(config.metricsToken);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

router.get('/metrics', (req, res) => {
  if (!isMetricsAuthorized(req)) {
    res.status(401).json({
      error: { code: 'unauthorized', message: 'Token de métricas inválido.' }
    });
    return;
  }
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(metrics.render());
});

module.exports = router;
