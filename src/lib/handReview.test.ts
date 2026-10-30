import { beforeEach, expect, it, vi } from 'vitest';
import { createDeck, dealToJSON } from './dealing';
import type { Deal } from '@/types/bridge';
const mock = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mock.from } }));
import { loadHandDetail } from './handReview';

let phase: string;
let partial: boolean;
const deck = createDeck();
const deal = dealToJSON(Object.fromEntries(['N', 'E', 'S', 'W'].map((seat, index) => [seat, deck.slice(index * 13, index * 13 + 13)])) as unknown as Deal);
beforeEach(() => {
  phase = 'scoring'; partial = false;
  mock.from.mockReset().mockImplementation((table: string) => {
    let id: string;
    const query = {
      select() { return this; }, eq(_key: string, value: string) { id = value; return this; },
      maybeSingle() { return this; },
      then(resolve: (v: unknown) => unknown) {
        const data = table === 'hands' ? { id, game_id: 'original-game', phase, dealer: 'N', vulnerability: 'none', contract: {}, score: {}, play_state: {} }
          : table === 'games' ? { table_id: 'original-table' }
          : Object.entries(deal).slice(0, partial ? 2 : 4).map(([seat, cards]) => ({ seat, cards }));
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    }; return query;
  });
});
it('loads the requested completed hand rather than whichever hand is now latest', async () => {
  const result = await loadHandDetail('completed-hand-1');
  expect(result?.handId).toBe('completed-hand-1');
  expect(result?.tableId).toBe('original-table');
  expect(Object.values(result!.deal).flat()).toHaveLength(52);
});
it('does not open analysis for an ongoing hand or an incompletely authorized deal', async () => {
  phase = 'playing';
  expect(await loadHandDetail('ongoing')).toBeNull();
  expect(mock.from).toHaveBeenCalledTimes(1);
  phase = 'finished'; partial = true;
  expect(await loadHandDetail('partial')).toBeNull();
});
