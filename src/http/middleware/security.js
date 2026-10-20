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
 * HTML, CSS e JS são totalmente externos: o markup não tem `<script>` nem
 * `<style>`/`style="..."` inline (blocos JSON-LD são data blocks e não passam
 * pelo `script-src`). Isso permite `script-src 'self'` e `style-src 'self'`
 * sem `'unsafe-inline'`, a defesa principal contra XSS injetado no HTML.
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
    'style-src': ["'self'"],
    'img-src': ["'self'", 'data:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'"],
    // Sob HTTPS, força subrecursos a também usarem HTTPS. Em dev (http) isso
    // quebraria os assets locais, então só entra em produção.
    ...(config.isProduction ? { 'upgrade-insecure-requests': [] } : {})
  }
};

const helmetMiddleware = helmet({
  contentSecurityPolicy,
  crossOriginEmbedderPolicy: false,
  // HSTS só faz sentido sob HTTPS (produção). Em dev (http) o browser ignora.
  hsts: config.isProduction
});

/**
 * Headers que o helmet não cobre por padrão (Fase 8).
 * Negar por padrão APIs de browser que o app não usa reduz a superfície de
 * ataque (ex.: script injetado tentando acessar câmera/microfone).
 */
const permissionsPolicyMiddleware = (_req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
  );
  next();
};

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

module.exports = {
  helmetMiddleware,
  permissionsPolicyMiddleware,
  corsMiddleware,
  apiLimiter,
  aiLimiter,
  authLimiter
};
