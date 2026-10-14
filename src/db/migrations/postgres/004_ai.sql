-- 004_ai — credenciais BYOK (cifradas) e medição de uso de IA (PostgreSQL / produção)

CREATE TABLE IF NOT EXISTS ai_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  key_ciphertext TEXT NOT NULL,
  key_iv TEXT NOT NULL,
  key_tag TEXT NOT NULL,
  key_last4 TEXT,
  base_url TEXT,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_credentials_user_idx ON ai_credentials (user_id);

CREATE TABLE IF NOT EXISTS ai_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  source TEXT NOT NULL,
  model TEXT,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_user_created_idx ON ai_usage (user_id, created_at DESC);
