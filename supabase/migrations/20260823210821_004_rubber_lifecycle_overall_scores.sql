/*
# Rubber Lifecycle: Overall Score Tracking + Host-Only Rubber Start

1. Changes
- `tables`: Add overall_ns_total and overall_ew_total columns to track cumulative score across all rubbers at a table.
- `tables`: Add rubber_number column to track which rubber is currently active.
- `games`: Add rubber_number column to identify which rubber within a table this game belongs to.
- `games` INSERT: Restrict to table host only (only the host can start a new rubber).
- `games` UPDATE: Keep table member access for play state updates.

2. Security
- Only the table host can insert new games (start new rubbers).
- Any table member can update game state during play.
- RLS remains enabled on all tables.
*/

-- Add overall score tracking to tables
ALTER TABLE tables ADD COLUMN IF NOT EXISTS overall_ns_total int NOT NULL DEFAULT 0;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS overall_ew_total int NOT NULL DEFAULT 0;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS rubber_number int NOT NULL DEFAULT 0;

-- Add rubber number to games
ALTER TABLE games ADD COLUMN IF NOT EXISTS rubber_number int NOT NULL DEFAULT 1;

-- Only the table host can insert new games (start rubbers)
DROP POLICY IF EXISTS "games_insert_table_member" ON games;
CREATE POLICY "games_insert_host_only"
ON games FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM tables t WHERE t.id = games.table_id AND t.host_id = auth.uid())
);

-- Keep table member update access for play state
DROP POLICY IF EXISTS "games_update_table_member" ON games;
CREATE POLICY "games_update_member"
ON games FOR UPDATE
TO authenticated USING (
  EXISTS (
    SELECT 1 FROM table_players tp
    WHERE tp.user_id = auth.uid() AND tp.table_id = games.table_id
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM table_players tp
    WHERE tp.user_id = auth.uid() AND tp.table_id = games.table_id
  )
);
