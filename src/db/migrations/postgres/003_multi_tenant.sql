-- 003_multi_tenant — escopo por usuário + revisões no banco (PostgreSQL / produção)
-- user_id é adicionado como NULL para não quebrar linhas legadas; o app sempre
-- grava o dono e o script scripts/migrate-legacy.js associa as linhas antigas.

ALTER TABLE praxis_items ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS praxis_items_user_created_idx ON praxis_items (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS praxis_items_user_status_idx ON praxis_items (user_id, status);
CREATE INDEX IF NOT EXISTS reminders_user_idx ON reminders (user_id, sent_at);

CREATE TABLE IF NOT EXISTS weekly_reviews (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  executei TEXT NOT NULL,
  trouxe_paz TEXT NOT NULL,
  gerou_peso TEXT NOT NULL,
  deve_sair TEXT NOT NULL,
  insights TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS weekly_reviews_user_idx ON weekly_reviews (user_id, created_at DESC);
