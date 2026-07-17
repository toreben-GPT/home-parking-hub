ALTER TABLE parking_lots
  ADD COLUMN parking_ease_evaluated INTEGER NOT NULL DEFAULT 1
  CHECK (parking_ease_evaluated IN (0, 1));
