'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const password = require('../src/lib/password');

test('password: hash e verify com sucesso', async () => {
  const stored = await password.hash('senha-super-secreta');
  assert.ok(typeof stored === 'string' && stored.length > 20);
  assert.equal(await password.verify('senha-super-secreta', stored), true);
});

test('password: hash gera valores distintos (salt)', async () => {
  const a = await password.hash('mesma-senha');
  const b = await password.hash('mesma-senha');
  assert.notEqual(a, b);
  assert.equal(await password.verify('mesma-senha', a), true);
  assert.equal(await password.verify('mesma-senha', b), true);
});

test('password: verify rejeita senha incorreta', async () => {
  const stored = await password.hash('correta');
  assert.equal(await password.verify('errada', stored), false);
});

test('password: verify trata hash vazio/inválido sem lançar', async () => {
  assert.equal(await password.verify('x', ''), false);
  assert.equal(await password.verify('x', null), false);
  assert.equal(await password.verify('x', 'formato-desconhecido'), false);
});
