'use strict';

const helmet = require('helmet');
const cors = require('cors');
const rateLimitModule = require('express-rate-limit');
const { config } = require('../../config/env');

const rateLimit = rateLimitModule.rateLimit || rateLimitModule.default || rateLimitModule;
const isTest = config.nodeEnv === 'test';

/**
 * Content Security Policy (Fase 8).
 *
 * Os assets saíram do HTML: o CSS e o JS vivem em arquivos servidos por
 * `/app` e `/` (`styles.css`, `app.js`), então não há mais `<script>` inline
 * executável — só blocos JSON-LD, que são data blocks e não passam pelo
 * `script-src`. Isso permite `script-src 'self'` (sem `'unsafe-inline'`),
 * que é a defesa principal contra XSS injetado no HTML.
 *
 * `style-src` mantém `'unsafe-inline'` por causa de atributos `style="..."`
 * pontuais no HTML (layout). Migrar esses atributos para classes é dívida
 * técnica registrada; atributos `style` não são executáveis, então o risco
 * é baixo comparado ao de script inline.
 *
 * `connect-src 'self'`: a SPA só fala com `/api/*` no mesmo origem.
 */
const contentSecurityPolicy = {
  directives: {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'frame-ancestors': ["'self'"],
    'form-action': ["'self'"],
    'script-src': ["'self'"],
    'script-src-attr': ["'none'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'"]
  }
};

const helmetMiddleware = helmet({
  contentSecurityPolicy,
  crossOriginEmbedderPolicy: false,
  // HSTS só faz sentido sob HTTPS (produção). Em dev (http) o browser ignora.
  hsts: config.isProduction
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
