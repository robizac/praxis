'use strict';

process.env.NODE_ENV = 'test';
process.env.METRICS_TOKEN = 'test-metrics-token';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/http/app');

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

test('metrics: exige Bearer token quando METRICS_TOKEN está definido', async () => {
  await withServer(async (base) => {
    const semToken = await fetch(`${base}/metrics`);
    assert.equal(semToken.status, 401);

    const tokenErrado = await fetch(`${base}/metrics`, {
      headers: { authorization: 'Bearer errado' }
    });
    assert.equal(tokenErrado.status, 401);

    const ok = await fetch(`${base}/metrics`, {
      headers: { authorization: 'Bearer test-metrics-token' }
    });
    assert.equal(ok.status, 200);
    assert.match(await ok.text(), /http_requests_total|alerts_total/);
  });
});

test('metrics: token não afeta /health', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
  });
});
