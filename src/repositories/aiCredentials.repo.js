'use strict';

const { randomUUID } = require('crypto');
const db = require('../db');

const COLUMNS = `id, user_id, provider, key_ciphertext, key_iv, key_tag, key_last4,
  base_url, model, status, created_at, updated_at`;

function toPublic(row) {
  if (!row) {
    return null;
  }
  return {
    provider: row.provider,
    key_last4: row.key_last4,
    base_url: row.base_url || '',
    model: row.model || '',
    status: row.status,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
  };
}

async function getByUser(userId) {
  return db.get(`SELECT ${COLUMNS} FROM ai_credentials WHERE user_id = ?`, [userId]);
}

/** Cria ou substitui a credencial do usuário (1 por usuário). */
async function upsert(userId, data) {
  const existing = await getByUser(userId);
  const now = new Date().toISOString();
  const values = [
    data.provider,
    data.keyCiphertext,
    data.keyIv,
    data.keyTag,
    data.keyLast4 || null,
    data.baseUrl || null,
    data.model || null,
    data.status || 'active'
  ];

  if (existing) {
    await db.run(
      `UPDATE ai_credentials
         SET provider = ?, key_ciphertext = ?, key_iv = ?, key_tag = ?, key_last4 = ?,
             base_url = ?, model = ?, status = ?, updated_at = ?
       WHERE user_id = ?`,
      [...values, now, userId]
    );
  } else {
    await db.run(
      `INSERT INTO ai_credentials
         (id, user_id, provider, key_ciphertext, key_iv, key_tag, key_last4,
          base_url, model, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), userId, ...values, now, now]
    );
  }

  return getByUser(userId);
}

async function deleteByUser(userId) {
  const result = await db.run('DELETE FROM ai_credentials WHERE user_id = ?', [userId]);
  return result.changes;
}

module.exports = { toPublic, getByUser, upsert, deleteByUser };
