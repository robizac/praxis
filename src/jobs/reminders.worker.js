'use strict';

const { processDueReminders } = require('./reminders.job');
const logger = require('../lib/logger');

const intervalMs = process.env.REMINDER_WORKER_INTERVAL_MS || 30000;

async function loop() {
  try {
    const result = await processDueReminders();
    logger.info(result, '[reminder-worker] ciclo concluído');
  } catch (error) {
    logger.error({ err: error.message }, '[reminder-worker] falha no ciclo');
  }
}

function start() {
  logger.info(`[reminder-worker] iniciado; intervalo ${intervalMs}ms`);
  loop();
  setInterval(loop, intervalMs);
}

if (require.main === module) {
  start();
}

module.exports = { start, loop };
