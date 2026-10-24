import { useGame } from '@/context/GameContext';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useAuth } from '@/context/AuthContext';
import { VideoTile } from '@/components/VideoTile';
import { HandDisplay, PlayedCard, CardBackFan, DummyHandDisplay, type HandLayout } from '@/components/CardDisplay';
import { BiddingPanel, AuctionHistory } from '@/components/BiddingPanel';
import { ScorePanel, NextHandButton } from '@/components/ScorePanel';
import { DoubleDummyReview } from '@/components/DoubleDummyReview';
import { sortHand, dummySeat, isVulnerable } from '@/context/GameContext';
import type { Card, Seat, Suit, UndoRequest, Bid, AuctionEntry } from '@/types/bridge';
import { SEATS, SUIT_SYMBOLS, STRAIN_SYMBOLS, sideOfSeat } from '@/types/bridge';
import { getLegalCards } from '@/lib/play';
import { AvatarFigure } from '@/components/AvatarFigure';
import { DEFAULT_AVATAR_STYLE, isAvatarStyle, type AvatarStyle } from '@/lib/avatars';
import { ProfileSettings } from '@/components/ProfileSettings';
import { supabase } from '@/lib/supabase';
import {
  Mic, MicOff, Video, VideoOff, Volume2, VolumeX, ArrowLeft, Undo2, Check, X, UserRound, Zap, Settings,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface GameTableProps {
  tableId: string;
  onLeave: () => void;
}

type ViewSide = 'bottom' | 'left' | 'top' | 'right';
function useContainerSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width && rect.height) setSize({ width: rect.width, height: rect.height });
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, ...size };
}

function rotationFor(mySeat: Seat): Record<Seat, ViewSide> {
  switch (mySeat) {
    case 'S': return { S: 'bottom', W: 'left', N: 'top', E: 'right' };
    case 'W': return { W: 'bottom', N: 'left', E: 'top', S: 'right' };
    case 'N': return { N: 'bottom', E: 'left', S: 'top', W: 'right' };
    case 'E': return { E: 'bottom', S: 'left', W: 'top', N: 'right' };
  }
}

function handWidthFactor(hand: Card[]): number {
  if (hand.length === 0) return 1;
  const suits = new Set(hand.map(c => c.suit));
  return 1 + (hand.length - 1) * 0.32 + Math.max(0, suits.size - 1) * 0.1;
}

function suitColumnFactors(hand: Card[]) {
  if (hand.length === 0) return { widthFactor: 1.08, heightFactor: 1.4 };
  const bySuit: Record<string, Card[]> = {};
  for (const c of hand) (bySuit[c.suit] ??= []).push(c);
  const cols = Object.values(bySuit).filter(a => a.length > 0);
  const numCols = cols.length || 1;
  const maxColCards = Math.max(1, ...cols.map(a => a.length));
  const widthFactor = numCols * 1.08 - 0.08;
  const heightFactor = 1.4 * (1 + (maxColCards - 1) * 0.22);
  return { widthFactor, heightFactor };
}

function computeSuitColumnCardW(zoneW: number, zoneH: number, hand: Card[], maxW = 120): number {
  const { widthFactor, heightFactor } = suitColumnFactors(hand);
  return Math.max(20, Math.min(zoneW / widthFactor, zoneH / heightFactor, maxW));
}

function computeSuitRowCardW(zoneW: number, zoneH: number, hand: Card[], maxW = 120): number {
  const bySuit: Record<string, Card[]> = {};
  for (const card of hand) (bySuit[card.suit] ??= []).push(card);
  const nonEmptySuits = Object.values(bySuit).filter((cards) => cards.length > 0);
  const longestRow = Math.max(1, ...nonEmptySuits.map((cards) => cards.length));
  const rowCount = Math.max(1, nonEmptySuits.length);
  const widthFactor = 1 + (longestRow - 1) * 0.3;
  const heightFactor = rowCount * 1.44;
  return Math.max(20, Math.min(zoneW / widthFactor, zoneH / heightFactor, maxW));
}

function computeHorizontalCardW(zoneW: number, zoneH: number, hand: Card[], maxW = 220): number {
  return Math.max(24, Math.min(zoneW / handWidthFactor(hand), zoneH / 1.4, maxW));
}

const TRICK_POSITION_CLASSES: Record<ViewSide, string> = {
  top: 'top-0 left-1/2 -translate-x-1/2',
  bottom: 'bottom-0 left-1/2 -translate-x-1/2',
  left: 'left-0 top-1/2 -translate-y-1/2',
  right: 'right-0 top-1/2 -translate-y-1/2',
};

export function GameTable({ tableId, onLeave }: GameTableProps) {
  const { profile } = useAuth();
  const game = useGame();
  const {
    mySeat, players, deal, dealer, vulnerability, auction, contract,
    playState, phase, passedOut, isMyTurn, currentSeat,
    legalCards, playCard, requestUndo, requestBidUndo, bidUndoRequest, respondUndo, error, loading,
    handRole, matchState,
    newHandsBeforeReplay, replaysStarted, hostId,
  } = game;

  const myUserId = profile?.id ?? '';
  const {
    localStream, peerStreams, videoEnabled, audioEnabled, outputEnabled,
    toggleVideo, toggleAudio, toggleOutput, error: webrtcError,
  } = useWebRTC({ tableId, userId: myUserId, enabled: true });
  const { ref: tableAreaRef, width: availW, height: availH } = useContainerSize();

  const seatToUserId: Record<Seat, string> = useMemo(() => {
    const map: Record<Seat, string> = { N: '', E: '', S: '', W: '' };
    players.forEach((p) => { map[p.seat] = p.user_id; });
    return map;
  }, [players]);

  const seatToName: Record<Seat, string> = useMemo(() => {
    const map: Record<Seat, string> = { N: '', E: '', S: '', W: '' };
    players.forEach((p) => { map[p.seat] = p.display_name; });
    return map;
  }, [players]);

  const seatToAvatarStyle: Record<Seat, AvatarStyle> = useMemo(() => {
    const map: Record<Seat, AvatarStyle> = {
      N: defaultAvatarForSeat('N'),
      E: defaultAvatarForSeat('E'),
      S: defaultAvatarForSeat('S'),
      W: defaultAvatarForSeat('W'),
    };
    players.forEach((player) => {
      if (isAvatarStyle(player.avatar_style)) map[player.seat] = player.avatar_style;
    });
    return map;
  }, [players]);

  const legalCardSet = useMemo(() => {
    return new Set(legalCards.map((c) => `${c.rank}${c.suit}`));
  }, [legalCards]);

  const allPlayedCards = useMemo(() => {
    const played: Record<Seat, Card[]> = { N: [], E: [], S: [], W: [] };
    if (!playState) return played;
    for (const trick of playState.completedTricks) {
      for (const tc of trick) {
        played[tc.seat].push(tc.card);
      }
    }
    for (const tc of playState.currentTrick) {
      played[tc.seat].push(tc.card);
    }
    return played;
  }, [playState]);

  const viewSides = useMemo<Record<Seat, ViewSide>>(
    () => (mySeat ? rotationFor(mySeat) : { S: 'bottom', W: 'left', N: 'top', E: 'right' }),
    [mySeat],
  );

  const [avatarStyle, setAvatarStyle] = useState<AvatarStyle>(DEFAULT_AVATAR_STYLE);
  const [profileOpen, setProfileOpen] = useState(false);
  const [animToggleOpen, setAnimToggleOpen] = useState(false);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [fastAnimations, setFastAnimations] = useState(false);
  const [replaySetting, setReplaySetting] = useState(newHandsBeforeReplay);

  useEffect(() => { setReplaySetting(newHandsBeforeReplay); }, [newHandsBeforeReplay]);
  const [avatarPlay, setAvatarPlay] = useState<{ seat: Seat; card: Card; key: string } | null>(null);
  const currentTrick = playState?.currentTrick ?? [];
  const currentTrickCard = currentTrick.length > 0 ? currentTrick[currentTrick.length - 1] : null;
  const animationKey = phase === 'playing' && currentTrickCard
    ? `${playState?.trickNumber ?? 0}-${playState?.currentTrick.length ?? 0}-${currentTrickCard.seat}-${currentTrickCard.card.rank}${currentTrickCard.card.suit}`
    : '';

  useEffect(() => {
    if (isAvatarStyle(profile?.avatar_style)) {
      setAvatarStyle(profile.avatar_style);
    }
  }, [profile?.avatar_style]);

  useEffect(() => {
    if (!animationKey || !currentTrickCard || !animationsEnabled) return;
    const nextPlay = { seat: currentTrickCard.seat, card: currentTrickCard.card, key: animationKey };
    setAvatarPlay(nextPlay);
    const timeout = window.setTimeout(() => setAvatarPlay((current) => current?.key === animationKey ? null : current), fastAnimations ? 520 : 900);
    return () => window.clearTimeout(timeout);
  }, [animationKey, currentTrickCard, animationsEnabled, fastAnimations]);

  const lastBidPerSeat: Record<Seat, AuctionEntry | null> = useMemo(() => {
    const map: Record<Seat, AuctionEntry | null> = { N: null, E: null, S: null, W: null };
    for (const entry of auction) {
      map[entry.seat] = entry;
    }
    return map;
  }, [auction]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Loading game...</p>
        </div>
      </div>
    );
  }

  if (!mySeat) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 text-sm mb-4">You are not seated at this table.</p>
          <button onClick={onLeave} className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm">
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Waiting for the deal...</p>
          <p className="text-slate-500 text-xs mt-1">The first hand is being dealt.</p>
        </div>
      </div>
    );
  }

  const dummy = contract ? dummySeat(contract.declarer) : null;
  const isDummyRevealed = playState?.dummyRevealed ?? false;
  const isDeclarer = contract?.declarer === mySeat;
  const isDummySeat = dummy === mySeat;

  const getHand = (seat: Seat) => {
    if (!deal) return [];
    const fullHand = sortHand(deal[seat], contract?.strain);
    const played = allPlayedCards[seat] ?? [];
    return fullHand.filter(
      (c) => !played.some((p) => p.suit === c.suit && p.rank === c.rank),
    );
  };

  const shouldShowHand = (seat: Seat): boolean => {
    if (seat === mySeat) return true;
    if (phase !== 'playing' || !isDummyRevealed || !dummy) return false;
    if (seat === dummy) return true;
    return isDummySeat && seat === contract?.declarer;
  };

  const canPlayForSeat = (seat: Seat): boolean => {
    if (phase !== 'playing' || !playState) return false;
    if (playState.currentSeat !== seat) return false;
    if (isDummySeat && seat === mySeat) return false;
    if (isDeclarer && (seat === mySeat || seat === dummy)) return true;
    if (seat === mySeat) return true;
    return false;
  };

  const getCardClickHandler = (seat: Seat): ((card: Card) => void) | undefined => {
    if (!canPlayForSeat(seat)) return undefined;
    return playCard;
  };

  const getLegalCardsForDisplay = (seat: Seat): Set<string> | undefined => {
    if (!canPlayForSeat(seat)) return undefined;
    if (!playState || !deal) return undefined;
    if (seat !== mySeat && isDeclarer && seat === dummy) {
      const dummyHand = getHand(seat);
      const legal = getLegalCards(dummyHand, playState, seat);
      return new Set(legal.map((c) => `${c.rank}${c.suit}`));
    }
    return legalCardSet;
  };

  const getStreamForSeat = (seat: Seat): MediaStream | null => {
    const userId = seatToUserId[seat];
    if (userId === myUserId) return localStream;
    return peerStreams.get(userId) ?? null;
  };

  const isHost = hostId === myUserId;

  const hasCardsPlayed = (playState?.currentTrick.length ?? 0) > 0 || (playState?.completedTricks.length ?? 0) > 0;
  const canRequestUndo = (() => {
    if (!mySeat || !playState) return false;
    let lastSeat: Seat | null = null;
    if (playState.currentTrick.length > 0) {
      lastSeat = playState.currentTrick[playState.currentTrick.length - 1].seat;
    } else if (playState.completedTricks.length > 0) {
      const lastTrick = playState.completedTricks[playState.completedTricks.length - 1];
      if (lastTrick.length > 0) lastSeat = lastTrick[lastTrick.length - 1].seat;
    }
    if (!lastSeat) return false;
    return sideOfSeat(mySeat) === sideOfSeat(lastSeat);
  })();

  const vulText = (() => {
    switch (vulnerability) {
      case 'none': return 'None Vul';
      case 'NS': return 'NS Vul';
      case 'EW': return 'EW Vul';
      case 'both': return 'All Vul';
      default: return '';
    }
  })();

  // --- Dynamic sizing based on measured container ---
  const w = availW || 800;
  const h = availH || 600;
  const centerW = w * 0.5;
  const centerH = h * 0.5;
  const edgeH = (h - centerH) / 2;
  const edgeW = (w - centerW) / 2;

  const ZONE_PAD = 8;

  const myHandCards = getHand(mySeat);
  const myCardW = Math.max(44, computeHorizontalCardW(w - 40, edgeH - ZONE_PAD, myHandCards, 240));

  // Video tiles live in the corners — they don't consume card space
  const cornerVideoW = Math.min(160, w * 0.14, h * 0.16);

  let dummyCardW = 40;
  if (dummy && isDummyRevealed && phase === 'playing') {
    const dummySide = viewSides[dummy];
    const dummyHandCards = getHand(dummy);
    if (dummySide === 'top' || dummySide === 'bottom') {
      const zoneW = w - 40;
      const zoneH = edgeH - ZONE_PAD;
      dummyCardW = computeHorizontalCardW(zoneW, Math.max(40, zoneH), dummyHandCards, 220);
    } else {
      const zoneW = edgeW - ZONE_PAD;
      dummyCardW = computeSuitRowCardW(Math.max(40, zoneW), Math.max(40, h - 40), dummyHandCards, 180);
    }
  }

  const otherHandCards = SEATS.filter(s => s !== mySeat && s !== dummy).map(s => getHand(s)).find(h => h.length > 0) || [];
  const otherHorizontalCardW = Math.max(36, computeHorizontalCardW(w - 40, edgeH - ZONE_PAD, otherHandCards, 150));
  const otherSideCardW = Math.max(36, Math.min(
    computeSuitRowCardW(edgeW - ZONE_PAD, centerH - ZONE_PAD, otherHandCards, 110),
    110,
  ));
  const playedCardW = Math.max(56, Math.min(centerW * 0.3, centerH * 0.3, 140));
  const trickAreaSize = Math.min(centerW * 0.8, centerH * 0.8, 300);

  const seatBySide: Record<ViewSide, Seat | null> = { top: null, bottom: null, left: null, right: null };
  for (const seat of SEATS) {
    seatBySide[viewSides[seat]] = seat;
  }

  const renderSeatContent = (seat: Seat) => {
    const side = viewSides[seat];
    const isMe = seat === mySeat;
    const isDummySeatHere = dummy === seat && isDummyRevealed && phase === 'playing';
    const showHand = shouldShowHand(seat);
    const isTurnNow = currentSeat === seat && phase !== 'finished';
    const layout: HandLayout = side === 'top' || side === 'bottom' ? 'horizontal' : 'side';
    const cardW = isMe ? myCardW : isDummySeatHere ? dummyCardW : layout === 'horizontal' ? otherHorizontalCardW : otherSideCardW;

    return (
      <SeatBadge
        isTurn={isTurnNow}
        isDealer={dealer === seat}
        isVulnerable={isVulnerable(seat, vulnerability)}
        seatLabel={seat}
        playerName={seatToName[seat] || seat}
      >
        <div className={`flex flex-col items-center gap-1 ${layout === 'side' ? 'max-w-full' : ''}`}>
          {showHand ? (
            dummy === seat && isDummyRevealed && phase === 'playing' ? (
              <DummyHandDisplay
                hand={getHand(seat)}
                isTurn={isTurnNow}
                cardWidth={cardW}
                trumpStrain={contract?.strain}
                onCardClick={getCardClickHandler(seat)}
                legalCards={getLegalCardsForDisplay(seat)}
                layout={layout}
              />
            ) : (
              <HandDisplay
                hand={getHand(seat)}
                seat={seat}
                hidden={false}
                cardWidth={cardW}
                isDummy={dummy === seat && isDummyRevealed}
                isTurn={isTurnNow && phase === 'playing'}
                trumpStrain={contract?.strain}
                compact={layout === 'horizontal' ? false : true}
                layout={layout}
                onCardClick={getCardClickHandler(seat)}
                legalCards={getLegalCardsForDisplay(seat)}
              />
            )
          ) : (
            <CardBackFan cardWidth={cardW} />
          )}
        </div>
      </SeatBadge>
    );
  };

  return (
    <>
    <div className="h-dvh min-h-[28rem] overflow-hidden bg-gradient-to-br from-slate-900 via-emerald-950/80 to-slate-900 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/80 backdrop-blur border-b border-slate-700/50">
        <button
          onClick={onLeave}
          className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Leave Table
        </button>

        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-400">Dealer: <span className="text-white font-medium">{dealer}</span></span>
          <span className="text-slate-400">Vul: <span className="text-white font-medium">{vulText}</span></span>
          <span className={`px-2 py-0.5 rounded-full font-medium ${
            handRole === 'replay'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
          }`}>
            {handRole === 'replay' ? 'Replay' : 'Original'}
          </span>
          {contract && (
            <span className="text-slate-400">Contract: <span className="text-emerald-400 font-medium">
              {contract.level}{contract.strain === 'NT' ? 'NT' : SUIT_SYMBOLS[contract.strain as Suit]}{contract.doubled === 1 ? 'X' : contract.doubled === 2 ? 'XX' : ''} by {contract.declarer}
            </span></span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setProfileOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-slate-700 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-600"
          >
            <UserRound className="h-4 w-4" />
            Profile
          </button>
          <div className="relative">
            <button
              onClick={() => setAnimToggleOpen((open) => !open)}
              className="flex items-center gap-1.5 rounded-lg bg-slate-700 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-600"
              aria-expanded={animToggleOpen}
              title="Table settings"
            >
              <Settings className="h-4 w-4" />
              Table Settings
            </button>
            {animToggleOpen && createPortal(
              <div
                className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
                onClick={() => setAnimToggleOpen(false)}
                role="presentation"
              >
                <div
                  className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="table-settings-title"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <span id="table-settings-title" className="text-sm font-semibold text-white">Table Settings</span>
                    <button onClick={() => setAnimToggleOpen(false)} className="text-slate-400 hover:text-white" aria-label="Close table settings">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Your display</p>
                  <label className="flex items-center justify-between text-sm text-slate-300 py-2 cursor-pointer">
                    Animated card play
                    <input type="checkbox" checked={animationsEnabled} onChange={(event) => setAnimationsEnabled(event.target.checked)} className="accent-emerald-500 h-4 w-4" />
                  </label>
                  <label className={`flex items-center justify-between text-sm text-slate-300 py-2 cursor-pointer ${!animationsEnabled ? 'opacity-40' : ''}`}>
                    Fast play
                    <input type="checkbox" checked={fastAnimations} disabled={!animationsEnabled} onChange={(event) => setFastAnimations(event.target.checked)} className="accent-emerald-500 h-4 w-4" />
                  </label>
                  {isHost && (
                    <div className="mt-3 border-t border-slate-700/50 pt-3">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Table host only</p>
                      <label className="flex items-center justify-between text-sm text-slate-300 py-2">
                        <span className="whitespace-nowrap">New hands before replay</span>
                        <select
                          value={replaySetting}
                          disabled={replaysStarted}
                          onChange={(e) => {
                            if (replaysStarted) return;
                            const v = parseInt(e.target.value, 10);
                            if (!isNaN(v)) {
                              setReplaySetting(v);
                              supabase
                                .from('tables')
                                .update({ new_hands_before_replay: v })
                                .eq('id', tableId)
                                .then();
                            }
                          }}
                          className="w-16 px-1.5 py-1 bg-slate-800 border border-slate-600 rounded text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {[4, 8, 12, 16, 20, 24, 28, 32].map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                      {replaysStarted && (
                        <p className="text-[10px] text-slate-500 mt-1">Locked — replays have already started.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>,
              document.body,
            )}
          </div>
          {phase === 'playing' && playState && !playState.undoRequest && hasCardsPlayed && canRequestUndo && (
            <button
              onClick={() => requestUndo()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-all"
              title="Request to undo the last card played"
            >
              <Undo2 className="w-4 h-4" />
              Undo
            </button>
          )}
          {phase === 'bidding' && !bidUndoRequest && auction.length > 0 && (() => {
            const lastBid = auction[auction.length - 1];
            const canReq = mySeat && sideOfSeat(mySeat) === sideOfSeat(lastBid.seat);
            return canReq ? (
              <button
                onClick={() => requestBidUndo()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-all"
                title="Request to undo the last bid"
              >
                <Undo2 className="w-4 h-4" />
                Undo Bid
              </button>
            ) : null;
          })()}
          <button
            onClick={toggleAudio}
            aria-label={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
            title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
            className={`p-2 rounded-lg transition-all ${audioEnabled ? 'bg-slate-700 text-white' : 'bg-red-600 text-white'}`}
          >
            {audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </button>
          <button
            onClick={toggleOutput}
            aria-label={outputEnabled ? 'Mute participant audio' : 'Unmute participant audio'}
            title={outputEnabled ? 'Mute participant audio' : 'Unmute participant audio'}
            className={`p-2 rounded-lg transition-all ${outputEnabled ? 'bg-slate-700 text-white' : 'bg-red-600 text-white'}`}
          >
            {outputEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            onClick={toggleVideo}
            aria-label={videoEnabled ? 'Turn camera off' : 'Turn camera on'}
            title={videoEnabled ? 'Turn camera off' : 'Turn camera on'}
            className={`p-2 rounded-lg transition-all ${videoEnabled ? 'bg-slate-700 text-white' : 'bg-red-600 text-white'}`}
          >
            {videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {webrtcError && (
        <div className="bg-amber-900/30 border-b border-amber-700/30 px-4 py-1.5 text-xs text-amber-300 text-center">
          {webrtcError}
        </div>
      )}

      {/* Main game area */}
      <div className="flex-1 flex min-h-0">
        <div
          ref={tableAreaRef}
          className="flex-1 relative min-w-0 min-h-0 overflow-hidden bg-emerald-950/20"
          style={{
            display: 'grid',
            gridTemplateAreas: '"top top top" "left center right" "bottom bottom bottom"',
            gridTemplateColumns: 'minmax(60px, 1fr) minmax(0, 2fr) minmax(60px, 1fr)',
            gridTemplateRows: 'minmax(50px, 1fr) minmax(0, 2fr) minmax(50px, 1fr)',
          }}
        >
          {/* Felt table background */}
          <div className="absolute inset-4 rounded-2xl bg-gradient-to-br from-emerald-900/40 to-emerald-950/60 border border-emerald-800/30 pointer-events-none" />

          {avatarPlay && animationsEnabled && (
            <AnimatedPlayCard
              key={avatarPlay.key}
              side={viewSides[avatarPlay.seat]}
              avatarStyle={avatarPlay.seat === mySeat ? avatarStyle : seatToAvatarStyle[avatarPlay.seat]}
              fast={fastAnimations}
            />
          )}

          {/* Top seat */}
          {seatBySide.top && (
            <div style={{ gridArea: 'top' }} className="relative overflow-hidden flex justify-center items-end pb-2 z-10">
              {renderSeatContent(seatBySide.top)}
            </div>
          )}

          {/* Left seat */}
          {seatBySide.left && (
            <div style={{ gridArea: 'left' }} className="relative overflow-visible flex items-center justify-end pr-2 z-10">
              {renderSeatContent(seatBySide.left)}
            </div>
          )}

          {/* Center: trick area / bidding area / scoring */}
          <div style={{ gridArea: 'center' }} className="relative overflow-hidden flex items-center justify-center p-2">
            <div className="pointer-events-auto w-full h-full flex items-center justify-center overflow-hidden">

              {phase === 'bidding' && !passedOut && (
                <div className="flex flex-col items-center gap-2 bg-slate-900/70 backdrop-blur-sm rounded-2xl p-3 border border-slate-700/40 max-h-full overflow-hidden">
                  <div className="text-center shrink-0">
                    <p className="text-slate-300 text-sm font-medium">
                      {isMyTurn ? 'Your turn to bid' : `Waiting for ${currentSeat} to bid...`}
                    </p>
                  </div>
                  {isMyTurn && <BiddingPanel />}
                  <div className="min-h-0 overflow-y-auto max-h-full">
                    <AuctionHistory />
                  </div>
                </div>
              )}

              {phase === 'playing' && playState && (
                <div className="relative flex items-center justify-center" style={{ width: trickAreaSize, height: trickAreaSize }}>
                  {(currentTrick.length > 0 ? currentTrick : (playState.lastCompletedTrick ?? [])).map((tc, i) => {
                    const side = viewSides[tc.seat];
                    const flyClass = `card-fly-in-${side}`;
                    return (
                      <div key={`${tc.seat}-${tc.card.rank}${tc.card.suit}-${i}`} className={`absolute ${TRICK_POSITION_CLASSES[side]} transition-all duration-300 ${flyClass}`}>
                        <PlayedCard card={tc.card} seat={tc.seat} cardWidth={playedCardW} />
                      </div>
                    );
                  })}

                  <div className="text-center pointer-events-none">
                    <div className="flex gap-4 text-xs">
                      <div className="text-emerald-300">
                        NS: <span className="font-bold">{playState.tricksWonNS}</span>
                      </div>
                      <div className="text-blue-300">
                        EW: <span className="font-bold">{playState.tricksWonEW}</span>
                      </div>
                    </div>
                    <div className="text-slate-500 text-xs mt-1">
                      Trick {playState.trickNumber}
                    </div>
                    {isMyTurn && (
                      <div className="mt-2 text-amber-400 text-xs font-medium animate-pulse">
                        Your turn to play
                      </div>
                    )}
                  </div>
                </div>
              )}

              {(phase === 'scoring' || phase === 'finished') && (
                <div className="flex flex-col items-center gap-2 max-h-full overflow-y-auto p-1">
                  {passedOut ? (
                    <div className="bg-slate-800/80 rounded-xl p-4 text-center shrink-0">
                      <p className="text-slate-300">Hand passed out — no contract reached.</p>
                      <NextHandButton />
                    </div>
                  ) : (
                    <>
                      <ScorePanel />
                      <DoubleDummyReview />
                      <NextHandButton />
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right seat */}
          {seatBySide.right && (
            <div style={{ gridArea: 'right' }} className="relative overflow-visible flex items-center justify-start pl-2 z-10">
              {renderSeatContent(seatBySide.right)}
            </div>
          )}

          {/* Bottom seat */}
          {seatBySide.bottom && (
            <div style={{ gridArea: 'bottom' }} className="relative overflow-hidden flex justify-center items-start pt-2 z-10">
              {renderSeatContent(seatBySide.bottom)}
            </div>
          )}

          {/* Video tiles in the four corners — don't consume card space */}
          {SEATS.map((seat) => {
            const side = viewSides[seat];
            // Map each seat to a corner: bottom→bottom-left, left→top-left, top→top-right, right→bottom-right
            const cornerClass =
              side === 'bottom' ? 'bottom-3 left-3' :
              side === 'left'   ? 'top-3 left-3' :
              side === 'top'    ? 'top-3 right-3' :
                                  'bottom-3 right-3';
            const seatName = seatToName[seat] || seat;
            const isLocal = seatToUserId[seat] === myUserId;
            return (
              <div key={`video-${seat}`} className={`absolute ${cornerClass} z-20`}>
                <div className="relative" style={{ width: cornerVideoW }}>
                  <VideoTile
                    stream={getStreamForSeat(seat)}
                    displayName={seatName}
                    seat={seat}
                    isLocal={isLocal}
                    muted={isLocal || !outputEnabled}
                    className="w-full aspect-[4/3]"
                  />

                  {phase === 'bidding' && lastBidPerSeat[seat] && (
                    <BidBadge bid={lastBidPerSeat[seat]!.bid} />
                  )}
                </div>
              </div>
            );
          })}

          {/* Error display */}
          {error && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-600/90 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-20">
              {error}
            </div>
          )}

          {/* Undo request banner (play) */}
          {phase === 'playing' && playState?.undoRequest && (
            <UndoBanner
              undoRequest={playState.undoRequest}
              mySeat={mySeat}
              seatToName={seatToName}
              onRespond={respondUndo}
            />
          )}

          {/* Undo request banner (bidding) */}
          {phase === 'bidding' && bidUndoRequest && (
            <UndoBanner
              undoRequest={bidUndoRequest}
              mySeat={mySeat}
              seatToName={seatToName}
              onRespond={respondUndo}
            />
          )}
        </div>

        {/* Right sidebar: scoreboard */}
        <div className="w-72 lg:w-80 xl:w-96 bg-slate-900/80 backdrop-blur border-l border-slate-700/50 p-3 hidden lg:block overflow-y-auto">
          <ScorePanel />
          <div className="mt-3">
            {phase === 'playing' && playState && (
              <div className="bg-slate-800/70 rounded-xl border border-slate-700/50 p-3">
                <h4 className="text-xs text-slate-400 font-medium mb-2">Current Trick</h4>
                <div className="flex justify-between text-sm">
                  <span className="text-emerald-300">NS: {playState.tricksWonNS}</span>
                  <span className="text-blue-300">EW: {playState.tricksWonEW}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">Trick {playState.trickNumber} / 13</div>
              </div>
            )}
            <AuctionHistory />
          </div>
        </div>
      </div>
      {profileOpen && <ProfileSettings onClose={() => setProfileOpen(false)} />}
    </div>
    </>
  );
}

function defaultAvatarForSeat(seat: Seat): AvatarStyle {
  return ({ N: 'cobalt', E: 'coral', S: 'mint', W: 'gold' } as Record<Seat, AvatarStyle>)[seat];
}

function AnimatedPlayCard({ side, avatarStyle, fast }: { side: ViewSide; avatarStyle: AvatarStyle; fast: boolean }) {
  return (
    <div className={`pointer-events-none absolute left-1/2 top-1/2 z-30 ${fast ? 'card-travel-fast' : ''} card-travel-from-${side}`}>
      <div className="-translate-x-1/2 -translate-y-1/2">
        <AvatarFigure style={avatarStyle} active />
      </div>
    </div>
  );
}

interface SeatBadgeProps {
  isTurn: boolean;
  isDealer: boolean;
  isVulnerable: boolean;
  seatLabel: Seat;
  playerName: string;
  children: ReactNode;
}

function SeatBadge({ isTurn, isDealer, isVulnerable, seatLabel, playerName, children }: SeatBadgeProps) {
  return (
    <div className={`relative transition-all ${isTurn ? 'ring-2 ring-amber-400 rounded-xl p-1' : ''}`}>
      <div className="mb-1 flex items-center gap-1 overflow-hidden rounded bg-slate-900/90 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
        <span className="shrink-0 text-emerald-300">{seatLabel}</span>
        <span className="truncate">{playerName}</span>
        {isDealer && <span className="shrink-0 rounded bg-amber-500 px-1 text-[9px] text-white">D</span>}
        {isVulnerable && <span className="shrink-0 rounded bg-red-500 px-1 text-[9px] text-white">V</span>}
      </div>
      {children}
    </div>
  );
}

interface UndoBannerProps {
  undoRequest: UndoRequest;
  mySeat: Seat;
  seatToName: Record<Seat, string>;
  onRespond: (accept: boolean) => void;
}

function UndoBanner({ undoRequest, mySeat, seatToName, onRespond }: UndoBannerProps) {
  const requesterSide = sideOfSeat(undoRequest.requestedBy);
  const mySide = sideOfSeat(mySeat);
  const isOpponent = mySide !== requesterSide;
  const alreadyResponded =
    undoRequest.acceptedBy.includes(mySeat) || undoRequest.declinedBy.includes(mySeat);

  const requesterName = seatToName[undoRequest.requestedBy] || undoRequest.requestedBy;
  const isBidUndo = !undoRequest.card && !!undoRequest.bid;
  const undoItemText = isBidUndo && undoRequest.bid
    ? undoRequest.bid.type === 'pass'
      ? 'Pass'
      : undoRequest.bid.type === 'double'
        ? 'Double'
        : undoRequest.bid.type === 'redouble'
          ? 'Redouble'
          : `${undoRequest.bid.level}${undoRequest.bid.strain === 'NT' ? 'NT' : STRAIN_SYMBOLS[undoRequest.bid.strain as Suit]}`
    : undoRequest.card
      ? `${undoRequest.card.rank}${undoRequest.card.suit}`
      : '';
  const opponentSeats = SEATS.filter((s) => sideOfSeat(s) !== requesterSide);
  const acceptedCount = undoRequest.acceptedBy.length;
  const totalNeeded = opponentSeats.length;

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30">
      <div className="bg-slate-900/95 backdrop-blur rounded-2xl border border-amber-500/40 shadow-2xl p-6 max-w-sm w-full">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
            <Undo2 className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-white font-medium text-sm">Undo Request</h3>
            <p className="text-slate-400 text-xs">
              {requesterName} ({undoRequest.requestedBy}) wants to take back the {undoItemText}
            </p>
          </div>
        </div>

        {isOpponent && !alreadyResponded ? (
          <>
            <p className="text-slate-300 text-sm mb-4">
              {isBidUndo
                ? `Do you accept this undo request? The last bid (${undoItemText}) will be removed.`
                : `Do you accept this undo request? The card will be returned to ${requesterName}'s hand.`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => onRespond(true)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-all"
              >
                <Check className="w-4 h-4" />
                Accept
              </button>
              <button
                onClick={() => onRespond(false)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-all"
              >
                <X className="w-4 h-4" />
                Decline
              </button>
            </div>
          </>
        ) : isOpponent && alreadyResponded ? (
          <p className="text-slate-400 text-sm text-center py-2">
            Waiting for {totalNeeded - acceptedCount} more opponent{totalNeeded - acceptedCount !== 1 ? 's' : ''} to respond...
          </p>
        ) : !isOpponent ? (
          <p className="text-slate-400 text-sm text-center py-2">
            Waiting for opponents to respond ({acceptedCount}/{totalNeeded} accepted)...
          </p>
        ) : null}
      </div>
    </div>
  );
}

interface BidBadgeProps {
  bid: Bid;
}

function BidBadge({ bid }: BidBadgeProps) {
  let text = '';
  let colorClass = '';
  if (bid.type === 'pass') {
    text = 'Pass';
    colorClass = 'bg-slate-600 text-slate-200';
  } else if (bid.type === 'double') {
    text = 'X';
    colorClass = 'bg-red-900 text-red-200';
  } else if (bid.type === 'redouble') {
    text = 'XX';
    colorClass = 'bg-amber-900 text-amber-200';
  } else {
    const suitSymbol = bid.strain === 'NT' ? 'NT' : SUIT_SYMBOLS[bid.strain as Suit];
    text = `${bid.level}${suitSymbol}`;
    const isRed = bid.strain === 'H' || bid.strain === 'D';
    colorClass = isRed
      ? 'bg-white text-red-600'
      : bid.strain === 'NT'
        ? 'bg-white text-amber-700'
        : 'bg-white text-slate-900';
  }
  return (
    <div className={`absolute -top-2 -right-2 z-20 bid-pop-in rounded-lg shadow-lg px-2 py-0.5 text-xs font-bold ${colorClass}`}>
      {text}
    </div>
  );
}
