PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS parking_lots (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  address TEXT NOT NULL DEFAULT '' CHECK (length(address) <= 300),
  maps_url TEXT NOT NULL DEFAULT '' CHECK (length(maps_url) <= 2048),
  walk_minutes INTEGER CHECK (walk_minutes IS NULL OR walk_minutes >= 0),
  walk_distance_meters INTEGER CHECK (walk_distance_meters IS NULL OR walk_distance_meters >= 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'excluded', 'closed')),
  parking_ease TEXT NOT NULL CHECK (parking_ease IN ('easy', 'normal', 'difficult')),
  ease_note TEXT NOT NULL DEFAULT '' CHECK (length(ease_note) <= 2000),
  payment_methods TEXT NOT NULL CHECK (json_valid(payment_methods)),
  recommendation_comment TEXT NOT NULL DEFAULT '' CHECK (length(recommendation_comment) <= 4000),
  ai_summary TEXT NOT NULL DEFAULT '' CHECK (length(ai_summary) <= 10000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_parking_lots_status_updated
  ON parking_lots(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS pricing_versions (
  id TEXT PRIMARY KEY NOT NULL,
  parking_lot_id TEXT NOT NULL,
  source_text TEXT NOT NULL DEFAULT '' CHECK (length(source_text) <= 20000),
  base_rate TEXT NOT NULL DEFAULT '' CHECK (length(base_rate) <= 2000),
  weekday_maximum TEXT NOT NULL DEFAULT '' CHECK (length(weekday_maximum) <= 2000),
  holiday_maximum TEXT NOT NULL DEFAULT '' CHECK (length(holiday_maximum) <= 2000),
  night_maximum TEXT NOT NULL DEFAULT '' CHECK (length(night_maximum) <= 2000),
  night_hours TEXT NOT NULL DEFAULT '' CHECK (length(night_hours) <= 2000),
  maximum_repeat TEXT NOT NULL DEFAULT '' CHECK (length(maximum_repeat) <= 2000),
  exceptions TEXT NOT NULL DEFAULT '' CHECK (length(exceptions) <= 4000),
  pattern_prices TEXT NOT NULL CHECK (json_valid(pattern_prices)),
  change_note TEXT NOT NULL DEFAULT '' CHECK (length(change_note) <= 2000),
  is_current INTEGER NOT NULL CHECK (is_current IN (0, 1)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (parking_lot_id) REFERENCES parking_lots(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pricing_one_current_per_lot
  ON pricing_versions(parking_lot_id)
  WHERE is_current = 1;

CREATE INDEX IF NOT EXISTS idx_pricing_lot_created
  ON pricing_versions(parking_lot_id, created_at DESC);

CREATE TABLE IF NOT EXISTS availability_logs (
  id TEXT PRIMARY KEY NOT NULL,
  parking_lot_id TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('available', 'limited', 'full')),
  memo TEXT NOT NULL DEFAULT '' CHECK (length(memo) <= 2000),
  day_type TEXT NOT NULL CHECK (day_type IN ('weekday', 'holiday')),
  time_period TEXT NOT NULL CHECK (time_period IN ('night', 'day')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (parking_lot_id) REFERENCES parking_lots(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_availability_lot_observed
  ON availability_logs(parking_lot_id, observed_at DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS memos (
  id TEXT PRIMARY KEY NOT NULL,
  parking_lot_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (parking_lot_id) REFERENCES parking_lots(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_memos_lot_updated
  ON memos(parking_lot_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY NOT NULL,
  parking_lot_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('price_sign', 'entrance', 'overview', 'other')),
  file_name TEXT NOT NULL CHECK (length(file_name) BETWEEN 1 AND 255),
  content_type TEXT NOT NULL CHECK (length(content_type) BETWEEN 1 AND 100),
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  object_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY (parking_lot_id) REFERENCES parking_lots(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_photos_lot_created
  ON photos(parking_lot_id, created_at DESC);
