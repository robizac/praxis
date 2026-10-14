'use strict';

const { randomUUID } = require('crypto');
const db = require('../db');

async function insert({ userId, action, entity, entityId, metadata, ip }) {
  await db.run(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id, metadata, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      userId || null,
      action,
      entity || null,
      entityId || null,
      metadata ? JSON.stringify(metadata) : null,
      ip || null,
      new Date().toISOString()
    ]
  );
}

async function listRecent(limit = 100) {
  return db.all('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?', [limit]);
}

module.exports = { insert, listRecent };
