'use strict';

const { randomUUID } = require('crypto');
const db = require('../db');

function nowIso() {
  return new Date().toISOString();
}

async function create({ userId, tokenHash, userAgent, ip, expiresAt }) {
  const id = randomUUID();
  await db.run(
    `INSERT INTO sessions
      (id, user_id, token_hash, user_agent, ip, expires_at, revoked_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
    [id, userId, tokenHash, userAgent || null, ip || null, expiresAt, nowIso()]
  );
  return id;
}

async function findByTokenHash(tokenHash) {
  return db.get('SELECT * FROM sessions WHERE token_hash = ?', [tokenHash]);
}

async function revoke(id) {
  await db.run('UPDATE sessions SET revoked_at = ? WHERE id = ?', [nowIso(), id]);
}

async function revokeByTokenHash(tokenHash) {
  await db.run('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?', [nowIso(), tokenHash]);
}

async function revokeAllForUser(userId) {
  await db.run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [
    nowIso(),
    userId
  ]);
}

module.exports = {
  nowIso,
  create,
  findByTokenHash,
  revoke,
  revokeByTokenHash,
  revokeAllForUser
};
