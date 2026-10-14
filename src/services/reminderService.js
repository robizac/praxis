'use strict';

const repo = require('../repositories/reminders.repo');
const praxisRepo = require('../repositories/praxis.repo');
const settingsService = require('./settingsService');
const usageService = require('./usageService');
const logger = require('../lib/logger');
const {
  REMINDER_CHANNELS,
  isValidChannel,
  BadRequestError,
  NotFoundError
} = require('../domain');

const CHANNELS = REMINDER_CHANNELS;

async function create({ userId, praxisId, remindAtIso, channel }) {
  if (!Number.isInteger(praxisId) || !remindAtIso) {
    throw new BadRequestError('ID e remind_at_iso são obrigatórios.');
  }

  if (!isValidChannel(channel)) {
    throw new BadRequestError('channel deve ser telegram, email ou browser.');
  }

  const item = await praxisRepo.getById(userId, praxisId);
  if (!item) {
    throw new NotFoundError('Item não encontrado.');
  }

  const reminderDate = new Date(remindAtIso);
  if (Number.isNaN(reminderDate.getTime())) {
    throw new BadRequestError('remind_at_iso inválido.');
  }

  return repo.create(userId, {
    praxisId,
    remindAtIso: reminderDate.toISOString(),
    channel
  });
}

/**
 * Cria o lembrete default ao gerar uma ação (Fase 7), conforme as preferências do
 * usuário. Nunca lança por cota/prazo: apenas retorna `null` quando não se aplica.
 */
async function createDefaultForItem({ userId, planId = 'free', praxisId, prazoIso }) {
  const settings = await settingsService.getReminderSettings(userId);
  if (!settings.enabled || !isValidChannel(settings.channel)) {
    return null;
  }

  const deadline = new Date(prazoIso).getTime();
  if (Number.isNaN(deadline)) {
    return null;
  }

  const remindAt = deadline - settings.leadMinutes * 60 * 1000;
  if (remindAt <= Date.now()) {
    return null;
  }

  const usage = await usageService.getRemindersUsage(userId, planId);
  if (!usage.canCreate) {
    logger.warn(
      { userId, praxisId, limit: usage.limit },
      '[reminders] cota de lembretes atingida; lembrete default não criado'
    );
    return null;
  }

  return repo.create(userId, {
    praxisId,
    remindAtIso: new Date(remindAt).toISOString(),
    channel: settings.channel
  });
}

/**
 * Lembretes vencidos de um canal.
 * `userId` é opcional: o worker de sistema usa sem escopo; a API usa com escopo.
 */
async function dueByChannel(channel, userId = null) {
  return repo.listDueByChannel(channel, new Date().toISOString(), userId);
}

async function markSent(id, userId = null) {
  const changes = await repo.markSent(id, new Date().toISOString(), userId);
  return changes > 0;
}

async function markFailed(id, errorMessage, userId = null) {
  const changes = await repo.markFailed(id, errorMessage, userId);
  return changes > 0;
}

module.exports = { create, createDefaultForItem, dueByChannel, markSent, markFailed, CHANNELS };
