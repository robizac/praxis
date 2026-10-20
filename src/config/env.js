'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const VALID_AI_PROVIDERS = ['ollama', 'openai', 'anthropic', 'gemini'];
const REMOTE_AI_PROVIDERS = ['openai', 'anthropic', 'gemini'];

// Avisos de segredo auto-gerado, coletados no boot (exibidos por loadConfig()).
const autoSecretWarnings = [];

/**
 * Resolve um segredo obrigatório. Se a env estiver ausente, gera um valor
 * ESTÁVEL (não aleatório por processo) para o app subir sem configuração manual
 * — útil em PaaS onde o segredo pode não ter sido injetado.
 *
 * Estabilidade entre restarts/instâncias: tenta persistir em um arquivo dentro
 * de um diretório gravável (`DATA_DIR` → cwd → tmp). Se nada for gravável,
 * deriva de forma determinística a partir de identificadores do ambiente, de
 * modo que o mesmo host chegue sempre ao mesmo valor.
 *
 * Preferência sempre pela env explícita; o fallback é só rede de segurança.
 */
function resolveSecret(envName, { minLength = 32 } = {}) {
  const fromEnv = process.env[envName];
  if (fromEnv && fromEnv.length >= minLength) {
    return fromEnv;
  }

  const persisted = readOrCreatePersistedSecret(envName);
  if (persisted) {
    autoSecretWarnings.push(
      `${envName} ausente ou curta — usando segredo auto-gerado e persistido. ` +
        `Defina ${envName} nas variáveis de ambiente para controlar o valor.`
    );
    return persisted;
  }

  // Último recurso: derivação determinística por host (sem persistência).
  const basis = [
    process.env.APP_URL || '',
    process.env.APP_BASE_DOMAIN || '',
    os.hostname(),
    envName
  ].join('|');
  const derived = crypto.createHash('sha256').update(`praxis-fallback|${basis}`).digest('hex');
  autoSecretWarnings.push(
    `${envName} ausente e sem diretório gravável — usando segredo derivado do host. ` +
      `Defina ${envName} para um valor estável e seguro.`
  );
  return derived;
}

/** Diretório gravável para persistir segredos auto-gerados. */
function writableDataDir() {
  const candidates = [process.env.DATA_DIR, path.join(process.cwd(), '.data'), os.tmpdir()];
  for (const dir of candidates) {
    if (!dir) {
      continue;
    }
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return dir;
    } catch (_error) {
      // tenta o próximo candidato
    }
  }
  return null;
}

/** Lê (ou cria) um segredo persistido para `envName` em `<dataDir>/.secrets.json`. */
function readOrCreatePersistedSecret(envName) {
  const dir = writableDataDir();
  if (!dir) {
    return null;
  }
  const file = path.join(dir, '.praxis-secrets.json');
  let store = {};
  try {
    if (fs.existsSync(file)) {
      store = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
    }
  } catch (_error) {
    store = {};
  }
  if (typeof store[envName] === 'string' && store[envName].length >= 32) {
    return store[envName];
  }
  const value = crypto.randomBytes(32).toString('hex');
  store[envName] = value;
  try {
    fs.writeFileSync(file, JSON.stringify(store), { mode: 0o600 });
  } catch (_error) {
    return null;
  }
  return value;
}

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
  ? REMOTE_AI_PROVIDERS.includes(configuredProvider)
    ? configuredProvider
    : 'openai'
  : configuredProvider;

const config = {
  nodeEnv,
  isProduction,
  port: toInt(process.env.PORT, 3000),
  appUrl: process.env.APP_URL || `http://localhost:${toInt(process.env.PORT, 3000)}`,
  appBaseDomain: process.env.APP_BASE_DOMAIN || 'localhost',
  sessionSecret: resolveSecret('SESSION_SECRET'),
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
    keyEncryptionSecret: resolveSecret('AI_KEY_ENCRYPTION_SECRET'),
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

  alerts: {
    // Destino dos alertas operacionais (webhook, worker, 5xx, custo de IA).
    // Sem ALERT_EMAIL, os alertas continuam no log estruturado (`alert: true`).
    email: process.env.ALERT_EMAIL || '',
    cooldownMinutes: toInt(process.env.ALERT_COOLDOWN_MINUTES, 60),
    http5xxThreshold: toInt(process.env.ALERT_HTTP_5XX_THRESHOLD, 10),
    aiCostRatio: toNumber(process.env.ALERT_AI_COST_RATIO, 0.8)
  },

  // Se definido, /metrics exige `Authorization: Bearer <token>`.
  metricsToken: process.env.METRICS_TOKEN || '',

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
    errors.push(
      `AI_PROVIDER inválido: "${config.ai.provider}" (use ${VALID_AI_PROVIDERS.join(' ou ')}).`
    );
  }
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    errors.push(`PORT inválida: "${process.env.PORT}".`);
  }

  // Segredos auto-gerados (SESSION_SECRET/AI_KEY_ENCRYPTION_SECRET ausentes):
  // o app sobe mesmo assim, mas avisa que o valor deveria ser definido no host.
  warnings.push(...autoSecretWarnings);

  if (config.alerts.email && !(config.email.provider && config.email.apiKey)) {
    warnings.push(
      'ALERT_EMAIL definido sem EMAIL_PROVIDER/EMAIL_API_KEY — alertas operacionais irão apenas para o log.'
    );
  }

  if (isProduction) {
    if (!config.databaseUrl) {
      warnings.push('DATABASE_URL não definida — usando SQLite local mesmo em produção.');
    }
    if (!config.ai.managedOpenaiKey && config.ai.provider === 'openai') {
      warnings.push(
        'Nenhuma chave de IA gerenciada configurada (MANAGED_OPENAI_API_KEY/OPENAI_API_KEY).'
      );
    }
    if (!config.metricsToken) {
      warnings.push(
        '/metrics está público (apenas contadores agregados). Defina METRICS_TOKEN para exigir Bearer token.'
      );
    }
  } else {
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
