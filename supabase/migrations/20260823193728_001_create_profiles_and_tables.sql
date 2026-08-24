/*
# Create profiles and tables schema

1. New Tables
- `profiles`: Extends auth.users with display name and avatar for the friend group.
- `tables`: Game table rooms where 4 players sit for a bridge game.
- `table_players`: Seat assignments (N/E/S/W) for players at a table.

2. Security
- RLS enabled on all tables.
- Profiles: all authenticated users can read (to see who's online), users can update their own.
- Tables: all authenticated users can read and create (private friend club). Host can update/delete.
- Table players: authenticated users can read; users can insert themselves into an open seat and delete their own seat.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  avatar_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
CREATE POLICY "profiles_select_all"
ON profiles FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own"
ON profiles FOR UPDATE
TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own"
ON profiles FOR INSERT
TO authenticated WITH CHECK (auth.uid() = id);

CREATE TABLE IF NOT EXISTS tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  host_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'waiting',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tables_select_all" ON tables;
CREATE POLICY "tables_select_all"
ON tables FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "tables_insert_own" ON tables;
CREATE POLICY "tables_insert_own"
ON tables FOR INSERT
TO authenticated WITH CHECK (auth.uid() = host_id);

DROP POLICY IF EXISTS "tables_update_host" ON tables;
CREATE POLICY "tables_update_host"
ON tables FOR UPDATE
TO authenticated USING (auth.uid() = host_id) WITH CHECK (auth.uid() = host_id);

DROP POLICY IF EXISTS "tables_delete_host" ON tables;
CREATE POLICY "tables_delete_host"
ON tables FOR DELETE
TO authenticated USING (auth.uid() = host_id);

CREATE TABLE IF NOT EXISTS table_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seat text NOT NULL CHECK (seat IN ('N', 'E', 'S', 'W')),
  joined_at timestamptz DEFAULT now(),
  UNIQUE(table_id, seat),
  UNIQUE(table_id, user_id)
);

ALTER TABLE table_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "table_players_select_all" ON table_players;
CREATE POLICY "table_players_select_all"
ON table_players FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "table_players_insert_own" ON table_players;
CREATE POLICY "table_players_insert_own"
ON table_players FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "table_players_delete_own" ON table_players;
CREATE POLICY "table_players_delete_own"
ON table_players FOR DELETE
TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_table_players_table ON table_players(table_id);
