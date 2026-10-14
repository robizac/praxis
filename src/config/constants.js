'use strict';

/** Constantes compartilhadas entre camadas (sessão, cookies e CSRF). */
const SESSION_TTL_DAYS = 30;
const SESSION_COOKIE = 'praxis_session';
const CSRF_COOKIE = 'praxis_csrf';
const CSRF_HEADER = 'x-csrf-token';

module.exports = {
  SESSION_TTL_DAYS,
  SESSION_COOKIE,
  CSRF_COOKIE,
  CSRF_HEADER
};
