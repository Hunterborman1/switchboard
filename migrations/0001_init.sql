-- Signed-link revocation list (checked by the gate).
CREATE TABLE IF NOT EXISTS revoked_links (jti TEXT PRIMARY KEY, revoked_at TEXT NOT NULL, note TEXT);
