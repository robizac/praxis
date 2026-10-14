'use strict';

const { AppError } = require('../../../domain');

const PROVIDERS = {
  openai: require('./openai'),
  ollama: require('./ollama'),
  anthropic: require('./anthropic'),
  gemini: require('./gemini')
};

const SUPPORTED = Object.keys(PROVIDERS);

function isSupported(name) {
  return SUPPORTED.includes(String(name || '').toLowerCase());
}

function getProvider(name) {
  const key = String(name || '').toLowerCase();
  const provider = PROVIDERS[key];
  if (!provider) {
    throw new AppError(`Provider de IA não suportado: ${name}`, {
      status: 400,
      code: 'unsupported_ai_provider',
      details: { supported: SUPPORTED }
    });
  }
  return provider;
}

/** Chama o adaptador do provider. Ver docs/09 (contrato dos adaptadores). */
async function generate(name, options) {
  return getProvider(name).generate(options);
}

module.exports = { PROVIDERS, SUPPORTED, isSupported, getProvider, generate };
