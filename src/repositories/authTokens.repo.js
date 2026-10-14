'use strict';

const { randomUUID } = require('crypto');
const db = require('../db');

function nowIso() {
  return new Date().toISOString();
}

async function createReset({ userId, tokenHash, expiresAt }) {
  const id = randomUUID();
  await db.run(
    `INSERT INTO password_resets (id, user_id, token_hash, expires_at, used_at, created_at)
     VALUES (?, ?, ?, ?, NULL, ?)`,
    [id, userId, tokenHash, expiresAt, nowIso()]
  );
  return id;
}

async function findResetByHash(tokenHash) {
  return db.get('SELECT * FROM password_resets WHERE token_hash = ?', [tokenHash]);
}

async function markResetUsed(id) {
  await db.run('UPDATE password_resets SET used_at = ? WHERE id = ?', [nowIso(), id]);
}

async function createVerification({ userId, tokenHash, expiresAt }) {
  const id = randomUUID();
  await db.run(
    `INSERT INTO email_verifications (id, user_id, token_hash, expires_at, used_at, created_at)
     VALUES (?, ?, ?, ?, NULL, ?)`,
    [id, userId, tokenHash, expiresAt, nowIso()]
  );
  return id;
}

async function findVerificationByHash(tokenHash) {
  return db.get('SELECT * FROM email_verifications WHERE token_hash = ?', [tokenHash]);
}

async function markVerificationUsed(id) {
  await db.run('UPDATE email_verifications SET used_at = ? WHERE id = ?', [nowIso(), id]);
}

module.exports = {
  createReset,
  findResetByHash,
  markResetUsed,
  createVerification,
  findVerificationByHash,
  markVerificationUsed
};
