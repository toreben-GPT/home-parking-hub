CREATE TABLE IF NOT EXISTS login_rate_limits (
  client_hash TEXT PRIMARY KEY NOT NULL CHECK (length(client_hash) = 64),
  failed_count INTEGER NOT NULL CHECK (failed_count BETWEEN 1 AND 1000000),
  window_started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_rate_limits_window
  ON login_rate_limits(window_started_at);
