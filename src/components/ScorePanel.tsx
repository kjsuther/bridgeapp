import { useGame } from '@/context/GameContext';
import { ArrowRight, Scale } from 'lucide-react';

export function ScorePanel() {
  const { lastScore, phase, contract, vulnerability, handNumber, matchState, handRole } = useGame();

  return (
    <div className="bg-slate-800/70 backdrop-blur rounded-xl border border-slate-700/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-medium text-sm">Hand Result</h3>
        <span className="text-xs text-slate-400">
          Hand {handNumber}
        </span>
      </div>

      <div className="text-xs text-slate-500 flex flex-wrap gap-3">
        <span>Vulnerability: <span className="text-slate-300">{vulLabel(vulnerability)}</span></span>
        {contract && (
          <span>Contract: <span className="text-slate-300">{contract.level}{contract.strain}{contract.doubled === 1 ? 'X' : contract.doubled === 2 ? 'XX' : ''} by {contract.declarer}</span></span>
        )}
      </div>

      {lastScore && (phase === 'scoring' || phase === 'finished') && (
        <div className="bg-emerald-950/40 border border-emerald-700/30 rounded-lg p-3">
          <p className="text-sm text-emerald-300 font-medium">{lastScore.summary}</p>
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Declarer side:</span>
              <span className="text-white">{lastScore.declarerSide}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Tricks made:</span>
              <span className="text-white">{lastScore.contract.tricksMade} / {6 + lastScore.contract.level}</span>
            </div>
          </div>
        </div>
      )}

      <div className="bg-slate-900/50 border border-amber-700/30 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5 text-amber-400" />
            <p className="text-xs text-slate-400 font-medium">IMP Match</p>
          </div>
          <span className="text-xs text-slate-500">
            {handRole === 'replay' ? 'Replay' : 'Original'} &middot; Board {matchState.boardNumber}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-emerald-300">Team A (N-S): <span className="font-bold">{matchState.totalImpsA > 0 ? '+' : ''}{matchState.totalImpsA}</span></span>
          <span className="text-blue-300">Team B (E-W): <span className="font-bold">{matchState.totalImpsB > 0 ? '+' : ''}{matchState.totalImpsB}</span></span>
        </div>
        {matchState.boardNumber > 0 && (
          <p className="text-xs text-slate-500 mt-1">{matchState.boardNumber} board{matchState.boardNumber !== 1 ? 's' : ''} completed</p>
        )}
      </div>
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

export function NextHandButton() {
  const { phase, startNewHand, mySeat, nextHandAvailable, nextHandBusy } = useGame();

  if ((phase === 'scoring' || phase === 'finished') && mySeat) {
    return (
      <button
        onClick={startNewHand}
        disabled={nextHandBusy}
        className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-emerald-600/20"
      >
        {nextHandBusy ? 'Joining next hand…' : nextHandAvailable ? 'Join next hand' : 'Continue to next hand'}
        <ArrowRight className="w-4 h-4" />
      </button>
    );
  }

  return null;
}
