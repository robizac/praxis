'use strict';

/**
 * Shim de compatibilidade.
 *
 * O código agora vive em `src/`. Este arquivo mantém `node server.js`
 * funcionando e reexporta a API principal para consumidores antigos.
 * Prefira: `npm start` (usa `src/http/server.js`).
 */

const { createApp, start } = require('./src/http/server');
const { parsePraxisJson } = require('./src/services/ai/parse');

if (require.main === module) {
  start().catch((error) => {
    console.error('[server] falha ao iniciar:', error);
    process.exit(1);
  });
}

module.exports = {
  app: createApp(),
  start,
  parsePraxisJson
};
