/*
# Constrain "new hands before replay" to multiples of four

## Summary

In duplicate bridge, dealer and vulnerability cycle every 4 boards
(N, E, S, W, then repeat). For replay hands to have the same dealer and
vulnerability as their original board, the block of new hands before
replays start must be a multiple of 4. This migration:

1. Updates the CHECK constraint on `tables.new_hands_before_replay`
   from `>= 1` to `>= 4 AND % 4 = 0`.
2. Changes the column default from 10 to 8 (nearest valid multiple of 4).
3. Migrates any existing tables with invalid values to the nearest valid
   multiple of 4 (rounding down to the nearest lower multiple, minimum 4).

## Changes

### tables table
- `new_hands_before_replay`: new CHECK constraint `(new_hands_before_replay >= 4 AND new_hands_before_replay % 4 = 0)`
- Default changed from 10 to 8

### Data migration
- Any table with `new_hands_before_replay` not a multiple of 4 is updated to
  `GREATEST(4, (new_hands_before_replay / 4) * 4)` — the largest valid value
  that does not exceed the current value (minimum 4).

## Security
- No RLS or policy changes.
*/

-- Fix any existing rows with invalid values (not a multiple of 4, or less than 4)
UPDATE tables
  SET new_hands_before_replay = GREATEST(4, (new_hands_before_replay / 4) * 4)
  WHERE new_hands_before_replay < 4
     OR new_hands_before_replay % 4 <> 0;

-- Drop the old constraint and add the new one
ALTER TABLE tables DROP CONSTRAINT IF EXISTS tables_new_hands_before_replay_check;
ALTER TABLE tables
  ADD CONSTRAINT tables_new_hands_before_replay_check
  CHECK (new_hands_before_replay >= 4 AND new_hands_before_replay % 4 = 0);

-- Change the default to 8
ALTER TABLE tables
  ALTER COLUMN new_hands_before_replay SET DEFAULT 8;
