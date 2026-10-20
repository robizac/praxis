'use strict';

const { createApp } = require('./app');
const { initDb } = require('../db');
const { setupReminderScheduler } = require('../jobs/reminders.job');
const { setupAlertScheduler } = require('../jobs/alerts.job');
const { config, loadConfig } = require('../config/env');
const { AREAS } = require('../domain');
const logger = require('../lib/logger');

async function start() {
  const { errors, warnings } = loadConfig();
  warnings.forEach((warning) => logger.warn(warning));

  if (errors.length) {
    // Saída explícita no stderr: garante que o motivo apareça nos logs do host
    // (ex.: Kymus) mesmo que o transporte do logger não esteja pronto.
    const message = `Configuração inválida — o processo não pode iniciar:\n- ${errors.join('\n- ')}`;
    logger.fatal(message);
    // eslint-disable-next-line no-console
    console.error(`\n[boot] ${message}\n`);
    throw new Error(message);
  }

  try {
    await initDb();
  } catch (error) {
    logger.fatal({ err: error }, 'Falha ao inicializar o banco de dados');
    // eslint-disable-next-line no-console
    console.error(`\n[boot] Falha ao inicializar o banco de dados: ${error.message}\n`);
    throw error;
  }

  setupReminderScheduler();
  setupAlertScheduler();

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
