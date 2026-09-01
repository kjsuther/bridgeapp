/*
# Create games, hands, and play history schema

1. New Tables
- `games`: A rubber bridge game session at a table. Tracks rubber state (games won per side, above/below line scores).
- `hands`: Each dealt hand within a game. Stores the deal, dealer, vulnerability, auction, contract, and scoring result.
- `plays`: Individual card plays within a hand's play phase.

2. Security
- RLS enabled on all tables.
- All tables scoped to authenticated users. Anyone authenticated can read (to view/join games). 
- Inserts/updates: players at the table can write. We check membership via table_players.
*/

CREATE TABLE IF NOT EXISTS games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  ns_games_won int NOT NULL DEFAULT 0,
  ew_games_won int NOT NULL DEFAULT 0,
  ns_above int NOT NULL DEFAULT 0,
  ew_above int NOT NULL DEFAULT 0,
  ns_below_current int NOT NULL DEFAULT 0,
  ew_below_current int NOT NULL DEFAULT 0,
  ns_total int NOT NULL DEFAULT 0,
  ew_total int NOT NULL DEFAULT 0,
  hand_number int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  ended_at timestamptz
);

ALTER TABLE games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "games_select_all" ON games;
CREATE POLICY "games_select_all"
ON games FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "games_insert_table_member" ON games;
CREATE POLICY "games_insert_table_member"
ON games FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM table_players WHERE table_players.user_id = auth.uid() AND table_players.table_id = games.table_id)
);

DROP POLICY IF EXISTS "games_update_table_member" ON games;
CREATE POLICY "games_update_table_member"
ON games FOR UPDATE
TO authenticated USING (
  EXISTS (SELECT 1 FROM table_players WHERE table_players.user_id = auth.uid() AND table_players.table_id = games.table_id)
) WITH CHECK (
  EXISTS (SELECT 1 FROM table_players WHERE table_players.user_id = auth.uid() AND table_players.table_id = games.table_id)
);

CREATE TABLE IF NOT EXISTS hands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  hand_number int NOT NULL,
  deal jsonb NOT NULL,
  dealer text NOT NULL CHECK (dealer IN ('N', 'E', 'S', 'W')),
  vulnerability text NOT NULL DEFAULT 'none',
  auction jsonb NOT NULL DEFAULT '[]'::jsonb,
  contract jsonb,
  score jsonb,
  play_state jsonb,
  phase text NOT NULL DEFAULT 'bidding',
  created_at timestamptz DEFAULT now(),
  UNIQUE(game_id, hand_number)
);

ALTER TABLE hands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hands_select_all" ON hands;
CREATE POLICY "hands_select_all"
ON hands FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "hands_insert_table_member" ON hands;
CREATE POLICY "hands_insert_table_member"
ON hands FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM table_players tp
    JOIN games g ON g.id = hands.game_id
    WHERE tp.user_id = auth.uid() AND tp.table_id = g.table_id
  )
);

DROP POLICY IF EXISTS "hands_update_table_member" ON hands;
CREATE POLICY "hands_update_table_member"
ON hands FOR UPDATE
TO authenticated USING (
  EXISTS (
    SELECT 1 FROM table_players tp
    JOIN games g ON g.id = hands.game_id
    WHERE tp.user_id = auth.uid() AND tp.table_id = g.table_id
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM table_players tp
    JOIN games g ON g.id = hands.game_id
    WHERE tp.user_id = auth.uid() AND tp.table_id = g.table_id
  )
);

CREATE TABLE IF NOT EXISTS plays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hand_id uuid NOT NULL REFERENCES hands(id) ON DELETE CASCADE,
  trick_number int NOT NULL,
  seat text NOT NULL CHECK (seat IN ('N', 'E', 'S', 'W')),
  card text NOT NULL,
  played_at timestamptz DEFAULT now()
);

ALTER TABLE plays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plays_select_all" ON plays;
CREATE POLICY "plays_select_all"
ON plays FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "plays_insert_table_member" ON plays;
CREATE POLICY "plays_insert_table_member"
ON plays FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM plays p
    JOIN hands h ON h.id = p.hand_id
    JOIN games g ON g.id = h.game_id
    JOIN table_players tp ON tp.table_id = g.table_id
    WHERE tp.user_id = auth.uid()
  )
);

CREATE INDEX IF NOT EXISTS idx_games_table ON games(table_id);
CREATE INDEX IF NOT EXISTS idx_hands_game ON hands(game_id);
CREATE INDEX IF NOT EXISTS idx_plays_hand ON plays(hand_id);
