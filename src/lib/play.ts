import type { Card, PlayState, Seat, Suit } from '@/types/bridge';
import { RANK_VALUES, nextSeat, sideOfSeat } from '@/types/bridge';

export function canPlayCard(
  card: Card,
  hand: Card[],
  playState: PlayState,
  seat: Seat,
): boolean {
  if (seat !== playState.currentSeat) return false;
  if (!hand.some((c) => c.suit === card.suit && c.rank === card.rank)) return false;

  const currentTrick = playState.currentTrick;
  if (currentTrick.length === 0) return true;

  const ledSuit = currentTrick[0].card.suit;
  const hasLedSuit = hand.some((c) => c.suit === ledSuit);

  if (hasLedSuit) {
    return card.suit === ledSuit;
  }

  return true;
}

export function getLegalCards(hand: Card[], playState: PlayState, seat: Seat): Card[] {
  if (seat !== playState.currentSeat) return [];
  const currentTrick = playState.currentTrick;
  if (currentTrick.length === 0) return [...hand];

  const ledSuit = currentTrick[0].card.suit;
  const ledSuitCards = hand.filter((c) => c.suit === ledSuit);
  if (ledSuitCards.length > 0) return ledSuitCards;

  return [...hand];
}

export function trickWinner(trick: { seat: Seat; card: Card }[], trumpSuit?: Suit | null): Seat | null {
  if (trick.length === 0) return null;
  const ledSuit = trick[0].card.suit;
  let winner = trick[0];
  for (let i = 1; i < trick.length; i++) {
    const card = trick[i].card;
    // Trump beats any non-trump
    if (trumpSuit && card.suit === trumpSuit) {
      if (winner.card.suit !== trumpSuit || RANK_VALUES[card.rank] > RANK_VALUES[winner.card.rank]) {
        winner = trick[i];
      }
    } else if (card.suit === ledSuit && RANK_VALUES[card.rank] > RANK_VALUES[winner.card.rank]) {
      // Must beat the led suit (and winner must not be trump)
      if (!trumpSuit || winner.card.suit !== trumpSuit) {
        winner = trick[i];
      }
    }
  }
  return winner.seat;
}

export function applyCardPlay(
  playState: PlayState,
  seat: Seat,
  card: Card,
  trumpSuit?: Suit | null,
): { newPlayState: PlayState; trickComplete: boolean; winner: Seat | null } {
  const newTrick = [...playState.currentTrick, { seat, card }];

  if (newTrick.length < 4) {
    return {
      newPlayState: {
        ...playState,
        currentTrick: newTrick,
        currentSeat: nextSeat(seat),
        lastCompletedTrick: null,
      },
      trickComplete: false,
      winner: null,
    };
  }

  const winner = trickWinner(newTrick, trumpSuit);
  if (!winner) {
    return {
      newPlayState: { ...playState, currentTrick: newTrick },
      trickComplete: false,
      winner: null,
    };
  }

  const nsWon = sideOfSeat(winner) === 'NS';
  const completedTricks = [...playState.completedTricks, newTrick];

  const newPlayState: PlayState = {
    ...playState,
    currentTrick: [],
    completedTricks,
    tricksWonNS: playState.tricksWonNS + (nsWon ? 1 : 0),
    tricksWonEW: playState.tricksWonEW + (nsWon ? 0 : 1),
    currentSeat: winner,
    leader: winner,
    trickNumber: playState.trickNumber + 1,
    lastCompletedTrick: newTrick,
  };

  return { newPlayState, trickComplete: true, winner };
}

export function isPlayComplete(playState: PlayState): boolean {
  return playState.completedTricks.length >= 13;
}

export function getOpeningLeader(contract: { declarer: Seat }): Seat {
  return nextSeat(contract.declarer);
}

export function createInitialPlayState(leader: Seat): PlayState {
  return {
    currentTrick: [],
    tricksWonNS: 0,
    tricksWonEW: 0,
    currentSeat: leader,
    trickNumber: 1,
    leader,
    completedTricks: [],
    dummyRevealed: false,
    lastCompletedTrick: null,
    undoRequest: null,
  };
}

export function cardsRemainingInHand(hand: Card[], playedCards: { seat: Seat; card: Card }[], seat: Seat): Card[] {
  const played = playedCards.filter((p) => p.seat === seat).map((p) => p.card);
  return hand.filter((c) => !played.some((p) => p.suit === c.suit && p.rank === c.rank));
}

export function dummySeat(declarer: Seat): Seat {
  const partners: Record<Seat, Seat> = { N: 'S', S: 'N', E: 'W', W: 'E' };
  return partners[declarer];
}

export function revertLastPlay(
  playState: PlayState,
  trumpSuit?: Suit | null,
): { newPlayState: PlayState; revertedCard: Card; revertedSeat: Seat; trickNumber: number } | null {
  // Prefer reverting from the current trick
  if (playState.currentTrick.length > 0) {
    const lastIdx = playState.currentTrick.length - 1;
    const lastPlay = playState.currentTrick[lastIdx];
    const newTrick = playState.currentTrick.slice(0, lastIdx);
    return {
      newPlayState: {
        ...playState,
        currentTrick: newTrick,
        currentSeat: lastPlay.seat,
        undoRequest: null,
      },
      revertedCard: lastPlay.card,
      revertedSeat: lastPlay.seat,
      trickNumber: playState.trickNumber,
    };
  }

  // Otherwise revert the last card of the last completed trick
  if (playState.completedTricks.length > 0) {
    const lastTrick = playState.completedTricks[playState.completedTricks.length - 1];
    if (lastTrick.length === 0) return null;

    const winner = trickWinner(lastTrick, trumpSuit);
    const lastPlay = lastTrick[lastTrick.length - 1];
    const restoredTrick = lastTrick.slice(0, lastTrick.length - 1);
    const newCompletedTricks = playState.completedTricks.slice(0, -1);

    const nsWon = winner ? sideOfSeat(winner) === 'NS' : false;

    // The leader of the restored trick is whoever led it (first card)
    const restoredLeader = restoredTrick.length > 0 ? restoredTrick[0].seat : playState.leader;

    return {
      newPlayState: {
        ...playState,
        completedTricks: newCompletedTricks,
        currentTrick: restoredTrick,
        trickNumber: playState.trickNumber - 1,
        currentSeat: lastPlay.seat,
        leader: restoredLeader,
        tricksWonNS: playState.tricksWonNS - (nsWon ? 1 : 0),
        tricksWonEW: playState.tricksWonEW - (nsWon ? 0 : 1),
        lastCompletedTrick: newCompletedTricks.length > 0
          ? newCompletedTricks[newCompletedTricks.length - 1]
          : null,
        undoRequest: null,
      },
      revertedCard: lastPlay.card,
      revertedSeat: lastPlay.seat,
      trickNumber: playState.trickNumber - 1,
    };
  }

  return null;
}

export function sortHandForPlay(hand: Card[]): Card[] {
  const suitOrder: Record<Suit, number> = { S: 0, H: 1, D: 2, C: 3 };
  return [...hand].sort((a, b) => {
    if (a.suit !== b.suit) return suitOrder[a.suit] - suitOrder[b.suit];
    return RANK_VALUES[b.rank] - RANK_VALUES[a.rank];
  });
}
