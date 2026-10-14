'use strict';

const { normalizePraxisPayload } = require('../../domain');

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function extractFirstJsonObject(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  return match ? match[0] : '';
}

/**
 * Extrai e normaliza o JSON devolvido pelo modelo.
 * @returns {{ok: true, data: object} | {ok: false, error: string, raw: string}}
 */
function parsePraxisJson(rawText) {
  const raw = String(rawText || '').trim();
  let parsed = tryParseJson(raw);

  if (!parsed) {
    const candidate = extractFirstJsonObject(raw);
    if (candidate) {
      parsed = tryParseJson(candidate);
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'invalid_json', raw };
  }

  const normalized = normalizePraxisPayload(parsed);
  if (!normalized.acao || !normalized.prazo || !normalized.regra_minima) {
    return { ok: false, error: 'missing_fields', raw };
  }

  return { ok: true, data: normalized };
}

module.exports = { parsePraxisJson };
