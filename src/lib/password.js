'use strict';

const crypto = require('crypto');

/**
 * Hash de senha com Argon2id (preferencial) e fallback para scrypt do Node
 * (caso o binário nativo do argon2 não esteja disponível no host).
 *
 * O hash armazenado é auto-descritivo: começa com `$argon2id$` ou `scrypt$`,
 * permitindo verificação sem configuração externa.
 */

let argon2 = null;
try {
  // eslint-disable-next-line global-require
  argon2 = require('@node-rs/argon2');
} catch (_error) {
  argon2 = null;
}

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function scryptHash(password) {
  const salt = crypto.randomBytes(16);
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      SCRYPT.keylen,
      { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p },
      (error, derived) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(
          `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${derived.toString('base64')}`
        );
      }
    );
  });
}

function scryptVerify(password, stored) {
  const parts = stored.split('$');
  if (parts.length !== 6) {
    return false;
  }
  const [, N, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');

  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      expected.length,
      { N: Number(N), r: Number(r), p: Number(p) },
      (error, derived) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derived.length === expected.length && crypto.timingSafeEqual(derived, expected));
      }
    );
  });
}

async function hash(password) {
  if (argon2) {
    return argon2.hash(password);
  }
  return scryptHash(password);
}

async function verify(password, stored) {
  if (!stored) {
    return false;
  }
  try {
    if (stored.startsWith('$argon2')) {
      if (!argon2) {
        return false;
      }
      return await argon2.verify(stored, password);
    }
    if (stored.startsWith('scrypt$')) {
      return await scryptVerify(password, stored);
    }
    return false;
  } catch (_error) {
    return false;
  }
}

module.exports = { hash, verify, algorithm: argon2 ? 'argon2id' : 'scrypt' };
