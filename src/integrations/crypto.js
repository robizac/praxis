'use strict';

const crypto = require('crypto');
const { config } = require('../config/env');
const { AppError } = require('../domain');

/**
 * Cifra/decifra segredos (chaves BYOK) com AES-256-GCM.
 *
 * A chave mestra vem de `AI_KEY_ENCRYPTION_SECRET` (secret manager do host).
 * Em desenvolvimento, se ausente, usa um valor fixo inseguro (apenas local) e
 * registra um aviso; em qualquer caso o valor em claro nunca é persistido.
 */

const SALT = 'praxis-ai-key-v1';
const DEV_FALLBACK_SECRET = 'praxis-dev-insecure-ai-key-do-not-use-in-prod';
const ALGO = 'aes-256-gcm';

let warned = false;
let cachedKey = null;

function masterKey() {
  if (cachedKey) {
    return cachedKey;
  }

  let secret = config.ai.keyEncryptionSecret;
  if (!secret) {
    if (config.isProduction) {
      throw new AppError('AI_KEY_ENCRYPTION_SECRET não configurada.', {
        status: 500,
        code: 'ai_key_secret_missing'
      });
    }
    secret = DEV_FALLBACK_SECRET;
    if (!warned) {
      warned = true;
      console.warn(
        '[crypto] AI_KEY_ENCRYPTION_SECRET ausente — usando chave de desenvolvimento. ' +
          'Nunca use este modo em produção.'
      );
    }
  }

  cachedKey = crypto.scryptSync(secret, SALT, 32);
  return cachedKey;
}

/** Cifra um texto e retorna os componentes em base64. */
function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, masterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64')
  };
}

/** Decifra os componentes gerados por `encryptSecret`. */
function decryptSecret({ ciphertext, iv, tag }) {
  const decipher = crypto.createDecipheriv(ALGO, masterKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final()
  ]);
  return decrypted.toString('utf8');
}

/** Últimos 4 caracteres para exibição mascarada (nunca expõe a chave). */
function last4(secret) {
  const value = String(secret || '');
  return value.length <= 4 ? value : value.slice(-4);
}

module.exports = { encryptSecret, decryptSecret, last4 };
