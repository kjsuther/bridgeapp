/*
# Add below-completed columns for rubber scorecard display

1. Changes
- `games`: Add `ns_below_completed` and `ew_below_completed` columns to store
  the sum of below-line points from completed games within the current rubber.
  This lets the scorecard show completed-game points with a separator line
  above the current game's below-line points, instead of sweeping everything
  to the total immediately.

2. Security
- No security changes. Existing policies remain in effect.
*/

ALTER TABLE games ADD COLUMN IF NOT EXISTS ns_below_completed int NOT NULL DEFAULT 0;
ALTER TABLE games ADD COLUMN IF NOT EXISTS ew_below_completed int NOT NULL DEFAULT 0;
