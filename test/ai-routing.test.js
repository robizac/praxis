const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');

const db = require('../src/db');
const usersRepo = require('../src/repositories/users.repo');
const aiUsageRepo = require('../src/repositories/aiUsage.repo');
const aiCredentialsRepo = require('../src/repositories/aiCredentials.repo');
const aiService = require('../src/services/ai/aiService');
const cache = require('../src/services/ai/cache');
const { encryptSecret } = require('../src/integrations/crypto');
const { config } = require('../src/config/env');

const skip = db.dialect !== 'sqlite';

const PRAXIS_JSON = JSON.stringify({
  area: 'Identidade',
  acao: 'Fazer 10 minutos agora',
  prazo: '01/01/2030 20:00',
  regra_minima: 'Se travar, faça 3 minutos'
});

async function createUser() {
  return usersRepo.create({
    email: `ai-${randomUUID()}@example.com`,
    passwordHash: 'x',
    name: 'IA'
  });
}

function stubFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), body: options && options.body ? JSON.parse(options.body) : null });
    return handler(String(url), options);
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function ollamaOk() {
  return { ok: true, json: async () => ({ message: { content: PRAXIS_JSON } }) };
}

function openaiOk() {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: PRAXIS_JSON } }],
      usage: { prompt_tokens: 500, completion_tokens: 150, total_tokens: 650 }
    })
  };
}

async function saveByok(userId, provider, apiKey) {
  const enc = encryptSecret(apiKey);
  return aiCredentialsRepo.upsert(userId, {
    provider,
    keyCiphertext: enc.ciphertext,
    keyIv: enc.iv,
    keyTag: enc.tag,
    keyLast4: apiKey.slice(-4),
    status: 'active'
  });
}

test('aiService: modo gerenciado registra uso e serve do cache', { skip }, async () => {
  await db.initDb();
  const user = await createUser();
  cache.clear();

  const input = `aprendi algo novo ${randomUUID()}`;
  const stub = stubFetch(ollamaOk);

  try {
    const first = await aiService.generate({ userId: user.id, planId: 'free', input, area: 'Identidade' });
    assert.equal(first.source, 'managed');
    assert.equal(first.provider, 'ollama');
    assert.equal(first.cached, false);
    assert.equal(first.model, config.ai.ollamaModel, 'usa o modelo padrão do provider gerenciado');
    assert.equal(stub.calls[0].body.model, config.ai.ollamaModel);
    assert.equal(stub.calls.length, 1);

    const second = await aiService.generate({ userId: user.id, planId: 'free', input, area: 'Identidade' });
    assert.equal(second.cached, true);
    assert.equal(stub.calls.length, 1, 'cache evita nova chamada ao provider');

    const used = await aiUsageRepo.countManagedSince(user.id, new Date(0).toISOString());
    assert.equal(used, 1, 'apenas a geração real é registrada');
  } finally {
    stub.restore();
  }
});

test('aiService: BYOK usa a chave do usuário e ignora a cota gerenciada', { skip }, async () => {
  await db.initDb();
  const user = await createUser();

  // Estoura a cota gerenciada.
  for (let i = 0; i < 12; i += 1) {
    await aiUsageRepo.insert({ userId: user.id, provider: 'ollama', source: 'managed', model: 'm', usage: null, costUsd: 0 });
  }

  await saveByok(user.id, 'openai', 'sk-openai-bypass-1234');
  cache.clear();

  const stub = stubFetch((url) => {
    assert.ok(url.startsWith('https://api.openai.com/'), `URL inesperada: ${url}`);
    return openaiOk();
  });

  try {
    const result = await aiService.generate({
      userId: user.id,
      planId: 'free',
      input: `byok ${randomUUID()}`,
      area: 'Identidade'
    });
    assert.equal(result.source, 'byok');
    assert.equal(result.provider, 'openai');
    assert.ok(result.text.length > 0);

    const managed = await aiUsageRepo.countManagedSince(user.id, new Date(0).toISOString());
    assert.equal(managed, 12, 'BYOK não adiciona uso gerenciado');
  } finally {
    stub.restore();
  }
});

test('aiService: falha do BYOK retorna erro claro', { skip }, async () => {
  await db.initDb();
  const user = await createUser();
  await saveByok(user.id, 'openai', 'sk-openai-quebrada-1234');
  cache.clear();

  const stub = stubFetch(() => ({ ok: false, status: 401, text: async () => 'invalid api key' }));

  try {
    await assert.rejects(
      () => aiService.generate({ userId: user.id, planId: 'free', input: `falha ${randomUUID()}`, area: 'Identidade' }),
      (error) => error.code === 'ai_provider_error' && /chave de IA/i.test(error.message)
    );
  } finally {
    stub.restore();
  }
});
