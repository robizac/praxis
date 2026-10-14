'use strict';

const db = require('../db');

async function getById(id) {
  return db.get('SELECT id, type, processed_at, created_at FROM stripe_events WHERE id = ?', [id]);
}

/**
 * Registra o evento e sinaliza se é a primeira vez (idempotência).
 * Retorna `true` quando inserido agora; `false` quando já existia (ou corrida).
 */
async function tryInsert(id, type, payload) {
  if (await getById(id)) {
    return false;
  }
  try {
    await db.run(
      'INSERT INTO stripe_events (id, type, payload, processed_at, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, type, payload || null, null, new Date().toISOString()]
    );
    return true;
  } catch (error) {
    // Corrida: outra instância inseriu o mesmo evento primeiro.
    if (/unique|duplicate/i.test(String(error.message))) {
      return false;
    }
    throw error;
  }
}

async function markProcessed(id) {
  await db.run('UPDATE stripe_events SET processed_at = ? WHERE id = ?', [
    new Date().toISOString(),
    id
  ]);
}

async function isProcessed(id) {
  const row = await getById(id);
  return Boolean(row && row.processed_at);
}

module.exports = { getById, tryInsert, markProcessed, isProcessed };
