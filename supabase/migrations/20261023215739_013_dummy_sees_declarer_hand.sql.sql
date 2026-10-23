/*
# Allow dummy player to see declarer's hand after opening lead

## Purpose
After the opening lead, the dummy player should be able to see their partner's
(the declarer's) hand so they can follow along with the play. Currently the
hand_cards RLS policy only allows reading the dummy's cards once dummy is
revealed — it does not allow the dummy player to read the declarer's cards.

## Changes
1. Modifies the `hand_cards_select_visible` SELECT policy on `hand_cards`.
   - Adds a new OR branch: when dummy is revealed, the player sitting at the
     dummy seat can also read the declarer's cards (the declarer is the
     partner of the dummy).
   - The declarer seat is derived from `h.contract->>'declarer'`, and the
     dummy seat is the opposite partner (N<->S, E<->W).

## Security
- Only the dummy player (the one seated at the dummy seat) gains read access
  to the declarer's cards, and only after the opening lead (`dummyRevealed`
  is true in `play_state`).
- No other player's access changes.
- The policy is still scoped to authenticated users who are members of the
  table.
*/

DROP POLICY IF EXISTS "hand_cards_select_visible" ON public.hand_cards;

CREATE POLICY "hand_cards_select_visible"
ON public.hand_cards FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.hands h
    JOIN public.games g ON g.id = h.game_id
    LEFT JOIN public.table_players me
      ON me.table_id = g.table_id AND me.user_id = auth.uid()
    WHERE h.id = hand_cards.hand_id
      AND public.can_access_bridge_table(g.table_id)
      AND (
        me.seat = hand_cards.seat
        OR h.phase IN ('scoring', 'finished')
        OR (
          COALESCE((h.play_state->>'dummyRevealed')::boolean, false)
          AND (
            -- Anyone can see the dummy's cards once revealed
            hand_cards.seat = CASE h.contract->>'declarer'
              WHEN 'N' THEN 'S'
              WHEN 'S' THEN 'N'
              WHEN 'E' THEN 'W'
              WHEN 'W' THEN 'E'
            END
            OR (
              -- The dummy player can also see the declarer's cards
              me.seat = CASE h.contract->>'declarer'
                WHEN 'N' THEN 'S'
                WHEN 'S' THEN 'N'
                WHEN 'E' THEN 'W'
                WHEN 'W' THEN 'E'
              END
              AND hand_cards.seat = h.contract->>'declarer'
            )
          )
        )
      )
  )
);