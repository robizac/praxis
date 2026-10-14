'use strict';

const { randomUUID } = require('crypto');
const db = require('../db');

function map(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    user_id: row.user_id,
    chat_id: row.chat_id,
    username: row.username,
    linked_at: row.linked_at,
    updated_at: row.updated_at
  };
}

async function getByUser(userId) {
  return map(await db.get('SELECT * FROM telegram_chats WHERE user_id = ?', [userId]));
}

async function getByChatId(chatId) {
  return map(await db.get('SELECT * FROM telegram_chats WHERE chat_id = ?', [chatId]));
}

/** Cria/atualiza o vínculo de Telegram do usuário (1 chat por usuário). */
async function upsert(userId, { chatId, username = null }) {
  const now = new Date().toISOString();
  const existing = await getByUser(userId);
  if (existing) {
    await db.run(
      'UPDATE telegram_chats SET chat_id = ?, username = ?, updated_at = ? WHERE user_id = ?',
      [String(chatId), username, now, userId]
    );
  } else {
    await db.run(
      `INSERT INTO telegram_chats (id, user_id, chat_id, username, linked_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [randomUUID(), userId, String(chatId), username, now, now]
    );
  }
  return getByUser(userId);
}

async function deleteByUser(userId) {
  const result = await db.run('DELETE FROM telegram_chats WHERE user_id = ?', [userId]);
  return result.changes;
}

module.exports = { getByUser, getByChatId, upsert, deleteByUser };
