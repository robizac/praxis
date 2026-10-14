'use strict';

const usersRepo = require('../repositories/users.repo');
const {
  REMINDER_CHANNELS,
  BadRequestError,
  NotFoundError
} = require('../domain');

const DEFAULT_CHANNEL = 'browser';
const DEFAULT_LEAD_MINUTES = 10;
const MAX_LEAD_MINUTES = 10080; // 7 dias

function toBool(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  const text = String(value).trim().toLowerCase();
  return text === 'true' || text === '1' || text === 'on' || text === 'yes';
}

function toLeadMinutes(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > MAX_LEAD_MINUTES) {
    throw new BadRequestError(`leadMinutes deve ser um inteiro entre 0 e ${MAX_LEAD_MINUTES}.`);
  }
  return number;
}

/** Mapeia a linha de `users` para o contrato público das preferências de lembrete. */
function mapReminderPrefs(user) {
  return {
    enabled: Number(user.reminder_default_enabled) === 1,
    channel: REMINDER_CHANNELS.includes(user.reminder_default_channel)
      ? user.reminder_default_channel
      : DEFAULT_CHANNEL,
    leadMinutes: Number.isInteger(user.reminder_default_lead_minutes)
      ? user.reminder_default_lead_minutes
      : DEFAULT_LEAD_MINUTES
  };
}

async function getReminderSettings(userId) {
  const user = await usersRepo.findById(userId);
  if (!user) {
    throw new NotFoundError('Usuário não encontrado.');
  }
  return mapReminderPrefs(user);
}

/** Atualização parcial: campos ausentes mantêm o valor atual. */
async function updateReminderSettings(userId, payload = {}) {
  const current = await getReminderSettings(userId);

  const enabled = payload.enabled === undefined ? current.enabled : toBool(payload.enabled);
  const channel =
    payload.channel === undefined || payload.channel === null || payload.channel === ''
      ? current.channel
      : String(payload.channel).trim();
  const leadMinutes =
    payload.leadMinutes === undefined ? current.leadMinutes : toLeadMinutes(payload.leadMinutes);

  if (!REMINDER_CHANNELS.includes(channel)) {
    throw new BadRequestError('channel deve ser telegram, email ou browser.');
  }

  await usersRepo.updateReminderPrefs(userId, { enabled, channel, leadMinutes });
  return getReminderSettings(userId);
}

module.exports = {
  mapReminderPrefs,
  getReminderSettings,
  updateReminderSettings,
  DEFAULT_CHANNEL,
  DEFAULT_LEAD_MINUTES,
  MAX_LEAD_MINUTES
};
