import { useGame } from '@/context/GameContext';
import { Trophy, ArrowRight, RotateCw } from 'lucide-react';

export function ScorePanel() {
  const { rubberState, lastScore, phase, contract, vulnerability, handNumber } = useGame();

  const nsGameLine = rubberState.nsGamesWon;
  const ewGameLine = rubberState.ewGamesWon;

  return (
    <div className="bg-slate-800/70 backdrop-blur rounded-xl border border-slate-700/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-medium text-sm">Rubber Scorecard</h3>
        <span className="text-xs text-slate-400">
          Rubber {rubberState.rubberNumber} &middot; Hand {handNumber}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-0 rounded-lg overflow-hidden border border-slate-700/50">
        <ScoreColumn
          label="We (N-S)"
          above={rubberState.nsAbove}
          belowCurrent={rubberState.nsBelowCurrent}
          belowCompleted={rubberState.nsBelowCompleted}
          total={rubberState.nsTotal}
          gamesWon={nsGameLine}
          accent="emerald"
        />
        <ScoreColumn
          label="They (E-W)"
          above={rubberState.ewAbove}
          belowCurrent={rubberState.ewBelowCurrent}
          belowCompleted={rubberState.ewBelowCompleted}
          total={rubberState.ewTotal}
          gamesWon={ewGameLine}
          accent="blue"
        />
      </div>

      <div className="text-xs text-slate-500 flex flex-wrap gap-3">
        <span>Vulnerability: <span className="text-slate-300">{vulLabel(vulnerability)}</span></span>
        {contract && (
          <span>Contract: <span className="text-slate-300">{contract.level}{contract.strain}{contract.doubled === 1 ? 'X' : contract.doubled === 2 ? 'XX' : ''} by {contract.declarer}</span></span>
        )}
      </div>

      {lastScore && phase === 'scoring' && (
        <div className="bg-emerald-950/40 border border-emerald-700/30 rounded-lg p-3">
          <p className="text-sm text-emerald-300 font-medium">{lastScore.summary}</p>
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Below line ({lastScore.declarerSide}):</span>
              <span className="text-white">{lastScore.belowLine}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Above line ({lastScore.aboveLine >= 0 ? lastScore.declarerSide : lastScore.declarerSide === 'NS' ? 'EW' : 'NS'}):</span>
              <span className="text-white">{Math.abs(lastScore.aboveLine)}</span>
            </div>
          </div>
        </div>
      )}

      {(rubberState.overallNsTotal > 0 || rubberState.overallEwTotal > 0) && (
        <div className="bg-slate-900/50 border border-slate-700/30 rounded-lg p-3">
          <p className="text-xs text-slate-400 font-medium mb-2">Overall Score (All Rubbers)</p>
          <div className="flex justify-between text-sm">
            <span className="text-emerald-300">NS: <span className="font-bold">{rubberState.overallNsTotal}</span></span>
            <span className="text-blue-300">EW: <span className="font-bold">{rubberState.overallEwTotal}</span></span>
          </div>
        </div>
      )}
    </div>
  );
}

function vulLabel(vul: string): string {
  switch (vul) {
    case 'none': return 'None';
    case 'NS': return 'NS';
    case 'EW': return 'EW';
    case 'both': return 'Both';
    default: return vul;
  }
}

function ScoreColumn({
  label, above, belowCurrent, belowCompleted, total, gamesWon, accent,
}: {
  label: string;
  above: number;
  belowCurrent: number;
  belowCompleted: number;
  total: number;
  gamesWon: number;
  accent: 'emerald' | 'blue';
}) {
  const accentText = accent === 'emerald' ? 'text-emerald-300' : 'text-blue-300';
  const accentBg = accent === 'emerald' ? 'bg-emerald-950/40' : 'bg-blue-950/40';

  return (
    <div className={`${accentBg} p-3 min-h-[180px] flex flex-col`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-medium ${accentText}`}>{label}</span>
        <div className="flex gap-0.5">
          {[0, 1].map((i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full ${i < gamesWon ? 'bg-amber-400' : 'bg-slate-600'}`}
            />
          ))}
        </div>
      </div>

      {/* Above the line */}
      <div className="flex-1 text-xs space-y-0.5">
        <div className="text-slate-500 mb-1">Above</div>
        {above > 0 ? (
          <div className={accentText}>{above}</div>
        ) : (
          <div className="text-slate-600">—</div>
        )}
      </div>

      {/* Horizontal line */}
      <div className="border-t-2 border-slate-500/60 my-2" />

      {/* Below the line — completed games */}
      <div className="text-xs space-y-0.5">
        {belowCompleted > 0 && (
          <>
            <div className="text-slate-500 mb-0.5">Completed games</div>
            <div className={accentText}>{belowCompleted}</div>
            <div className="border-t border-dashed border-slate-600/50 my-1.5" />
          </>
        )}
        <div className="text-slate-500 mb-1">Current game</div>
        <div className={`text-sm font-semibold ${accentText}`}>{belowCurrent}</div>
      </div>

      {/* Total */}
      <div className="mt-2 pt-2 border-t border-slate-700/40 flex justify-between text-sm">
        <span className="text-slate-300 font-medium">Total</span>
        <span className="text-white font-bold">{total}</span>
      </div>
    </div>
  );
}

export function NextHandButton() {
  const { phase, rubberState, startNewHand, mySeat } = useGame();

  if ((phase === 'scoring' || phase === 'finished') && !rubberState.rubberComplete && mySeat) {
    return (
      <button
        onClick={startNewHand}
        className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-emerald-600/20"
      >
        Deal Next Hand
        <ArrowRight className="w-4 h-4" />
      </button>
    );
  }

  return null;
}

export function RubberResultsOverlay() {
  const { rubberState, mySeat, startNewRubber } = useGame();

  if (!rubberState.rubberComplete) return null;

  const nsWon = rubberState.nsTotal > rubberState.ewTotal;
  const winnerName = nsWon ? 'North-South' : 'East-West';
  const winnerScore = Math.max(rubberState.nsTotal, rubberState.ewTotal);
  const loserScore = Math.min(rubberState.nsTotal, rubberState.ewTotal);
  const margin = winnerScore - loserScore;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700/60 shadow-2xl max-w-md w-full p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto mb-4">
            <Trophy className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Rubber Complete!</h2>
          <p className="text-lg text-amber-300 font-medium">{winnerName} wins</p>
          <p className="text-sm text-slate-400 mt-1">
            {winnerScore} &mdash; {loserScore} (margin: {margin})
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-emerald-950/40 border border-emerald-700/30 rounded-xl p-4 text-center">
            <p className="text-xs text-emerald-300 font-medium mb-1">North-South</p>
            <p className="text-2xl font-bold text-white">{rubberState.nsTotal}</p>
            <p className="text-xs text-slate-500 mt-1">{rubberState.nsGamesWon} game{rubberState.nsGamesWon !== 1 ? 's' : ''} won</p>
          </div>
          <div className="bg-blue-950/40 border border-blue-700/30 rounded-xl p-4 text-center">
            <p className="text-xs text-blue-300 font-medium mb-1">East-West</p>
            <p className="text-2xl font-bold text-white">{rubberState.ewTotal}</p>
            <p className="text-xs text-slate-500 mt-1">{rubberState.ewGamesWon} game{rubberState.ewGamesWon !== 1 ? 's' : ''} won</p>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-700/30 rounded-xl p-4 mb-6">
          <p className="text-xs text-slate-400 font-medium mb-2">Overall Score (All Rubbers)</p>
          <div className="flex justify-between text-lg">
            <span className="text-emerald-300">NS: <span className="font-bold">{rubberState.overallNsTotal}</span></span>
            <span className="text-blue-300">EW: <span className="font-bold">{rubberState.overallEwTotal}</span></span>
          </div>
        </div>

        {mySeat && (
          <button
            onClick={startNewRubber}
            className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-emerald-600/20"
          >
            <RotateCw className="w-4 h-4" />
            Continue to Next Rubber
          </button>
        )}
      </div>
    </div>
  );
}
