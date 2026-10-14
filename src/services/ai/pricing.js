'use strict';

/**
 * Preços públicos aproximados em US$ por 1M de tokens.
 * Fonte: docs/09-ia-e-custos.md — revisar trimestralmente (preços de API mudam).
 * A estimativa é usada apenas para medição/alerta, nunca para cobrança.
 */
const PRICES = {
  openai: {
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'gpt-4o': { input: 2.5, output: 10 },
    'gpt-5-nano': { input: 0.05, output: 0.4 },
    default: { input: 0.15, output: 0.6 }
  },
  anthropic: {
    'claude-3-5-haiku': { input: 0.8, output: 4 },
    'claude-3-5-sonnet': { input: 3, output: 15 },
    'claude-3-7-sonnet': { input: 3, output: 15 },
    default: { input: 0.8, output: 4 }
  },
  gemini: {
    'gemini-1.5-flash': { input: 0.075, output: 0.3 },
    'gemini-2.0-flash': { input: 0.1, output: 0.4 },
    'gemini-2.5-flash': { input: 0.3, output: 2.5 },
    default: { input: 0.1, output: 0.4 }
  },
  ollama: {
    default: { input: 0, output: 0 }
  }
};

function ratesFor(provider, model) {
  const table = PRICES[provider] || PRICES.openai;
  if (model && table[model]) {
    return table[model];
  }
  if (model) {
    const prefix = Object.keys(table).find((key) => key !== 'default' && model.startsWith(key));
    if (prefix) {
      return table[prefix];
    }
  }
  return table.default;
}

function estimateCostUsd(provider, model, usage) {
  if (!usage) {
    return 0;
  }
  const { input, output } = ratesFor(provider, model);
  const promptTokens = Number(usage.prompt_tokens || 0);
  const completionTokens = Number(usage.completion_tokens || 0);
  return (promptTokens / 1e6) * input + (completionTokens / 1e6) * output;
}

module.exports = { PRICES, ratesFor, estimateCostUsd };
