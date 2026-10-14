'use strict';

const db = require('../db');

async function create(code, userId, expiresAtIso) {
  await db.run(
    'INSERT INTO telegram_link_codes (code, user_id, expires_at, used_at, created_at) VALUES (?, ?, ?, NULL, ?)',
    [code, userId, expiresAtIso, new Date().toISOString()]
  );
  return getByCode(code);
}

async function getByCode(code) {
  return db.get('SELECT * FROM telegram_link_codes WHERE code = ?', [code]);
}

async function getActiveByUser(userId) {
  return db.get(
    'SELECT * FROM telegram_link_codes WHERE user_id = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1',
    [userId]
  );
}

async function markUsed(code) {
  const result = await db.run('UPDATE telegram_link_codes SET used_at = ? WHERE code = ? AND used_at IS NULL', [
    new Date().toISOString(),
    code
  ]);
  return result.changes;
}

/** Invalida códigos antigos (não usados) do usuário antes de gerar um novo. */
async function deleteUnusedByUser(userId) {
  await db.run('DELETE FROM telegram_link_codes WHERE user_id = ? AND used_at IS NULL', [userId]);
}

/** Remove códigos já usados ou expirados (mantém a tabela pequena e evita colisões). */
async function deleteStale(beforeIso) {
  const result = await db.run(
    'DELETE FROM telegram_link_codes WHERE used_at IS NOT NULL OR expires_at < ?',
    [beforeIso]
  );
  return result.changes;
}

module.exports = { create, getByCode, getActiveByUser, markUsed, deleteUnusedByUser, deleteStale };
