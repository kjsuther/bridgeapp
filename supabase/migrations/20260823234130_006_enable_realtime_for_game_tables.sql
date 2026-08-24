/*
# Enable Supabase Realtime for game tables

## Purpose
Bidding and card play changes were not propagating to other players in real-time
because the game tables were never added to Supabase's realtime publication.
This migration adds `games`, `hands`, `plays`, and `tables` to the
`supabase_realtime` publication so that the frontend's realtime subscriptions
receive row-level change events (INSERT, UPDATE, DELETE) as they happen.

## Changes
1. Adds the following tables to the `supabase_realtime` publication:
   - `public.games`
   - `public.hands`
   - `public.plays`
   - `public.tables`

## Security
- No RLS policy changes. Realtime respects RLS: only rows the authenticated
  user is allowed to SELECT will be broadcast to them.
- The existing SELECT policies on all four tables already scope reads to
  authenticated table members, so realtime events will only reach seated
  players.

## Notes
- This is idempotent: the DO block checks pg_publication_tables before adding.
- No data is modified or deleted.
*/

DO $$
DECLARE
  tbl text;
  pub_exists boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') INTO pub_exists;
  IF NOT pub_exists THEN
    RETURN;
  END IF;

  FOREACH tbl IN ARRAY ARRAY['games','hands','plays','tables'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = tbl AND schemaname = 'public'
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $$;
