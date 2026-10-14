'use strict';

/**
 * Aplica as migrações de banco. Idempotente.
 * Uso: npm run migrate
 */

const db = require('../src/db');

(async () => {
  try {
    const executed = await db.initDb();
    if (executed.length) {
      console.log(`Migrações aplicadas (${db.dialect}): ${executed.join(', ')}`);
    } else {
      console.log(`Banco já atualizado (${db.dialect}). Nada a migrar.`);
    }
    await db.close();
    process.exit(0);
  } catch (error) {
    console.error('Falha ao migrar:', error);
    process.exit(1);
  }
})();
