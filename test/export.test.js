'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/db');
const { createApp } = require('../src/http/app');

class Client {
  constructor(base) {
    this.base = base;
    this.cookies = {};
  }
  header() {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
  store(setCookies) {
    for (const raw of setCookies) {
      const pair = raw.split(';')[0];
      const sep = pair.indexOf('=');
      const key = pair.slice(0, sep).trim();
      const value = pair.slice(sep + 1).trim();
      if (!value) delete this.cookies[key];
      else this.cookies[key] = value;
    }
  }
  async request(method, path, body) {
    const headers = {};
    if (Object.keys(this.cookies).length) headers.cookie = this.header();
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      headers['x-csrf-token'] = this.csrfToken();
    }
    const res = await fetch(this.base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    this.store(res.headers.getSetCookie());
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (_e) {
      data = text;
    }
    return { status: res.status, data, headers: res.headers, text };
  }
  csrfToken() {
    return this.cookies.praxis_csrf || '';
  }
  get(path) {
    return this.request('GET', path);
  }
  post(path, body) {
    return this.request('POST', path, body);
  }
  async init() {
    await this.get('/api/auth/csrf');
    return this;
  }
}

function uniqueEmail() {
  return `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function withServer(run) {
  await db.initDb();
  const app = createApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const skip = db.dialect !== 'sqlite';

test('export: CSV retorna header e Content-Disposition', { skip }, async () => {
  await withServer(async (base) => {
    const client = await new Client(base).init();
    const email = uniqueEmail();
    await client.post('/api/auth/register', { name: 'Exp', email, password: 'senha12345' });

    const res = await client.get('/api/history/export?format=csv');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/csv/);
    assert.match(res.headers.get('content-disposition') || '', /praxis-historico\.csv/);
    assert.match(res.text, /id,created_at,area,status,texto,acao,prazo,regra_minima,tags/);
  });
});

test('export: Markdown retorna conteúdo', { skip }, async () => {
  await withServer(async (base) => {
    const client = await new Client(base).init();
    const email = uniqueEmail();
    await client.post('/api/auth/register', { name: 'Exp', email, password: 'senha12345' });

    const res = await client.get('/api/history/export?format=md');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/markdown/);
    assert.match(res.text, /# Histórico PRAXIS/);
  });
});

test('export: formato inválido retorna 400', { skip }, async () => {
  await withServer(async (base) => {
    const client = await new Client(base).init();
    const email = uniqueEmail();
    await client.post('/api/auth/register', { name: 'Exp', email, password: 'senha12345' });

    const res = await client.get('/api/history/export?format=pdf');
    assert.equal(res.status, 400);
  });
});
