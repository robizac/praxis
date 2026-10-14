const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');

const db = require('../src/db');
const usersRepo = require('../src/repositories/users.repo');
const aiUsageRepo = require('../src/repositories/aiUsage.repo');
const aiCredentialsRepo = require('../src/repositories/aiCredentials.repo');
const praxisRepo = require('../src/repositories/praxis.repo');
const remindersRepo = require('../src/repositories/reminders.repo');
const usageService = require('../src/services/usageService');
const { encryptSecret } = require('../src/integrations/crypto');

const skip = db.dialect !== 'sqlite';

async function createUser() {
  return usersRepo.create({
    email: `usage-${randomUUID()}@example.com`,
    passwordHash: 'x',
    name: 'Uso'
  });
}

async function seedManaged(userId, count, costUsd = 0.000165) {
  for (let i = 0; i < count; i += 1) {
    await aiUsageRepo.insert({
      userId,
      provider: 'ollama',
      source: 'managed',
      model: 'mistral',
      usage: { prompt_tokens: 500, completion_tokens: 150, total_tokens: 650 },
      costUsd
    });
  }
}

test('usageService: cota do plano Free (10/mês)', { skip }, async () => {
  await db.initDb();
  const user = await createUser();

  const before = await usageService.getQuota(user.id, 'free');
  assert.equal(before.limit, 10);
  assert.equal(before.used, 0);
  assert.equal(before.canGenerate, true);

  await seedManaged(user.id, 10);

  const after = await usageService.getQuota(user.id, 'free');
  assert.equal(after.used, 10);
  assert.equal(after.remaining, 0);
  assert.equal(after.canGenerate, false);

  await assert.rejects(
    () => usageService.ensureCanConsume(user.id, 'free'),
    (error) => error.code === 'quota_exceeded' && error.status === 402
  );
});

test('usageService: BYOK ignora a cota gerenciada', { skip }, async () => {
  await db.initDb();
  const user = await createUser();
  await seedManaged(user.id, 15);

  // Sem BYOK: bloqueado.
  await assert.rejects(() => usageService.requireEntitlement(user.id, 'free'), /limite/i);

  // Com BYOK ativo: liberado.
  const enc = encryptSecret('sk-user-123456');
  await aiCredentialsRepo.upsert(user.id, {
    provider: 'openai',
    keyCiphertext: enc.ciphertext,
    keyIv: enc.iv,
    keyTag: enc.tag,
    keyLast4: '3456',
    status: 'active'
  });

  assert.equal(await usageService.hasByok(user.id), true);
  await usageService.requireEntitlement(user.id, 'free');
});

test('usageService: custo do dia soma apenas gerações gerenciadas', { skip }, async () => {
  await db.initDb();
  const user = await createUser();
  await seedManaged(user.id, 2, 0.001);

  const cost = await usageService.costTodayUsd();
  assert.ok(cost >= 0.002);
});

test('usageService: entitlement de lembretes ativos (Free = 20)', { skip }, async () => {
  await db.initDb();
  const user = await createUser();

  const praxisId = await praxisRepo.insert(user.id, {
    texto: 't',
    acaoPratica: 'a',
    prazoIso: new Date(Date.now() + 3600000).toISOString(),
    prazoHumano: 'em 1h',
    regraMinima: 'r',
    area: 'Trabalho & Provisão',
    tags: []
  });

  const createReminder = () =>
    remindersRepo.create(user.id, {
      praxisId,
      remindAtIso: new Date(Date.now() + 3600000).toISOString(),
      channel: 'telegram'
    });

  for (let i = 0; i < 19; i += 1) {
    await createReminder();
  }

  const almost = await usageService.getRemindersUsage(user.id, 'free');
  assert.equal(almost.limit, 20);
  assert.equal(almost.used, 19);
  assert.equal(almost.canCreate, true);
  // Ainda pode criar (19 < 20).
  await usageService.ensureCanCreateReminder(user.id, 'free');

  const lastOne = await createReminder();
  const full = await usageService.getRemindersUsage(user.id, 'free');
  assert.equal(full.used, 20);
  assert.equal(full.canCreate, false);

  await assert.rejects(
    () => usageService.ensureCanCreateReminder(user.id, 'free'),
    (error) => error.code === 'quota_exceeded' && error.status === 402
  );
  await assert.rejects(
    () => usageService.requireEntitlement(user.id, 'free', 'reminders'),
    (error) => error.status === 402
  );

  // Enviar um lembrete libera espaço (ativos caem para 19).
  await remindersRepo.markSent(lastOne.id, new Date().toISOString(), user.id);
  const freed = await usageService.getRemindersUsage(user.id, 'free');
  assert.equal(freed.used, 19);
  assert.equal(freed.canCreate, true);

  // Pro tem limite maior.
  const pro = await usageService.getRemindersUsage(user.id, 'pro');
  assert.equal(pro.limit, 500);
  assert.equal(pro.canCreate, true);
});
