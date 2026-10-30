import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { createLiveRefresh } from '@/lib/liveRefresh';
import { useAuth } from '@/context/AuthContext';
import type {
  Seat, Deal, AuctionEntry, Bid, Contract, PlayState,
  HandScore, Vulnerability, TablePlayer, Card, Phase, Suit, UndoRequest,
  MatchState, HandRole,
} from '@/types/bridge';
import {
  sideOfSeat, isVulnerable, SEATS,
} from '@/types/bridge';
import {
  jsonToDeal, sortHand, dealerForHand, vulnerabilityForHand, swapSeatForReplay,
  swapVulnerabilityForReplay,
} from '@/lib/dealing';
import {
  isValidBid, isAuctionComplete, isPassedOut, determineContract, getBidderSeat,
} from '@/lib/bidding';
import {
  getLegalCards, applyCardPlay, isPlayComplete, getOpeningLeader,
  createInitialPlayState, trickWinner, dummySeat, revertLastPlay,
} from '@/lib/play';
import {
  scoreHand,
} from '@/lib/scoring';
import { playTurnNotification } from '@/lib/sound';
import { scheduleHand } from '@/lib/matchSchedule';
import { computeImpResult, rawScoreForNS } from '@/lib/impScoring';

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
  lastScore: HandScore | null;
  passedOut: boolean;
  handNumber: number;
  currentHandId: string | null;
  nextHandAvailable: boolean;
  nextHandBusy: boolean;
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
  handRole: HandRole;
  matchState: MatchState;
  newHandsBeforeReplay: number;
  replaysStarted: boolean;
  hostId: string | null;
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
  const [lastScore, setLastScore] = useState<HandScore | null>(null);
  const [passedOut, setPassedOut] = useState(false);
  const [handNumber, setHandNumber] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const handVersionRef = useRef(0);
  const [currentHandId, setCurrentHandId] = useState<string | null>(null);
  const [bidUndoRequest, setBidUndoRequest] = useState<UndoRequest | null>(null);
  const [handRole, setHandRole] = useState<HandRole>('original');
  const [matchState, setMatchState] = useState<MatchState>({
    totalImpsA: 0,
    totalImpsB: 0,
    boardNumber: 0,
    completedBoards: [],
  });
  const [newHandsBeforeReplay, setNewHandsBeforeReplay] = useState(10);
  const [replaysStarted, setReplaysStarted] = useState(false);
  const [hostId, setHostId] = useState<string | null>(null);

  const loadRequestRef = useRef(0);
  const loadedHandRef = useRef<{ id: string; number: number; version: number; completed: boolean } | null>(null);
  const releasedHandRef = useRef<string | null>(null);
  const advancingRef = useRef(false);
  const [nextHandAvailable, setNextHandAvailable] = useState(false);
  const [nextHandBusy, setNextHandBusy] = useState(false);

  const updateHand = useCallback(async (
    handId: string,
    patch: Record<string, unknown>,
  ): Promise<boolean> => {
    const { data: nextVersion, error: updateError } = await supabase
      .rpc('update_bridge_hand', {
        p_hand_id: handId,
        p_expected_version: handVersionRef.current,
        p_patch: patch,
      });

    if (updateError || nextVersion === null) {
      setError('The table changed on another device. Your view is being refreshed.');
      return false;
    }

    handVersionRef.current = Number(nextVersion);
    if (loadedHandRef.current?.id === handId) {
      loadedHandRef.current.version = Math.max(loadedHandRef.current.version, Number(nextVersion));
      if (patch.phase === 'scoring' || patch.phase === 'finished') loadedHandRef.current.completed = true;
    }
    return true;
  }, []);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const creatingHandRef = useRef(false);

  // Load players and determine my seat
  useEffect(() => {
    let cancelled = false;
    const loadPlayers = async () => {
      const { data: tablePlayers } = await supabase
        .from('table_players')
        .select('user_id, seat')
        .eq('table_id', tableId);

      if (tablePlayers) {
        const userIds = tablePlayers.map((p) => p.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_style, avatar_url')
          .in('id', userIds);

        const profMap: Record<string, { display_name: string; avatar_style: string | null; avatar_url: string | null }> = {};
        (profiles || []).forEach((p) => {
          profMap[p.id] = { display_name: p.display_name, avatar_style: p.avatar_style, avatar_url: p.avatar_url };
        });

        const seatPlayers: TablePlayer[] = tablePlayers.map((p) => ({
          user_id: p.user_id,
          seat: p.seat as Seat,
          display_name: profMap[p.user_id]?.display_name ?? 'Unknown',
          avatar_style: profMap[p.user_id]?.avatar_style ?? null,
          avatar_url: profMap[p.user_id]?.avatar_url ?? null,
        }));

        if (cancelled) return;
        setPlayers(seatPlayers);

        const myAssignment = seatPlayers.find((p) => p.user_id === profileRef.current?.id);
        setMySeat(myAssignment?.seat ?? null);
      }
    };
    const live = createLiveRefresh(loadPlayers);
    void live.refresh();
    const channel = supabase.channel(`game-players-${tableId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, live.refresh)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'table_players', filter: `table_id=eq.${tableId}`,
      }, live.refresh)
      .subscribe(live.onStatus);
    return () => {
      cancelled = true;
      live.dispose();
      void supabase.removeChannel(channel);
    };
  }, [tableId, profile?.id]);

  // Load game state
  const loadGameState = useCallback(async () => {
    const request = ++loadRequestRef.current;
    // Fetch game, table, and latest hand in parallel
    const [gameResult, tableResult, handsResult, replayResult] = await Promise.all([
      supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .maybeSingle(),
      supabase
        .from('tables')
        .select('match_imps_a, match_imps_b, match_board_number, new_hands_before_replay, host_id')
        .eq('id', tableId)
        .maybeSingle(),
      supabase
        .from('hands')
        .select('*')
        .eq('game_id', gameId)
        .order('hand_number', { ascending: false })
        .limit(1),
      supabase
        .from('hands')
        .select('id')
        .eq('game_id', gameId)
        .eq('hand_role', 'replay')
        .limit(1),
    ]);

    if (request !== loadRequestRef.current) return;
    const game = gameResult.data;
    const tableData = tableResult.data;
    const hands = handsResult.data;

    if (!game) {
      setLoading(false);
      return;
    }

    const applyTableState = () => {
      setReplaysStarted(Boolean(replayResult.data && replayResult.data.length > 0));
      setHostId(tableData?.host_id ?? null);
      setMatchState({
        totalImpsA: tableData?.match_imps_a ?? 0,
        totalImpsB: tableData?.match_imps_b ?? 0,
        boardNumber: tableData?.match_board_number ?? 0,
        completedBoards: [],
      });
      setNewHandsBeforeReplay(tableData?.new_hands_before_replay ?? 10);
      setHandNumber(hands?.[0]?.hand_number ?? game.hand_number);

    };

    if (hands && hands.length > 0) {
      let hand = hands[0];
      const previous = loadedHandRef.current;
      let newerHandWaiting = false;
      if (previous?.completed && hand.hand_number > previous.number && releasedHandRef.current !== previous.id) {
        setNextHandAvailable(true);
        return;
      }
      // A fast next deal can arrive before this client receives the final play.
      // Load that client's completed hand first so its summary is never skipped.
      if (previous && hand.hand_number > previous.number && releasedHandRef.current !== previous.id) {
        const { data: completed, error: completedError } = await supabase.from('hands')
          .select('*').eq('id', previous.id).maybeSingle();
        if (request !== loadRequestRef.current) return;
        if (completedError || !completed || !['scoring', 'finished'].includes(completed.phase)) return;
        hand = completed;
        newerHandWaiting = true;
      }
      const { data: visibleHands, error: visibleHandsError } = await supabase
        .from('hand_cards')
        .select('seat, cards')
        .eq('hand_id', hand.id);

      if (request !== loadRequestRef.current) return;
      const version = Number(hand.state_version ?? 0);
      if (previous && (hand.hand_number < previous.number || (hand.id === previous.id && version < previous.version))) return;
      if (visibleHandsError) {
        setError('Your cards could not be loaded. Please refresh the table.');
        return;
      }

      applyTableState();
      loadedHandRef.current = { id: hand.id, number: hand.hand_number, version, completed: hand.phase === 'scoring' || hand.phase === 'finished' };
      setNextHandAvailable(newerHandWaiting);
      handVersionRef.current = version;
      const visibleDeal: Record<string, string[]> = { N: [], E: [], S: [], W: [] };
      for (const row of visibleHands ?? []) {
        visibleDeal[row.seat as Seat] = row.cards as string[];
      }
      setCurrentHandId(hand.id);
      setContract(null);
      setPlayState(null);
      setLastScore(null);
      setPassedOut(hand.phase === 'finished' && !hand.contract);
      const loadedDeal = jsonToDeal(visibleDeal);
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
      setHandRole((hand.hand_role as HandRole | undefined) ?? 'original');
    } else {
      applyTableState();
    }

    setLoading(false);
  }, [gameId, tableId]);

  // Realtime is primary. Periodic/focus reads recover a missed final-hand
  // update and re-fetch hand_cards after scoring makes all four hands visible.
  useEffect(() => {
    if (!gameId) return;
    const requests = loadRequestRef;
    const live = createLiveRefresh(loadGameState, 5000);
    void live.refresh();
    const channel = supabase.channel(`game-${gameId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'hands', filter: `game_id=eq.${gameId}`,
      }, live.refresh)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'hand_cards',
      }, live.refresh)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}`,
      }, live.refresh)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tables', filter: `id=eq.${tableId}`,
      }, live.refresh)
      .subscribe(live.onStatus);
    return () => {
      live.dispose();
      requests.current++;
      void supabase.removeChannel(channel);
    };
  }, [gameId, loadGameState, tableId]);

  // Determine the schedule for a hand: original vs replay, and which original to replay
  const getHandSchedule = useCallback(async (hNum: number): Promise<{
    role: HandRole;
    originalHandId: string | null;
    originalDealer: Seat | null;
    originalVulnerability: Vulnerability | null;
  }> => {
    // Fetch all original hands that have been played (phase = scoring/finished)
    // and don't have a replay yet
    const { data: allHands } = await supabase
      .from('hands')
      .select('id, hand_number, hand_role, phase, original_hand_id, dealer, vulnerability')
      .eq('game_id', gameId)
      .order('hand_number', { ascending: true });

    // Find original hands (hand_role = 'original') that have completed
    // and don't have a corresponding replay yet
    const completedOriginals: number[] = [];
    const replayedOriginals = new Set<number>();

    for (const h of allHands ?? []) {
      if (h.hand_role === 'original' && (h.phase === 'scoring' || h.phase === 'finished')) {
        completedOriginals.push(h.hand_number);
      }
      if (h.hand_role === 'replay' && h.original_hand_id) {
        // Find the original hand_number for this replay
        const orig = (allHands ?? []).find(o => o.id === h.original_hand_id);
        if (orig) replayedOriginals.add(orig.hand_number);
      }
    }

    const replayable = completedOriginals.filter(n => !replayedOriginals.has(n));
    const sched = scheduleHand(hNum, newHandsBeforeReplay, replayable);

    // If it's a replay, find the hand_id of the original (and its dealer/vulnerability)
    let originalHandId: string | null = null;
    let originalDealer: Seat | null = null;
    let originalVulnerability: Vulnerability | null = null;
    if (sched.role === 'replay' && sched.originalHandNumber !== null) {
      const orig = (allHands ?? []).find(
        h => h.hand_number === sched.originalHandNumber && h.hand_role === 'original'
      );
      originalHandId = orig?.id ?? null;
      if (orig) {
        originalDealer = orig.dealer as Seat;
        originalVulnerability = orig.vulnerability as Vulnerability;
      }
    }

    return { role: sched.role, originalHandId, originalDealer, originalVulnerability };
  }, [gameId, newHandsBeforeReplay]);

  // Create a new hand
  const createNewHand = useCallback(async (hNum: number) => {
    if (creatingHandRef.current) return null;
    creatingHandRef.current = true;

    const { role, originalHandId, originalDealer, originalVulnerability } = await getHandSchedule(hNum);

    // Dealer and vulnerability follow the cards' clockwise rotation on replay.
    // The database also derives these values from the original board.
    const firstDealer: Seat = 'N';
    const newDealer = originalDealer ? swapSeatForReplay(originalDealer) : dealerForHand(hNum, firstDealer);
    const vul: Vulnerability = originalVulnerability
      ? swapVulnerabilityForReplay(originalVulnerability)
      : vulnerabilityForHand(hNum);

    const rpcParams: Record<string, unknown> = {
      p_game_id: gameId,
      p_hand_number: hNum,
      p_dealer: newDealer,
      p_vulnerability: vul,
      p_hand_role: role,
    };
    if (role === 'replay' && originalHandId) {
      rpcParams.p_original_hand_id = originalHandId;
    }

    const { data: hand, error: handError } = await supabase
      .rpc('create_bridge_hand', rpcParams);

    creatingHandRef.current = false;
    if (handError && handError.code !== '23505') {
      setError('The hand could not be dealt. Please try again.');
    }
    return (hand as string | null) ?? null;
  }, [gameId, getHandSchedule]);

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

    const saved = await updateHand(currentHandId, updateData);
    if (!saved) { await loadGameState(); return; }

    setContract(newContract);
    setPlayState(newPlayState);
    setPhase(newPhase);
    setPassedOut(newPassedOut);
    if (newPassedOut) await loadGameState();
  }, [mySeat, currentHandId, auction, dealer, updateHand, loadGameState]);

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

    // Check if hand is complete
    let updatedPlayState = newPlayState;
    let newPhase: Phase = 'playing';
    let newContract = contract;
    let newLastScore: HandScore | null = lastScore;

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
        newContract = finalContract;
      }

      setLastScore(newLastScore);
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

    // If this was a replay hand and it just completed, compute IMPs
    if (isPlayComplete(updatedPlayState) && handRole === 'replay' && newContract) {
      // Find the original hand to compare scores
      const { data: replayHand } = await supabase
        .from('hands')
        .select('original_hand_id')
        .eq('id', currentHandId)
        .maybeSingle();

      if (replayHand?.original_hand_id) {
        const { data: origHand } = await supabase
          .from('hands')
          .select('contract, vulnerability, score, hand_number')
          .eq('id', replayHand.original_hand_id)
          .maybeSingle();

        if (origHand?.contract) {
          const origContract = origHand.contract as Contract;
          const replayContract = newContract;
          const origVul = (origHand.vulnerability ?? vulnerability) as Vulnerability;

          const imps = computeImpResult(origContract, replayContract, origVul, vulnerability);
          const origNsScore = rawScoreForNS(origContract, origVul);
          const replayNsScore = rawScoreForNS(replayContract, vulnerability);
          // Players stay in their seats for both playings; only the cards swap.
          // Team A = N+S in both playings, so the net points are the sum of the
          // raw NS scores. computeImpResult returns positive = Team A wins.
          const netPoints = origNsScore + replayNsScore;
          const impResult = {
            originalHandId: replayHand.original_hand_id,
            replayHandId: currentHandId,
            netPoints,
            imps,
            teamAIsNS: true,
          };

          updateData.imp_result = impResult;

          // Update match scores on the table
          const { data: freshTable } = await supabase
            .from('tables')
            .select('match_imps_a, match_imps_b, match_board_number')
            .eq('id', tableId)
            .maybeSingle();

          const newImpsA = (freshTable?.match_imps_a ?? 0) + imps;
          const newImpsB = (freshTable?.match_imps_b ?? 0) - imps;
          const newBoardNum = (freshTable?.match_board_number ?? 0) + 1;

          await supabase
            .from('tables')
            .update({
              match_imps_a: newImpsA,
              match_imps_b: newImpsB,
              match_board_number: newBoardNum,
            })
            .eq('id', tableId);

          setMatchState(prev => ({
            ...prev,
            totalImpsA: newImpsA,
            totalImpsB: newImpsB,
            boardNumber: newBoardNum,
          }));
        }
      }
    }

    const playRecordPromise = supabase.rpc('record_bridge_play', {
      p_hand_id: currentHandId,
      p_trick_number: playState.trickNumber,
      p_seat: playingSeat,
      p_card: `${card.rank}${card.suit}`,
    });

    const handSaved = await updateHand(currentHandId, updateData);
    if (!handSaved) return;

    await playRecordPromise;

    setPlayState(updatedPlayState);
    setPhase(newPhase);
    setContract(newContract);
    if (newPhase === 'scoring') await loadGameState();
  }, [mySeat, currentHandId, playState, deal, contract, vulnerability, lastScore, handRole, gameId, tableId, updateHand, loadGameState]);

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

    await updateHand(currentHandId, { play_state: updatedPlayState });
  }, [mySeat, currentHandId, playState, phase, updateHand]);

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

    await updateHand(currentHandId, { bid_undo_request: undoReq });
  }, [mySeat, currentHandId, phase, bidUndoRequest, auction, updateHand]);

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
        await updateHand(currentHandId, { bid_undo_request: null });
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

        await updateHand(currentHandId, updateData);
        return;
      }

      // Partial acceptance
      const updatedReq: UndoRequest = {
        ...latestReq,
        acceptedBy: newAccepted,
        declinedBy: newDeclined,
      };
      setBidUndoRequest(updatedReq);
      await updateHand(currentHandId, { bid_undo_request: updatedReq });
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
      await updateHand(currentHandId, { play_state: updatedPlayState });
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
        await updateHand(currentHandId, { play_state: updatedPlayState });
        return;
      }

      setPlayState(result.newPlayState);
      setError(null);

      // Delete the last play record from the plays table
      await supabase.rpc('delete_last_bridge_play', {
        p_hand_id: currentHandId,
      });

      await updateHand(currentHandId, { play_state: result.newPlayState });
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
    await updateHand(currentHandId, { play_state: updatedPlayState });
  }, [mySeat, currentHandId, playState, contract, bidUndoRequest, auction, phase, updateHand]);

  const startNewHand = useCallback(async () => {
    if (!mySeat || !currentHandId || advancingRef.current || (phase !== 'scoring' && phase !== 'finished')) return;
    advancingRef.current = true;
    setNextHandBusy(true);
    releasedHandRef.current = currentHandId;
    try {
      const { data: latest, error: latestError } = await supabase.from('hands')
        .select('id, hand_number').eq('game_id', gameId)
        .order('hand_number', { ascending: false }).limit(1).maybeSingle();
      if (latestError) throw latestError;
      if (!latest || latest.hand_number <= handNumber) {
        const nextHand = handNumber + 1;
        const created = await createNewHand(nextHand);
        if (created) {
          await supabase.from('games').update({ hand_number: nextHand })
            .eq('id', gameId).lt('hand_number', nextHand);
        }
      }
      await loadGameState();
    } catch {
      setError('Could not join the next hand. Please try again. Your completed hand is still available.');
    } finally {
      if (loadedHandRef.current?.id === currentHandId) releasedHandRef.current = null;
      advancingRef.current = false;
      setNextHandBusy(false);
    }
  }, [mySeat, currentHandId, phase, handNumber, gameId, createNewHand, loadGameState]);

  // Derived state
  const currentSeat = phase === 'bidding'
    ? (auction.length === 0 ? dealer : getBidderSeat(auction, dealer ?? 'N'))
    : playState?.currentSeat ?? null;

  const isDeclarerSeat = contract?.declarer === mySeat;
  const dummySeatVal = contract ? dummySeat(contract.declarer) : null;

  const isMyTurn = currentSeat === mySeat || (isDeclarerSeat && currentSeat === dummySeatVal);
  const isMyOwnTurn = currentSeat === mySeat;

  // Play a notification sound when it becomes my turn (not when it's dummy's turn)
  const prevIsMyOwnTurnRef = useRef(false);
  useEffect(() => {
    if (isMyOwnTurn && !prevIsMyOwnTurnRef.current) {
      playTurnNotification();
    }
    prevIsMyOwnTurnRef.current = isMyOwnTurn;
  }, [isMyOwnTurn]);

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
    lastScore,
    passedOut,
    handNumber,
    currentHandId,
    nextHandAvailable,
    nextHandBusy,
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
    handRole,
    matchState,
    newHandsBeforeReplay,
    replaysStarted,
    hostId,
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
