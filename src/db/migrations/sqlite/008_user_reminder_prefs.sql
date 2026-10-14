-- 008_user_reminder_prefs — preferências de lembrete default por usuário (SQLite)

ALTER TABLE users ADD COLUMN reminder_default_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN reminder_default_channel TEXT;
ALTER TABLE users ADD COLUMN reminder_default_lead_minutes INTEGER NOT NULL DEFAULT 10;
