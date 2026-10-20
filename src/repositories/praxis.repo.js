'use strict';

const db = require('../db');

const COLUMNS = `id, texto, acao_pratica, prazo_iso, prazo_humano, regra_minima,
  area, status, created_at, tags, completed_at`;

async function countPending(userId) {
  const row = await db.get(
    "SELECT COUNT(*) AS total FROM praxis_items WHERE user_id = ? AND status = 'pendente'",
    [userId]
  );
  return Number(row ? row.total : 0);
}

async function insert(userId, item) {
  return db.insertReturningId(
    `INSERT INTO praxis_items
      (user_id, texto, acao_pratica, prazo_iso, prazo_humano, regra_minima, area, status, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente', ?)`,
    [
      userId,
      item.texto,
      item.acaoPratica,
      item.prazoIso,
      item.prazoHumano,
      item.regraMinima,
      item.area,
      JSON.stringify(Array.isArray(item.tags) ? item.tags : [])
    ]
  );
}

async function getById(userId, id) {
  return db.get(`SELECT ${COLUMNS} FROM praxis_items WHERE id = ? AND user_id = ?`, [id, userId]);
}

async function listRecent(userId, limit = 100) {
  return db.all(
    `SELECT ${COLUMNS} FROM praxis_items WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    [userId, limit]
  );
}

async function listUpcoming(userId, fromIso, toIso) {
  return db.all(
    `SELECT ${COLUMNS} FROM praxis_items
     WHERE user_id = ? AND status = 'pendente' AND prazo_iso >= ? AND prazo_iso <= ?
     ORDER BY prazo_iso ASC`,
    [userId, fromIso, toIso]
  );
}

async function updateFields(userId, id, { status, area, tags, completedAt }) {
  await db.run(
    'UPDATE praxis_items SET status = ?, area = ?, tags = ?, completed_at = ? WHERE id = ? AND user_id = ?',
    [status, area, JSON.stringify(Array.isArray(tags) ? tags : []), completedAt || null, id, userId]
  );
  return getById(userId, id);
}

async function deleteById(userId, id) {
  const result = await db.run('DELETE FROM praxis_items WHERE id = ? AND user_id = ?', [
    id,
    userId
  ]);
  return result.changes;
}

module.exports = {
  countPending,
  insert,
  getById,
  listRecent,
  listUpcoming,
  updateFields,
  deleteById
};
