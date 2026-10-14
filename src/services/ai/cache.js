'use strict';

const crypto = require('crypto');

/**
 * Cache em memória de gerações PRAXIS.
 *
 * Chave = hash de (texto normalizado + área + provider + modelo). Reutiliza o
 * resultado por 30 dias (docs/09, guardrail #3). É por processo — um cache
 * distribuído (Redis) fica para quando houver mais de uma instância.
 */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;

const store = new Map();

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function hashKey({ input, area, provider, model }) {
  return crypto
    .createHash('sha256')
    .update(`${normalizeText(input)}|${normalizeText(area)}|${provider || ''}|${model || ''}`)
    .digest('hex');
}

function get(key) {
  const entry = store.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() > entry.expires) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function set(key, value) {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
  store.set(key, { value, expires: Date.now() + TTL_MS });
}

function clear() {
  store.clear();
}

function size() {
  return store.size;
}

module.exports = { TTL_MS, MAX_ENTRIES, normalizeText, hashKey, get, set, clear, size };
