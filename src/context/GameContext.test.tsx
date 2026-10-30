import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDeck } from '@/lib/dealing';
import { createInitialPlayState } from '@/lib/play';

const harness = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  slots: [] as Array<{ initial: unknown; value: unknown }>,
  profile: { id: 'user-S' },
  stateCursor: 0, refCursor: 0, refs: [] as Array<{ current: unknown }>,
  rpc: vi.fn(), from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn(),
}));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useRef: (value: unknown) => {
    const index = harness.refCursor++;
    return harness.refs[index] ?? (harness.refs[index] = { current: value });
  },
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => void | (() => void)) => { harness.effects.push(fn); },
  useState: (initial: unknown) => {
    const index = harness.stateCursor++;
    const slot = harness.slots[index] ?? (harness.slots[index] = { initial, value: initial });
    return [slot.value, (value: unknown) => {
      slot.value = typeof value === 'function' ? value(slot.value) : value;
    }];
  },
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ profile: harness.profile }) }));
vi.mock('@/lib/supabase', () => ({ supabase: {
  rpc: harness.rpc, from: harness.from, channel: harness.channel, removeChannel: harness.removeChannel,
} }));
import { GameProvider, useGame } from './GameContext';
import type { ReactElement } from 'react';
type GameValues = ReturnType<typeof useGame>;

let finished: boolean;
let currentHandNumber: number;
let renders: Map<typeof harness.slots, () => GameValues>;
let channels: Array<{ name: string; change: () => void; status: (s: string) => void }>;
let cleanups: Array<() => void>;
const seats = ['N', 'E', 'S', 'W'];
const deck = createDeck();
const cardRows = seats.map((seat, i) => ({ seat, cards: deck.slice(i * 13, i * 13 + 13).map(c => c.rank + c.suit) }));
async function settle() { for (let i = 0; i < 100; i++) await Promise.resolve(); }
function mountClient(seat: string) {
  const slots: typeof harness.slots = [];
  const refs: typeof harness.refs = [];
  const render = () => {
    harness.effects = [];
    harness.slots = slots;
    harness.refs = refs;
    harness.stateCursor = 0;
    harness.refCursor = 0;
    harness.profile = { id: `user-${seat}` };
    const element = GameProvider({ tableId: 'table', gameId: 'game', children: null }) as ReactElement<{ value: GameValues }>;
    return element.props.value;
  };
  render();
  for (const effect of harness.effects) {
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
  }
  renders.set(slots, render);
  return slots;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  finished = false; currentHandNumber = 1; channels = []; cleanups = []; renders = new Map();
  harness.removeChannel.mockResolvedValue(undefined);
  harness.rpc.mockImplementation(async (_name: string, params: {p_hand_number: number}) => {
    if (currentHandNumber >= params.p_hand_number) return { data: null, error: { code: '23505' } };
    currentHandNumber = params.p_hand_number;
    finished = false;
    return { data: `hand-${currentHandNumber}`, error: null };
  });
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
    let single = false;
    let requestedHand: string | null = null;
    const query = {
      update() { return this; }, lt() { return this; },
      select() { return this; }, eq(key: string, value: string) { if (key === 'hand_role') replay = true; if (key === 'id' || key === 'hand_id') requestedHand = value; return this; },
      in() { return this; }, order() { return this; }, limit() { return this; }, maybeSingle() { single = true; return this; },
      then(resolve: (value: unknown) => unknown) {
        const handNumber = table === 'hands' && requestedHand === 'hand-1' ? 1 : currentHandNumber;
        const completed = finished || (requestedHand === 'hand-1' && currentHandNumber > 1);
        const hand = {
          id: `hand-${handNumber}`, hand_number: handNumber, state_version: completed ? 2 : 1,
          dealer: 'N', vulnerability: 'none', phase: completed ? 'scoring' : handNumber > 1 ? 'bidding' : 'playing',
          contract: { level: 4, strain: 'H', declarer: 'S', doubled: 0, tricksMade: 10 },
          play_state: createInitialPlayState('E'), auction: [], hand_role: 'original',
          score: completed ? { summary: 'Made 4H' } : null,
        };
        const data = table === 'games' ? { id: 'game', hand_number: currentHandNumber }
          : table === 'tables' ? { match_board_number: 0, new_hands_before_replay: 8 }
          : table === 'hands' ? (replay ? [] : single ? hand : [hand])
          : table === 'hand_cards' ? (completed ? cardRows : cardRows.filter(r => r.seat === 'S' || r.seat === 'N'))
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

it('lets each player leave their completed summary independently after a newer hand is dealt', async () => {
  finished = true;
  const clients = seats.map(mountClient);
  await settle();
  currentHandNumber = 2;
  finished = false;
  channels.filter(c => c.name === 'game-game').forEach(c => c.change());
  await settle();
  for (const client of clients) {
    const view = renders.get(client)!();
    expect(view.phase).toBe('scoring');
    expect(view.currentHandId).toBe('hand-1');
    expect(view.nextHandAvailable).toBe(true);
  }
  await renders.get(clients[2])!().startNewHand();
  await settle();
  expect(renders.get(clients[2])!().currentHandId).toBe('hand-2');
  expect(renders.get(clients[2])!().phase).toBe('bidding');
  expect(renders.get(clients[0])!().currentHandId).toBe('hand-1');
  expect(renders.get(clients[1])!().currentHandId).toBe('hand-1');
  expect(renders.get(clients[3])!().currentHandId).toBe('hand-1');
});

it('allows one player to deal while another retains the completed summary', async () => {
  finished = true;
  const north = mountClient('N');
  const south = mountClient('S');
  await settle();
  await renders.get(south)!().startNewHand();
  await settle();
  channels.filter(c => c.name === 'game-game').forEach(c => c.change());
  await settle();
  expect(renders.get(south)!().handNumber).toBe(2);
  expect(renders.get(north)!().handNumber).toBe(1);
  expect(renders.get(north)!().phase).toBe('scoring');
  expect(renders.get(north)!().nextHandAvailable).toBe(true);
});

it('shows the completed summary when the next deal arrives before the final-play event', async () => {
  const south = mountClient('S');
  await settle();
  expect(renders.get(south)!().phase).toBe('playing');
  currentHandNumber = 2;
  channels.filter(c => c.name === 'game-game').forEach(c => c.change());
  await settle();
  const view = renders.get(south)!();
  expect(view.currentHandId).toBe('hand-1');
  expect(view.phase).toBe('scoring');
  expect(view.nextHandAvailable).toBe(true);
  expect(Object.values(view.deal ?? {}).map(cards => cards.length)).toEqual([13, 13, 13, 13]);
});
