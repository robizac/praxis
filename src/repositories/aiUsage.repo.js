'use strict';

const { randomUUID } = require('crypto');
const db = require('../db');

/** Registra uma geração de IA (bem-sucedida) para medição/cotas. */
async function insert(entry) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const usage = entry.usage || {};

  await db.run(
    `INSERT INTO ai_usage
       (id, user_id, provider, source, model, prompt_tokens, completion_tokens,
        total_tokens, cost_usd, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      entry.userId,
      entry.provider,
      entry.source,
      entry.model || null,
      Number(usage.prompt_tokens || usage.promptTokens || 0),
      Number(usage.completion_tokens || usage.completionTokens || 0),
      Number(usage.total_tokens || usage.totalTokens || 0),
      Number(entry.costUsd || 0),
      now
    ]
  );

  return id;
}

/** Gerações gerenciadas (que consomem cota) desde um instante ISO. */
async function countManagedSince(userId, fromIso) {
  const row = await db.get(
    `SELECT COUNT(*) AS total FROM ai_usage
      WHERE user_id = ? AND source = 'managed' AND created_at >= ?`,
    [userId, fromIso]
  );
  return Number(row ? row.total : 0);
}

/** Custo estimado (US$) das gerações gerenciadas desde um instante ISO. */
async function sumManagedCostSince(userId, fromIso) {
  const row = await db.get(
    `SELECT COALESCE(SUM(cost_usd), 0) AS total FROM ai_usage
      WHERE user_id = ? AND source = 'managed' AND created_at >= ?`,
    [userId, fromIso]
  );
  return Number(row ? row.total : 0);
}

/** Custo estimado (US$) global das gerações gerenciadas desde um instante ISO. */
async function sumAllManagedCostSince(fromIso) {
  const row = await db.get(
    `SELECT COALESCE(SUM(cost_usd), 0) AS total FROM ai_usage
      WHERE source = 'managed' AND created_at >= ?`,
    [fromIso]
  );
  return Number(row ? row.total : 0);
}

/** Uso de IA do usuário (exportação de dados / LGPD). */
async function listByUser(userId, limit = 5000) {
  return db.all(
    `SELECT id, provider, source, model, prompt_tokens, completion_tokens,
            total_tokens, cost_usd, created_at
       FROM ai_usage WHERE user_id = ? ORDER BY created_at ASC LIMIT ?`,
    [userId, limit]
  );
}

module.exports = {
  insert,
  countManagedSince,
  sumManagedCostSince,
  sumAllManagedCostSince,
  listByUser
};
