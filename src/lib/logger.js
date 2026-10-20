'use strict';

const pino = require('pino');
const { config } = require('../config/env');

const logger = pino({
  level: config.logLevel,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.apiKey', '*.token', '*.password'],
    remove: true
  }
});

module.exports = logger;
