const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');

const db = require('../src/db');
const { config } = require('../src/config/env');
const { createApp } = require('../src/http/app');
const usersRepo = require('../src/repositories/users.repo');
const praxisRepo = require('../src/repositories/praxis.repo');
const remindersRepo = require('../src/repositories/reminders.repo');
const telegramChatsRepo = require('../src/repositories/telegramChats.repo');
const telegramService = require('../src/services/telegramService');
const reminderService = require('../src/services/reminderService');
const { processDueReminders } = require('../src/jobs/reminders.job');

const skip = db.dialect !== 'sqlite';

async function createUser() {
  return usersRepo.create({
    email: `rem-${randomUUID()}@example.com`,
    passwordHash: 'x',
    name: 'Lembrete'
  });
}

async function createItem(userId) {
  return praxisRepo.insert(userId, {
    texto: 't',
    acaoPratica: 'Fazer 10 minutos da tarefa X',
    prazoIso: new Date(Date.now() + 3600000).toISOString(),
    prazoHumano: 'hoje',
    regraMinima: 'r',
    area: 'Energia & Ritmo',
    tags: []
  });
}

async function createDueReminder(userId, praxisId, channel = 'telegram') {
  return remindersRepo.create(userId, {
    praxisId,
    remindAtIso: new Date(Date.now() - 60000).toISOString(),
    channel
  });
}

test('reminders: canal email é aceito', { skip }, async () => {
  await db.initDb();
  const user = await createUser();
  const praxisId = await createItem(user.id);
  const reminder = await createDueReminder(user.id, praxisId, 'email');
  assert.equal(reminder.channel, 'email');

  await assert.rejects(
    () => reminderService.create({ userId: user.id, praxisId, remindAtIso: new Date().toISOString(), channel: 'sms' }),
    /channel/i
  );
});

test('reminders: worker marca falha de Telegram e incrementa attempts', { skip }, async () => {
  await db.initDb();
  const user = await createUser();
  const praxisId = await createItem(user.id);
  const reminder = await createDueReminder(user.id, praxisId, 'telegram');
  await telegramChatsRepo.upsert(user.id, { chatId: '555000', username: 'failer' });

  // Bot habilitado, mas a API responde erro → tentativa falha.
  const originalToken = config.telegram.botToken;
  const originalFetch = globalThis.fetch;
  config.telegram.botToken = 'test-token';
  globalThis.fetch = async () => ({ ok: false });

  try {
    await processDueReminders(['telegram']);
    const after = await remindersRepo.getById(reminder.id);
    assert.equal(after.attempts, 1);
    assert.equal(after.sent_at, null);
    assert.ok(after.last_error);
  } finally {
    config.telegram.botToken = originalToken;
    globalThis.fetch = originalFetch;
  }
});

test('reminders: worker envia Telegram pareado e marca como enviado', { skip }, async () => {
  await db.initDb();
  const user = await createUser();
  const praxisId = await createItem(user.id);
  const reminder = await createDueReminder(user.id, praxisId, 'telegram');
  await telegramChatsRepo.upsert(user.id, { chatId: '123456', username: 'tester' });

  const originalToken = config.telegram.botToken;
  const originalFetch = globalThis.fetch;
  config.telegram.botToken = 'test-token';
  const sentChatIds = [];
  globalThis.fetch = async (url, options) => {
    sentChatIds.push(JSON.parse(options.body).chat_id);
    return { ok: true };
  };

  try {
    await processDueReminders(['telegram']);
    // O worker é global; validamos o destino e o estado do NOSSO lembrete.
    assert.ok(sentChatIds.includes('123456'));
    const after = await remindersRepo.getById(reminder.id);
    assert.ok(after.sent_at);
  } finally {
    config.telegram.botToken = originalToken;
    globalThis.fetch = originalFetch;
  }
});

test('reminders: e-mail não configurado é ignorado (sem tentativas)', { skip }, async () => {
  await db.initDb();
  const user = await createUser();
  const praxisId = await createItem(user.id);
  const reminder = await createDueReminder(user.id, praxisId, 'email');

  const originalProvider = config.email.provider;
  const originalKey = config.email.apiKey;
  config.email.provider = '';
  config.email.apiKey = '';

  try {
    await processDueReminders(['email']);
    const after = await remindersRepo.getById(reminder.id);
    assert.equal(after.attempts, 0);
    assert.equal(after.sent_at, null);
  } finally {
    config.email.provider = originalProvider;
    config.email.apiKey = originalKey;
  }
});

test('reminders: canal browser não é processado pelo worker', { skip }, async () => {
  await db.initDb();
  const user = await createUser();
  const praxisId = await createItem(user.id);
  const reminder = await createDueReminder(user.id, praxisId, 'browser');

  // Garante que nenhum canal externo faça rede neste teste.
  const originalToken = config.telegram.botToken;
  const originalProvider = config.email.provider;
  config.telegram.botToken = '';
  config.email.provider = '';

  try {
    const result = await processDueReminders(['telegram', 'email', 'browser']);
    assert.ok(result); // roda sem erro
    const after = await remindersRepo.getById(reminder.id);
    assert.equal(after.sent_at, null); // browser é consumido pela SPA
  } finally {
    config.telegram.botToken = originalToken;
    config.email.provider = originalProvider;
  }
});

test('telegram: código vincula chat ao usuário', { skip }, async () => {
  await db.initDb();
  const user = await createUser();

  const originalToken = config.telegram.botToken;
  config.telegram.botToken = 'test-token';
  try {
    const { code } = await telegramService.generateLinkCode(user.id);
    assert.match(code, /^\d{6}$/);

    const linked = await telegramService.handleIncomingMessage({
      chatId: '999',
      username: 'someone',
      text: `/start ${code}`
    });
    assert.ok(linked);
    assert.equal(linked.user_id, user.id);
    assert.equal(linked.chat_id, '999');

    const status = await telegramService.getStatus(user.id);
    assert.equal(status.linked, true);
    assert.equal(status.chatId, '999');

    // Código é de uso único.
    const again = await telegramService.handleIncomingMessage({
      chatId: '1000',
      username: null,
      text: `/start ${code}`
    });
    assert.equal(again, null);

    await telegramService.unlink(user.id);
    assert.equal((await telegramService.getStatus(user.id)).linked, false);
  } finally {
    config.telegram.botToken = originalToken;
  }
});

test('telegram: código expirado não vincula', { skip }, async () => {
  await db.initDb();
  const user = await createUser();
  const linkCodesRepo = require('../src/repositories/telegramLinkCodes.repo');

  const originalToken = config.telegram.botToken;
  config.telegram.botToken = 'test-token';
  try {
    // Cria um código já expirado (único por execução — o banco persiste).
    const code = String(10000000 + (Date.now() % 90000000));
    await db.run('DELETE FROM telegram_link_codes WHERE code = ?', [code]);
    await linkCodesRepo.create(code, user.id, new Date(Date.now() - 1000).toISOString());
    const linked = await telegramService.handleIncomingMessage({
      chatId: '500',
      username: null,
      text: `/vincular ${code}`
    });
    assert.equal(linked, null);
  } finally {
    config.telegram.botToken = originalToken;
  }
});

test('telegram: webhook valida secret e vincula o chat', { skip }, async () => {
  await db.initDb();
  const user = await createUser();

  const originalToken = config.telegram.botToken;
  const originalSecret = config.telegram.webhookSecret;
  config.telegram.botToken = 'test-token';
  config.telegram.webhookSecret = 'segredo-de-teste';

  const app = createApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const { code } = await telegramService.generateLinkCode(user.id);
    const payload = {
      message: { chat: { id: 8080 }, from: { username: 'webhook-user' }, text: `/start ${code}` }
    };

    // Segredo errado → 401 (não vaza nem processa).
    const denied = await fetch(`${base}/webhooks/telegram`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'errado' },
      body: JSON.stringify(payload)
    });
    assert.equal(denied.status, 401);

    // Segredo correto → 200 e chat vinculado.
    const accepted = await fetch(`${base}/webhooks/telegram`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'segredo-de-teste'
      },
      body: JSON.stringify(payload)
    });
    assert.equal(accepted.status, 200);

    const status = await telegramService.getStatus(user.id);
    assert.equal(status.linked, true);
    assert.equal(status.chatId, '8080');
    assert.equal(status.username, 'webhook-user');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    config.telegram.botToken = originalToken;
    config.telegram.webhookSecret = originalSecret;
  }
});
