-- 001_init — schema base (PostgreSQL / produção)
-- Fase 1: mesmas entidades do MVP. Fase 2/3 adicionam users, sessions e user_id.

CREATE TABLE IF NOT EXISTS praxis_items (
  id SERIAL PRIMARY KEY,
  texto TEXT NOT NULL,
  acao_pratica TEXT NOT NULL,
  prazo_iso TIMESTAMPTZ NOT NULL,
  prazo_humano TEXT NOT NULL,
  regra_minima TEXT NOT NULL,
  area TEXT NOT NULL DEFAULT 'Energia & Ritmo',
  status TEXT NOT NULL DEFAULT 'pendente',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS praxis_items_status_idx ON praxis_items (status);
CREATE INDEX IF NOT EXISTS praxis_items_created_idx ON praxis_items (created_at DESC);

CREATE TABLE IF NOT EXISTS reminders (
  id SERIAL PRIMARY KEY,
  praxis_id INTEGER NOT NULL REFERENCES praxis_items(id) ON DELETE CASCADE,
  remind_at_iso TIMESTAMPTZ NOT NULL,
  channel TEXT NOT NULL,
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS reminders_due_idx ON reminders (channel, sent_at, remind_at_iso);
