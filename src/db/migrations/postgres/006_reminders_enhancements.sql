-- 006_reminders_enhancements — melhorias em lembretes e pareamento Telegram por usuário (Postgres)

ALTER TABLE reminders ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS last_error TEXT;

CREATE TABLE IF NOT EXISTS telegram_chats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  username TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_chats_user_idx ON telegram_chats (user_id);
