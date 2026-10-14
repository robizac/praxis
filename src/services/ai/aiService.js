'use strict';

const { config } = require('../../config/env');
const { ProviderError } = require('../../domain');
const providers = require('./providers');
const credentialsRepo = require('../../repositories/aiCredentials.repo');
const usageService = require('../usageService');
const { decryptSecret } = require('../../integrations/crypto');
const cache = require('./cache');
const { estimateCostUsd } = require('./pricing');

/**
 * Decide a rota da geração (docs/09, 9.2):
 *   - BYOK ativo  -> chave do usuário, sem consumir cota gerenciada.
 *   - Sem BYOK    -> provider gerenciado da plataforma, sujeito a cota e orçamento.
 */
async function resolveRoute(userId) {
  const cred = await credentialsRepo.getByUser(userId);
  if (cred && cred.status === 'active') {
    return {
      source: usageService.BYOK,
      provider: cred.provider,
      apiKey: decryptSecret({ ciphertext: cred.key_ciphertext, iv: cred.key_iv, tag: cred.key_tag }),
      baseUrl: cred.base_url || undefined,
      model: cred.model || undefined
    };
  }

  return {
    source: usageService.MANAGED,
    provider: config.ai.provider,
    apiKey: (config.ai.managedKeys && config.ai.managedKeys[config.ai.provider]) || config.ai.managedOpenaiKey,
    // Deixa cada adaptador usar o modelo padrão do seu provider
    // (openai → AI_DEFAULT_MODEL; ollama → OLLAMA_MODEL; anthropic/gemini → padrão do adaptador).
    model: undefined
  };
}

async function generate({ userId, planId = 'free', input, area }) {
  const route = await resolveRoute(userId);

  // Só o modo gerenciado consome cota/orçamento da plataforma.
  if (route.source === usageService.MANAGED) {
    await usageService.ensureCanConsume(userId, planId);
    await usageService.ensureDailyBudget();
  }

  const cacheKey = cache.hashKey({ input, area, provider: route.provider, model: route.model });
  const cached = cache.get(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  let result;
  try {
    result = await providers.generate(route.provider, {
      input,
      area,
      apiKey: route.apiKey,
      baseUrl: route.baseUrl,
      model: route.model
    });
  } catch (error) {
    if (route.source === usageService.BYOK) {
      throw new ProviderError(
        route.provider,
        'Sua chave de IA não conseguiu gerar a resposta.',
        'Revise a chave/modelo em Conta ou remova a chave para voltar ao modo gerenciado.'
      );
    }
    throw error;
  }

  const usage = result.usage || null;
  const model = result.model || route.model || null;
  const costUsd = estimateCostUsd(route.provider, model, usage);

  await usageService.recordUsage({
    userId,
    provider: route.provider,
    source: route.source,
    model,
    usage,
    costUsd
  });

  const payload = { text: result.text, provider: route.provider, usage, source: route.source, model };
  cache.set(cacheKey, payload);
  return { ...payload, cached: false };
}

module.exports = { generate, resolveRoute };
