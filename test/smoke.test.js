'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/db');
const { createApp } = require('../src/http/app');
const { runSmoke } = require('../scripts/smoke');

async function withServer(run) {
  const app = createApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('smoke: funil básico (sem IA/Stripe) passa contra servidor real', async () => {
  await db.initDb();
  await withServer(async (base) => {
    const summary = await runSmoke({
      baseUrl: base,
      generate: false,
      checkout: false,
      metrics: false,
      keepAccount: false,
      log: () => {}
    });
    assert.equal(
      summary.fail,
      0,
      `falhas: ${JSON.stringify(summary.results.filter((r) => r.status === 'FAIL'))}`
    );
    assert.ok(summary.ok >= 6, `esperava >=6 ok, got ${summary.ok}`);
  });
});

test('smoke: falha de uso sem baseUrl lança erro', async () => {
  await assert.rejects(() => runSmoke({ baseUrl: null, log: () => {} }), /Base URL/);
});
