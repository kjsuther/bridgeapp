import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { Card, PlayState, Seat } from '@/types/bridge';
import { createPlayAnimationTracker, playedCardKey } from '@/lib/playAnimation';

export function useCardPlayAnimation(
  table: RefObject<HTMLElement>, hand: string, state: PlayState | null,
  enabled: boolean, fast: boolean,
) {
  const tracker = useRef(createPlayAnimationTracker());
  const sources = useRef(new Map<string, DOMRect>());
  const running = useRef(new Set<Animation>());

  const capture = (seat: Seat, card: Card) => {
    const element = table.current?.querySelector<HTMLElement>(`[data-hand-seat="${seat}"] [data-card="${card.rank}${card.suit}"]`);
    if (element) sources.current.set(`${seat}-${card.rank}${card.suit}`, element.getBoundingClientRect());
  };

  useLayoutEffect(() => {
    const root = table.current;
    const plays = tracker.current(hand, state);
    if (!root) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!enabled || reduced) {
      running.current.forEach(animation => animation.cancel());
      running.current.clear();
    } else {
      for (const play of plays) {
        const key = playedCardKey(play);
        const source = sources.current.get(key) ?? sources.current.get(play.seat);
        const target = root.querySelector<HTMLElement>(`[data-played-seat="${play.seat}"] [data-card="${play.card.rank}${play.card.suit}"]`);
        if (!source || !target || !target.animate) continue;
        const dest = target.getBoundingClientRect();
        if (!dest.width || !dest.height || !source.width) continue;
        const animation = target.animate([
          { transform: `translate(${source.x - dest.x}px, ${source.y - dest.y}px) scale(${source.width / dest.width}, ${source.height / dest.height})` },
          { transform: 'translate(0, 0) scale(1, 1)' },
        ], { duration: fast ? 300 : 650, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
        target.style.transformOrigin = 'top left';
        running.current.add(animation);
        const release = () => { running.current.delete(animation); };
        animation.onfinish = release;
        animation.oncancel = release;
      }
    }
    // Save the rendered hand geometry before the next play removes a card.
    const nextSources = new Map<string, DOMRect>();
    root.querySelectorAll<HTMLElement>('[data-hand-seat]').forEach(zone => {
      const seat = zone.dataset.handSeat!;
      const back = zone.querySelector<HTMLElement>('[data-card-back]');
      if (back) nextSources.set(seat, back.getBoundingClientRect());
      zone.querySelectorAll<HTMLElement>('[data-card]').forEach(card => {
        nextSources.set(`${seat}-${card.dataset.card}`, card.getBoundingClientRect());
      });
    });
    sources.current = nextSources;
  });

  useLayoutEffect(() => () => {
    running.current.forEach(animation => animation.cancel());
    running.current.clear();
  }, [hand]);
  return capture;
}
