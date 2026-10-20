'use strict';

const { config } = require('../../../config/env');
const { ProviderError } = require('../../../domain');
const { buildPrompt } = require('../prompt');
const { getFetch, withTimeout } = require('./http');

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

/**
 * OpenAI Chat Completions.
 * Contrato: generate({ input, area, apiKey, model, baseUrl }) -> { text, usage, model }
 */
async function generate({ input, area, apiKey, model, baseUrl }) {
  const key = apiKey || config.ai.managedOpenaiKey;
  if (!key) {
    throw new ProviderError(
      'openai',
      'Nenhuma chave da OpenAI configurada.',
      'Informe uma chave BYOK ou defina MANAGED_OPENAI_API_KEY.'
    );
  }

  const usedModel = model || config.ai.defaultModel;
  const prompt = buildPrompt(input, area);
  const fetch = await getFetch();
  const timeout = withTimeout(config.ai.timeoutMs);
  const endpoint = `${baseUrl || DEFAULT_BASE_URL}/chat/completions`;

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      signal: timeout.signal,
      body: JSON.stringify({
        model: usedModel,
        temperature: 0.3,
        max_tokens: config.ai.maxTokens,
        messages: [
          {
            role: 'system',
            content: 'Você transforma aprendizado em execução prática no formato exato solicitado.'
          },
          { role: 'user', content: prompt }
        ]
      })
    });
  } catch (_error) {
    throw new ProviderError(
      'openai',
      'Não foi possível conectar à OpenAI.',
      'Verifique sua conexão e a chave.'
    );
  } finally {
    timeout.done();
  }

  if (!response.ok) {
    const body = await response.text();
    console.error('[openai] erro HTTP', response.status, body);
    // Traduz o status do provider em algo acionável: sem isso o operador
    // só vê "não conseguiu gerar" e não sabe se é chave, modelo ou cota.
    const porStatus = {
      401: [
        'A chave da OpenAI foi recusada.',
        'Confirme se MANAGED_OPENAI_API_KEY/OPENAI_API_KEY está correta e não expirou.'
      ],
      403: [
        'A chave da OpenAI não tem permissão para este modelo.',
        'Verifique o acesso da chave ao modelo e o limite do projeto na OpenAI.'
      ],
      404: [
        `O modelo "${usedModel}" não existe na OpenAI.`,
        'Ajuste AI_DEFAULT_MODEL para um modelo disponível na sua conta.'
      ],
      429: [
        'A OpenAI recusou a requisição por limite de uso.',
        'Aguarde o limite do seu nível e verifique o crédito disponível na OpenAI.'
      ]
    };
    const [message, hint] = porStatus[response.status] || [
      'OpenAI não conseguiu gerar a resposta.',
      'Confirme a chave, o crédito disponível e o modelo.'
    ];
    throw new ProviderError('openai', message, hint, response.status);
  }

  const data = await response.json();
  const text = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!text) {
    throw new ProviderError(
      'openai',
      'OpenAI retornou resposta vazia.',
      'Tente novamente ou ajuste o modelo.'
    );
  }

  return { text, usage: data?.usage || null, model: usedModel };
}

module.exports = { generate };
