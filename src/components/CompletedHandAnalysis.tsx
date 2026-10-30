import { useEffect, useState } from 'react';
import type { HandDetail, SeatNames } from '@/types/review';
import { loadHandDetail, loadSeatNames } from '@/lib/handReview';
import { ComparisonHandPanel } from './ComparisonHandPanel';

export function CompletedHandAnalysis({ handId }: { handId: string }) {
  const [detail, setDetail] = useState<HandDetail | null>(null);
  const [names, setNames] = useState<SeatNames>({ N: 'N', E: 'E', S: 'S', W: 'W' });
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(-1);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setIndex(-1);
    (async () => {
      try {
        const result = await loadHandDetail(handId);
        if (cancelled) return;
        setDetail(result);
        if (result) {
          const seatNames = await loadSeatNames(result.tableId);
          if (!cancelled) setNames(seatNames);
        }
      } catch {
        if (!cancelled) setDetail(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [handId]);
  const total = detail?.playState.completedTricks.flat().length ?? 0;
  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Completed-hand double-dummy analysis</h1>
          <button onClick={() => window.close()} className="rounded bg-slate-700 px-3 py-2">Close window</button>
        </div>
        {loading ? <p role="status">Loading completed hand…</p> : !detail ? (
          <p role="alert">Analysis is available for completed hands with a contract. This hand may be passed out, unavailable, or not accessible to your account.</p>
        ) : <>
          <p className="mb-3 text-sm text-slate-300">Step through the recorded play. Dots show declarer’s best possible result against the contract for every legal next card.</p>
          <div className="mb-4 flex flex-wrap items-center justify-center gap-3">
            <button onClick={() => setIndex(-1)} className="rounded bg-slate-700 px-3 py-2">Opening lead</button>
            <button disabled={index < 0} onClick={() => setIndex(i => Math.max(-1, i - 1))} className="rounded bg-slate-700 px-3 py-2 disabled:opacity-40">Previous card</button>
            <span aria-live="polite">Card {index + 1} / {total}</span>
            <button disabled={index >= total - 1} onClick={() => setIndex(i => Math.min(total - 1, i + 1))} className="rounded bg-slate-700 px-3 py-2 disabled:opacity-40">Next card</button>
            <button onClick={() => setIndex(total - 1)} className="rounded bg-slate-700 px-3 py-2">End of hand</button>
            <input aria-label="Recorded play position" type="range" min={-1} max={Math.max(-1, total - 1)} value={index} onChange={event => setIndex(Number(event.target.value))} className="w-full" />
          </div>
          <ComparisonHandPanel title="Hand just played" subtitle="Actual seats and recorded play" detail={detail} cardIndex={index} accent="emerald" seatNames={names} />
        </>}
      </div>
    </main>
  );
}
