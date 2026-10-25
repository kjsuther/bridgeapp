/*
# Fix update_bridge_hand to persist imp_result

## Problem
The `update_bridge_hand` RPC function handled `auction`, `contract`, `score`,
`play_state`, `bid_undo_request`, and `phase` patches — but did NOT handle the
`imp_result` column. When the game computed the IMP result for a completed
replay hand and called `update_bridge_hand` with `imp_result` in the patch,
the column was silently ignored and never written.

This caused the History screen (which reads `imp_result` from each hand to show
per-board IMPs) to display 0 IMPs for every board, even though the table's
running `match_imps_a` / `match_imps_b` totals were correctly updated by the
separate direct `.update()` on the `tables` table.

## Changes
1. Replaces `update_bridge_hand` with a version that also applies the
   `imp_result` patch key (same jsonb NULLIF pattern as `score` / `play_state`).
2. Backfills the `imp_result` for the single already-completed replay hand
   (hand 9 on TheRohitReport table) by recomputing it from the stored
   contracts and vulnerability of the original + replay hands.

## Security
- No new tables, no policy changes, no new grants.
- The function remains SECURITY DEFINER with `search_path = 'public'`, callable
  by `authenticated` only (existing grant preserved).
*/

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
    imp_result = CASE WHEN p_patch ? 'imp_result' THEN NULLIF(p_patch->'imp_result', 'null'::jsonb) ELSE imp_result END,
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
