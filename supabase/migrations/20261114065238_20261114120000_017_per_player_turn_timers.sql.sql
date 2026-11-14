/*
# Add per-player turn timers to bridge hands

## Summary
Tracks how long each player spends on their turns during bidding and card
play. At the end of a hand, the accumulated milliseconds per seat are shown
on the summary screen. Time spent waiting for the dummy hand to play is NOT
counted toward the dummy player — those turns are attributed to the declarer,
who plays the dummy's cards.

## New columns on `hands`
1. `turn_started_at` (timestamptz, nullable)
   - Marks when the current turn began. Set to `now()` when a hand is created
     and reset to `now()` on every turn transition (bid placed, card played).
   - Set to NULL when the hand reaches scoring/finished so the clock stops.
2. `turn_times` (jsonb, default '{}'::jsonb)
   - Accumulated milliseconds per seat, e.g. `{"N": 14200, "E": 8700}`.
   - Updated server-side on each turn transition.

## Changes to `create_bridge_hand`
- Initializes `turn_started_at = now()` and `turn_times = '{}'::jsonb` for
  both original and replay hands, so the first bidder's clock starts
  immediately when the hand is dealt.

## Changes to `update_bridge_hand`
- Adds handling for two new patch keys:
  - `turn_started_at`: sets the timestamp (NULL to stop the clock).
  - `turn_times`: replaces the accumulated-times JSON.
- All existing patch keys (auction, contract, score, play_state, etc.) remain
  unchanged.

## Security
- No new tables, no new policies, no new grants.
- Both RPC functions remain SECURITY DEFINER with `search_path = public`,
  callable by `authenticated` only (existing grants preserved).
- The new columns are accessible through the existing `hands` SELECT policy
  (`hands_select_all` / table-member checks) since they are part of the hands
  row.
*/

ALTER TABLE public.hands
  ADD COLUMN IF NOT EXISTS turn_started_at timestamptz;

ALTER TABLE public.hands
  ADD COLUMN IF NOT EXISTS turn_times jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill turn_started_at to now() for any existing hands that have one.
UPDATE public.hands SET turn_started_at = now()
  WHERE turn_started_at IS NULL;

CREATE OR REPLACE FUNCTION public.create_bridge_hand(
  p_game_id uuid,
  p_hand_number integer,
  p_dealer text,
  p_vulnerability text,
  p_hand_role text DEFAULT 'original',
  p_original_hand_id uuid DEFAULT NULL
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
  v_orig_cards record;
  v_original_dealer text;
  v_original_vulnerability text;
  v_n_cards jsonb;
  v_e_cards jsonb;
  v_s_cards jsonb;
  v_w_cards jsonb;
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
  IF p_hand_role NOT IN ('original', 'replay') THEN
    RAISE EXCEPTION 'Invalid hand_role';
  END IF;

  IF p_hand_role = 'replay' THEN
    IF p_original_hand_id IS NULL THEN
      RAISE EXCEPTION 'A replay requires an original hand';
    END IF;
    SELECT
      h.dealer, h.vulnerability,
      hc_n.cards AS n_cards,
      hc_e.cards AS e_cards,
      hc_s.cards AS s_cards,
      hc_w.cards AS w_cards
    INTO v_orig_cards
    FROM public.hands h
    LEFT JOIN public.hand_cards hc_n ON hc_n.hand_id = h.id AND hc_n.seat = 'N'
    LEFT JOIN public.hand_cards hc_e ON hc_e.hand_id = h.id AND hc_e.seat = 'E'
    LEFT JOIN public.hand_cards hc_s ON hc_s.hand_id = h.id AND hc_s.seat = 'S'
    LEFT JOIN public.hand_cards hc_w ON hc_w.hand_id = h.id AND hc_w.seat = 'W'
    WHERE h.id = p_original_hand_id
      AND h.game_id = p_game_id
      AND h.hand_role = 'original'
      AND h.phase IN ('scoring', 'finished');

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Completed original hand not found in this game';
    END IF;
    IF v_orig_cards.n_cards IS NULL OR v_orig_cards.e_cards IS NULL
       OR v_orig_cards.s_cards IS NULL OR v_orig_cards.w_cards IS NULL THEN
      RAISE EXCEPTION 'Original hand is missing cards';
    END IF;

    v_n_cards := v_orig_cards.w_cards;
    v_e_cards := v_orig_cards.n_cards;
    v_s_cards := v_orig_cards.e_cards;
    v_w_cards := v_orig_cards.s_cards;

    v_original_dealer := v_orig_cards.dealer;
    v_original_vulnerability := v_orig_cards.vulnerability;
    p_dealer := CASE v_original_dealer
      WHEN 'N' THEN 'E' WHEN 'E' THEN 'S'
      WHEN 'S' THEN 'W' WHEN 'W' THEN 'N' END;
    p_vulnerability := CASE v_original_vulnerability
      WHEN 'NS' THEN 'EW' WHEN 'EW' THEN 'NS'
      ELSE v_original_vulnerability END;

    INSERT INTO public.hands (
      game_id, hand_number, deal, dealer, vulnerability, auction, phase,
      hand_role, original_hand_id, turn_started_at, turn_times
    ) VALUES (
      p_game_id, p_hand_number, NULL, p_dealer, p_vulnerability, '[]'::jsonb, 'bidding',
      p_hand_role, p_original_hand_id, now(), '{}'::jsonb
    )
    RETURNING id INTO v_hand_id;

    INSERT INTO public.hand_cards (hand_id, seat, cards) VALUES
      (v_hand_id, 'N', v_n_cards),
      (v_hand_id, 'E', v_e_cards),
      (v_hand_id, 'S', v_s_cards),
      (v_hand_id, 'W', v_w_cards);
  ELSE
    SELECT array_agg(rank || suit ORDER BY random())
    INTO v_deck
    FROM unnest(ARRAY['2','3','4','5','6','7','8','9','T','J','Q','K','A']) AS ranks(rank)
    CROSS JOIN unnest(ARRAY['S','H','D','C']) AS suits(suit);

    INSERT INTO public.hands (
      game_id, hand_number, deal, dealer, vulnerability, auction, phase,
      hand_role, turn_started_at, turn_times
    ) VALUES (
      p_game_id, p_hand_number, NULL, p_dealer, p_vulnerability, '[]'::jsonb, 'bidding',
      COALESCE(p_hand_role, 'original'), now(), '{}'::jsonb
    )
    RETURNING id INTO v_hand_id;

    INSERT INTO public.hand_cards (hand_id, seat, cards) VALUES
      (v_hand_id, 'N', to_jsonb(v_deck[1:13])),
      (v_hand_id, 'E', to_jsonb(v_deck[14:26])),
      (v_hand_id, 'S', to_jsonb(v_deck[27:39])),
      (v_hand_id, 'W', to_jsonb(v_deck[40:52]));
  END IF;

  RETURN v_hand_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_bridge_hand(uuid, integer, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_bridge_hand(uuid, integer, text, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_bridge_hand(
  p_hand_id uuid,
  p_expected_version bigint,
  p_patch jsonb
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_table_id uuid;
  v_next_version bigint;
  v_current_turn_started_at timestamptz;
  v_current_turn_times jsonb;
  v_seat text;
  v_elapsed_ms bigint;
  v_new_turn_times jsonb;
BEGIN
  SELECT g.table_id
  INTO v_table_id
  FROM public.hands h
  JOIN public.games g ON g.id = h.game_id
  WHERE h.id = p_hand_id;

  IF v_table_id IS NULL OR NOT public.can_access_bridge_table(v_table_id) THEN
    RAISE EXCEPTION 'Not authorized to update this hand';
  END IF;

  -- If the patch includes a 'timed_seat', accumulate elapsed time for that
  -- seat before applying the rest of the patch. This keeps timing
  -- authoritative on the server (clocks differ between browsers).
  IF p_patch ? 'timed_seat' THEN
    v_seat := p_patch->>'timed_seat';

    SELECT turn_started_at, turn_times
    INTO v_current_turn_started_at, v_current_turn_times
    FROM public.hands
    WHERE id = p_hand_id
      AND state_version = p_expected_version;

    IF v_current_turn_started_at IS NOT NULL AND v_seat IN ('N', 'E', 'S', 'W') THEN
      v_elapsed_ms := GREATEST(
        EXTRACT(EPOCH FROM (now() - v_current_turn_started_at)) * 1000,
        0
      )::bigint;

      v_new_turn_times := COALESCE(v_current_turn_times, '{}'::jsonb)
        || jsonb_build_object(v_seat, (
          COALESCE((COALESCE(v_current_turn_times, '{}'::jsonb) ->> v_seat)::bigint, 0) + v_elapsed_ms
        ));

      -- Merge the computed turn_times into the patch so the UPDATE below
      -- persists it, and reset turn_started_at to now() (or NULL if the
      -- hand is ending).
      p_patch := p_patch
        || jsonb_build_object('turn_times', v_new_turn_times)
        || jsonb_build_object(
             'turn_started_at',
             CASE WHEN p_patch ? 'phase' AND p_patch->>'phase' IN ('scoring', 'finished')
                  THEN 'null'::jsonb
                  ELSE to_jsonb(now()) END
           );
    END IF;
  END IF;

  UPDATE public.hands
  SET
    auction = CASE WHEN p_patch ? 'auction' THEN p_patch->'auction' ELSE auction END,
    contract = CASE WHEN p_patch ? 'contract' THEN NULLIF(p_patch->'contract', 'null'::jsonb) ELSE contract END,
    score = CASE WHEN p_patch ? 'score' THEN NULLIF(p_patch->'score', 'null'::jsonb) ELSE score END,
    play_state = CASE WHEN p_patch ? 'play_state' THEN NULLIF(p_patch->'play_state', 'null'::jsonb) ELSE play_state END,
    bid_undo_request = CASE WHEN p_patch ? 'bid_undo_request' THEN NULLIF(p_patch->'bid_undo_request', 'null'::jsonb) ELSE bid_undo_request END,
    imp_result = CASE WHEN p_patch ? 'imp_result' THEN NULLIF(p_patch->'imp_result', 'null'::jsonb) ELSE imp_result END,
    turn_times = CASE WHEN p_patch ? 'turn_times' THEN p_patch->'turn_times' ELSE turn_times END,
    turn_started_at = CASE
      WHEN p_patch ? 'turn_started_at' THEN NULLIF(p_patch->'turn_started_at', 'null'::jsonb)::timestamptz
      ELSE turn_started_at END,
    phase = CASE WHEN p_patch ? 'phase' THEN p_patch->>'phase' ELSE phase END,
    state_version = state_version + 1
  WHERE id = p_hand_id
  AND state_version = p_expected_version
  RETURNING state_version INTO v_next_version;

  RETURN v_next_version;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_bridge_hand(uuid, bigint, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_bridge_hand(uuid, bigint, jsonb) TO authenticated;
