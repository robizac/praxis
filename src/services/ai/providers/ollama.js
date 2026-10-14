'use strict';

const { config } = require('../../../config/env');
const { ProviderError } = require('../../../domain');
const { buildPrompt, PRAXIS_JSON_SCHEMA } = require('../prompt');
const { getFetch, withTimeout } = require('./http');

/**
 * Ollama local (http://localhost:11434) — BYOK "self-host", custo zero.
 * Contrato: generate({ input, area, baseUrl, model }) -> { text, usage, model }
 */
async function generate({ input, area, model, baseUrl }) {
  const prompt = buildPrompt(input, area);
  const fetch = await getFetch();
  const timeout = withTimeout(config.ai.timeoutMs);
  const url = baseUrl || config.ai.ollamaBaseUrl;
  const usedModel = model || config.ai.ollamaModel;

  let response;
  try {
    response = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: timeout.signal,
      body: JSON.stringify({
        model: usedModel,
        messages: [
          {
            role: 'system',
            content: 'Você transforma aprendizado em ação prática e responde apenas JSON válido.'
          },
          { role: 'user', content: prompt }
        ],
        stream: false,
        format: PRAXIS_JSON_SCHEMA
      })
    });
  } catch (_error) {
    throw new ProviderError(
      'ollama',
      'Não foi possível conectar ao Ollama.',
      `Inicie o Ollama em ${url} e confirme o modelo com: ollama pull ${usedModel}`
    );
  } finally {
    timeout.done();
  }

  if (!response.ok) {
    const body = await response.text();
    console.error('[ollama] erro HTTP', response.status, body);
    throw new ProviderError(
      'ollama',
      'Ollama não conseguiu gerar a resposta.',
      `Verifique se o modelo "${usedModel}" existe (ollama pull ${usedModel}) e se o serviço está online.`
    );
  }

  const data = await response.json();
  const text = String(data?.message?.content || '').trim();
  if (!text) {
    throw new ProviderError('ollama', 'Ollama retornou resposta vazia.', `Teste manualmente em ${url}.`);
  }

  const usage = data?.prompt_eval_count
    ? {
        prompt_tokens: Number(data.prompt_eval_count || 0),
        completion_tokens: Number(data.eval_count || 0),
        total_tokens: Number(data.prompt_eval_count || 0) + Number(data.eval_count || 0)
      }
    : null;

  return { text, usage, model: usedModel };
}

module.exports = { generate };
