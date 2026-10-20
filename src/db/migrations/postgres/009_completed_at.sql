-- 009_completed_at — registra quando uma ação foi concluída (quick win dashboard)

ALTER TABLE praxis_items ADD COLUMN completed_at TEXT;

CREATE INDEX IF NOT EXISTS praxis_items_user_completed_idx
  ON praxis_items (user_id, completed_at);
