'use strict';

const auditRepo = require('../repositories/audit.repo');
const logger = require('../lib/logger');

/** Registra um evento sensível. Falhas de auditoria nunca quebram o fluxo principal. */
async function record({ userId, action, entity, entityId, metadata, ip }) {
  try {
    await auditRepo.insert({ userId, action, entity, entityId, metadata, ip });
  } catch (error) {
    logger.warn({ err: error, action }, '[audit] falha ao registrar evento');
  }
}

async function listRecent(limit = 100) {
  return auditRepo.listRecent(limit);
}

module.exports = { record, listRecent };
