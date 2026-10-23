/*
# Add bid_undo_request column to hands table

1. Changes
- `hands`: Add `bid_undo_request` column (jsonb, nullable) to store undo
  requests during the bidding phase. This mirrors the `undoRequest` field
  in `play_state` but is used when play has not yet started (play_state is null).

2. Security
- No security changes. Existing policies on `hands` remain in effect.
*/

ALTER TABLE hands ADD COLUMN IF NOT EXISTS bid_undo_request jsonb;
