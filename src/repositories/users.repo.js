'use strict';

const { randomUUID } = require('crypto');
const db = require('../db');

function nowIso() {
  return new Date().toISOString();
}

async function create({ email, passwordHash, name, timezone, termsAcceptedAt }) {
  const id = randomUUID();
  const now = nowIso();
  const accepted = termsAcceptedAt || null;
  await db.run(
    `INSERT INTO users
      (id, email, password_hash, name, role, email_verified_at, timezone, status, created_at, updated_at, terms_accepted_at)
     VALUES (?, ?, ?, ?, 'user', NULL, ?, 'active', ?, ?, ?)`,
    [id, email, passwordHash, name, timezone || 'America/Sao_Paulo', now, now, accepted]
  );
  return findById(id);
}

async function findByEmail(email) {
  return db.get('SELECT * FROM users WHERE email = ?', [email]);
}

async function findById(id) {
  return db.get('SELECT * FROM users WHERE id = ?', [id]);
}

async function updatePassword(id, passwordHash) {
  await db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [
    passwordHash,
    nowIso(),
    id
  ]);
}

async function markEmailVerified(id) {
  const now = nowIso();
  await db.run('UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?', [
    now,
    now,
    id
  ]);
}

async function updateProfile(id, { name, timezone }) {
  await db.run('UPDATE users SET name = ?, timezone = ?, updated_at = ? WHERE id = ?', [
    name,
    timezone,
    nowIso(),
    id
  ]);
  return findById(id);
}

/** Atualiza preferências de lembrete default (Fase 7). */
async function updateReminderPrefs(id, { enabled, channel, leadMinutes }) {
  await db.run(
    `UPDATE users
        SET reminder_default_enabled = ?,
            reminder_default_channel = ?,
            reminder_default_lead_minutes = ?,
            updated_at = ?
      WHERE id = ?`,
    [enabled ? 1 : 0, channel, leadMinutes, nowIso(), id]
  );
  return findById(id);
}

module.exports = {
  nowIso,
  create,
  findByEmail,
  findById,
  updatePassword,
  markEmailVerified,
  updateProfile,
  updateReminderPrefs
};
