'use strict';

const { randomUUID } = require('crypto');
const pinoHttp = require('pino-http');
const logger = require('../../lib/logger');
const { config } = require('../../config/env');

/** Garante um request id correlacionável nos logs e na resposta. */
function requestContext(req, res, next) {
  req.id = req.headers['x-request-id'] || randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.id,
  autoLogging: config.nodeEnv !== 'test',
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} -> ${res.statusCode}`
});

module.exports = { requestContext, httpLogger };
