const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');

const db = require('../src/db');
const usersRepo = require('../src/repositories/users.repo');
const praxisRepo = require('../src/repositories/praxis.repo');
const praxisService = require('../src/services/praxisService');
const reviewService = require('../src/services/reviewService');
const reminderService = require('../src/services/reminderService');

const skip = db.dialect !== 'sqlite';

async function createUser() {
  return usersRepo.create({
    email: `iso-${randomUUID()}@example.com`,
    passwordHash: 'x',
    name: 'Usuário Isolado'
  });
}

async function insertItem(userId, texto) {
  return praxisRepo.insert(userId, {
    texto,
    acaoPratica: 'Fazer 10 minutos agora',
    prazoIso: new Date(Date.now() + 3600 * 1000).toISOString(),
    prazoHumano: '01/01/2030 20:00',
    regraMinima: 'Se travar, faça 3 minutos',
    area: 'Identidade'
  });
}

test('itens de praxis são isolados por usuário', { skip }, async () => {
  await db.initDb();
  const a = await createUser();
  const b = await createUser();

  const itemA = await insertItem(a.id, 'item do A');
  const itemB = await insertItem(b.id, 'item do B');

  const listA = await praxisService.listHistory(a.id, 100);
  assert.ok(listA.some((item) => item.id === itemA));
  assert.ok(!listA.some((item) => item.id === itemB), 'A não deve ver o item de B');

  // Leitura escopada: A não enxerga o item de B.
  assert.equal(await praxisService.getById(a.id, itemB), null);
  assert.ok(await praxisService.getById(b.id, itemB));

  // Escrita escopada: A não altera nem remove o item de B.
  await assert.rejects(
    () => praxisService.update(a.id, itemB, { status: 'feito' }),
    /não encontrado/
  );
  assert.equal(await praxisService.remove(a.id, itemB), false);
  assert.ok(await praxisService.getById(b.id, itemB), 'item de B permanece');

  assert.equal(await praxisRepo.countPending(a.id), 1);
  assert.equal(await praxisRepo.countPending(b.id), 1);
});

test('revisões semanais são isoladas por usuário', { skip }, async () => {
  await db.initDb();
  const a = await createUser();
  const b = await createUser();

  const payload = {
    respostas: { executei: 'sim', trouxe_paz: 'sim', gerou_peso: 'não', deve_sair: 'não' }
  };

  const review = await reviewService.create(a.id, payload);
  assert.ok(review.id);
  assert.equal(review.respostas.executei, 'sim');

  const listA = await reviewService.list(a.id);
  assert.ok(listA.some((item) => item.id === review.id));
  assert.equal((await reviewService.list(b.id)).length, 0);
});

test('lembretes são isolados por usuário', { skip }, async () => {
  await db.initDb();
  const a = await createUser();
  const b = await createUser();

  const itemA = await insertItem(a.id, 'item do A');
  const itemB = await insertItem(b.id, 'item do B');
  const remindAtIso = new Date(Date.now() - 1000).toISOString();

  const reminder = await reminderService.create({
    userId: a.id,
    praxisId: itemA,
    remindAtIso,
    channel: 'browser'
  });
  assert.ok(reminder.id);

  const dueA = await reminderService.dueByChannel('browser', a.id);
  assert.ok(dueA.some((item) => item.id === reminder.id));
  assert.equal((await reminderService.dueByChannel('browser', b.id)).length, 0);

  // A não cria lembrete para item de B.
  await assert.rejects(
    () =>
      reminderService.create({ userId: a.id, praxisId: itemB, remindAtIso, channel: 'browser' }),
    /não encontrado/
  );
});
