'use strict';

const crypto = require('crypto');
const { config } = require('../../config/env');
const {
  SESSION_COOKIE,
  CSRF_COOKIE,
  CSRF_HEADER,
  SESSION_TTL_DAYS
} = require('../../config/constants');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Cookies relevantes para a API (o SPA é same-origin, então Lax basta). */
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.isProduction,
  path: '/',
  maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
};

// O cookie CSRF precisa ser legível pelo JS do SPA (double-submit).
const CSRF_COOKIE_OPTIONS = {
  httpOnly: false,
  sameSite: 'lax',
  secure: config.isProduction,
  path: '/'
};

/** Parser de cookies mínimo (evita a dependência cookie-parser). */
function parseCookieHeader(header) {
  const cookies = {};
  if (!header) {
    return cookies;
  }
  for (const chunk of header.split(';')) {
    const separator = chunk.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const key = chunk.slice(0, separator).trim();
    const rawValue = chunk.slice(separator + 1).trim();
    if (!key) {
      continue;
    }
    try {
      cookies[key] = decodeURIComponent(rawValue);
    } catch (_error) {
      cookies[key] = rawValue;
    }
  }
  return cookies;
}

/** Popula `req.cookies` a partir do header. */
function cookieParser(req, _res, next) {
  req.cookies = parseCookieHeader(req.headers.cookie);
  next();
}

/** Garante um token CSRF no cookie; devolve o valor atual. */
function ensureCsrfToken(req, res) {
  const existing = req.cookies?.[CSRF_COOKIE];
  if (existing) {
    return existing;
  }
  const token = crypto.randomBytes(32).toString('base64url');
  res.cookie(CSRF_COOKIE, token, CSRF_COOKIE_OPTIONS);
  req.cookies[CSRF_COOKIE] = token;
  return token;
}

function clearCsrfCookie(res) {
  res.clearCookie(CSRF_COOKIE, { ...CSRF_COOKIE_OPTIONS, maxAge: undefined });
}

/**
 * Proteção CSRF por double-submit: o valor do cookie precisa bater com o header
 * `x-csrf-token` em métodos que alteram estado. Requisições `GET` apenas
 * estabelecem o cookie quando ele ainda não existe.
 */
function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) {
    ensureCsrfToken(req, res);
    next();
    return;
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER];
  const valid =
    cookieToken &&
    headerToken &&
    cookieToken.length === headerToken.length &&
    crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));

  if (!valid) {
    res.status(403).json({
      error: {
        code: 'csrf_invalid',
        message: 'Sessão de segurança expirada. Recarregue a página e tente novamente.'
      },
      requestId: req.id
    });
    return;
  }

  next();
}

module.exports = {
  SESSION_COOKIE,
  CSRF_COOKIE,
  CSRF_HEADER,
  SESSION_COOKIE_OPTIONS,
  CSRF_COOKIE_OPTIONS,
  parseCookieHeader,
  cookieParser,
  ensureCsrfToken,
  clearCsrfCookie,
  csrfProtection
};
