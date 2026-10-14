'use strict';

const db = require('../db');

function mapRow(row) {
  if (!row) {
    return null;
  }
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;
  return {
    id: row.id,
    created_at: createdAt,
    respostas: {
      executei: row.executei,
      trouxe_paz: row.trouxe_paz,
      gerou_peso: row.gerou_peso,
      deve_sair: row.deve_sair
    },
    insights: row.insights || ''
  };
}

const COLUMNS = 'id, executei, trouxe_paz, gerou_peso, deve_sair, insights, created_at';

async function list(userId, limit = 100) {
  const rows = await db.all(
    `SELECT ${COLUMNS} FROM weekly_reviews WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    [userId, limit]
  );
  return rows.map(mapRow);
}

async function create(userId, payload) {
  const respostas = payload?.respostas || {};
  const id = await db.insertReturningId(
    `INSERT INTO weekly_reviews
      (user_id, executei, trouxe_paz, gerou_peso, deve_sair, insights, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      respostas.executei,
      respostas.trouxe_paz,
      respostas.gerou_peso,
      respostas.deve_sair,
      payload?.insights || null,
      new Date().toISOString()
    ]
  );

  return mapRow(await db.get(`SELECT ${COLUMNS} FROM weekly_reviews WHERE id = ?`, [id]));
}

module.exports = { mapRow, list, create };
