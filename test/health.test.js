'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/db');
const metrics = require('../src/lib/metrics');
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

test('health: responde status e uptime', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
    assert.equal(typeof data.uptime, 'number');
  });
});

test('ready: confirma acesso ao banco', async () => {
  await db.initDb();
  await withServer(async (base) => {
    const res = await fetch(`${base}/ready`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ready');
    assert.equal(data.db, db.dialect);
  });
});

test('metrics: expõe contadores no formato Prometheus', async () => {
  await db.initDb();
  metrics.reset();

  await withServer(async (base) => {
    await fetch(`${base}/health`);

    const res = await fetch(`${base}/metrics`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/plain/);

    const text = await res.text();
    assert.match(text, /# TYPE http_requests_total counter/);
    assert.match(text, /http_requests_total\{/);
    assert.match(text, /http_request_duration_seconds_bucket/);
  });
});

test('segurança: CSP sem inline e headers completos', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/`);
    const csp = res.headers.get('content-security-policy') || '';

    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /style-src 'self'/);
    assert.doesNotMatch(csp, /unsafe-inline/);

    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    assert.match(res.headers.get('permissions-policy') || '', /camera=\(\)/);
    assert.equal(res.headers.get('x-powered-by'), null);
  });
});

test('páginas legais: respondem sem extensão e falam de LGPD', async () => {
  await withServer(async (base) => {
    const privacidade = await fetch(`${base}/privacidade`);
    assert.equal(privacidade.status, 200);
    const privacidadeHtml = await privacidade.text();
    assert.match(privacidadeHtml, /direitos/i);
    assert.match(privacidadeHtml, /Exportar/);
    assert.match(privacidadeHtml, /Excluir/);

    for (const page of ['/termos', '/contato']) {
      const res = await fetch(`${base}${page}`);
      assert.equal(res.status, 200, `${page} deveria responder 200`);
    }
  });
});
