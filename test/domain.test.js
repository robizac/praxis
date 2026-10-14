const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeArea, shouldBlockNewAction } = require('../src/domain');

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
