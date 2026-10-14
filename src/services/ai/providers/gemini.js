'use strict';

const { config } = require('../../../config/env');
const { ProviderError } = require('../../../domain');
const { buildPrompt } = require('../prompt');
const { getFetch, withTimeout } = require('./http');

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Google Gemini (Generative Language API).
 * Contrato: generate({ input, area, apiKey, model, baseUrl }) -> { text, usage, model }
 */
async function generate({ input, area, apiKey, model, baseUrl }) {
  if (!apiKey) {
    throw new ProviderError('gemini', 'Nenhuma chave do Google Gemini configurada.', 'Informe uma chave BYOK.');
  }

  const usedModel = model || 'gemini-2.0-flash';
  const prompt = buildPrompt(input, area);
  const fetch = await getFetch();
  const timeout = withTimeout(config.ai.timeoutMs);
  const base = baseUrl || DEFAULT_BASE_URL;
  const endpoint = `${base}/models/${usedModel}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: timeout.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: config.ai.maxTokens
        }
      })
    });
  } catch (_error) {
    throw new ProviderError('gemini', 'Não foi possível conectar ao Google Gemini.', 'Verifique sua conexão e a chave.');
  } finally {
    timeout.done();
  }

  if (!response.ok) {
    const body = await response.text();
    console.error('[gemini] erro HTTP', response.status, body);
    throw new ProviderError(
      'gemini',
      'Gemini não conseguiu gerar a resposta.',
      'Confirme a chave, a cota e o modelo.'
    );
  }

  const data = await response.json();
  const text = String(
    data?.candidates?.[0]?.content?.parts?.map((part) => part?.text || '').join('') || ''
  ).trim();
  if (!text) {
    throw new ProviderError('gemini', 'Gemini retornou resposta vazia.', 'Tente novamente ou ajuste o modelo.');
  }

  const meta = data?.usageMetadata;
  const usage = meta
    ? {
        prompt_tokens: Number(meta.promptTokenCount || 0),
        completion_tokens: Number(meta.candidatesTokenCount || 0),
        total_tokens: Number(meta.totalTokenCount || 0)
      }
    : null;

  return { text, usage, model: usedModel };
}

module.exports = { generate };
