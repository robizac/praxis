'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');

const db = require('../src/db');
const { createApp } = require('../src/http/app');
const usersRepo = require('../src/repositories/users.repo');
const praxisRepo = require('../src/repositories/praxis.repo');
const remindersRepo = require('../src/repositories/reminders.repo');
const reviewsRepo = require('../src/repositories/reviews.repo');
const aiUsageRepo = require('../src/repositories/aiUsage.repo');
const accountRepo = require('../src/repositories/account.repo');
const settingsService = require('../src/services/settingsService');

const skip = db.dialect !== 'sqlite';

/** Cliente HTTP mínimo com cookie jar e CSRF (mesmo padrão dos outros testes). */
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
      if (value) {
        this.cookies[key] = value;
      } else {
        delete this.cookies[key];
      }
    }
  }

  async request(method, path, body) {
    const headers = {};
    if (Object.keys(this.cookies).length) headers.cookie = this.header();
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      headers['x-csrf-token'] = this.cookies.praxis_csrf || '';
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

  get(path) {
    return this.request('GET', path);
  }

  post(path, body) {
    return this.request('POST', path, body);
  }

  delete(path, body) {
    return this.request('DELETE', path, body);
  }

  async init() {
    await this.get('/api/auth/csrf');
    return this;
  }
}

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

async function register(client) {
  const email = `acc-${randomUUID()}@example.com`;
  const res = await client.post('/api/auth/register', {
    name: 'Conta Teste',
    email,
    password: 'SenhaForte123',
    acceptedTerms: true
  });
  assert.equal(res.status, 201);
  return res.data.user;
}

/** Popula dados variados do usuário para validar export/exclusão. */
async function seedUserData(userId) {
  const prazoIso = new Date(Date.now() + 3600000).toISOString();
  const praxisId = await praxisRepo.insert(userId, {
    texto: 'Aprendi algo',
    acaoPratica: 'Fazer algo',
    prazoIso,
    prazoHumano: 'em breve',
    regraMinima: 'Regra',
    area: 'Energia & Ritmo',
    tags: ['foco']
  });
  await remindersRepo.create(userId, { praxisId, remindAtIso: prazoIso, channel: 'telegram' });
  await reviewsRepo.create(userId, {
    respostas: { executei: 'sim', trouxe_paz: 'sim', gerou_peso: 'não', deve_sair: 'nada' },
    insights: 'ok'
  });
  await aiUsageRepo.insert({
    userId,
    provider: 'openai',
    source: 'managed',
    model: 'gpt-test',
    usage: { total_tokens: 42 },
    costUsd: 0.001
  });
  await settingsService.updateReminderSettings(userId, {
    enabled: true,
    channel: 'telegram',
    leadMinutes: 20
  });
}

test('export: exige autenticação', { skip }, async () => {
  await db.initDb();
  await withServer(async (base) => {
    const client = await new Client(base).init();
    const res = await client.get('/api/account/export');
    assert.equal(res.status, 401);
  });
});

test('export: reúne os dados do usuário (praxis-export-v1)', { skip }, async () => {
  await db.initDb();
  await withServer(async (base) => {
    const client = await new Client(base).init();
    const user = await register(client);
    await seedUserData(user.id);

    const res = await client.get('/api/account/export');
    assert.equal(res.status, 200);
    assert.equal(res.data.format, 'praxis-export-v1');
    assert.equal(res.data.user.id, user.id);
    assert.equal(res.data.items.length, 1);
    assert.equal(res.data.items[0].acao, 'Fazer algo');
    assert.equal(res.data.reminders.length, 1);
    assert.equal(res.data.weeklyReviews.length, 1);
    assert.equal(res.data.aiUsage.length, 1);
    assert.equal(res.data.settings.reminderDefault.enabled, true);
    assert.equal(res.data.settings.reminderDefault.leadMinutes, 20);
    assert.equal(res.data.subscription, null);
  });
});

test('export: inclui o log de auditoria e registra o acesso', { skip }, async () => {
  await db.initDb();
  await withServer(async (base) => {
    const client = await new Client(base).init();
    await register(client);

    const res = await client.get('/api/account/export');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.auditLog));
    assert.ok(res.data.auditLog.some((entry) => entry.action === 'account.exported'));
    // O export não devolve o vínculo interno `user_id` do log.
    assert.ok(res.data.auditLog.every((entry) => entry.user_id === undefined));
  });
});

test('delete: exige a palavra de confirmação', { skip }, async () => {
  await db.initDb();
  await withServer(async (base) => {
    const client = await new Client(base).init();
    const user = await register(client);

    const wrong = await client.delete('/api/account', { confirm: 'apagar' });
    assert.equal(wrong.status, 400);
    // A conta continua existindo.
    assert.ok(await usersRepo.findById(user.id));

    const ok = await client.delete('/api/account', { confirm: 'EXCLUIR' });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.deleted, true);
  });
});

test('delete: apaga todos os dados e a sessão', { skip }, async () => {
  await db.initDb();
  await withServer(async (base) => {
    const client = await new Client(base).init();
    const user = await register(client);
    await seedUserData(user.id);

    const res = await client.delete('/api/account', { confirm: 'EXCLUIR' });
    assert.equal(res.status, 200);

    // Usuário e dados relacionados removidos.
    assert.ok(!(await usersRepo.findById(user.id)));
    const items = await db.get('SELECT COUNT(*) AS total FROM praxis_items WHERE user_id = ?', [
      user.id
    ]);
    assert.equal(Number(items.total), 0);
    const reminders = await db.get('SELECT COUNT(*) AS total FROM reminders WHERE user_id = ?', [
      user.id
    ]);
    assert.equal(Number(reminders.total), 0);
    const reviews = await db.get('SELECT COUNT(*) AS total FROM weekly_reviews WHERE user_id = ?', [
      user.id
    ]);
    assert.equal(Number(reviews.total), 0);
    const usage = await db.get('SELECT COUNT(*) AS total FROM ai_usage WHERE user_id = ?', [
      user.id
    ]);
    assert.equal(Number(usage.total), 0);

    // Sessão encerrada: export não autentica mais.
    const after = await client.get('/api/account/export');
    assert.equal(after.status, 401);
  });
});

test('delete: registra o evento account.deleted sem PII', { skip }, async () => {
  await db.initDb();
  await withServer(async (base) => {
    const client = await new Client(base).init();
    const user = await register(client);

    const before = await db.get('SELECT COUNT(*) AS total FROM audit_log WHERE action = ?', [
      'account.deleted'
    ]);

    const res = await client.delete('/api/account', { confirm: 'EXCLUIR' });
    assert.equal(res.status, 200);

    const after = await db.get('SELECT COUNT(*) AS total FROM audit_log WHERE action = ?', [
      'account.deleted'
    ]);
    assert.equal(Number(after.total), Number(before.total) + 1);

    const rows = await db.all(
      `SELECT user_id, entity_id, metadata FROM audit_log
        WHERE action = ? AND metadata IS NOT NULL
        ORDER BY created_at DESC LIMIT 1`,
      ['account.deleted']
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, null);
    assert.equal(rows[0].entity_id, null);

    const metadata = JSON.parse(rows[0].metadata);
    assert.equal(metadata.stripeCanceled, false);
    assert.ok(metadata.counts.users >= 1);
    assert.ok(!JSON.stringify(metadata).includes(user.id));
  });
});

test('delete: anonimiza o log de auditoria', { skip }, async () => {
  await db.initDb();
  const user = await usersRepo.create({
    email: `acc-audit-${randomUUID()}@example.com`,
    passwordHash: 'x',
    name: 'Auditoria'
  });
  const action = `test.action.${randomUUID()}`;
  await db.run(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id, metadata, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      user.id,
      action,
      null,
      null,
      JSON.stringify({ a: 1 }),
      '127.0.0.1',
      new Date().toISOString()
    ]
  );

  await accountRepo.anonymizeAuditLog(user.id);
  const rows = await db.all('SELECT user_id, ip, metadata FROM audit_log WHERE action = ?', [
    action
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_id, null);
  assert.equal(rows[0].ip, null);
  assert.equal(rows[0].metadata, null);

  await accountRepo.purgeUser(user.id);
  assert.ok(!(await usersRepo.findById(user.id)));
});
