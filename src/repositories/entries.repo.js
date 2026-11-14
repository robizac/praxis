'use strict';

const db = require('../db');

async function create(userId, content) {
  return db.insertReturningId('INSERT INTO entries (user_id, content) VALUES (?, ?)', [
    userId,
    content
  ]);
}

async function listByUser(userId, limit = 100) {
  return db.all(
    'SELECT id, content, created_at FROM entries WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [userId, limit]
  );
}

async function deleteById(userId, id) {
  const result = await db.run('DELETE FROM entries WHERE id = ? AND user_id = ?', [id, userId]);
  return result.changes;
}

module.exports = { create, listByUser, deleteById };
