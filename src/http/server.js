'use strict';

const { createApp } = require('./app');
const { initDb } = require('../db');
const { setupReminderScheduler } = require('../jobs/reminders.job');
const { config, loadConfig } = require('../config/env');
const { AREAS } = require('../domain');
const logger = require('../lib/logger');

async function start() {
  const { errors, warnings } = loadConfig();
  warnings.forEach((warning) => logger.warn(warning));

  if (errors.length) {
    throw new Error(`Configuração inválida:\n- ${errors.join('\n- ')}`);
  }

  await initDb();
  setupReminderScheduler();

  const app = createApp();

  return new Promise((resolve) => {
    const server = app.listen(config.port, '0.0.0.0', () => {
      logger.info(
        `PRAXIS rodando em ${config.appUrl} | provider=${config.ai.provider} | db=${require('../db').dialect}`
      );
      logger.info(`Áreas disponíveis: ${AREAS.join(', ')}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  start().catch((error) => {
    logger.error({ err: error }, 'Falha ao iniciar o servidor');
    process.exit(1);
  });
}

module.exports = { start, createApp };
