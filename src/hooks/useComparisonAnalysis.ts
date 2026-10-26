import { useEffect, useRef, useState } from 'react';
import { DoubleDummyClient } from '@/lib/doubleDummyClient';
import { analysisKey, cardKey } from '@/lib/ddsPosition';
import type { AnalysisPosition, PositionAnalysis } from '@/lib/ddsPosition';

interface AnalysisState {
  key: string;
  result: PositionAnalysis | null;
  centerTotals: Record<string, number>;
  error: string | null;
}

export function useComparisonAnalysis(position: AnalysisPosition) {
  const clientRef = useRef<DoubleDummyClient | null>(null);
  const [state, setState] = useState<AnalysisState>({ key: '', result: null, centerTotals: {}, error: null });
  const [attempt, setAttempt] = useState(0);
  const key = analysisKey(position);

  useEffect(() => {
    const client = new DoubleDummyClient();
    clientRef.current = client;
    return () => { client.dispose(); clientRef.current = null; };
  }, []);

  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;
    let cancelled = false;
    setState({ key, result: null, centerTotals: {}, error: null });
    const failed = (error: string) => {
      if (!cancelled) setState(previous => ({ ...previous, error }));
    };
    // Current position gets priority. A single solve supplies every legal-card dot.
    const cancellations = [client.request(position, result => {
      if (!cancelled) setState(previous => ({ ...previous, result }));
    }, failed)];

    const count = position.playedCards.length;
    const trickStart = count > 0 ? Math.floor((count - 1) / 4) * 4 : 0;
    for (let index = trickStart; index < count; index++) {
      const played = position.playedCards[index];
      const identity = `${played.seat}:${cardKey(played.card)}`;
      const before = { ...position, playedCards: position.playedCards.slice(0, index) };
      const cachedTotal = client.peek(before)?.cardTotals[cardKey(played.card)];
      const putTotal = (total: number) => {
        if (!cancelled) setState(previous => ({ ...previous, centerTotals: { ...previous.centerTotals, [identity]: total } }));
      };
      if (cachedTotal !== undefined) {
        putTotal(cachedTotal);
      } else {
        // Evaluate each center card immediately AFTER it was played. Keep that
        // value even if a later card in the trick changes the possible result.
        cancellations.push(client.request(
          { ...position, playedCards: position.playedCards.slice(0, index + 1) },
          result => putTotal(result.totalTricks), failed,
        ));
      }
    }
    return () => { cancelled = true; cancellations.forEach(cancel => cancel()); };
    // The key includes every solver input; object identity must not restart work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const current = state.key === key ? state : { result: null, centerTotals: {}, error: null };
  return { ...current, computing: !current.result && !current.error, retry: () => setAttempt(value => value + 1) };
}
