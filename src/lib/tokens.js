'use strict';

const crypto = require('crypto');

/** Token opaco (URL-safe) para sessões e tokens de uso único. */
function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Hash SHA-256 (hex) — o token em claro nunca é persistido. */
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** Comparação em tempo constante de dois tokens em claro. */
function safeEqual(a, b) {
  const bufferA = Buffer.from(String(a));
  const bufferB = Buffer.from(String(b));
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufferA, bufferB);
}

function addMinutes(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

module.exports = { randomToken, hashToken, safeEqual, addMinutes };
