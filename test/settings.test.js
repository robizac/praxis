'use strict';

// Precisa vir antes de qualquer require que carregue src/config/env.js
// para desativar o rate limit durante os testes (skip quando nodeEnv=test).
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');

const db = require('../src/db');
const { createApp } = require('../src/http/app');
const usersRepo = require('../src/repositories/users.repo');
const praxisRepo = require('../src/repositories/praxis.repo');
const settingsService = require('../src/services/settingsService');
const reminderService = require('../src/services/reminderService');
const usageService = require('../src/services/usageService');
const aiService = require('../src/services/ai/aiService');
const praxisService = require('../src/services/praxisService');

const skip = db.dialect !== 'sqlite';

async function createUser() {
  return usersRepo.create({
    email: `set-${randomUUID()}@example.com`,
    passwordHash: 'x',
    name: 'Config'
  });
}

async function createItem(userId, prazoIso) {
  return praxisRepo.insert(userId, {
    texto: 't',
    acaoPratica: 'Ação de teste',
    prazoIso,
    prazoHumano: 'em breve',
    regraMinima: 'r',
    area: 'Energia & Ritmo',
    tags: []
  });
}

test('settings: padrões do lembrete default', { skip }, async () => {
  await db.initDb();
  const user = await createUser();
  const settings = await settingsService.getReminderSettings(user.id);
  assert.deepEqual(settings, { enabled: false, channel: 'browser', leadMinutes: 10 });
});

test('settings: atualiza e valida preferências', { skip }, async () => {
  await db.initDb();
  const user = await createUser();

  const updated = await settingsService.updateReminderSettings(user.id, {
    enabled: true,
    channel: 'telegram',
    leadMinutes: 30
  });
  assert.deepEqual(updated, { enabled: true, channel: 'telegram', leadMinutes: 30 });

  // Campo ausente mantém o valor atual.
  const partial = await settingsService.updateReminderSettings(user.id, { leadMinutes: 15 });
  assert.deepEqual(partial, { enabled: true, channel: 'telegram', leadMinutes: 15 });

  await assert.rejects(
    () => settingsService.updateReminderSettings(user.id, { channel: 'sms' }),
    /channel/i
  );
  await assert.rejects(
    () => settingsService.updateReminderSettings(user.id, { leadMinutes: 99999 }),
    /leadMinutes/i
  );
});

test('lembrete default: cria ao gerar com preferências ativas', { skip }, async () => {
  await db.initDb();
  const user = await createUser();
  await settingsService.updateReminderSettings(user.id, {
    enabled: true,
    channel: 'telegram',
    leadMinutes: 10
  });

  const prazoIso = new Date(Date.now() + 3600000).toISOString();
  const itemId = await createItem(user.id, prazoIso);

  const reminder = await reminderService.createDefaultForItem({
    userId: user.id,
    praxisId: itemId,
    prazoIso
  });

  assert.ok(reminder);
  assert.equal(reminder.channel, 'telegram');
  assert.equal(reminder.praxis_id, itemId);
  const expected = new Date(new Date(prazoIso).getTime() - 10 * 60000).toISOString();
  assert.equal(new Date(reminder.remind_at_iso).toISOString(), expected);
});

test('lembrete default: desativado ou prazo vencido não cria', { skip }, async () => {
  await db.initDb();
  const user = await createUser();
  const future = new Date(Date.now() + 3600000).toISOString();
  const itemId = await createItem(user.id, future);

  // Desativado (padrão).
  assert.equal(
    await reminderService.createDefaultForItem({
      userId: user.id,
      praxisId: itemId,
      prazoIso: future
    }),
    null
  );

  // Ativado, mas prazo já vencido → não agenda no passado.
  await settingsService.updateReminderSettings(user.id, { enabled: true, channel: 'email' });
  const past = new Date(Date.now() - 3600000).toISOString();
  const pastItem = await createItem(user.id, past);
  assert.equal(
    await reminderService.createDefaultForItem({
      userId: user.id,
      praxisId: pastItem,
      prazoIso: past
    }),
    null
  );
});

test('lembrete default: respeita a cota sem lançar', { skip }, async () => {
  await db.initDb();
  const user = await createUser();
  await settingsService.updateReminderSettings(user.id, { enabled: true, channel: 'browser' });
  const future = new Date(Date.now() + 3600000).toISOString();
  const itemId = await createItem(user.id, future);

  const original = usageService.getRemindersUsage;
  usageService.getRemindersUsage = async () => ({ canCreate: false, limit: 20, used: 20 });
  try {
    assert.equal(
      await reminderService.createDefaultForItem({
        userId: user.id,
        praxisId: itemId,
        prazoIso: future
      }),
      null
    );
  } finally {
    usageService.getRemindersUsage = original;
  }
});

test('praxisService.generate cria o lembrete default', { skip }, async () => {
  await db.initDb();
  const user = await createUser();
  await settingsService.updateReminderSettings(user.id, {
    enabled: true,
    channel: 'telegram',
    leadMinutes: 10
  });

  const original = aiService.generate;
  // Sem JSON válido → buildSafeFallback define prazo futuro (+24h).
  aiService.generate = async () => ({
    text: 'sem-json',
    provider: 'test',
    source: 'managed',
    cached: false
  });
  try {
    const result = await praxisService.generate({
      userId: user.id,
      planId: 'free',
      texto: 'Fazer mais exercícios'
    });
    assert.ok(result.defaultReminder);
    assert.equal(result.defaultReminder.channel, 'telegram');
    assert.equal(result.defaultReminder.praxis_id, result.id);
  } finally {
    aiService.generate = original;
  }
});

/** Cliente HTTP mínimo com cookie jar e CSRF para testar as rotas. */
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
    if (Object.keys(this.cookies).length) {
      headers.cookie = this.header();
    }
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }
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

  put(path, body) {
    return this.request('PUT', path, body);
  }

  async init() {
    await this.get('/api/auth/csrf');
    return this;
  }
}

test('API: GET/PUT /api/settings', { skip }, async () => {
  await db.initDb();
  const app = createApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const client = new Client(`http://127.0.0.1:${port}`);

  try {
    await client.init();
    const register = await client.post('/api/auth/register', {
      name: 'Config',
      email: `set-http-${randomUUID()}@example.com`,
      password: 'SenhaForte123'
    });
    assert.equal(register.status, 201);

    const initial = await client.get('/api/settings');
    assert.equal(initial.status, 200);
    assert.deepEqual(initial.data.reminderDefault, {
      enabled: false,
      channel: 'browser',
      leadMinutes: 10
    });

    const put = await client.put('/api/settings', {
      enabled: true,
      channel: 'email',
      leadMinutes: 15
    });
    assert.equal(put.status, 200);
    assert.deepEqual(put.data.reminderDefault, {
      enabled: true,
      channel: 'email',
      leadMinutes: 15
    });

    const after = await client.get('/api/settings');
    assert.deepEqual(after.data.reminderDefault, {
      enabled: true,
      channel: 'email',
      leadMinutes: 15
    });

    const invalid = await client.put('/api/settings', { channel: 'sms' });
    assert.equal(invalid.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
