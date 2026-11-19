import { useGame } from '@/context/GameContext';
import { ArrowRight, Scale, Timer } from 'lucide-react';
import { rawScoreForNS } from '@/lib/impScoring';
import { formatDuration } from '@/lib/turn';
import type { Seat } from '@/types/bridge';
import { SEATS, sideOfSeat } from '@/types/bridge';

export function ScorePanel({ showMatch = true }: { showMatch?: boolean } = {}) {
  const { lastScore, phase, contract, vulnerability, handNumber, matchState, handRole, matchPointDifference, boardPointDifference, turnTimes, gameTurnTimes } = useGame();

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
          {contract && <p className="mt-1 text-xs text-slate-200">Hand score (N-S): {signed(rawScoreForNS(contract, vulnerability))} points</p>}
          {boardPointDifference != null && <p className="mt-1 text-xs text-amber-200">Board point difference: Team A {signed(boardPointDifference)} / Team B {signed(-boardPointDifference)}</p>}
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

      {showMatch && (
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
          <p className="mt-2 text-xs text-slate-300">Raw match point difference: {matchPointDifference == null ? 'Loading…' : `Team A ${signed(matchPointDifference)} / Team B ${signed(-matchPointDifference)}`}</p>
          <p className="mt-1 text-[11px] text-slate-400">Team A = seated N-S; Team B = seated E-W. Points compare completed original/replay pairs.</p>
          {matchState.boardNumber > 0 && (
            <p className="text-xs text-slate-500 mt-1">{matchState.boardNumber} board{matchState.boardNumber !== 1 ? 's' : ''} completed</p>
          )}
        </div>
      )}

      {(phase === 'scoring' || phase === 'finished') && (
        <TurnTimerSummary turnTimes={turnTimes} gameTurnTimes={gameTurnTimes} />
      )}
    </div>
  );
}

function TurnTimerSummary({ turnTimes, gameTurnTimes }: { turnTimes: Record<Seat, number>; gameTurnTimes: Record<Seat, number> }) {
  const anyHandTime = SEATS.some((s) => turnTimes[s] > 0);
  const anyGameTime = SEATS.some((s) => gameTurnTimes[s] > 0);
  if (!anyHandTime && !anyGameTime) return null;

  return (
    <div className="bg-slate-900/50 border border-sky-800/40 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Timer className="w-3.5 h-3.5 text-sky-400" />
        <p className="text-xs text-slate-400 font-medium">Turn Times</p>
      </div>

      {anyHandTime && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">This hand</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
            {SEATS.map((seat) => (
              <div key={`hand-${seat}`} className="flex justify-between">
                <span className={sideOfSeat(seat) === 'NS' ? 'text-emerald-300' : 'text-blue-300'}>{seat}</span>
                <span className="text-slate-200 tabular-nums">{formatDuration(turnTimes[seat] ?? 0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {anyGameTime && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Game total</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
            {SEATS.map((seat) => (
              <div key={`game-${seat}`} className="flex justify-between">
                <span className={sideOfSeat(seat) === 'NS' ? 'text-emerald-300' : 'text-blue-300'}>{seat}</span>
                <span className="text-slate-200 tabular-nums">{formatDuration(gameTurnTimes[seat] ?? 0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function signed(value: number) { return `${value > 0 ? '+' : ''}${value}`; }

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
        {nextHandBusy ? 'Joining next hand...' : nextHandAvailable ? 'Join next hand' : 'Continue to next hand'}
        <ArrowRight className="w-4 h-4" />
      </button>
    );
  }

  return null;
}
