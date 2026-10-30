import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDeck } from '@/lib/dealing';
import { createInitialPlayState } from '@/lib/play';

const harness = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  slots: [] as Array<{ initial: unknown; value: unknown }>,
  profile: { id: 'user-S' },
  from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn(),
}));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useRef: (value: unknown) => ({ current: value }),
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => void | (() => void)) => { harness.effects.push(fn); },
  useState: (initial: unknown) => {
    const slot = { initial, value: initial };
    harness.slots.push(slot);
    return [initial, (value: unknown) => {
      slot.value = typeof value === 'function' ? value(slot.value) : value;
    }];
  },
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ profile: harness.profile }) }));
vi.mock('@/lib/supabase', () => ({ supabase: {
  from: harness.from, channel: harness.channel, removeChannel: harness.removeChannel,
} }));
import { GameProvider } from './GameContext';

let finished: boolean;
let channels: Array<{ name: string; change: () => void; status: (s: string) => void }>;
let cleanups: Array<() => void>;
const seats = ['N', 'E', 'S', 'W'];
const deck = createDeck();
const cardRows = seats.map((seat, i) => ({ seat, cards: deck.slice(i * 13, i * 13 + 13).map(c => c.rank + c.suit) }));
async function settle() { for (let i = 0; i < 100; i++) await Promise.resolve(); }
function mountClient(seat: string) {
  harness.effects = [];
  harness.slots = [];
  harness.profile = { id: `user-${seat}` };
  GameProvider({ tableId: 'table', gameId: 'game', children: null });
  const slots = harness.slots;
  for (const effect of harness.effects) {
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
  }
  return slots;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  finished = false; channels = []; cleanups = [];
  harness.removeChannel.mockResolvedValue(undefined);
  harness.channel.mockImplementation((name: string) => {
    const channel = {
      name, change: () => {}, status: (status: string) => { void status; },
      on(_type: string, _filter: unknown, change: () => void) { this.change = change; return this; },
      subscribe(status: (s: string) => void) { this.status = status; return this; },
    };
    channels.push(channel); return channel;
  });
  harness.from.mockImplementation((table: string) => {
    let replay = false;
    const query = {
      select() { return this; }, eq(key: string) { if (key === 'hand_role') replay = true; return this; },
      in() { return this; }, order() { return this; }, limit() { return this; }, maybeSingle() { return this; },
      then(resolve: (value: unknown) => unknown) {
        const hand = {
          id: 'hand', hand_number: 1, state_version: finished ? 2 : 1,
          dealer: 'N', vulnerability: 'none', phase: finished ? 'scoring' : 'playing',
          contract: { level: 4, strain: 'H', declarer: 'S', doubled: 0, tricksMade: 10 },
          play_state: createInitialPlayState('E'), auction: [], hand_role: 'original',
          score: finished ? { summary: 'Made 4H' } : null,
        };
        const data = table === 'games' ? { id: 'game', hand_number: 1 }
          : table === 'tables' ? { match_board_number: 0, new_hands_before_replay: 8 }
          : table === 'hands' ? (replay ? [] : [hand])
          : table === 'hand_cards' ? (finished ? cardRows : cardRows.filter(r => r.seat === 'S' || r.seat === 'N'))
          : table === 'table_players' ? seats.map(seat => ({ seat, user_id: `user-${seat}` }))
          : seats.map(seat => ({ id: `user-${seat}`, display_name: seat }));
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return query;
  });
});
afterEach(() => {
  cleanups.forEach(cleanup => cleanup());
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks();
});

it('updates all four clients to scoring and reloads all starting hands when the final update arrives', async () => {
  const clients = seats.map(mountClient);
  await settle();
  for (const slots of clients) {
    expect(slots.find(s => s.initial === 'bidding')?.value).toBe('playing');
  }
  finished = true;
  channels.filter(c => c.name === 'game-game').forEach(c => c.change());
  await settle();
  for (const slots of clients) {
    expect(slots.find(s => s.initial === 'bidding')?.value).toBe('scoring');
    const deal = slots.map(s => s.value).find(v => v && typeof v === 'object' && 'N' in v && Array.isArray(v.N)) as Record<string, unknown[]>;
    expect(seats.map(seat => deal[seat].length)).toEqual([13, 13, 13, 13]);
    expect(slots.some(s => (s.value as { summary?: string })?.summary === 'Made 4H')).toBe(true);
  }
});

it('recovers a missed hand-completion event without refreshing the page', async () => {
  const slots = mountClient('S');
  await settle();
  finished = true;
  await vi.advanceTimersByTimeAsync(5000);
  await settle();
  expect(slots.find(s => s.initial === 'bidding')?.value).toBe('scoring');
});

it('does not roll a completed hand back to an older playing snapshot', async () => {
  finished = true;
  const slots = mountClient('S');
  await settle();
  finished = false;
  channels.find(c => c.name === 'game-game')!.change();
  await settle();
  expect(slots.find(s => s.initial === 'bidding')?.value).toBe('scoring');
});
