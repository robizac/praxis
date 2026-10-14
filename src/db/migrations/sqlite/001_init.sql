-- 001_init — schema base (SQLite / desenvolvimento)
-- Alinhado ao legado (praxis.db) para migração transparente.

CREATE TABLE IF NOT EXISTS praxis_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  texto TEXT NOT NULL,
  acao_pratica TEXT NOT NULL,
  prazo_iso TEXT NOT NULL,
  prazo_humano TEXT NOT NULL,
  regra_minima TEXT NOT NULL,
  area TEXT NOT NULL DEFAULT 'Energia & Ritmo',
  status TEXT NOT NULL DEFAULT 'pendente',
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS praxis_items_status_idx ON praxis_items (status);
CREATE INDEX IF NOT EXISTS praxis_items_created_idx ON praxis_items (created_at);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  praxis_id INTEGER NOT NULL,
  remind_at_iso TEXT NOT NULL,
  channel TEXT NOT NULL,
  sent_at TEXT,
  FOREIGN KEY (praxis_id) REFERENCES praxis_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS reminders_due_idx ON reminders (channel, sent_at, remind_at_iso);
