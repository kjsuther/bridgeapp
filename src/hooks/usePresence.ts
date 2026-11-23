import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const CHANNEL_NAME = (tableId: string) => `table-${tableId}-presence`;

/**
 * Used from inside a game or table-setup screen.
 * Tracks the current user as "present" on the table's presence channel
 * so the lobby and other screens can see who's actively online.
 */
export function useTablePresence(tableId: string, userId: string, enabled = true) {
  const [presentUserIds, setPresentUserIds] = useState<Set<string>>(new Set());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!enabled || !tableId || !userId) return;

    let cancelled = false;
    const channel = supabase.channel(CHANNEL_NAME(tableId), {
      config: { presence: { key: userId } },
    });

    channelRef.current = channel;

    channel.on('presence', { event: 'sync' }, () => {
      if (cancelled) return;
      const state = channel.presenceState();
      const ids = new Set<string>();
      for (const key of Object.keys(state)) {
        ids.add(key);
      }
      setPresentUserIds(ids);
    });

    channel.subscribe(async (status) => {
      if (cancelled) return;
      if (status === 'SUBSCRIBED') {
        await channel.track({ joinedAt: Date.now() });
      }
    });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [tableId, userId, enabled]);

  return presentUserIds;
}

/**
 * Used from the lobby. Subscribes to multiple tables' presence channels
 * as a passive listener (does not track itself as present).
 * Returns a map of tableId -> Set of present user IDs.
 */
export function useLobbyPresence(tableIds: string[]) {
  const [presenceByTable, setPresenceByTable] = useState<Record<string, Set<string>>>({});
  const key = tableIds.join(',');

  useEffect(() => {
    setPresenceByTable({});
    if (tableIds.length === 0) return;

    let cancelled = false;
    const channels: ReturnType<typeof supabase.channel>[] = [];

    for (const tid of tableIds) {
      const channel = supabase.channel(CHANNEL_NAME(tid), {
        config: { presence: { key: 'lobby-listener' } },
      });

      channel.on('presence', { event: 'sync' }, () => {
        if (cancelled) return;
        const state = channel.presenceState();
        const ids = new Set<string>();
        for (const id of Object.keys(state)) {
          if (id !== 'lobby-listener') ids.add(id);
        }
        setPresenceByTable((prev) => ({ ...prev, [tid]: ids }));
      });

      channel.subscribe();
      channels.push(channel);
    }

    return () => {
      cancelled = true;
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return presenceByTable;
}
