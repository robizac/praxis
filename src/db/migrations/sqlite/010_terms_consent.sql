-- 010_terms_consent — registro de consentimento aos termos (LGPD, RF-07)

ALTER TABLE users ADD COLUMN terms_accepted_at TEXT;
