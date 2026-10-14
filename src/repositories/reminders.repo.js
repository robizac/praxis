'use strict';

const db = require('../db');

async function create(userId, { praxisId, remindAtIso, channel }) {
  const id = await db.insertReturningId(
    `INSERT INTO reminders (user_id, praxis_id, remind_at_iso, channel, sent_at)
     VALUES (?, ?, ?, ?, NULL)`,
    [userId, praxisId, remindAtIso, channel]
  );
  return getById(id);
}

async function getById(id) {
  return db.get('SELECT * FROM reminders WHERE id = ?', [id]);
}

/**
 * Lembretes vencidos e não enviados.
 * `userId` é opcional: o worker de sistema usa sem escopo; a API usa com escopo.
 */
// Teto de tentativas por lembrete (evita retry infinito).
const MAX_ATTEMPTS = 5;

async function listDueByChannel(channel, nowIso, userId = null) {
  const base = `SELECT r.id, r.praxis_id, r.remind_at_iso, r.channel, r.user_id, r.attempts,
       p.acao_pratica, p.prazo_humano
     FROM reminders r
     JOIN praxis_items p ON p.id = r.praxis_id
     WHERE r.channel = ? AND r.sent_at IS NULL AND r.attempts < ${MAX_ATTEMPTS} AND r.remind_at_iso <= ?`;

  if (userId) {
    return db.all(`${base} AND r.user_id = ? ORDER BY r.remind_at_iso ASC`, [channel, nowIso, userId]);
  }
  return db.all(`${base} ORDER BY r.remind_at_iso ASC`, [channel, nowIso]);
}

/** Marca como enviado; com `userId`, só afeta lembrete do próprio usuário. */
async function markSent(id, nowIso, userId = null) {
  if (userId) {
    const result = await db.run(
      'UPDATE reminders SET sent_at = ? WHERE id = ? AND user_id = ?',
      [nowIso, id, userId]
    );
    return result.changes;
  }
  const result = await db.run('UPDATE reminders SET sent_at = ? WHERE id = ?', [nowIso, id]);
  return result.changes;
}

async function deleteByPraxis(praxisId) {
  await db.run('DELETE FROM reminders WHERE praxis_id = ?', [praxisId]);
}

/** Registra uma falha de envio: incrementa `attempts` e guarda `last_error`. */
async function markFailed(id, errorMessage, userId = null) {
  const message = errorMessage ? String(errorMessage).slice(0, 500) : null;
  const sql = userId
    ? 'UPDATE reminders SET attempts = attempts + 1, last_error = ? WHERE id = ? AND user_id = ?'
    : 'UPDATE reminders SET attempts = attempts + 1, last_error = ? WHERE id = ?';
  const params = userId ? [message, id, userId] : [message, id];
  const result = await db.run(sql, params);
  return result.changes;
}

/** Lembretes ativos (ainda não enviados) do usuário — base do entitlement `reminders`. */
async function countActiveByUser(userId) {
  const row = await db.get(
    'SELECT COUNT(*) AS total FROM reminders WHERE user_id = ? AND sent_at IS NULL',
    [userId]
  );
  return Number(row ? row.total : 0);
}

/** Todos os lembretes do usuário (exportação de dados / LGPD). */
async function listByUser(userId) {
  return db.all(
    `SELECT id, praxis_id, remind_at_iso, channel, sent_at, attempts, last_error
       FROM reminders WHERE user_id = ? ORDER BY remind_at_iso ASC`,
    [userId]
  );
}

module.exports = {
  MAX_ATTEMPTS,
  create,
  getById,
  listDueByChannel,
  listByUser,
  markSent,
  markFailed,
  deleteByPraxis,
  countActiveByUser
};
