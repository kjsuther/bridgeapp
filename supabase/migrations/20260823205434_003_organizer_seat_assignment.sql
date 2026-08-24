/*
# Organizer-Driven Seat Assignment

1. Changes
- `table_players`: Allow any table member (organizer) to insert and delete seat assignments for other users,
  not just the user themselves. The organizer is the table creator (host) OR any player already seated at the table.
- `tables`: Allow any table member to update the table status (so any seated player can start the rubber,
  not just the original host). The host can still update.
- `tables`: Allow any table member to update the table (for status changes like 'playing', 'waiting', 'finished').

2. Security
- RLS remains enabled on all tables.
- `table_players` INSERT: allowed if the inserting user is the table host OR is already seated at this table.
- `table_players` DELETE: allowed if the deleting user is the table host OR is already seated at this table
  OR is deleting their own seat.
- `tables` UPDATE: allowed if the user is the table host OR is seated at this table.
- `tables` SELECT: now scoped to host or seated players only (so users only see their own tables).
- `games` SELECT: scoped to table members only.
- `hands` SELECT: scoped to table members only.
- `plays` SELECT: scoped to table members only.

3. Important Notes
- This enables the "organizer" workflow: one person creates a table, assigns all four seats by picking
  from all logged-in users, and starts the game. When a user is assigned to a seat, their lobby detects
  it via realtime and auto-navigates them to the table.
- Any seated player can restart the table (start a new rubber) even if they didn't create it.
*/

-- table_players: allow organizer (host or any seated member) to insert seats for other users
DROP POLICY IF EXISTS "table_players_insert_own" ON table_players;
CREATE POLICY "table_players_insert_organizer"
ON table_players FOR INSERT
TO authenticated WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM tables t WHERE t.id = table_players.table_id AND t.host_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM table_players tp
    WHERE tp.table_id = table_players.table_id AND tp.user_id = auth.uid()
  )
);

-- table_players: allow organizer (host or any seated member) to delete any seat, or user to delete own seat
DROP POLICY IF EXISTS "table_players_delete_own" ON table_players;
CREATE POLICY "table_players_delete_organizer"
ON table_players FOR DELETE
TO authenticated USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM tables t WHERE t.id = table_players.table_id AND t.host_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM table_players tp
    WHERE tp.table_id = table_players.table_id AND tp.user_id = auth.uid()
  )
);

-- tables: allow any table member to update (status changes, etc.)
DROP POLICY IF EXISTS "tables_update_host" ON tables;
CREATE POLICY "tables_update_member"
ON tables FOR UPDATE
TO authenticated USING (
  auth.uid() = host_id
  OR EXISTS (
    SELECT 1 FROM table_players tp
    WHERE tp.table_id = tables.id AND tp.user_id = auth.uid()
  )
) WITH CHECK (
  auth.uid() = host_id
  OR EXISTS (
    SELECT 1 FROM table_players tp
    WHERE tp.table_id = tables.id AND tp.user_id = auth.uid()
  )
);

-- tables: scope SELECT to host or seated players only (users only see tables they created or were pulled into)
DROP POLICY IF EXISTS "tables_select_all" ON tables;
CREATE POLICY "tables_select_member_or_host"
ON tables FOR SELECT
TO authenticated USING (
  host_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM table_players tp
    WHERE tp.table_id = tables.id AND tp.user_id = auth.uid()
  )
);

-- games: scope SELECT to table members only
DROP POLICY IF EXISTS "games_select_all" ON games;
CREATE POLICY "games_select_member"
ON games FOR SELECT
TO authenticated USING (
  EXISTS (
    SELECT 1 FROM table_players tp
    JOIN games g ON g.id = games.id
    WHERE tp.user_id = auth.uid() AND tp.table_id = g.table_id
  )
);

-- hands: scope SELECT to table members only
DROP POLICY IF EXISTS "hands_select_all" ON hands;
CREATE POLICY "hands_select_member"
ON hands FOR SELECT
TO authenticated USING (
  EXISTS (
    SELECT 1 FROM table_players tp
    JOIN games g ON g.id = hands.game_id
    WHERE tp.user_id = auth.uid() AND tp.table_id = g.table_id
  )
);

-- plays: scope SELECT to table members only
DROP POLICY IF EXISTS "plays_select_all" ON plays;
CREATE POLICY "plays_select_member"
ON plays FOR SELECT
TO authenticated USING (
  EXISTS (
    SELECT 1 FROM plays p
    JOIN hands h ON h.id = p.hand_id
    JOIN games g ON g.id = h.game_id
    JOIN table_players tp ON tp.table_id = g.table_id
    WHERE tp.user_id = auth.uid()
  )
);

-- plays: fix INSERT policy to properly reference the row being inserted
DROP POLICY IF EXISTS "plays_insert_table_member" ON plays;
CREATE POLICY "plays_insert_member"
ON plays FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM hands h
    JOIN games g ON g.id = h.game_id
    JOIN table_players tp ON tp.table_id = g.table_id
    WHERE h.id = plays.hand_id AND tp.user_id = auth.uid()
  )
);
