import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { scoreHand } from '@/lib/scoring';
const context = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/context/GameContext', () => ({ useGame: () => context.value }));
import { ScorePanel } from './ScorePanel';
it('retains IMPs alongside signed board and cumulative point differences', () => {
  const contract = { level: 4, strain: 'H', declarer: 'S', doubled: 0, tricksMade: 10 } as const;
  context.value = { phase: 'scoring', contract, lastScore: scoreHand(contract, 'none'), vulnerability: 'none', handNumber: 12,
    handRole: 'replay', matchState: { boardNumber: 2, totalImpsA: 10, totalImpsB: -10 },
    matchPointDifference: 450, boardPointDifference: -170 };
  const html = renderToStaticMarkup(<ScorePanel />);
  expect(html).toContain('IMP Match');
  expect(html).toContain('Team A -170 / Team B +170');
  expect(html).toContain('Team A +450 / Team B -450');
  expect(html).toContain('Hand score (N-S):');
});
