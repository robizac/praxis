'use strict';

const { config } = require('../config/env');
const { runMigrations } = require('./migrate');

/**
 * Seleciona o adaptador de banco: Postgres quando DATABASE_URL está definida,
 * caso contrário SQLite local (desenvolvimento/testes).
 */
const adapter = config.databaseUrl ? require('./postgres') : require('./sqlite');

async function initDb() {
  const executed = await runMigrations(adapter);
  if (executed.length) {
    console.log(`[db] migrações aplicadas (${adapter.dialect}): ${executed.join(', ')}`);
  }
  return executed;
}

module.exports = {
  ...adapter,
  initDb
};
