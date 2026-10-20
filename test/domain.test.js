const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeArea, shouldBlockNewAction, toIsoFromPtBr, formatPtBr } = require('../src/domain');

test('normalizeArea usa fallback quando valor é inválido', () => {
  assert.equal(normalizeArea('nada a ver'), 'Energia & Ritmo');
});

test('normalizeArea mantém área válida', () => {
  assert.equal(normalizeArea('Relacionamento'), 'Relacionamento');
});

test('shouldBlockNewAction bloqueia com 2 pendentes', () => {
  assert.equal(shouldBlockNewAction(2), true);
});

test('shouldBlockNewAction não bloqueia com 1 pendente', () => {
  assert.equal(shouldBlockNewAction(1), false);
});

test('toIsoFromPtBr converte data válida em ISO', () => {
  const iso = toIsoFromPtBr('25/12/2026 20:00');
  assert.ok(iso);
  const date = new Date(iso);
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 11);
  assert.equal(date.getDate(), 25);
  assert.equal(date.getHours(), 20);
  assert.equal(date.getMinutes(), 0);
});

test('toIsoFromPtBr rejeita data inexistente (31/02)', () => {
  assert.equal(toIsoFromPtBr('31/02/2026 20:00'), null);
});

test('toIsoFromPtBr rejeita 29/02 em ano não bissexto', () => {
  assert.equal(toIsoFromPtBr('29/02/2026 20:00'), null);
});

test('toIsoFromPtBr rejeita mês/hora fora do intervalo', () => {
  assert.equal(toIsoFromPtBr('32/13/2026 20:00'), null);
  assert.equal(toIsoFromPtBr('10/10/2026 25:00'), null);
});

test('toIsoFromPtBr rejeita texto sem data', () => {
  assert.equal(toIsoFromPtBr('sem data nenhuma'), null);
  assert.equal(toIsoFromPtBr(''), null);
  assert.equal(toIsoFromPtBr(null), null);
});

test('toIsoFromPtBr faz round-trip com formatPtBr (vírgula do pt-BR)', () => {
  const date = new Date(2026, 11, 25, 20, 0, 0, 0);
  const humano = formatPtBr(date);
  assert.match(humano, /,/, 'pt-BR usa vírgula entre data e hora');
  assert.equal(toIsoFromPtBr(humano), date.toISOString());
});

test('formatPtBr não depende do ICU (small-icu cairia para en-US)', () => {
  // Com `toLocaleString('pt-BR')`, um Node sem dados de locale pt-BR
  // devolveria "12/25/2026, 20:00": o usuário veria a data no formato
  // americano e o app não conseguiria reinterpretar o próprio prazo.
  const date = new Date(2026, 11, 25, 20, 0, 0, 0);
  assert.equal(formatPtBr(date), '25/12/2026, 20:00');
  assert.equal(formatPtBr(new Date(2026, 0, 5, 9, 7, 0, 0)), '05/01/2026, 09:07');
});
