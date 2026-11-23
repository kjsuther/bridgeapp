import { useGame } from '@/context/GameContext';
import { ArrowRight, Scale, Timer, Microscope } from 'lucide-react';
import { rawScoreForNS } from '@/lib/impScoring';
import { formatDuration } from '@/lib/turn';
import { openDoubleDummyWindow } from '@/lib/historyWindow';
import type { Seat, Contract, Vulnerability } from '@/types/bridge';
import { SEATS, sideOfSeat, SUIT_SYMBOLS } from '@/types/bridge';

export function ScorePanel({ showMatch = true }: { showMatch?: boolean } = {}) {
  const {
    lastScore, phase, contract, vulnerability, handNumber, handRole,
    matchState, matchPointDifference, boardPointDifference,
    turnTimes, gameTurnTimes, replayOfHandNumber,
    lastCompletedHandId, lastCompletedHandNumber,
  } = useGame();

  const handComplete = phase === 'scoring' || phase === 'finished';
  const phaseLabel = phase === 'bidding' ? 'Bidding' : phase === 'playing' ? 'Playing' : handComplete ? 'Complete' : '';

  return (
    <div className="space-y-3">
      {/* Current Hand section */}
      <div className="bg-slate-800/70 backdrop-blur rounded-xl border border-slate-700/50 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-medium text-sm">Current Hand</h3>
          <div className="flex items-center gap-2">
            {phaseLabel && <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">{phaseLabel}</span>}
            <span className="text-xs text-slate-400">Board {matchState.boardNumber} · Hand {handNumber}</span>
          </div>
        </div>

        <div className="text-xs text-slate-500 flex flex-wrap gap-3">
          <span>Vul: <span className="text-slate-300">{vulLabel(vulnerability)}</span></span>
          {contract && (
            <span>Contract: <span className="text-slate-300">{contractLabel(contract)}</span></span>
          )}
          {handRole === 'replay' && replayOfHandNumber && (
            <span className="text-amber-300">Replay of hand {replayOfHandNumber}</span>
          )}
        </div>
      </div>

      {/* Last Completed Hand section — visible during all phases, not just scoring */}
      {lastScore && lastCompletedHandId && (
        <div className="bg-slate-800/70 backdrop-blur rounded-xl border border-slate-700/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-medium text-sm">Last Completed Hand</h3>
            {lastCompletedHandNumber != null && (
              <span className="text-xs text-slate-400">Hand {lastCompletedHandNumber}</span>
            )}
          </div>
          <div className={`rounded-lg p-3 ${lastScore.made ? 'bg-emerald-950/40 border border-emerald-700/30' : 'bg-red-950/40 border border-red-800/30'}`}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium">
                {contract && handComplete && <span className="text-slate-200">{contractLabel(contract)} </span>}
                {!handComplete && lastScore.contract && <span className="text-slate-200">{contractLabel(lastScore.contract)} </span>}
                <span className={lastScore.made ? 'text-emerald-300' : 'text-red-300'}>
                  {lastScore.made
                    ? `Made${lastScore.overtricks > 0 ? ` +${lastScore.overtricks}` : ''}`
                    : `Down ${lastScore.undertricks}`}
                </span>
              </p>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Tricks made:</span>
                <span className="text-white">{lastScore.contract.tricksMade} / {6 + lastScore.contract.level}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Declarer side:</span>
                <span className="text-white">{lastScore.declarerSide}</span>
              </div>
              {(() => {
                const scoreContract = handComplete ? contract : lastScore.contract;
                if (scoreContract) {
                  return (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Score (N-S):</span>
                      <span className="text-white">{signed(rawScoreForNS(scoreContract, vulnerability))} pts</span>
                    </div>
                  );
                }
                return null;
              })()}
              {boardPointDifference != null && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Board pts:</span>
                  <span className="text-amber-200">A {signed(boardPointDifference)} / B {signed(-boardPointDifference)}</span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => openDoubleDummyWindow(lastCompletedHandId)}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 transition-colors"
          >
            <Microscope className="w-4 h-4" />
            Double-dummy analysis
          </button>
        </div>
      )}

      {/* Match Total section */}
      {showMatch && (
        <div className="bg-slate-800/70 backdrop-blur rounded-xl border border-amber-700/30 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-amber-400" />
              <h3 className="text-white font-medium text-sm">Match Total</h3>
            </div>
            <span className="text-xs text-slate-500">
              Board {matchState.boardNumber}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-emerald-300">Team A (N-S): <span className="font-bold">{matchState.totalImpsA > 0 ? '+' : ''}{matchState.totalImpsA}</span></span>
            <span className="text-blue-300">Team B (E-W): <span className="font-bold">{matchState.totalImpsB > 0 ? '+' : ''}{matchState.totalImpsB}</span></span>
          </div>
          <p className="text-xs text-slate-400">Raw point diff: {matchPointDifference == null ? 'Loading…' : `A ${signed(matchPointDifference)} / B ${signed(-matchPointDifference)}`}</p>
        </div>
      )}

      {handComplete && (
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
    <div className="bg-slate-800/70 backdrop-blur rounded-xl border border-sky-800/40 p-4 space-y-2">
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

function contractLabel(c: Contract): string {
  const dbl = c.doubled === 1 ? 'X' : c.doubled === 2 ? 'XX' : '';
  const strain = c.strain === 'NT' ? 'NT' : SUIT_SYMBOLS[c.strain as keyof typeof SUIT_SYMBOLS];
  return `${c.level}${strain}${dbl} by ${c.declarer}`;
}

function signed(value: number) { return `${value > 0 ? '+' : ''}${value}`; }

function vulLabel(vul: Vulnerability): string {
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
