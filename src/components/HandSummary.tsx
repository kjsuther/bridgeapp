import { useEffect, useRef } from 'react';
import { useGame } from '@/context/GameContext';
import { SEATS } from '@/types/bridge';
import { sortHand } from '@/lib/dealing';
import { HandDisplay } from './CardDisplay';
import { openDoubleDummyWindow } from '@/lib/historyWindow';
import { ScorePanel, NextHandButton } from './ScorePanel';

export function HandSummary({ onClose }: { onClose: () => void }) {
  const { handNumber, players, deal, contract, phase, currentHandId, nextHandAvailable } = useGame();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  if (phase !== 'scoring' && phase !== 'finished') return null;
  return (
    <dialog ref={dialog} onCancel={onClose} aria-labelledby="hand-summary-title"
      className="m-auto w-[min(96vw,1400px)] max-h-[92dvh] rounded-2xl border border-slate-600 bg-slate-900 p-5 text-white shadow-2xl backdrop:bg-black/65">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 id="hand-summary-title" className="text-xl font-semibold">Hand {handNumber} complete</h2>
        <button autoFocus onClick={onClose} className="rounded-lg bg-slate-700 px-4 py-2">Back to table</button>
      </div>
      {contract ? <ScorePanel /> : <p className="mb-4">Hand passed out. No contract was reached.</p>}
      <h3 className="mt-5 mb-3 font-semibold">Original cards dealt to each player</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {SEATS.map(seat => (
          <section key={seat} className="overflow-auto rounded-xl border border-slate-700 bg-emerald-950/40 p-3">
            <h4 className="mb-3 font-semibold">{seat} — {players.find(player => player.seat === seat)?.display_name ?? seat}</h4>
            {deal?.[seat].length === 13 ? (
              <HandDisplay hand={sortHand(deal[seat], contract?.strain)} seat={seat} cardWidth={44} layout="side" />
            ) : <p role="status" className="text-sm text-slate-300">Loading starting cards…</p>}
          </section>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        {contract && currentHandId && <button onClick={() => openDoubleDummyWindow(currentHandId)} className="rounded-lg bg-amber-700 px-4 py-2">Open double-dummy analysis</button>}
        <NextHandButton />
      </div>
      <p className="mt-3 text-sm text-slate-300">{nextHandAvailable ? 'A newer hand is available. Join when you are ready; this summary stays open until you choose to move on.' : 'Take your time reviewing. Continue when you are ready; other players keep their own summaries.'}</p>
    </dialog>
  );
}
