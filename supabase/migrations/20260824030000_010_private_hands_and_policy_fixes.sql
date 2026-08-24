/*
  Protect hidden hands and repair row-level security policies.

  Deals are split into one row per seat. A player can read their own cards,
  dummy becomes visible after the opening lead, and all cards become visible
  after play. New deals are generated inside Postgres so no participant's
  browser receives all four hands while dealing.
*/

CREATE OR REPLACE FUNCTION public.can_access_bridge_table(requested_table_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.tables t
      WHERE t.id = requested_table_id AND t.host_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.table_players tp
      WHERE tp.table_id = requested_table_id AND tp.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_bridge_table(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_bridge_table(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.hand_cards (
  hand_id uuid NOT NULL REFERENCES public.hands(id) ON DELETE CASCADE,
  seat text NOT NULL CHECK (seat IN ('N', 'E', 'S', 'W')),
  cards jsonb NOT NULL,
  PRIMARY KEY (hand_id, seat)
);

ALTER TABLE public.hand_cards ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.hands
  ADD COLUMN IF NOT EXISTS state_version bigint NOT NULL DEFAULT 0;

-- Preserve existing games before clearing the legacy all-hands payload.
INSERT INTO public.hand_cards (hand_id, seat, cards)
SELECT h.id, e.key, e.value
FROM public.hands h
CROSS JOIN LATERAL jsonb_each(h.deal) AS e
WHERE h.deal IS NOT NULL
ON CONFLICT (hand_id, seat) DO NOTHING;

ALTER TABLE public.hands ALTER COLUMN deal DROP NOT NULL;
UPDATE public.hands SET deal = NULL WHERE deal IS NOT NULL;

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
          AND hand_cards.seat = CASE h.contract->>'declarer'
            WHEN 'N' THEN 'S'
            WHEN 'S' THEN 'N'
            WHEN 'E' THEN 'W'
            WHEN 'W' THEN 'E'
          END
        )
      )
  )
);

CREATE OR REPLACE FUNCTION public.create_bridge_hand(
  p_game_id uuid,
  p_hand_number integer,
  p_dealer text,
  p_vulnerability text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_id uuid;
  v_hand_id uuid;
  v_deck text[];
BEGIN
  SELECT table_id INTO v_table_id FROM public.games WHERE id = p_game_id;
  IF v_table_id IS NULL OR NOT public.can_access_bridge_table(v_table_id) THEN
    RAISE EXCEPTION 'Not authorized to deal this hand';
  END IF;
  IF p_dealer NOT IN ('N', 'E', 'S', 'W') THEN
    RAISE EXCEPTION 'Invalid dealer';
  END IF;
  IF p_vulnerability NOT IN ('none', 'NS', 'EW', 'both') THEN
    RAISE EXCEPTION 'Invalid vulnerability';
  END IF;

  SELECT array_agg(rank || suit ORDER BY random())
  INTO v_deck
  FROM unnest(ARRAY['2','3','4','5','6','7','8','9','T','J','Q','K','A']) AS ranks(rank)
  CROSS JOIN unnest(ARRAY['S','H','D','C']) AS suits(suit);

  INSERT INTO public.hands (
    game_id, hand_number, deal, dealer, vulnerability, auction, phase
  ) VALUES (
    p_game_id, p_hand_number, NULL, p_dealer, p_vulnerability, '[]'::jsonb, 'bidding'
  )
  RETURNING id INTO v_hand_id;

  INSERT INTO public.hand_cards (hand_id, seat, cards) VALUES
    (v_hand_id, 'N', to_jsonb(v_deck[1:13])),
    (v_hand_id, 'E', to_jsonb(v_deck[14:26])),
    (v_hand_id, 'S', to_jsonb(v_deck[27:39])),
    (v_hand_id, 'W', to_jsonb(v_deck[40:52]));

  RETURN v_hand_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_bridge_hand(uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_bridge_hand(uuid, integer, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_bridge_hand(
  p_hand_id uuid,
  p_expected_version bigint,
  p_patch jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_id uuid;
  v_next_version bigint;
BEGIN
  SELECT g.table_id
  INTO v_table_id
  FROM public.hands h
  JOIN public.games g ON g.id = h.game_id
  WHERE h.id = p_hand_id;

  IF v_table_id IS NULL OR NOT public.can_access_bridge_table(v_table_id) THEN
    RAISE EXCEPTION 'Not authorized to update this hand';
  END IF;

  UPDATE public.hands
  SET
    auction = CASE WHEN p_patch ? 'auction' THEN p_patch->'auction' ELSE auction END,
    contract = CASE WHEN p_patch ? 'contract' THEN NULLIF(p_patch->'contract', 'null'::jsonb) ELSE contract END,
    score = CASE WHEN p_patch ? 'score' THEN NULLIF(p_patch->'score', 'null'::jsonb) ELSE score END,
    play_state = CASE WHEN p_patch ? 'play_state' THEN NULLIF(p_patch->'play_state', 'null'::jsonb) ELSE play_state END,
    bid_undo_request = CASE WHEN p_patch ? 'bid_undo_request' THEN NULLIF(p_patch->'bid_undo_request', 'null'::jsonb) ELSE bid_undo_request END,
    phase = CASE WHEN p_patch ? 'phase' THEN p_patch->>'phase' ELSE phase END,
    state_version = state_version + 1
  WHERE id = p_hand_id
    AND state_version = p_expected_version
  RETURNING state_version INTO v_next_version;

  RETURN v_next_version;
END;
$$;

REVOKE ALL ON FUNCTION public.update_bridge_hand(uuid, bigint, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_bridge_hand(uuid, bigint, jsonb) TO authenticated;

DROP POLICY IF EXISTS "hands_update_table_member" ON public.hands;

CREATE OR REPLACE FUNCTION public.record_bridge_play(
  p_hand_id uuid,
  p_trick_number integer,
  p_seat text,
  p_card text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_id uuid;
  v_play_id uuid;
BEGIN
  SELECT g.table_id
  INTO v_table_id
  FROM public.hands h
  JOIN public.games g ON g.id = h.game_id
  WHERE h.id = p_hand_id;

  IF v_table_id IS NULL OR NOT public.can_access_bridge_table(v_table_id) THEN
    RAISE EXCEPTION 'Not authorized to record this play';
  END IF;
  IF p_seat NOT IN ('N', 'E', 'S', 'W')
    OR p_card !~ '^(2|3|4|5|6|7|8|9|T|J|Q|K|A)(S|H|D|C)$'
  THEN
    RAISE EXCEPTION 'Invalid play';
  END IF;

  INSERT INTO public.plays (hand_id, trick_number, seat, card)
  VALUES (p_hand_id, p_trick_number, p_seat, p_card)
  RETURNING id INTO v_play_id;

  RETURN v_play_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_bridge_play(uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_bridge_play(uuid, integer, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_last_bridge_play(p_hand_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_id uuid;
BEGIN
  SELECT g.table_id
  INTO v_table_id
  FROM public.hands h
  JOIN public.games g ON g.id = h.game_id
  WHERE h.id = p_hand_id;

  IF v_table_id IS NULL OR NOT public.can_access_bridge_table(v_table_id) THEN
    RAISE EXCEPTION 'Not authorized to undo this play';
  END IF;

  DELETE FROM public.plays
  WHERE id = (
    SELECT id
    FROM public.plays
    WHERE hand_id = p_hand_id
    ORDER BY played_at DESC, id DESC
    LIMIT 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_last_bridge_play(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_last_bridge_play(uuid) TO authenticated;

DROP POLICY IF EXISTS "plays_insert_member" ON public.plays;
DROP POLICY IF EXISTS "plays_insert_table_member" ON public.plays;

CREATE UNIQUE INDEX IF NOT EXISTS plays_one_card_per_seat_per_trick
ON public.plays(hand_id, trick_number, seat);

DROP POLICY IF EXISTS "table_players_select_all" ON public.table_players;
DROP POLICY IF EXISTS "table_players_select_visible" ON public.table_players;
CREATE POLICY "table_players_select_visible"
ON public.table_players FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.can_access_bridge_table(table_id)
);

DROP POLICY IF EXISTS "plays_select_member" ON public.plays;
CREATE POLICY "plays_select_member"
ON public.plays FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.hands h
    JOIN public.games g ON g.id = h.game_id
    WHERE h.id = plays.hand_id
      AND public.can_access_bridge_table(g.table_id)
  )
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'hand_cards'
    )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hand_cards;
  END IF;
END $$;
