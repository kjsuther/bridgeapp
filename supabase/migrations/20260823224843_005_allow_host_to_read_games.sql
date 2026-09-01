/*
# Allow Table Hosts to Read Newly Started Games

1. Changes
- Update the `games` SELECT policy so the table host can read games for their table.
- Keep seated-player access unchanged.

2. Security
- Access remains limited to authenticated users who are either the table host or a seated player.
- This is required because the host creates the first game before relying on the game row returned by Supabase.
*/

DROP POLICY IF EXISTS "games_select_member" ON games;
CREATE POLICY "games_select_member_or_host"
ON games FOR SELECT
TO authenticated USING (
  EXISTS (
    SELECT 1 FROM tables t
    WHERE t.id = games.table_id AND t.host_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM table_players tp
    WHERE tp.user_id = auth.uid() AND tp.table_id = games.table_id
  )
);
