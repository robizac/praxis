'use strict';

let fallbackFetch = null;

/** Usa o `fetch` global (Node 18+) ou `node-fetch` como fallback. */
async function getFetch() {
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch;
  }
  if (!fallbackFetch) {
    const mod = await import('node-fetch');
    fallbackFetch = mod.default;
  }
  return fallbackFetch;
}

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

module.exports = { getFetch, withTimeout };
