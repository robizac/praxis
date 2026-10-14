-- 006_reminders_enhancements — melhorias em lembretes e pareamento Telegram por usuário (SQLite)

-- Adiciona colunas para retentativas e logs de falha
ALTER TABLE reminders ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reminders ADD COLUMN last_error TEXT;

-- Pareamento de Telegram por usuário (substitui chat_id global)
CREATE TABLE IF NOT EXISTS telegram_chats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  username TEXT,
  linked_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS telegram_chats_user_idx ON telegram_chats (user_id);
