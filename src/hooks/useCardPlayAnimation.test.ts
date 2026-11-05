import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createInitialPlayState } from '@/lib/play';
import type { PlayState } from '@/types/bridge';
const hooks = vi.hoisted(() => ({ refs: [] as { current: unknown }[], index: 0, effects: [] as (() => void | (() => void))[] }));
vi.mock('react', () => ({
  useRef: (value: unknown) => hooks.refs[hooks.index++] ?? (hooks.refs[hooks.index - 1] = { current: value }),
  useLayoutEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
}));
import { useCardPlayAnimation } from './useCardPlayAnimation';

const box = (x: number, y: number) => ({ x, y, width: 100, height: 140 });
let target: ReturnType<typeof card>;
const append = vi.fn();
function card() {
  const animation = { cancel: vi.fn(), onfinish: null as null | (() => void), oncancel: null as null | (() => void) };
  const flight = { style: {}, removeAttribute: vi.fn(), setAttribute: vi.fn(), remove: vi.fn(), animate: vi.fn<(frames: unknown, options: unknown) => typeof animation>(() => animation), disabled: false };
  return { style: { visibility: '' }, getBoundingClientRect: () => box(400, 300), cloneNode: () => flight,
    animate: vi.fn(), flight, animation };
}
const zone = { dataset: { handSeat: 'S' }, querySelector: () => null,
  querySelectorAll: () => [{ dataset: { card: 'AS' }, getBoundingClientRect: () => box(100, 600) }] };
const root = { querySelector: () => target, querySelectorAll: () => [zone] };
function Render(state: PlayState, enabled = true) {
  hooks.index = 0; hooks.effects = [];
  useCardPlayAnimation({ current: root } as unknown as React.RefObject<HTMLElement>, 'hand-1', state, enabled, false);
  hooks.effects[0]();
}
beforeEach(() => {
  hooks.refs = []; target = card(); append.mockClear();
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
  vi.stubGlobal('document', { body: { appendChild: append } });
});
afterEach(() => vi.unstubAllGlobals());

it('flies from the prior hand geometry on an independent layer and does not repeat an echo', () => {
  const initial = createInitialPlayState('S');
  Render(initial);
  const played = { ...initial, currentTrick: [{ seat: 'S' as const, card: { rank: 'A' as const, suit: 'S' as const } }] };
  Render(played);
  expect(append).toHaveBeenCalledWith(target.flight);
  expect(target.flight.animate.mock.calls[0][0]).toEqual([
    { transform: 'translate(-300px, 300px) scale(1, 1)' }, { transform: 'translate(0, 0) scale(1, 1)' },
  ]);
  expect(target.style.visibility).toBe('hidden');
  Render(JSON.parse(JSON.stringify(played)));
  expect(append).toHaveBeenCalledTimes(1);
  // Center cards can leave the DOM at the next trick; completion still cleans up.
  target.animation.onfinish!();
  expect(target.flight.remove).toHaveBeenCalledTimes(1);
  expect(target.style.visibility).toBe('');
});

it('skips flights when animations are disabled', () => {
  const initial = createInitialPlayState('S');
  Render(initial);
  Render({ ...initial, currentTrick: [{ seat: 'S', card: { rank: 'A', suit: 'S' } }] }, false);
  expect(append).not.toHaveBeenCalled();
});
