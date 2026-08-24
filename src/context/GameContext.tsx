import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type {
  Seat, Deal, AuctionEntry, Bid, Contract, PlayState,
  HandScore, RubberState, Vulnerability, TablePlayer, Card, Phase, Suit, UndoRequest,
} from '@/types/bridge';
import {
  sideOfSeat, isVulnerable, SEATS,
} from '@/types/bridge';
import {
  dealHands, dealToJSON, jsonToDeal, sortHand, vulnerabilityForHand, dealerForHand,
} from '@/lib/dealing';
import {
  isValidBid, isAuctionComplete, isPassedOut, determineContract, getBidderSeat,
} from '@/lib/bidding';
import {
  getLegalCards, applyCardPlay, isPlayComplete, getOpeningLeader,
  createInitialPlayState, trickWinner, dummySeat, revertLastPlay,
} from '@/lib/play';
import {
  scoreHand, updateRubberState, createInitialRubberState,
} from '@/lib/scoring';
import { playTurnNotification } from '@/lib/sound';

interface GameContextValue {
  gameId: string | null;
  tableId: string | null;
  mySeat: Seat | null;
  players: TablePlayer[];
  deal: Deal | null;
  dealer: Seat | null;
  vulnerability: Vulnerability;
  auction: AuctionEntry[];
  contract: Contract | null;
  playState: PlayState | null;
  phase: Phase;
  rubberState: RubberState;
  lastScore: HandScore | null;
  passedOut: boolean;
  handNumber: number;
  isMyTurn: boolean;
  currentSeat: Seat | null;
  legalCards: Card[];
  makeBid: (bid: Bid) => Promise<void>;
  playCard: (card: Card) => Promise<void>;
  requestUndo: () => Promise<void>;
  requestBidUndo: () => Promise<void>;
  bidUndoRequest: UndoRequest | null;
  respondUndo: (accept: boolean) => Promise<void>;
  startNewHand: () => Promise<void>;
  startNewRubber: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

const GameContext = createContext<GameContextValue | undefined>(undefined);

export function GameProvider({ tableId, gameId: initialGameId, children }: {
  tableId: string;
  gameId: string;
  children: ReactNode;
}) {
  const { profile } = useAuth();
  const [gameId, setGameId] = useState<string>(initialGameId);
  const [mySeat, setMySeat] = useState<Seat | null>(null);
  const [players, setPlayers] = useState<TablePlayer[]>([]);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [dealer, setDealer] = useState<Seat | null>(null);
  const [vulnerability, setVulnerability] = useState<Vulnerability>('none');
  const [auction, setAuction] = useState<AuctionEntry[]>([]);
  const [contract, setContract] = useState<Contract | null>(null);
  const [playState, setPlayState] = useState<PlayState | null>(null);
  const [phase, setPhase] = useState<Phase>('bidding');
  const [rubberState, setRubberState] = useState<RubberState>(() => ({
    ...createInitialRubberState(),
    rubberNumber: 1,
    overallNsTotal: 0,
    overallEwTotal: 0,
  }));
  const [lastScore, setLastScore] = useState<HandScore | null>(null);
  const [passedOut, setPassedOut] = useState(false);
  const [handNumber, setHandNumber] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentHandId, setCurrentHandId] = useState<string | null>(null);
  const [bidUndoRequest, setBidUndoRequest] = useState<UndoRequest | null>(null);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const creatingHandRef = useRef(false);

  // Load players and determine my seat
  useEffect(() => {
    (async () => {
      const { data: tablePlayers } = await supabase
        .from('table_players')
        .select('user_id, seat')
        .eq('table_id', tableId);

      if (tablePlayers) {
        const userIds = tablePlayers.map((p) => p.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', userIds);

        const profMap: Record<string, string> = {};
        (profiles || []).forEach((p) => {
          profMap[p.id] = p.display_name;
        });

        const seatPlayers: TablePlayer[] = tablePlayers.map((p) => ({
          user_id: p.user_id,
          seat: p.seat as Seat,
          display_name: profMap[p.user_id] ?? 'Unknown',
        }));

        setPlayers(seatPlayers);

        const myAssignment = seatPlayers.find((p) => p.user_id === profileRef.current?.id);
        if (myAssignment) {
          setMySeat(myAssignment.seat);
        }
      }
    })();
  }, [tableId]);

  // Load game state
  const loadGameState = useCallback(async () => {
    const { data: game } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .maybeSingle();

    if (!game) {
      setLoading(false);
      return;
    }

    // Load overall scores from the table
    const { data: tableData } = await supabase
      .from('tables')
      .select('overall_ns_total, overall_ew_total, rubber_number')
      .eq('id', tableId)
      .maybeSingle();

    const rs: RubberState = {
      nsGamesWon: game.ns_games_won,
      ewGamesWon: game.ew_games_won,
      nsAbove: game.ns_above,
      ewAbove: game.ew_above,
      nsBelowCurrent: game.ns_below_current,
      ewBelowCurrent: game.ew_below_current,
      nsBelowCompleted: game.ns_below_completed ?? 0,
      ewBelowCompleted: game.ew_below_completed ?? 0,
      nsTotal: game.ns_total,
      ewTotal: game.ew_total,
      rubberComplete: game.status === 'finished',
      rubberNumber: game.rubber_number ?? 1,
      overallNsTotal: tableData?.overall_ns_total ?? 0,
      overallEwTotal: tableData?.overall_ew_total ?? 0,
    };
    setRubberState(rs);
    setHandNumber(game.hand_number);

    // Load the latest hand
    const { data: hands } = await supabase
      .from('hands')
      .select('*')
      .eq('game_id', gameId)
      .order('hand_number', { ascending: false })
      .limit(1);

    if (hands && hands.length > 0) {
      const hand = hands[0];
      setCurrentHandId(hand.id);
      setContract(null);
      setPlayState(null);
      setLastScore(null);
      setPassedOut(false);
      const loadedDeal = jsonToDeal(hand.deal as Record<string, string[]>);
      setDeal(loadedDeal);
      setDealer(hand.dealer as Seat);
      setVulnerability(hand.vulnerability as Vulnerability);
      setAuction((hand.auction as AuctionEntry[]) || []);
      setPhase(hand.phase as Phase);

      if (hand.contract) {
        setContract(hand.contract as Contract);
      }

      if (hand.play_state) {
        setPlayState(hand.play_state as PlayState);
      }

      if (hand.score) {
        setLastScore(hand.score as HandScore);
      }

      setBidUndoRequest((hand.bid_undo_request as UndoRequest | undefined) ?? null);
    }

    setLoading(false);
  }, [gameId, tableId]);

  useEffect(() => {
    loadGameState();
  }, [loadGameState]);

  // Realtime subscription
  useEffect(() => {
    if (!gameId) return;

    const channel = supabase.channel(`game-${gameId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'hands',
        filter: `game_id=eq.${gameId}`,
      }, () => loadGameState())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'games',
        filter: `id=eq.${gameId}`,
      }, () => loadGameState())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tables',
        filter: `id=eq.${tableId}`,
      }, () => loadGameState())
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [gameId, loadGameState, tableId]);

  // Create a new hand
  const createNewHand = useCallback(async (hNum: number) => {
    if (creatingHandRef.current) return null;
    creatingHandRef.current = true;

    const firstDealer: Seat = 'N';
    const newDeal = dealHands();
    const newDealer = dealerForHand(hNum, firstDealer);
    const vul = vulnerabilityForHand(hNum);

    const { data: hand, error: handError } = await supabase
      .from('hands')
      .insert({
        game_id: gameId,
        hand_number: hNum,
        deal: dealToJSON(newDeal),
        dealer: newDealer,
        vulnerability: vul,
        auction: [],
        phase: 'bidding',
      })
      .select('id')
      .maybeSingle();

    creatingHandRef.current = false;
    if (handError && handError.code !== '23505') {
      setError('The first hand could not be dealt. Please try again.');
    }
    return hand?.id ?? null;
  }, [gameId]);

  // Any seated player may deal the first hand; the unique constraint prevents duplicates.
  useEffect(() => {
    if (!mySeat || loading || currentHandId || deal || creatingHandRef.current) return;

    createNewHand(handNumber).then(() => {
      loadGameState();
    });
  }, [mySeat, loading, currentHandId, deal, handNumber, createNewHand, loadGameState]);

  // Bidding
  const makeBid = useCallback(async (bid: Bid) => {
    if (!mySeat || !currentHandId) return;

    const bidder = getBidderSeat(auction, dealer ?? 'N');
    if (bidder !== mySeat) {
      setError('It is not your turn to bid.');
      return;
    }

    if (!isValidBid(bid, auction, mySeat)) {
      setError('That bid is not valid.');
      return;
    }

    const newAuction = [...auction, { seat: mySeat, bid }];
    setAuction(newAuction);
    setError(null);

    const complete = isAuctionComplete(newAuction);

    let newPhase: Phase = 'bidding';
    let newContract: Contract | null = null;
    let newPlayState: PlayState | null = null;
    let newPassedOut = false;

    if (complete) {
      if (isPassedOut(newAuction)) {
        newPassedOut = true;
        newPhase = 'finished';
      } else {
        newContract = determineContract(newAuction);
        if (newContract) {
          newContract.tricksMade = 0;
          const leader = getOpeningLeader(newContract);
          newPlayState = createInitialPlayState(leader);
          newPlayState.dummyRevealed = false;
          newPhase = 'playing';
        }
      }
    }

    const updateData: Record<string, unknown> = {
      auction: newAuction,
      phase: newPhase,
    };

    if (newContract) {
      updateData.contract = newContract;
    }
    if (newPlayState) {
      updateData.play_state = newPlayState;
    }

    await supabase
      .from('hands')
      .update(updateData)
      .eq('id', currentHandId);

    setContract(newContract);
    setPlayState(newPlayState);
    setPhase(newPhase);
    setPassedOut(newPassedOut);
  }, [mySeat, currentHandId, auction, dealer]);

  // Card play
  const playCard = useCallback(async (card: Card) => {
    if (!mySeat || !currentHandId || !playState || !deal) return;

    // The seat whose turn it is to play — could be declarer playing dummy's hand
    const playingSeat = playState.currentSeat;

    // Determine if I'm authorized to play for this seat
    const isDeclarer = contract?.declarer === mySeat;
    const dummy = contract ? dummySeat(contract.declarer) : null;
    const canPlay =
      (playingSeat === mySeat && !(dummy === mySeat)) || // own hand, not dummy
      (isDeclarer && playingSeat === dummy); // declarer playing dummy

    if (!canPlay) {
      setError('It is not your turn to play a card.');
      return;
    }

    // Compute remaining cards for the playing seat (removing already-played cards)
    const playedBySeat: Record<Seat, Card[]> = { N: [], E: [], S: [], W: [] };
    for (const trick of playState.completedTricks) {
      for (const tc of trick) playedBySeat[tc.seat].push(tc.card);
    }
    for (const tc of playState.currentTrick) playedBySeat[tc.seat].push(tc.card);
    const remainingHand = deal[playingSeat].filter(
      (c) => !playedBySeat[playingSeat].some((p) => p.suit === c.suit && p.rank === c.rank),
    );

    const legal = getLegalCards(remainingHand, playState, playingSeat);
    const isLegal = legal.some((c) => c.suit === card.suit && c.rank === card.rank);

    if (!isLegal) {
      setError('That card is not legal. You must follow suit if you can.');
      return;
    }

    const { newPlayState } = applyCardPlay(playState, playingSeat, card, contract?.strain && contract.strain !== 'NT' ? (contract.strain as Suit) : null);
    setPlayState(newPlayState);
    setError(null);

    // Save the play
    await supabase
      .from('plays')
      .insert({
        hand_id: currentHandId,
        trick_number: playState.trickNumber,
        seat: playingSeat,
        card: `${card.rank}${card.suit}`,
      });

    // Check if hand is complete
    let updatedPlayState = newPlayState;
    let newPhase: Phase = 'playing';
    let newContract = contract;
    let newLastScore: HandScore | null = lastScore;
    let newRubber = rubberState;

    // Reveal dummy after the opening lead (first card of the first trick)
    if (!newPlayState.dummyRevealed && contract) {
      const totalCardsPlayed =
        newPlayState.completedTricks.reduce((sum, t) => sum + t.length, 0) +
        newPlayState.currentTrick.length;
      if (totalCardsPlayed >= 1) {
        updatedPlayState = { ...updatedPlayState, dummyRevealed: true };
      }
    }

    if (isPlayComplete(updatedPlayState)) {
      newPhase = 'scoring';

      if (contract) {
        const declarerTricks = sideOfSeat(contract.declarer) === 'NS'
          ? updatedPlayState.tricksWonNS
          : updatedPlayState.tricksWonEW;

        const finalContract: Contract = {
          ...contract,
          tricksMade: declarerTricks,
        };

        const score = scoreHand(finalContract, vulnerability);
        newLastScore = score;

        // Re-read the latest rubber state from the database to avoid stale closures
        // that lose points from previously completed hands.
        const { data: freshGame } = await supabase
          .from('games')
          .select('*')
          .eq('id', gameId)
          .maybeSingle();

        const freshRubber: RubberState = freshGame ? {
          nsGamesWon: freshGame.ns_games_won,
          ewGamesWon: freshGame.ew_games_won,
          nsAbove: freshGame.ns_above,
          ewAbove: freshGame.ew_above,
          nsBelowCurrent: freshGame.ns_below_current,
          ewBelowCurrent: freshGame.ew_below_current,
          nsBelowCompleted: freshGame.ns_below_completed ?? 0,
          ewBelowCompleted: freshGame.ew_below_completed ?? 0,
          nsTotal: freshGame.ns_total,
          ewTotal: freshGame.ew_total,
          rubberComplete: freshGame.status === 'finished',
          rubberNumber: freshGame.rubber_number ?? 1,
          overallNsTotal: rubberState.overallNsTotal,
          overallEwTotal: rubberState.overallEwTotal,
        } : rubberState;

        const { newState: updatedRubber, rubberComplete } = updateRubberState(freshRubber, score);
        newRubber = updatedRubber;

        // Update game state
        const gameUpdate: Record<string, unknown> = {
          ns_games_won: updatedRubber.nsGamesWon,
          ew_games_won: updatedRubber.ewGamesWon,
          ns_above: updatedRubber.nsAbove,
          ew_above: updatedRubber.ewAbove,
          ns_below_current: updatedRubber.nsBelowCurrent,
          ew_below_current: updatedRubber.ewBelowCurrent,
          ns_below_completed: updatedRubber.nsBelowCompleted,
          ew_below_completed: updatedRubber.ewBelowCompleted,
          ns_total: updatedRubber.nsTotal,
          ew_total: updatedRubber.ewTotal,
        };

        if (rubberComplete) {
          gameUpdate.status = 'finished';
          gameUpdate.ended_at = new Date().toISOString();
          newPhase = 'finished';

          // Update overall scores on the table
          const overallNs = (rubberState.overallNsTotal ?? 0) + updatedRubber.nsTotal;
          const overallEw = (rubberState.overallEwTotal ?? 0) + updatedRubber.ewTotal;
          const nextRubberNumber = (rubberState.rubberNumber ?? 1) + 1;

          await supabase
            .from('tables')
            .update({
              overall_ns_total: overallNs,
              overall_ew_total: overallEw,
              rubber_number: nextRubberNumber,
            })
            .eq('id', tableId);
        }

        await supabase.from('games').update(gameUpdate).eq('id', gameId);

        newContract = finalContract;
      }

      setLastScore(newLastScore);
      setRubberState({
        ...newRubber,
        rubberNumber: rubberState.rubberNumber,
        overallNsTotal: rubberState.overallNsTotal,
        overallEwTotal: rubberState.overallEwTotal,
      });
    }

    const updateData: Record<string, unknown> = {
      play_state: updatedPlayState,
      phase: newPhase,
    };

    if (newContract !== contract) {
      updateData.contract = newContract;
    }
    if (newLastScore) {
      updateData.score = newLastScore;
    }

    await supabase
      .from('hands')
      .update(updateData)
      .eq('id', currentHandId);

    setPlayState(updatedPlayState);
    setPhase(newPhase);
    setContract(newContract);
  }, [mySeat, currentHandId, playState, deal, contract, vulnerability, lastScore, gameId, tableId]);

  // --- Undo logic ---
  // Any player on the side that played the last card may request an undo.
  // Both opponents must accept for the undo to take effect.
  const requestUndo = useCallback(async () => {
    if (!mySeat || !currentHandId || !playState || phase !== 'playing') return;
    if (playState.undoRequest) return;

    // Find the last played card
    let lastCard: Card | null = null;
    let lastCardSeat: Seat | null = null;

    if (playState.currentTrick.length > 0) {
      const last = playState.currentTrick[playState.currentTrick.length - 1];
      lastCard = last.card;
      lastCardSeat = last.seat;
    } else if (playState.completedTricks.length > 0) {
      const lastTrick = playState.completedTricks[playState.completedTricks.length - 1];
      if (lastTrick.length > 0) {
        const last = lastTrick[lastTrick.length - 1];
        lastCard = last.card;
        lastCardSeat = last.seat;
      }
    }

    if (!lastCard || !lastCardSeat) return;

    // Only the player who played the card or their partner can request the undo
    const mySide = sideOfSeat(mySeat);
    const cardSide = sideOfSeat(lastCardSeat);
    if (mySide !== cardSide) {
      setError('Only the side that played the last card can request an undo.');
      return;
    }

    const undoReq: UndoRequest = {
      requestedBy: mySeat,
      card: lastCard,
      cardSeat: lastCardSeat,
      acceptedBy: [],
      declinedBy: [],
    };

    const updatedPlayState = { ...playState, undoRequest: undoReq };
    setPlayState(updatedPlayState);
    setError(null);

    await supabase
      .from('hands')
      .update({ play_state: updatedPlayState })
      .eq('id', currentHandId);
  }, [mySeat, currentHandId, playState, phase]);

  // --- Bidding undo logic ---
  // The player who made the last bid (or their partner) may request an undo.
  // Both opponents must accept for the undo to take effect.
  const requestBidUndo = useCallback(async () => {
    if (!mySeat || !currentHandId || phase !== 'bidding') return;
    if (bidUndoRequest) return;
    if (auction.length === 0) return;

    const lastEntry = auction[auction.length - 1];
    const lastBidSeat = lastEntry.seat;

    // Only the player who made the bid or their partner can request the undo
    const mySide = sideOfSeat(mySeat);
    const bidSide = sideOfSeat(lastBidSeat);
    if (mySide !== bidSide) {
      setError('Only the side that made the last bid can request an undo.');
      return;
    }

    const undoReq: UndoRequest = {
      requestedBy: mySeat,
      bid: lastEntry.bid,
      bidSeat: lastBidSeat,
      acceptedBy: [],
      declinedBy: [],
    };

    setBidUndoRequest(undoReq);
    setError(null);

    await supabase
      .from('hands')
      .update({ bid_undo_request: undoReq })
      .eq('id', currentHandId);
  }, [mySeat, currentHandId, phase, bidUndoRequest, auction]);

  const respondUndo = useCallback(async (accept: boolean) => {
    if (!mySeat || !currentHandId) return;

    // Handle bid undo request
    if (bidUndoRequest) {
      const req = bidUndoRequest;
      const mySide = sideOfSeat(mySeat);
      const requesterSide = sideOfSeat(req.requestedBy);
      if (mySide === requesterSide) return;
      if (req.acceptedBy.includes(mySeat) || req.declinedBy.includes(mySeat)) return;

      // Re-read the latest bid undo request from the database
      const { data: handRow } = await supabase
        .from('hands')
        .select('bid_undo_request, auction, phase, contract, play_state')
        .eq('id', currentHandId)
        .maybeSingle();

      const latestReq = (handRow?.bid_undo_request as UndoRequest | undefined) ?? bidUndoRequest;
      if (!latestReq) return;

      const newAccepted = accept ? [...latestReq.acceptedBy, mySeat] : latestReq.acceptedBy;
      const newDeclined = accept ? latestReq.declinedBy : [...latestReq.declinedBy, mySeat];

      const opponentSeats = SEATS.filter((s) => sideOfSeat(s) !== requesterSide);

      if (newDeclined.length > 0) {
        setBidUndoRequest(null);
        await supabase
          .from('hands')
          .update({ bid_undo_request: null })
          .eq('id', currentHandId);
        return;
      }

      if (newAccepted.length >= opponentSeats.length) {
        // All opponents accepted — undo the last bid
        const latestAuction = (handRow?.auction as AuctionEntry[] | undefined) ?? auction;
        const revertedAuction = latestAuction.slice(0, -1);
        const latestPhase = (handRow?.phase as Phase | undefined) ?? phase;

        const updateData: Record<string, unknown> = {
          auction: revertedAuction,
          bid_undo_request: null,
        };

        // If the auction was complete (contract/play state set), revert to bidding
        if (latestPhase !== 'bidding') {
          updateData.phase = 'bidding';
          updateData.contract = null;
          updateData.play_state = null;
        }

        setAuction(revertedAuction);
        setBidUndoRequest(null);
        setError(null);

        if (latestPhase !== 'bidding') {
          setPhase('bidding');
          setContract(null);
          setPlayState(null);
          setPassedOut(false);
        }

        await supabase
          .from('hands')
          .update(updateData)
          .eq('id', currentHandId);
        return;
      }

      // Partial acceptance
      const updatedReq: UndoRequest = {
        ...latestReq,
        acceptedBy: newAccepted,
        declinedBy: newDeclined,
      };
      setBidUndoRequest(updatedReq);
      await supabase
        .from('hands')
        .update({ bid_undo_request: updatedReq })
        .eq('id', currentHandId);
      return;
    }

    // Handle play undo request
    if (!playState || !playState.undoRequest) return;

    const req = playState.undoRequest;
    // Only opponents can respond
    const mySide = sideOfSeat(mySeat);
    const requesterSide = sideOfSeat(req.requestedBy);
    if (mySide === requesterSide) return;

    // Must not have already responded
    if (req.acceptedBy.includes(mySeat) || req.declinedBy.includes(mySeat)) return;

    // Re-read the latest play state from the database to avoid stale closures
    // when multiple opponents respond near-simultaneously.
    const { data: handRow } = await supabase
      .from('hands')
      .select('play_state')
      .eq('id', currentHandId)
      .maybeSingle();

    const latestPlayState = (handRow?.play_state as PlayState | undefined) ?? playState;
    if (!latestPlayState.undoRequest) return;
    const latestReq = latestPlayState.undoRequest;

    const newAccepted = accept ? [...latestReq.acceptedBy, mySeat] : latestReq.acceptedBy;
    const newDeclined = accept ? latestReq.declinedBy : [...latestReq.declinedBy, mySeat];

    // Find the two opponent seats
    const opponentSeats = SEATS.filter((s) => sideOfSeat(s) !== requesterSide);

    if (newDeclined.length > 0) {
      // Declined — clear the undo request, play continues
      const updatedPlayState = { ...latestPlayState, undoRequest: null };
      setPlayState(updatedPlayState);
      await supabase
        .from('hands')
        .update({ play_state: updatedPlayState })
        .eq('id', currentHandId);
      return;
    }

    // Check if all opponents accepted
    if (newAccepted.length >= opponentSeats.length) {
      // All opponents accepted — perform the undo
      const trumpSuit = contract?.strain && contract.strain !== 'NT' ? (contract.strain as Suit) : null;
      const result = revertLastPlay(latestPlayState, trumpSuit);
      if (!result) {
        const updatedPlayState = { ...latestPlayState, undoRequest: null };
        setPlayState(updatedPlayState);
        await supabase
          .from('hands')
          .update({ play_state: updatedPlayState })
          .eq('id', currentHandId);
        return;
      }

      setPlayState(result.newPlayState);
      setError(null);

      // Delete the last play record from the plays table
      const { data: plays } = await supabase
        .from('plays')
        .select('id, trick_number, seat, card, created_at')
        .eq('hand_id', currentHandId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (plays && plays.length > 0) {
        await supabase
          .from('plays')
          .delete()
          .eq('id', plays[0].id);
      }

      await supabase
        .from('hands')
        .update({ play_state: result.newPlayState })
        .eq('id', currentHandId);
      return;
    }

    // Partial acceptance — update the request with the new acceptance
    const updatedReq: UndoRequest = {
      ...latestReq,
      acceptedBy: newAccepted,
      declinedBy: newDeclined,
    };
    const updatedPlayState = { ...latestPlayState, undoRequest: updatedReq };
    setPlayState(updatedPlayState);
    await supabase
      .from('hands')
      .update({ play_state: updatedPlayState })
      .eq('id', currentHandId);
  }, [mySeat, currentHandId, playState, contract, bidUndoRequest, auction, phase]);

  const startNewHand = useCallback(async () => {
    if (!mySeat) return;

    const nextHand = handNumber + 1;
    setHandNumber(nextHand);
    setAuction([]);
    setContract(null);
    setPlayState(null);
    setPhase('bidding');
    setLastScore(null);
    setPassedOut(false);
    setBidUndoRequest(null);

    await supabase
      .from('games')
      .update({ hand_number: nextHand })
      .eq('id', gameId);

    await createNewHand(nextHand);
    await loadGameState();
  }, [mySeat, handNumber, gameId, createNewHand, loadGameState]);

  const startNewRubber = useCallback(async () => {
    if (!mySeat) return;

    const nextRubberNumber = (rubberState.rubberNumber ?? 1) + 1;

    const { data: newGame } = await supabase
      .from('games')
      .insert({
        table_id: tableId,
        status: 'active',
        hand_number: 1,
        rubber_number: nextRubberNumber,
      })
      .select('id')
      .maybeSingle();

    if (newGame) {
      setGameId(newGame.id);
      setHandNumber(1);
      setAuction([]);
      setContract(null);
      setPlayState(null);
      setPhase('bidding');
      setLastScore(null);
      setPassedOut(false);
      setBidUndoRequest(null);
      setRubberState({
        ...createInitialRubberState(),
        rubberNumber: nextRubberNumber,
        overallNsTotal: rubberState.overallNsTotal,
        overallEwTotal: rubberState.overallEwTotal,
      });
      setCurrentHandId(null);
      setDeal(null);
      creatingHandRef.current = false;
    }
  }, [mySeat, tableId, rubberState]);

  // Derived state
  const currentSeat = phase === 'bidding'
    ? (auction.length === 0 ? dealer : getBidderSeat(auction, dealer ?? 'N'))
    : playState?.currentSeat ?? null;

  const isDeclarerSeat = contract?.declarer === mySeat;
  const dummySeatVal = contract ? dummySeat(contract.declarer) : null;

  const isMyTurn = currentSeat === mySeat || (isDeclarerSeat && currentSeat === dummySeatVal);

  // Play a notification sound when it becomes my turn
  const prevIsMyTurnRef = useRef(false);
  useEffect(() => {
    if (isMyTurn && !prevIsMyTurnRef.current) {
      playTurnNotification();
    }
    prevIsMyTurnRef.current = isMyTurn;
  }, [isMyTurn]);

  // Compute remaining cards per seat by removing played cards
  const remainingCards: Record<Seat, Card[]> = (() => {
    const base: Record<Seat, Card[]> = { N: [], E: [], S: [], W: [] };
    if (!deal || !playState) return base;
    const played: Record<Seat, Card[]> = { N: [], E: [], S: [], W: [] };
    for (const trick of playState.completedTricks) {
      for (const tc of trick) played[tc.seat].push(tc.card);
    }
    for (const tc of playState.currentTrick) played[tc.seat].push(tc.card);
    (Object.keys(deal) as Seat[]).forEach((seat) => {
      base[seat] = deal[seat].filter(
        (c) => !played[seat].some((p) => p.suit === c.suit && p.rank === c.rank),
      );
    });
    return base;
  })();

  const legalCards: Card[] = (() => {
    if (phase !== 'playing' || !playState || !deal || !mySeat) return [];
    if (!isMyTurn) return [];
    // If it's dummy's turn and I'm declarer, compute legal cards from dummy's remaining hand
    if (isDeclarerSeat && currentSeat === dummySeatVal && dummySeatVal) {
      return getLegalCards(remainingCards[dummySeatVal], playState, dummySeatVal);
    }
    return getLegalCards(remainingCards[mySeat], playState, mySeat);
  })();

  const value: GameContextValue = {
    gameId,
    tableId,
    mySeat,
    players,
    deal,
    dealer,
    vulnerability,
    auction,
    contract,
    playState,
    phase,
    rubberState,
    lastScore,
    passedOut,
    handNumber,
    isMyTurn,
    currentSeat,
    legalCards,
    makeBid,
    playCard,
    requestUndo,
    requestBidUndo,
    bidUndoRequest,
    respondUndo,
    startNewHand,
    startNewRubber,
    loading,
    error,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) {
    throw new Error('useGame must be used within GameProvider');
  }
  return ctx;
}

export { sortHand, dummySeat, trickWinner, isVulnerable };
