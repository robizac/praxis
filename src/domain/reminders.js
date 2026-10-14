'use strict';

/** Canais de lembrete suportados (docs/05 RF-30). */
const REMINDER_CHANNELS = ['telegram', 'browser', 'email'];

function isValidChannel(channel) {
  return REMINDER_CHANNELS.includes(String(channel));
}

module.exports = { REMINDER_CHANNELS, isValidChannel };
