-- Add configurable "new hands before replay" setting to tables
ALTER TABLE tables
  ADD COLUMN IF NOT EXISTS new_hands_before_replay int NOT NULL DEFAULT 10
    CHECK (new_hands_before_replay >= 1);
