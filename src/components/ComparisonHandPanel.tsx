import { useMemo } from 'react';
import { sortHand } from '@/lib/dealing';
import { NORMAL_REVIEW_SEATS } from '@/lib/reviewAlignment';
import { cardKey, contractBadge } from '@/lib/ddsPosition';
import { useComparisonAnalysis } from '@/hooks/useComparisonAnalysis';
import type { Card, Contract, Seat, Suit, TrickCard, AuctionEntry } from '@/types/bridge';
import { SEATS, SUIT_SYMBOLS, RANK_VALUES } from '@/types/bridge';
import type { HandDetail, SeatNames } from '@/types/review';
import { Eye } from 'lucide-react';
import { CardDisplay, HandDisplay } from './CardDisplay';

/** Flatten completed tricks into a single ordered list of cards as they were played. */
function flattenPlayedCards(tricks: TrickCard[][]): TrickCard[] {
  const all: TrickCard[] = [];
  for (const trick of tricks) {
    for (const tc of trick) {
      all.push(tc);
    }
  }
  return all;
}

function nextSeat(seat: Seat): Seat {
  return SEATS[(SEATS.indexOf(seat) + 1) % SEATS.length];
}

function trickWinnerForHistory(trick: TrickCard[], trump: Suit | null): Seat {
  let winner = trick[0];
  for (const played of trick.slice(1)) {
    const card = played.card;
    if (trump && card.suit === trump && winner.card.suit !== trump) {
      winner = played;
    } else if (card.suit === winner.card.suit && RANK_VALUES[card.rank] > RANK_VALUES[winner.card.rank]) {
      winner = played;
    }
  }
  return winner.seat;
}

function nextPlayerForPosition(playedCards: TrickCard[], trump: Suit | null, openingLeader: Seat | undefined): Seat | null {
  if (playedCards.length === 0) return openingLeader ?? null;
  if (playedCards.length % 4 !== 0) return nextSeat(playedCards[playedCards.length - 1].seat);
  const lastTrick = playedCards.slice(-4);
  return trickWinnerForHistory(lastTrick, trump);
}

function legalCardsForPosition(hand: Card[], playedCards: TrickCard[]): Card[] {
  const currentTrick = playedCards.length % 4 === 0 ? [] : playedCards.slice(-(playedCards.length % 4));
  const ledSuit = currentTrick[0]?.card.suit;
  if (!ledSuit) return hand;
  const followingSuit = hand.filter(card => card.suit === ledSuit);
  return followingSuit.length > 0 ? followingSuit : hand;
}

export function ComparisonHandPanel({
  title, subtitle, detail, cardIndex, accent, seatNames, displaySeats = NORMAL_REVIEW_SEATS, displayTrumpStrain, showAuction = true,
}: {
  title: string;
  subtitle: string;
  detail: HandDetail;
  cardIndex: number;
  accent: 'emerald' | 'blue';
  showAuction?: boolean;
  seatNames: SeatNames;
  displaySeats?: Record<Seat, Seat>;
  displayTrumpStrain?: string;
}) {
  const accentText = accent === 'emerald' ? 'text-emerald-400' : 'text-blue-400';
  const accentBorder = accent === 'emerald' ? 'border-emerald-700/40' : 'border-blue-700/40';
  const accentBg = accent === 'emerald' ? 'bg-emerald-950/30' : 'bg-blue-950/30';

  const tricks = detail.playState.completedTricks;
  const allCards = useMemo(() => flattenPlayedCards(tricks), [tricks]);

  const playedUpTo = useMemo(() => {
    const played: Record<Seat, Card[]> = { N: [], E: [], S: [], W: [] };
    for (let i = 0; i <= cardIndex && i < allCards.length; i++) {
      const tc = allCards[i];
      played[tc.seat].push(tc.card);
    }
    return played;
  }, [allCards, cardIndex]);

  const currentTrickNumber = Math.floor(cardIndex / 4);
  const cardInTrick = cardIndex % 4;

  const currentTrickCards = useMemo(() => {
    if (currentTrickNumber < 0 || currentTrickNumber >= tricks.length) return [];
    const fullTrick = tricks[currentTrickNumber];
    return fullTrick.slice(0, cardInTrick + 1);
  }, [tricks, currentTrickNumber, cardInTrick]);

  const getRemainingHand = (seat: Seat): Card[] => {
    const full = sortHand(detail.deal[seat], displayTrumpStrain ?? detail.contract.strain);
    const played = playedUpTo[seat] ?? [];
    return full.filter(c => !played.some(p => p.suit === c.suit && p.rank === c.rank));
  };

  const trumpStrain = detail.contract.strain;

  const seatLabel = (seat: Seat): string => {
    const name = seatNames[seat] ?? seat;
    return `${seat} · ${name}`;
  };

  const playedCardsAtPosition = useMemo(
    () => allCards.slice(0, Math.min(cardIndex + 1, allCards.length)),
    [allCards, cardIndex],
  );
  const trump: Suit | null = trumpStrain === 'NT' ? null : trumpStrain as Suit;
  const analysis = useComparisonAnalysis({
    deal: detail.deal, playedCards: playedCardsAtPosition, trump,
    declarer: detail.contract.declarer,
    openingLeader: allCards[0]?.seat ?? nextSeat(detail.contract.declarer),
  });
  const ddResult = analysis.result;
  const ddComputing = analysis.computing;
  const nextPlayer = playedCardsAtPosition.length === 52 ? null
    : nextPlayerForPosition(playedCardsAtPosition, trump, allCards[0]?.seat);
  const legalCards = nextPlayer
    ? legalCardsForPosition(getRemainingHand(nextPlayer), playedCardsAtPosition) : [];
  const tricksNeeded = 6 + detail.contract.level;
  const cardBadges: Record<string, string> = {};
  const cardBadgeClassNames: Record<string, string> = {};
  for (const card of legalCards) {
    const key = cardKey(card);
    const total = ddResult?.cardTotals[key];
    const badge = total === undefined
      ? { label: analysis.error ? '?' : '…', className: 'bg-slate-600 text-white' }
      : contractBadge(total, detail.contract.level);
    cardBadges[key] = badge.label;
    cardBadgeClassNames[key] = badge.className;
  }

  const ddVerdict = ddResult
    ? (() => {
        const optimal = ddResult.totalTricks;
        const diff = optimal - tricksNeeded;
        if (diff > 0) return { text: `+${diff} overtrick${diff !== 1 ? 's' : ''} possible`, color: 'text-emerald-400' };
        if (diff === 0) return { text: 'Contract makes exactly', color: 'text-emerald-400' };
        return { text: `Down ${Math.abs(diff)} with best play`, color: 'text-blue-400' };
      })()
    : null;

  return (
    <div className={`rounded-xl border ${accentBorder} ${accentBg} backdrop-blur overflow-hidden`}>
      <div className="px-4 py-3 border-b border-slate-700/40">
        <div className="flex items-center justify-between">
          <h3 className={`text-sm font-bold ${accentText}`}>{title}</h3>
          <span className="text-xs text-slate-500">{subtitle}</span>
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs">
          <span className="text-slate-300 font-medium">
            {contractText(detail.contract)}
          </span>
          <span className="text-slate-500">{detail.score.summary}</span>
        </div>
      </div>

      <div className="p-4">
        <div className="overflow-x-auto">
        <div className="grid grid-areas-4h grid-cols-1 gap-2 min-w-[480px]">
          <div className="flex justify-center">
            <HandDisplay
              hand={getRemainingHand(displaySeats.N)}
              seat={displaySeats.N}
              label={seatLabel(displaySeats.N)}
              cardWidth={36}
              trumpStrain={displayTrumpStrain ?? trumpStrain}
              cardOverlap={0.55}
              cardBadges={nextPlayer === displaySeats.N ? cardBadges : undefined}
              cardBadgeClassNames={nextPlayer === displaySeats.N ? cardBadgeClassNames : undefined}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <HandDisplay
              hand={getRemainingHand(displaySeats.W)}
              seat={displaySeats.W}
              label={seatLabel(displaySeats.W)}
              cardWidth={36}
              trumpStrain={displayTrumpStrain ?? trumpStrain}
              cardOverlap={0.55}
              cardBadges={nextPlayer === displaySeats.W ? cardBadges : undefined}
              cardBadgeClassNames={nextPlayer === displaySeats.W ? cardBadgeClassNames : undefined}
            />
            <div className="flex-shrink-0">
              {currentTrickCards.length > 0 ? (
                <TrickDisplay trick={currentTrickCards} displaySeats={displaySeats} seatNames={seatNames} totals={analysis.centerTotals} contractLevel={detail.contract.level} failed={!!analysis.error} />
              ) : (
                <div className="w-24 h-24 flex items-center justify-center text-xs text-slate-600">
                  {currentTrickNumber >= tricks.length ? 'Complete' : '—'}
                </div>
              )}
            </div>
            <HandDisplay
              hand={getRemainingHand(displaySeats.E)}
              seat={displaySeats.E}
              label={seatLabel(displaySeats.E)}
              cardWidth={36}
              trumpStrain={displayTrumpStrain ?? trumpStrain}
              cardOverlap={0.55}
              cardBadges={nextPlayer === displaySeats.E ? cardBadges : undefined}
              cardBadgeClassNames={nextPlayer === displaySeats.E ? cardBadgeClassNames : undefined}
            />
          </div>
          <div className="flex justify-center">
            <HandDisplay
              hand={getRemainingHand(displaySeats.S)}
              seat={displaySeats.S}
              label={seatLabel(displaySeats.S)}
              cardWidth={36}
              trumpStrain={displayTrumpStrain ?? trumpStrain}
              cardOverlap={0.55}
              cardBadges={nextPlayer === displaySeats.S ? cardBadges : undefined}
              cardBadgeClassNames={nextPlayer === displaySeats.S ? cardBadgeClassNames : undefined}
            />
          </div>
        </div>

        </div>
        <p className="mt-3 text-[11px] text-slate-400">
          Dots show declarer’s result versus the contract after each card:
          <span className="text-emerald-400"> = or + makes</span> ·
          <span className="text-red-400"> − goes down</span>.
        </p>

        {/* Always-on double-dummy analysis for the current position */}
        <div className="mt-3 bg-slate-900/50 border border-amber-800/30 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Eye className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-medium text-amber-300">Double-Dummy</span>
            <span className="text-[10px] text-slate-500 ml-auto">
              {nextPlayer ? `next: ${nextPlayer}${ddComputing ? ' · calculating' : ''}` : 'optimal play from here'}
            </span>
          </div>
          {analysis.error ? (
            <div role="alert" className="text-xs text-red-300">
              <p>{analysis.error}</p>
              <button onClick={analysis.retry} className="mt-2 underline">Retry analysis</button>
            </div>
          ) : ddComputing ? (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin" />
              Analyzing position...
            </div>
          ) : ddResult ? (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Best possible for declarer:</span>
                <span className="text-white font-bold">{ddResult.totalTricks} tricks</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Tricks won so far:</span>
                <span className="text-slate-300">{ddResult.tricksWonSoFar}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Contract needs:</span>
                <span className="text-slate-300">{tricksNeeded} tricks</span>
              </div>
              {ddVerdict && (
                <div className={`text-xs font-medium pt-1 border-t border-slate-700/30 ${ddVerdict.color}`}>
                  {ddVerdict.text}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Analysis unavailable.</p>
          )}
        </div>

        {showAuction && <div className="mt-3 pt-3 border-t border-slate-700/30">
          <div className="text-xs text-slate-500 mb-1">Auction</div>
          <div className="flex flex-wrap gap-1">
            {detail.auction.map((entry, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-300">
                {seatNames[entry.seat] ?? entry.seat}: {bidText(entry.bid)}
              </span>
            ))}
          </div>
        </div>}
      </div>
    </div>
  );
}

function TrickDisplay({ trick, seatNames, totals, contractLevel, failed, displaySeats }: {
  trick: TrickCard[]; seatNames: SeatNames; totals: Record<string, number>;
  contractLevel: number; failed: boolean; displaySeats: Record<Seat, Seat>;
}) {
  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-0.5 w-36 h-40">
      {SEATS.map((position) => {
        const seat = displaySeats[position];
        const tc = trick.find(c => c.seat === seat);
        const total = tc ? totals[seat + ':' + cardKey(tc.card)] : undefined;
        return (
          <div
            key={seat}
            className={`flex flex-col items-center justify-center ${seatPosClass(position)}`}
          >
            {tc && (
              <CardDisplay card={tc.card} cardWidth={40} disabled
                badge={total === undefined ? (failed ? '?' : '…') : contractBadge(total, contractLevel).label}
                badgeClassName={total === undefined ? 'bg-slate-600 text-white' : contractBadge(total, contractLevel).className}
              />
            )}
            {!tc && <span className="text-[9px] text-slate-700">{seatNames[seat] ?? seat}</span>}
          </div>
        );
      })}
    </div>
  );
}

function seatPosClass(seat: Seat): string {
  switch (seat) {
    case 'N': return 'col-start-2 row-start-1';
    case 'E': return 'col-start-3 row-start-2';
    case 'S': return 'col-start-2 row-start-3';
    case 'W': return 'col-start-1 row-start-2';
  }
}

function contractText(c: Contract): string {
  const strain = c.strain === 'NT' ? 'NT' : SUIT_SYMBOLS[c.strain as keyof typeof SUIT_SYMBOLS] ?? c.strain;
  const dbl = c.doubled === 1 ? 'X' : c.doubled === 2 ? 'XX' : '';
  return `${c.level}${strain}${dbl} by ${c.declarer}`;
}

function bidText(bid: AuctionEntry['bid']): string {
  if (bid.type === 'pass') return 'Pass';
  if (bid.type === 'double') return 'X';
  if (bid.type === 'redouble') return 'XX';
  const strain = bid.strain === 'NT' ? 'NT' : SUIT_SYMBOLS[bid.strain as keyof typeof SUIT_SYMBOLS] ?? bid.strain;
  return `${bid.level}${strain}`;
}

