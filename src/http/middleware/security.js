'use strict';

const helmet = require('helmet');
const cors = require('cors');
const rateLimitModule = require('express-rate-limit');
const { config } = require('../../config/env');

const rateLimit = rateLimitModule.rateLimit || rateLimitModule.default || rateLimitModule;
const isTest = config.nodeEnv === 'test';

/**
 * CSP desativada por enquanto: a SPA ainda usa CSS/JS inline.
 * Fase 8 externaliza os assets e habilita uma política restritiva.
 */
const helmetMiddleware = helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
});

const corsMiddleware = cors({
  origin: config.isProduction ? config.appUrl : true,
  credentials: true
});

function makeLimiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isTest,
    message: { error: { code: 'too_many_requests', message } }
  });
}

const apiLimiter = makeLimiter({
  windowMs: 60 * 1000,
  limit: 120,
  message: 'Muitas requisições. Aguarde um instante.'
});

const aiLimiter = makeLimiter({
  windowMs: 60 * 1000,
  limit: 30,
  message: 'Muitas gerações em pouco tempo. Aguarde um instante.'
});

// Proteção contra força bruta em cadastro/login/recuperação de senha.
const authLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
});

module.exports = { helmetMiddleware, corsMiddleware, apiLimiter, aiLimiter, authLimiter };
