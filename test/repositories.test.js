const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');

const db = require('../src/db');
const praxisRepo = require('../src/repositories/praxis.repo');
const usersRepo = require('../src/repositories/users.repo');
const reminderService = require('../src/services/reminderService');

async function createUser() {
  return usersRepo.create({
    email: `repo-${randomUUID()}@example.com`,
    passwordHash: 'x',
    name: 'Teste'
  });
}

test(
  'repositório de praxis: cria, lê, lista e remove',
  { skip: db.dialect !== 'sqlite' },
  async () => {
    await db.initDb();
    const user = await createUser();

    const id = await praxisRepo.insert(user.id, {
      texto: 'aprendizado de teste',
      acaoPratica: 'Fazer 10 minutos agora',
      prazoIso: new Date(Date.now() + 3600 * 1000).toISOString(),
      prazoHumano: '01/01/2030 20:00',
      regraMinima: 'Se travar, faça 3 minutos',
      area: 'Identidade'
    });

    const row = await praxisRepo.getById(user.id, id);
    assert.equal(row.texto, 'aprendizado de teste');
    assert.equal(row.area, 'Identidade');

    const list = await praxisRepo.listRecent(user.id, 10);
    assert.ok(list.some((item) => item.id === id));

    const pending = await praxisRepo.countPending(user.id);
    assert.ok(pending >= 1);

    await praxisRepo.deleteById(user.id, id);
    assert.equal(await praxisRepo.getById(user.id, id), undefined);
  }
);

test('reminderService valida canal inválido', { skip: db.dialect !== 'sqlite' }, async () => {
  await db.initDb();
  const user = await createUser();
  await assert.rejects(
    () =>
      reminderService.create({
        userId: user.id,
        praxisId: 1,
        remindAtIso: new Date().toISOString(),
        channel: 'fax'
      }),
    /channel deve ser telegram, email ou browser/
  );
});
