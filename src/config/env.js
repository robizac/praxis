'use strict';

const dotenv = require('dotenv');

dotenv.config();

const VALID_AI_PROVIDERS = ['ollama', 'openai', 'anthropic', 'gemini'];
const REMOTE_AI_PROVIDERS = ['openai', 'anthropic', 'gemini'];

function toInt(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toNumber(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

const configuredProvider = String(process.env.AI_PROVIDER || 'ollama').toLowerCase();
// O provider gerenciado da plataforma precisa ser remoto em produção (BYOK aceita qualquer um).
const provider = isProduction
  ? (REMOTE_AI_PROVIDERS.includes(configuredProvider) ? configuredProvider : 'openai')
  : configuredProvider;

const config = {
  nodeEnv,
  isProduction,
  port: toInt(process.env.PORT, 3000),
  appUrl: process.env.APP_URL || `http://localhost:${toInt(process.env.PORT, 3000)}`,
  appBaseDomain: process.env.APP_BASE_DOMAIN || 'localhost',
  sessionSecret: process.env.SESSION_SECRET || '',
  logLevel: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  databaseUrl: process.env.DATABASE_URL || '',

  ai: {
    provider,
    defaultProvider: process.env.AI_DEFAULT_PROVIDER || 'openai',
    managedOpenaiKey: process.env.MANAGED_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '',
    managedKeys: {
      openai: process.env.MANAGED_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '',
      anthropic: process.env.MANAGED_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || '',
      gemini: process.env.MANAGED_GEMINI_API_KEY || process.env.GEMINI_API_KEY || ''
    },
    defaultModel: process.env.AI_DEFAULT_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    maxTokens: toInt(process.env.AI_MAX_TOKENS, 400),
    timeoutMs: toInt(process.env.AI_TIMEOUT_MS, 20000),
    dailyBudgetUsd: toNumber(process.env.AI_DAILY_BUDGET_USD, 5),
    keyEncryptionSecret: process.env.AI_KEY_ENCRYPTION_SECRET || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'mistral'
  },

  email: {
    provider: process.env.EMAIL_PROVIDER || '',
    apiKey: process.env.EMAIL_API_KEY || '',
    from: process.env.EMAIL_FROM || 'PRAXIS <no-reply@localhost>'
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    priceProMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY || '',
    priceProAnnual: process.env.STRIPE_PRICE_PRO_ANNUAL || '',
    portalConfigId: process.env.STRIPE_PORTAL_CONFIG_ID || '',
    trialDays: toInt(process.env.BILLING_TRIAL_DAYS, 7)
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    botUsername: process.env.TELEGRAM_BOT_USERNAME || '',
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || ''
  }
};

function validate() {
  const errors = [];
  const warnings = [];

  if (!VALID_AI_PROVIDERS.includes(config.ai.provider)) {
    errors.push(`AI_PROVIDER inválido: "${config.ai.provider}" (use ${VALID_AI_PROVIDERS.join(' ou ')}).`);
  }
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    errors.push(`PORT inválida: "${process.env.PORT}".`);
  }

  if (isProduction) {
    if (!config.sessionSecret || config.sessionSecret.length < 32) {
      errors.push('SESSION_SECRET é obrigatório em produção (mínimo 32 caracteres).');
    }
    if (!config.databaseUrl) {
      warnings.push('DATABASE_URL não definida — usando SQLite local mesmo em produção.');
    }
    if (!config.ai.managedOpenaiKey && config.ai.provider === 'openai') {
      warnings.push('Nenhuma chave de IA gerenciada configurada (MANAGED_OPENAI_API_KEY/OPENAI_API_KEY).');
    }
    if (!config.ai.keyEncryptionSecret) {
      warnings.push('AI_KEY_ENCRYPTION_SECRET não definida — o BYOK (chave do usuário) não poderá ser usado com segurança.');
    }
  } else {
    if (!config.sessionSecret) {
      warnings.push('SESSION_SECRET ausente (ok em dev; obrigatório em produção).');
    }
    if (config.ai.provider === 'openai' && !config.ai.openaiApiKey && !config.ai.managedOpenaiKey) {
      warnings.push('AI_PROVIDER=openai sem OPENAI_API_KEY definida.');
    }
  }

  return { errors, warnings };
}

function loadConfig() {
  const { errors, warnings } = validate();
  return { config, errors, warnings };
}

module.exports = { config, loadConfig, toBool };
