'use strict';

const { config } = require('../../../config/env');
const { ProviderError } = require('../../../domain');
const { buildPrompt } = require('../prompt');
const { getFetch, withTimeout } = require('./http');

const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1';
const API_VERSION = '2023-06-01';

/**
 * Anthropic Messages API.
 * Contrato: generate({ input, area, apiKey, model, baseUrl }) -> { text, usage, model }
 */
async function generate({ input, area, apiKey, model, baseUrl }) {
  if (!apiKey) {
    throw new ProviderError(
      'anthropic',
      'Nenhuma chave da Anthropic configurada.',
      'Informe uma chave BYOK.'
    );
  }

  const usedModel = model || 'claude-3-5-haiku-latest';
  const prompt = buildPrompt(input, area);
  const fetch = await getFetch();
  const timeout = withTimeout(config.ai.timeoutMs);
  const endpoint = `${baseUrl || DEFAULT_BASE_URL}/messages`;

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION
      },
      signal: timeout.signal,
      body: JSON.stringify({
        model: usedModel,
        max_tokens: config.ai.maxTokens,
        temperature: 0.3,
        system: 'Você transforma aprendizado em execução prática no formato exato solicitado.',
        messages: [{ role: 'user', content: prompt }]
      })
    });
  } catch (_error) {
    throw new ProviderError(
      'anthropic',
      'Não foi possível conectar à Anthropic.',
      'Verifique sua conexão e a chave.'
    );
  } finally {
    timeout.done();
  }

  if (!response.ok) {
    const body = await response.text();
    console.error('[anthropic] erro HTTP', response.status, body);
    throw new ProviderError(
      'anthropic',
      'Anthropic não conseguiu gerar a resposta.',
      'Confirme a chave, o crédito disponível e o modelo.'
    );
  }

  const data = await response.json();
  const text = String(data?.content?.map((part) => part?.text || '').join('') || '').trim();
  if (!text) {
    throw new ProviderError(
      'anthropic',
      'Anthropic retornou resposta vazia.',
      'Tente novamente ou ajuste o modelo.'
    );
  }

  const inputTokens = Number(data?.usage?.input_tokens || 0);
  const outputTokens = Number(data?.usage?.output_tokens || 0);
  const usage = data?.usage
    ? {
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens
      }
    : null;

  return { text, usage, model: usedModel };
}

module.exports = { generate };
