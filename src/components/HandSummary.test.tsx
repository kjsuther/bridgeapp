import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { createDeck } from '@/lib/dealing';
import type { Deal, Phase } from '@/types/bridge';

const context = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/context/GameContext', () => ({ useGame: () => context.value }));
import { HandSummary } from './HandSummary';

const deck = createDeck();
const deal = Object.fromEntries(['N', 'E', 'S', 'W'].map((seat, index) => [seat, deck.slice(index * 13, index * 13 + 13)])) as unknown as Deal;
function setup(phase: Phase) {
  context.value = {
    handNumber: 3, deal, phase, contract: null, players: [], mySeat: 'S',
    matchState: { boardNumber: 0, totalImpsA: 0, totalImpsB: 0 }, handRole: 'original',
  };
}
it('shows all 52 originally dealt cards after a hand, including a passed-out hand', () => {
  setup('finished');
  const html = renderToStaticMarkup(<HandSummary onClose={() => {}} />);
  expect(html).toContain('Hand 3 complete');
  expect(html).toContain('Hand passed out');
  expect(html.match(/data-card="/g)).toHaveLength(52);
  expect(html).toContain('Deal Next Hand');
});
it('never renders the original-hands dialog during live play', () => {
  setup('playing');
  expect(renderToStaticMarkup(<HandSummary onClose={() => {}} />)).toBe('');
});
it('does not invent or expose cards while an authorized starting hand is loading', () => {
  setup('scoring');
  context.value.deal = { ...deal, E: [], W: [] };
  const html = renderToStaticMarkup(<HandSummary onClose={() => {}} />);
  expect(html.match(/data-card="/g)).toHaveLength(26);
  expect(html.match(/Loading starting cards/g)).toHaveLength(2);
});
