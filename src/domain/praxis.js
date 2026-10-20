'use strict';

const { normalizeArea } = require('./areas');

const DONE_STATUSES = ['feito', 'concluido', 'concluído'];

function normalizeStatus(status) {
  const value = String(status || '')
    .toLowerCase()
    .trim();
  return DONE_STATUSES.includes(value) ? 'feito' : 'pendente';
}

function sanitizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .slice(0, 10);
}

function toIsoFromPtBr(text) {
  const match = String(text || '').match(/(\d{2})\/(\d{2})\/(\d{4})[\s,]+(\d{2}):(\d{2})/);
  if (!match) {
    return null;
  }

  const [, day, month, year, hour, minute] = match;
  const d = Number(day);
  const m = Number(month) - 1;
  const y = Number(year);
  const h = Number(hour);
  const min = Number(minute);

  // `new Date` normaliza estouros (31/02 → 03/03, 25:00 → 01:00 do dia seguinte)
  // em vez de rejeitar. Comparamos os componentes de volta para garantir que a
  // data digitada existe de fato; caso contrário, é inválida.
  const localDate = new Date(y, m, d, h, min, 0, 0);
  if (
    Number.isNaN(localDate.getTime()) ||
    localDate.getFullYear() !== y ||
    localDate.getMonth() !== m ||
    localDate.getDate() !== d ||
    localDate.getHours() !== h ||
    localDate.getMinutes() !== min
  ) {
    return null;
  }

  return localDate.toISOString();
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

/**
 * Formata data no padrão pt-BR (`dd/mm/aaaa, hh:mm`).
 *
 * Não usa `toLocaleString('pt-BR')` de propósito: o resultado depende dos
 * dados de locale do ICU e, em builds small-icu (Node sem locale data),
 * sai em en-US ("12/25/2026, 20:00"). Isso quebra o round-trip com
 * `toIsoFromPtBr` — o app deixa de conseguir reinterpretar a própria data —
 * e mostra o prazo no formato americano para o usuário.
 */
function formatPtBr(dateLike) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const day = pad2(date.getDate());
  const month = pad2(date.getMonth() + 1);
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  return `${day}/${month}/${date.getFullYear()}, ${hour}:${minute}`;
}

/** Normaliza a saída crua do modelo para o contrato PRAXIS. */
function normalizePraxisPayload(payload) {
  const data = payload && typeof payload === 'object' ? payload : {};
  return {
    area: normalizeArea(data.area),
    acao: String(data.acao || '').trim(),
    prazo: String(data.prazo || '').trim(),
    regra_minima: String(data.regra_minima || '').trim()
  };
}

/** Fallback determinístico quando a IA não devolve JSON válido. */
function buildSafeFallback(texto, area) {
  const due = new Date(Date.now() + 24 * 60 * 60 * 1000);
  due.setHours(20, 0, 0, 0);
  return {
    area: normalizeArea(area),
    acao: `Aplique por 10 minutos: "${texto}".`,
    prazo: formatPtBr(due),
    regra_minima:
      'Se demorar mais de 2 minutos para começar, reduza para 3 minutos e execute agora.'
  };
}

/** Normaliza a coluna `tags` que pode vir como JSONB (array) ou TEXT. */
function parseTagsColumn(value) {
  if (Array.isArray(value)) {
    return sanitizeTags(value);
  }
  try {
    return sanitizeTags(JSON.parse(value || '[]'));
  } catch (_error) {
    return [];
  }
}

module.exports = {
  normalizeStatus,
  sanitizeTags,
  toIsoFromPtBr,
  formatPtBr,
  normalizePraxisPayload,
  buildSafeFallback,
  parseTagsColumn
};
