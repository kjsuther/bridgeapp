/*
# Fix turn_started_at jsonb-to-timestamptz cast in update_bridge_hand

## Problem
The per-player turn timer migration (017) added `turn_started_at` handling
to `update_bridge_hand`. The UPDATE statement used:

    NULLIF(p_patch->'turn_started_at', 'null'::jsonb)::timestamptz

The `->` operator returns jsonb, and Postgres cannot cast jsonb directly
to timestamptz (`ERROR: cannot cast type jsonb to timestamp with time zone`).

This caused every bid and card play to fail silently — the RPC raised an
exception, the frontend's `updateHand` received an error, showed "The table
changed on another device", and refreshed. Players could not bid or play.

## Fix
Change `->` to `->>` (which returns text) so the value is a text string
that can be cast to timestamptz:

    NULLIF(p_patch->>'turn_started_at', 'null')::timestamptz

## Security
- No schema changes, no new tables, no policy changes.
- The RPC remains SECURITY DEFINER with existing grants.
*/

CREATE OR REPLACE FUNCTION public.update_bridge_hand(
  p_hand_id uuid,
  p_expected_version bigint,
  p_patch jsonb
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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
      WHEN p_patch ? 'turn_started_at' THEN NULLIF(p_patch->>'turn_started_at', 'null')::timestamptz
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
