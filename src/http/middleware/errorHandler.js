'use strict';

const { AppError } = require('../../domain');
const logger = require('../../lib/logger');

function notFound(req, res) {
  res.status(404).json({
    error: { code: 'not_found', message: 'Rota não encontrada.' },
    requestId: req.id
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  const isAppError = err instanceof AppError;
  const status = isAppError ? err.status : 500;
  const code = isAppError ? err.code : 'internal_error';
  const message = isAppError && err.expose ? err.message : 'Erro interno do servidor.';

  const payload = {
    error: { code, message },
    requestId: req.id
  };

  if (isAppError && err.details) {
    payload.error.details = err.details;
  }

  if (status >= 500) {
    logger.error({ err, requestId: req.id }, message);
  }

  res.status(status).json(payload);
}

module.exports = { notFound, errorHandler };
