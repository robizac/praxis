'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const metrics = require('../src/lib/metrics');

test('metrics: contadores acumulam por labels', () => {
  metrics.reset();

  metrics.increment('test_total', 'Teste.', { result: 'ok' });
  metrics.increment('test_total', 'Teste.', { result: 'ok' });
  metrics.increment('test_total', 'Teste.', { result: 'erro' }, 2);

  assert.equal(metrics.getCounter('test_total', { result: 'ok' }), 2);
  assert.equal(metrics.getCounter('test_total', { result: 'erro' }), 2);
  assert.equal(metrics.getCounter('test_total', { result: 'inexistente' }), 0);
  assert.equal(metrics.getCounter('nao_existe'), 0);

  const entries = metrics.getCounters('test_total');
  assert.equal(entries.length, 2);
  assert.equal(metrics.getCounters('nao_existe').length, 0);
});

test('metrics: render segue o formato do Prometheus', () => {
  metrics.reset();
  metrics.increment('praxis_test_total', 'Contador de teste.', { a: '1' }, 3);
  metrics.observe('praxis_test_seconds', 'Histograma de teste.', [0.1, 1], 0.5, { rota: '/x' });

  const text = metrics.render();

  assert.match(text, /# HELP praxis_test_total Contador de teste\./);
  assert.match(text, /# TYPE praxis_test_total counter/);
  assert.match(text, /praxis_test_total\{a="1"\} 3/);

  assert.match(text, /# TYPE praxis_test_seconds histogram/);
  assert.match(text, /praxis_test_seconds_bucket\{rota="\/x",le="0.1"\} 0/);
  assert.match(text, /praxis_test_seconds_bucket\{rota="\/x",le="1"\} 1/);
  assert.match(text, /praxis_test_seconds_bucket\{rota="\/x",le="\+Inf"\} 1/);
  assert.match(text, /praxis_test_seconds_count\{rota="\/x"\} 1/);
});

test('metrics: contador sem valores aparece zerado', () => {
  metrics.reset();
  metrics.increment('praxis_zero_total', 'Zerado.', {}, 0);

  const text = metrics.render();
  assert.match(text, /# TYPE praxis_zero_total counter/);
  assert.match(text, /praxis_zero_total\{?/);
});

test('metrics: reset limpa o registry', () => {
  metrics.increment('praxis_reset_total', 'Reset.');
  assert.equal(metrics.getCounter('praxis_reset_total'), 1);

  metrics.reset();
  assert.equal(metrics.getCounter('praxis_reset_total'), 0);
  assert.doesNotMatch(metrics.render(), /praxis_reset_total/);
});
