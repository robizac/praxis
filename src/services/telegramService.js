'use strict';

const { randomInt } = require('crypto');
const { config } = require('../config/env');
const telegramChatsRepo = require('../repositories/telegramChats.repo');
const linkCodesRepo = require('../repositories/telegramLinkCodes.repo');
const telegram = require('../integrations/telegram');
const { AppError, BadRequestError } = require('../domain');

const CODE_TTL_MS = 15 * 60 * 1000;

function isConfigured() {
  return telegram.isConfigured();
}

/** Gera um código curto de pareamento (válido por 15 min), invalidando os anteriores. */
async function generateLinkCode(userId) {
  if (!isConfigured()) {
    throw new BadRequestError('Bot do Telegram não configurado (TELEGRAM_BOT_TOKEN).');
  }
  await linkCodesRepo.deleteUnusedByUser(userId);
  // Limpa códigos usados/expirados para reduzir colisões de PK.
  await linkCodesRepo.deleteStale(new Date().toISOString());

  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    const existing = await linkCodesRepo.getByCode(code);
    if (existing) {
      continue;
    }
    await linkCodesRepo.create(code, userId, expiresAt);
    return { code, expiresAt, botUsername: config.telegram.botUsername || null };
  }
  throw new AppError('Não foi possível gerar um código agora. Tente novamente.', {
    status: 503,
    code: 'telegram_code_unavailable'
  });
}

/**
 * Processa uma mensagem recebida pelo bot. Retorna o usuário vinculado ou null.
 * Aceita `/start <code>` ou `/vincular <code>`.
 */
async function handleIncomingMessage({ chatId, username, text }) {
  if (!chatId || !text) {
    return null;
  }
  const match = String(text).trim().match(/^\/(?:start|vincular)\s+(\d{4,8})\b/i);
  if (!match) {
    return null;
  }

  const code = match[1];
  const record = await linkCodesRepo.getByCode(code);
  if (!record || record.used_at) {
    return null;
  }
  if (new Date(record.expires_at).getTime() < Date.now()) {
    return null;
  }

  await linkCodesRepo.markUsed(code);
  const linked = await telegramChatsRepo.upsert(record.user_id, { chatId, username: username || null });
  return linked;
}

async function getStatus(userId) {
  const chat = await telegramChatsRepo.getByUser(userId);
  return {
    configured: isConfigured(),
    linked: Boolean(chat),
    chatId: chat ? chat.chat_id : null,
    username: chat ? chat.username : null,
    linkedAt: chat ? chat.linked_at : null
  };
}

async function unlink(userId) {
  const changes = await telegramChatsRepo.deleteByUser(userId);
  return { unlinked: changes > 0 };
}

module.exports = { isConfigured, generateLinkCode, handleIncomingMessage, getStatus, unlink };
