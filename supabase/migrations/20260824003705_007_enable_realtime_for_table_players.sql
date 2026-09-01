/*
# Enable Supabase Realtime for table_players

## Purpose
When a host assigns players to seats, those players' Lobby screens were not
receiving realtime updates because `table_players` was never added to the
`supabase_realtime` publication. Players only discovered they had been seated
after a manual page refresh. This migration adds `table_players` to the
realtime publication so seat-assignment changes propagate instantly to all
connected clients.

## Changes
1. Adds `public.table_players` to the `supabase_realtime` publication.

## Security
- No RLS policy changes. Realtime respects RLS: only rows the authenticated
  user is allowed to SELECT will be broadcast to them.
- The existing SELECT policies on `table_players` already scope reads to
  authenticated table members, so realtime events will only reach seated
  players and the host.

## Notes
- This is idempotent: the DO block checks pg_publication_tables before adding.
- No data is modified or deleted.
*/

DO $$
DECLARE
  pub_exists boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') INTO pub_exists;
  IF NOT pub_exists THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'table_players'
      AND schemaname = 'public'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.table_players';
  END IF;
END $$;
