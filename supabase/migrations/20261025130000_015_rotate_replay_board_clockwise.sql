/*
 * Replay the board with a clockwise quarter-turn, preserving hand order.
 * Dealer and vulnerability follow the original cards, independently of client
 * parameters. Players keep their seats and exchange partnerships' cards.
 * Only future replays change; existing hands and scores are left as recorded.
 * Apply before deploying the matching frontend. Finish any active replay
 * before switching all clients to the new frontend.
 */

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
    -- Rotate the cards clockwise instead of reflecting N/E and S/W.
    -- Derive board metadata here so every caller uses the same rotation.
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

    -- Old N -> E, E -> S, S -> W, W -> N.
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
