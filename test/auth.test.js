'use strict';

// Precisa vir antes de qualquer require que carregue src/config/env.js,
// para desativar o rate limit durante os testes (skip quando nodeEnv=test).
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/db');
const { createApp } = require('../src/http/app');

const skip = db.dialect !== 'sqlite';

/** Cliente HTTP mínimo com "cookie jar" e CSRF automático. */
class Client {
  constructor(base) {
    this.base = base;
    this.cookies = {};
  }

  header() {
    return Object.entries(this.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  }

  store(setCookies) {
    for (const raw of setCookies) {
      const pair = raw.split(';')[0];
      const separator = pair.indexOf('=');
      const key = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (!value) {
        delete this.cookies[key];
      } else {
        this.cookies[key] = value;
      }
    }
  }

  async request(method, path, body) {
    const headers = {};
    if (Object.keys(this.cookies).length) {
      headers.cookie = this.header();
    }
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      headers['x-csrf-token'] = this.csrfToken();
    }

    const response = await fetch(this.base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    this.store(response.headers.getSetCookie());
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (_error) {
        data = text;
      }
    }
    return { status: response.status, data };
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
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`;
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

test('auth: cadastro cria usuário, sessão e retorna /me', { skip }, async () => {
  await withServer(async (base) => {
    const client = await new Client(base).init();
    const email = uniqueEmail();

    const register = await client.post('/api/auth/register', {
      name: 'Maria Teste',
      email,
      password: 'senha12345'
    });

    assert.equal(register.status, 201);
    assert.equal(register.data.user.email, email);
    assert.equal(register.data.user.role, 'user');
    assert.equal(register.data.user.email_verified, false);
    assert.ok(client.cookies.praxis_session, 'cookie de sessão deve ser definido');
    assert.equal(register.data.user.password_hash, undefined);

    const me = await client.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.data.user.email, email);
    assert.equal(me.data.plan.id, 'free');
  });
});

test('auth: cadastro com e-mail duplicado retorna 409', { skip }, async () => {
  await withServer(async (base) => {
    const email = uniqueEmail();
    const first = await new Client(base).init();
    const created = await first.post('/api/auth/register', {
      name: 'Primeiro',
      email,
      password: 'senha12345'
    });
    assert.equal(created.status, 201);

    const second = await new Client(base).init();
    const duplicate = await second.post('/api/auth/register', {
      name: 'Segundo',
      email,
      password: 'senha12345'
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.data.error.code, 'email_taken');
  });
});

test('auth: rotas de aplicação exigem login', { skip }, async () => {
  await withServer(async (base) => {
    const anonymous = await new Client(base).init();
    const response = await anonymous.get('/api/meta');
    assert.equal(response.status, 401);
    assert.equal(response.data.error.code, 'unauthorized');
  });
});

test('auth: login válido e inválido', { skip }, async () => {
  await withServer(async (base) => {
    const email = uniqueEmail();
    const owner = await new Client(base).init();
    await owner.post('/api/auth/register', { name: 'Login', email, password: 'senha12345' });

    const wrong = await new Client(base).init();
    const wrongResponse = await wrong.post('/api/auth/login', { email, password: 'senha-errada' });
    assert.equal(wrongResponse.status, 401);

    const right = await new Client(base).init();
    const rightResponse = await right.post('/api/auth/login', { email, password: 'senha12345' });
    assert.equal(rightResponse.status, 200);
    assert.equal(rightResponse.data.user.email, email);
    assert.ok(right.cookies.praxis_session);
  });
});

test('auth: logout revoga a sessão', { skip }, async () => {
  await withServer(async (base) => {
    const client = await new Client(base).init();
    await client.post('/api/auth/register', {
      name: 'Logout',
      email: uniqueEmail(),
      password: 'senha12345'
    });

    const before = await client.get('/api/auth/me');
    assert.equal(before.status, 200);

    const logout = await client.post('/api/auth/logout');
    assert.equal(logout.status, 200);

    const after = await client.get('/api/auth/me');
    assert.equal(after.status, 401);
  });
});

test('auth: requisição mutante sem CSRF é rejeitada', { skip }, async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Sem CSRF', email: uniqueEmail(), password: 'senha12345' })
    });
    assert.equal(response.status, 403);
    const data = await response.json();
    assert.equal(data.error.code, 'csrf_invalid');
  });
});

test('auth: redefinição de senha revoga sessões existentes', { skip }, async () => {
  await withServer(async (base) => {
    const email = uniqueEmail();
    const client = await new Client(base).init();
    const register = await client.post('/api/auth/register', {
      name: 'Reset',
      email,
      password: 'senha-antiga1'
    });
    const resetToken = register.data.devVerificationToken; // token de verificação (dev)
    assert.ok(resetToken, 'token de dev deve ser retornado em ambiente não-produtivo');

    const forgot = await client.post('/api/auth/forgot-password', { email });
    assert.equal(forgot.status, 200);
    const token = forgot.data.devToken;
    assert.ok(token, 'token de reset deve ser retornado em ambiente não-produtivo');

    const reset = await client.post('/api/auth/reset-password', {
      token,
      password: 'senha-nova123'
    });
    assert.equal(reset.status, 200);

    // A sessão antiga deve ter sido revogada.
    const meWithOldSession = await client.get('/api/auth/me');
    assert.equal(meWithOldSession.status, 401);

    // Login com a nova senha funciona.
    const fresh = await new Client(base).init();
    const login = await fresh.post('/api/auth/login', { email, password: 'senha-nova123' });
    assert.equal(login.status, 200);
  });
});

test('auth: verificação de e-mail marca a conta', { skip }, async () => {
  await withServer(async (base) => {
    const client = await new Client(base).init();
    const register = await client.post('/api/auth/register', {
      name: 'Verifica',
      email: uniqueEmail(),
      password: 'senha12345'
    });
    const token = register.data.devVerificationToken;
    assert.ok(token);

    const verify = await client.post('/api/auth/verify-email', { token });
    assert.equal(verify.status, 200);
    assert.equal(verify.data.user.email_verified, true);

    const me = await client.get('/api/auth/me');
    assert.equal(me.data.user.email_verified, true);
  });
});

test('auth: validação de senha curta retorna 400', { skip }, async () => {
  await withServer(async (base) => {
    const client = await new Client(base).init();
    const response = await client.post('/api/auth/register', {
      name: 'Curta',
      email: uniqueEmail(),
      password: '123'
    });
    assert.equal(response.status, 400);
    assert.equal(response.data.error.code, 'bad_request');
  });
});
