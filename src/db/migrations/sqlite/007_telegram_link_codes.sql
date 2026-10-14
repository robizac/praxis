-- 007_telegram_link_codes — códigos de pareamento do Telegram por usuário (SQLite)

CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS telegram_link_codes_user_idx ON telegram_link_codes (user_id);
