'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const { config } = require('../src/config/env');
const email = require('../src/integrations/email');
const metrics = require('../src/lib/metrics');
const alertService = require('../src/services/alertService');
const usageService = require('../src/services/usageService');
const alertsJob = require('../src/jobs/alerts.job');

function restoreConfig() {
  config.alerts.email = '';
  config.alerts.http5xxThreshold = 10;
  config.alerts.aiCostRatio = 0.8;
  config.ai.dailyBudgetUsd = 5;
}

test('alerta: sem ALERT_EMAIL fica só no log estruturado', async () => {
  restoreConfig();
  alertService.reset();
  metrics.reset();

  const result = await alertService.raise('teste_sem_email', 'Mensagem.');

  assert.equal(result.raised, true);
  assert.equal(result.emailed, false);
  assert.equal(result.reason, 'no_alert_email');
  assert.equal(
    metrics.getCounter('alerts_total', { key: 'teste_sem_email', severity: 'warning' }),
    1
  );
});

test('alerta: envia e-mail e respeita o cooldown', async () => {
  restoreConfig();
  config.alerts.email = 'ops@example.com';
  alertService.reset();
  metrics.reset();

  const originalSend = email.send;
  const originalIsConfigured = email.isConfigured;
  let sent = 0;

  email.isConfigured = () => true;
  email.send = async () => {
    sent += 1;
    return { delivered: true };
  };

  try {
    const first = await alertService.raise('teste_cooldown', 'Primeiro.', { a: 1 });
    const second = await alertService.raise('teste_cooldown', 'Segundo.', { a: 2 });

    assert.equal(first.emailed, true);
    assert.equal(second.emailed, false);
    assert.equal(second.reason, 'cooldown');
    assert.equal(sent, 1);
  } finally {
    email.send = originalSend;
    email.isConfigured = originalIsConfigured;
    restoreConfig();
  }
});

test('alerta: severidade critical usa o nível de erro e label próprio', async () => {
  restoreConfig();
  alertService.reset();
  metrics.reset();

  await alertService.raise('teste_critical', 'Falha grave.', {}, { severity: 'critical' });

  assert.equal(
    metrics.getCounter('alerts_total', { key: 'teste_critical', severity: 'critical' }),
    1
  );
});

test('alertas: pico de 5xx dispara uma vez por janela', async () => {
  restoreConfig();
  config.alerts.http5xxThreshold = 2;
  alertService.reset();
  metrics.reset();
  alertsJob.resetWindow();

  metrics.increment('http_requests_total', 'req', {
    method: 'GET',
    route: '/x',
    status: '500'
  });
  metrics.increment('http_requests_total', 'req', {
    method: 'GET',
    route: '/x',
    status: '503'
  });

  const first = await alertsJob.checkHttp5xx();
  assert.equal(first.delta, 2);
  assert.equal(
    metrics.getCounter('alerts_total', { key: 'http_5xx_spike', severity: 'critical' }),
    1
  );

  const second = await alertsJob.checkHttp5xx();
  assert.equal(second.delta, 0);
  assert.equal(
    metrics.getCounter('alerts_total', { key: 'http_5xx_spike', severity: 'critical' }),
    1
  );
});

test('alertas: custo de IA alerta ao atingir a fração do teto diário', async () => {
  restoreConfig();
  config.alerts.email = '';
  config.ai.dailyBudgetUsd = 5;
  config.alerts.aiCostRatio = 0.8;
  alertService.reset();
  metrics.reset();

  const original = usageService.costTodayUsd;
  usageService.costTodayUsd = async () => 4.2;

  try {
    const result = await alertsJob.checkAiCost();
    assert.equal(result.ratio, 0.84);
    assert.equal(
      metrics.getCounter('alerts_total', { key: 'ai_cost_threshold', severity: 'warning' }),
      1
    );
  } finally {
    usageService.costTodayUsd = original;
  }
});

test('alertas: sem orçamento diário a checagem é ignorada', async () => {
  restoreConfig();
  config.ai.dailyBudgetUsd = 0;
  alertService.reset();
  metrics.reset();

  const result = await alertsJob.checkAiCost();

  assert.equal(result.skipped, true);
  assert.equal(
    metrics.getCounter('alerts_total', { key: 'ai_cost_threshold', severity: 'warning' }),
    0
  );
});
