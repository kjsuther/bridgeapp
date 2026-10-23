/*
# Duplicate IMP Match Scoring

## Summary

This migration adds support for a duplicate-style bridge match where hands are
replayed with swapped seats (N+S swap with E+W) and scored using IMP (International
Matchpoint) comparison. The match structure is:

  - Hands 1-10: "original" hands, dealt fresh and played normally
  - Hands 11-20: "replay" hands — each replays one of hands 1-10 with seats swapped
    (the deal from hand N is re-dealt with N↔E and S↔W swapped so each team plays
     the other side's cards)
  - Hands 21+: alternating — odd-numbered hands are new originals; the next even-
    numbered hand replays the oldest played original that hasn't been replayed yet

After each replay hand completes, the app computes the net score difference between
the original and replay playings and converts it to IMPs using the WBF IMP scale.

## Changes

### hands table — new columns
- `hand_role` (text, default 'original'): 'original' for freshly dealt hands,
  'replay' for a swapped-second playing of a prior hand.
- `original_hand_id` (uuid, nullable): for replay hands, points to the original
  hand whose deal was re-used (with swapped seats). NULL for original hands.
- `imp_result` (jsonb, nullable): for replay hands, stores { netPoints, imps,
  teamAIsNS } after both playings are scored.

### tables table — new columns
- `match_imps_a` (int, default 0): cumulative IMPs for Team A (originally N+S).
- `match_imps_b` (int, default 0): cumulative IMPs for Team B (originally E+W).
- `match_board_number` (int, default 0): number of completed board-pairs.

### create_bridge_hand — new optional parameters
- `p_hand_role` (text, default 'original'): 'original' or 'replay'.
- `p_original_hand_id` (uuid, nullable): the original hand to copy deal from, when
  replay=true. When provided, the deal is copied from that hand with seats swapped
  (N↔E, S↔W) instead of being randomly dealt.

### Security
- No new tables. Existing RLS policies on `hands`, `tables`, and `games` remain
  in effect. The updated `create_bridge_hand` function keeps its SECURITY DEFINER
  + table-access check. No new policies needed.
*/

-- Add hand_role, original_hand_id, imp_result to hands
ALTER TABLE hands
  ADD COLUMN IF NOT EXISTS hand_role text NOT NULL DEFAULT 'original'
    CHECK (hand_role IN ('original', 'replay'));

ALTER TABLE hands
  ADD COLUMN IF NOT EXISTS original_hand_id uuid REFERENCES hands(id) ON DELETE SET NULL;

ALTER TABLE hands
  ADD COLUMN IF NOT EXISTS imp_result jsonb;

-- Add match IMP tracking to tables
ALTER TABLE tables
  ADD COLUMN IF NOT EXISTS match_imps_a int NOT NULL DEFAULT 0;

ALTER TABLE tables
  ADD COLUMN IF NOT EXISTS match_imps_b int NOT NULL DEFAULT 0;

ALTER TABLE tables
  ADD COLUMN IF NOT EXISTS match_board_number int NOT NULL DEFAULT 0;

-- Index for finding original hands that need replay
CREATE INDEX IF NOT EXISTS idx_hands_original_role
  ON hands(game_id, hand_role);

CREATE INDEX IF NOT EXISTS idx_hands_original_hand_id
  ON hands(original_hand_id)
  WHERE original_hand_id IS NOT NULL;

-- Updated create_bridge_hand with replay support
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

  IF p_hand_role = 'replay' AND p_original_hand_id IS NOT NULL THEN
    -- Copy the deal from the original hand with seats swapped (N<->E, S<->W)
    SELECT
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
    WHERE h.id = p_original_hand_id;

    IF v_orig_cards IS NULL THEN
      RAISE EXCEPTION 'Original hand not found';
    END IF;

    -- Swap: new N gets old E, new E gets old N, new S gets old W, new W gets old S
    v_n_cards := COALESCE(v_orig_cards.e_cards, '[]'::jsonb);
    v_e_cards := COALESCE(v_orig_cards.n_cards, '[]'::jsonb);
    v_s_cards := COALESCE(v_orig_cards.w_cards, '[]'::jsonb);
    v_w_cards := COALESCE(v_orig_cards.s_cards, '[]'::jsonb);

    INSERT INTO public.hands (
      game_id, hand_number, deal, dealer, vulnerability, auction, phase,
      hand_role, original_hand_id
    ) VALUES (
      p_game_id, p_hand_number, NULL, p_dealer, p_vulnerability, '[]'::jsonb, 'bidding',
      p_hand_role, p_original_hand_id
    )
    RETURNING id INTO v_hand_id;

    INSERT INTO public.hand_cards (hand_id, seat, cards) VALUES
      (v_hand_id, 'N', v_n_cards),
      (v_hand_id, 'E', v_e_cards),
      (v_hand_id, 'S', v_s_cards),
      (v_hand_id, 'W', v_w_cards);
  ELSE
    -- Standard random deal
    SELECT array_agg(rank || suit ORDER BY random())
    INTO v_deck
    FROM unnest(ARRAY['2','3','4','5','6','7','8','9','T','J','Q','K','A']) AS ranks(rank)
    CROSS JOIN unnest(ARRAY['S','H','D','C']) AS suits(suit);

    INSERT INTO public.hands (
      game_id, hand_number, deal, dealer, vulnerability, auction, phase,
      hand_role
    ) VALUES (
      p_game_id, p_hand_number, NULL, p_dealer, p_vulnerability, '[]'::jsonb, 'bidding',
      COALESCE(p_hand_role, 'original')
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
