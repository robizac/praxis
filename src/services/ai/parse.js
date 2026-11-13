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

  let tasks = [];
  if (Array.isArray(parsed.tasks)) {
    tasks = parsed.tasks.map((t) => normalizePraxisPayload(t));
  } else if (Array.isArray(parsed)) {
    tasks = parsed.map((t) => normalizePraxisPayload(t));
  } else if (parsed.acao) {
    tasks = [normalizePraxisPayload(parsed)];
  }

  tasks = tasks.filter((t) => t.acao && t.prazo && t.regra_minima);
  if (!tasks.length) {
    return { ok: false, error: 'missing_fields', raw };
  }

  return { ok: true, data: { tasks } };
}

module.exports = { parsePraxisJson };
