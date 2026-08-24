import { useGame } from '@/context/GameContext';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useAuth } from '@/context/AuthContext';
import { VideoTile } from '@/components/VideoTile';
import { HandDisplay, PlayedCard, CardBackFan, DummyHandDisplay } from '@/components/CardDisplay';
import { BiddingPanel, AuctionHistory } from '@/components/BiddingPanel';
import { ScorePanel, NextHandButton, RubberResultsOverlay } from '@/components/ScorePanel';
import { DoubleDummyReview } from '@/components/DoubleDummyReview';
import { sortHand, dummySeat, isVulnerable } from '@/context/GameContext';
import type { Card, Seat, Suit, UndoRequest, Bid, AuctionEntry } from '@/types/bridge';
import { SEATS, SUIT_SYMBOLS, STRAIN_SYMBOLS, sideOfSeat } from '@/types/bridge';
import { getLegalCards } from '@/lib/play';
import {
  Mic, MicOff, Video, VideoOff, Volume2, VolumeX, ArrowLeft, Undo2, Check, X,
} from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

interface GameTableProps {
  tableId: string;
  onLeave: () => void;
}

type ViewSide = 'bottom' | 'left' | 'top' | 'right';

const TABLE_STAGE_WIDTH = 1280;
const TABLE_STAGE_HEIGHT = 820;

function useTableStageScale() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateScale = () => {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      setScale(Math.min(width / TABLE_STAGE_WIDTH, height / TABLE_STAGE_HEIGHT, 1.25));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return { containerRef, scale };
}

function rotationFor(mySeat: Seat): Record<Seat, ViewSide> {
  switch (mySeat) {
    case 'S': return { S: 'bottom', W: 'left', N: 'top', E: 'right' };
    case 'W': return { W: 'bottom', N: 'left', E: 'top', S: 'right' };
    case 'N': return { N: 'bottom', E: 'left', S: 'top', W: 'right' };
    case 'E': return { E: 'bottom', S: 'left', W: 'top', N: 'right' };
  }
}

export function GameTable({ tableId, onLeave }: GameTableProps) {
  const { profile } = useAuth();
  const game = useGame();
  const {
    mySeat, players, deal, dealer, vulnerability, auction, contract,
    playState, phase, passedOut, isMyTurn, currentSeat,
    legalCards, playCard, requestUndo, requestBidUndo, bidUndoRequest, respondUndo, error, loading, rubberState,
  } = game;

  const myUserId = profile?.id ?? '';
  const {
    localStream, peerStreams, videoEnabled, audioEnabled, outputEnabled,
    toggleVideo, toggleAudio, toggleOutput, error: webrtcError,
  } = useWebRTC({ tableId, userId: myUserId, enabled: true });
  const { containerRef: tableStageRef, scale: tableStageScale } = useTableStageScale();

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

  const legalCardSet = useMemo(() => {
    return new Set(legalCards.map((c) => `${c.rank}${c.suit}`));
  }, [legalCards]);

  // Compute played cards to remove them from displayed hands
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

  // Who can play cards for a given seat:
  // - Declarer plays both their own hand and dummy's hand
  // - Dummy cannot play any cards
  // - Defenders play only their own hand
  const canPlayForSeat = (seat: Seat): boolean => {
    if (phase !== 'playing' || !playState) return false;
    if (playState.currentSeat !== seat) return false;
    if (isDummySeat && seat === mySeat) return false; // dummy never plays
    if (isDeclarer && (seat === mySeat || seat === dummy)) return true; // declarer plays own + dummy
    if (seat === mySeat) return true; // defenders play own hand
    return false;
  };

  const getCardClickHandler = (seat: Seat): ((card: Card) => void) | undefined => {
    if (!canPlayForSeat(seat)) return undefined;
    return playCard;
  };

  const getLegalCardsForDisplay = (seat: Seat): Set<string> | undefined => {
    if (!canPlayForSeat(seat)) return undefined;
    if (!playState || !deal) return undefined;
    // For dummy's hand when declarer is playing, compute legal cards from dummy's remaining hand
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

  const currentTrick = playState?.currentTrick ?? [];

  // Undo availability: at least one card must have been played
  const hasCardsPlayed = (playState?.currentTrick.length ?? 0) > 0 || (playState?.completedTricks.length ?? 0) > 0;
  // Only the side that played the last card can request undo
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

  const myVideoSizeClass = 'w-48 aspect-[4/3]';
  const otherVideoSizeClass = 'w-72 aspect-[4/3]';
  const dummyVideoSizeClass = 'w-72 aspect-[4/3]';
  const myCardSize: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'xl';
  const dummyCardSize: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'xl';
  const otherCardSize: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'md';

  // Dummy hand rotation: the dummy hand should face the declarer.
  // Map the dummy's view-side to a rotation direction.
  const dummyRotation: 'up' | 'down' | 'left' | 'right' = (() => {
    if (!dummy) return 'up';
    const dummySide = viewSides[dummy];
    // If dummy is at top, cards face down toward declarer at bottom
    // If dummy is at bottom, cards face up
    // If dummy is on left, cards face right (toward center/declarer)
    // If dummy is on right, cards face left
    switch (dummySide) {
      case 'top': return 'down';
      case 'bottom': return 'up';
      case 'left': return 'right';
      case 'right': return 'left';
    }
  })();

  const trickPositionClasses: Record<ViewSide, string> = {
    top: 'top-0 left-1/2 -translate-x-1/2',
    bottom: 'bottom-0 left-1/2 -translate-x-1/2',
    left: 'left-0 top-1/2 -translate-y-1/2',
    right: 'right-0 top-1/2 -translate-y-1/2',
  };

  return (
    <div className="h-dvh min-h-[36rem] overflow-hidden bg-gradient-to-br from-slate-900 via-emerald-950/80 to-slate-900 flex flex-col">
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
          {contract && (
            <span className="text-slate-400">Contract: <span className="text-emerald-400 font-medium">
              {contract.level}{contract.strain === 'NT' ? 'NT' : SUIT_SYMBOLS[contract.strain as Suit]}{contract.doubled === 1 ? 'X' : contract.doubled === 2 ? 'XX' : ''} by {contract.declarer}
            </span></span>
          )}
        </div>

        <div className="flex items-center gap-2">
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
        {/* Keep the full table composition together and scale it from the
            available width and height. This prevents edge-anchored seats from
            drifting apart or colliding as the window changes shape. */}
        <div ref={tableStageRef} className="flex-1 relative min-w-0 min-h-0 overflow-hidden bg-emerald-950/20">
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              width: TABLE_STAGE_WIDTH,
              height: TABLE_STAGE_HEIGHT,
              transform: `translate(-50%, -50%) scale(${tableStageScale})`,
              transformOrigin: 'center',
            }}
          >
          {/* Felt table background — scales with screen */}
          <div className="absolute inset-4 md:inset-6 lg:inset-8 rounded-2xl bg-gradient-to-br from-emerald-900/40 to-emerald-950/60 border border-emerald-800/30" />

          {/* Render each seat at its rotated view-side */}
          {SEATS.map((seat) => {
            const side = viewSides[seat];
            const isMe = seat === mySeat;
            const seatName = seatToName[seat] || seat;
            const isDummySeatHere = dummy === seat && isDummyRevealed && phase === 'playing';
            const cardSize = isMe ? myCardSize : isDummySeatHere ? dummyCardSize : otherCardSize;
            const showHand = shouldShowHand(seat);
            const isTurnNow = currentSeat === seat && phase !== 'finished';

            const seatContent = (
              <div className={`flex ${
                isMe
                  ? 'flex-col-reverse items-center gap-2'
                  : isDummySeatHere
                    ? side === 'left' || side === 'right'
                      ? 'flex-col items-center gap-2'
                      : 'flex-row items-center gap-3'
                    : side === 'left' || side === 'right'
                      ? 'flex-col items-center gap-2'
                      : side === 'top'
                        ? 'flex-col items-center gap-2'
                        : 'flex-col-reverse items-center gap-2'
              }`}>
                {!isMe && (
                  <div className="relative">
                    <VideoTile
                      stream={getStreamForSeat(seat)}
                      displayName={seatName}
                      seat={seat}
                      isLocal={seatToUserId[seat] === myUserId}
                      muted={!outputEnabled}
                      className={isDummySeatHere ? dummyVideoSizeClass : otherVideoSizeClass}
                    />
                    {phase === 'bidding' && lastBidPerSeat[seat] && (
                      <BidBadge bid={lastBidPerSeat[seat]!.bid} />
                    )}
                  </div>
                )}
                {showHand ? (
                  dummy === seat && isDummyRevealed && phase === 'playing' ? (
                    <DummyHandDisplay
                      hand={getHand(seat)}
                      rotation={dummyRotation}
                      isTurn={isTurnNow}
                      size={cardSize}
                      trumpStrain={contract?.strain}
                      onCardClick={getCardClickHandler(seat)}
                      legalCards={getLegalCardsForDisplay(seat)}
                    />
                  ) : (
                    <HandDisplay
                      hand={getHand(seat)}
                      seat={seat}
                      hidden={false}
                      size={cardSize}
                      isDummy={dummy === seat && isDummyRevealed}
                      isTurn={isTurnNow && phase === 'playing'}
                      trumpStrain={contract?.strain}
                      onCardClick={getCardClickHandler(seat)}
                      legalCards={getLegalCardsForDisplay(seat)}
                    />
                  )
                ) : (
                  <CardBackFan size={cardSize} />
                )}
              </div>
            );

            return (
              <SeatPosition
                key={seat}
                position={side}
                isTurn={isTurnNow}
                isDealer={dealer === seat}
                isVulnerable={isVulnerable(seat, vulnerability)}
                seatLabel={seat}
                atEdge={isDummySeatHere}
              >
                {seatContent}
              </SeatPosition>
            );
          })}

          {/* Player's own webcam — fixed to the side so cards can be larger */}
          {mySeat && (
            <div className="absolute bottom-3 left-3 z-20">
              <div className="relative">
                <VideoTile
                  stream={getStreamForSeat(mySeat)}
                  displayName={seatToName[mySeat] || mySeat}
                  seat={mySeat}
                  isLocal
                  muted
                  className={myVideoSizeClass}
                />
                {phase === 'bidding' && lastBidPerSeat[mySeat] && (
                  <BidBadge bid={lastBidPerSeat[mySeat]!.bid} />
                )}
              </div>
            </div>
          )}

          {/* Center: trick area / bidding area */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="pointer-events-auto max-h-full overflow-y-auto">
              {phase === 'bidding' && !passedOut && (
                <div className="flex flex-col items-center gap-3 bg-slate-900/70 backdrop-blur-sm rounded-2xl p-4 border border-slate-700/40">
                  <div className="text-center">
                    <p className="text-slate-300 text-sm font-medium">
                      {isMyTurn ? 'Your turn to bid' : `Waiting for ${currentSeat} to bid...`}
                    </p>
                  </div>
                  {isMyTurn && <BiddingPanel />}
                  <AuctionHistory />
                </div>
              )}

              {phase === 'playing' && playState && (
                <div className="relative w-64 h-64 flex items-center justify-center">
                  {(currentTrick.length > 0 ? currentTrick : (playState.lastCompletedTrick ?? [])).map((tc, i) => {
                    const side = viewSides[tc.seat];
                    const flyClass = `card-fly-in-${side}`;
                    return (
                      <div key={`${tc.seat}-${tc.card.rank}${tc.card.suit}-${i}`} className={`absolute ${trickPositionClasses[side]} transition-all duration-300 ${flyClass}`}>
                        <PlayedCard card={tc.card} seat={tc.seat} />
                      </div>
                    );
                  })}

                  <div className="text-center">
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

              {(phase === 'scoring' || phase === 'finished') && !rubberState.rubberComplete && (
                <div className="flex flex-col items-center gap-4">
                  {passedOut ? (
                    <div className="bg-slate-800/80 rounded-xl p-6 text-center">
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

          {/* Error display */}
          {error && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-600/90 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
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
        </div>

        {/* Rubber results overlay */}
        <RubberResultsOverlay />

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
    </div>
  );
}

interface SeatPositionProps {
  position: ViewSide;
  isTurn: boolean;
  isDealer: boolean;
  isVulnerable: boolean;
  seatLabel: Seat;
  atEdge?: boolean;
  children: React.ReactNode;
}

function SeatPosition({ position, isTurn, isDealer, isVulnerable, seatLabel, atEdge, children }: SeatPositionProps) {
  const positionClasses: Record<ViewSide, string> = {
    top: 'top-2 left-1/2 -translate-x-1/2',
    bottom: 'bottom-2 left-1/2 -translate-x-1/2',
    left: 'left-2 top-1/2 -translate-y-1/2',
    right: 'right-2 top-1/2 -translate-y-1/2',
  };
  const edgeClasses: Record<ViewSide, string> = {
    top: 'top-0 left-1/2 -translate-x-1/2',
    bottom: 'bottom-0 left-1/2 -translate-x-1/2',
    left: 'left-0 top-1/2 -translate-y-1/2',
    right: 'right-0 top-1/2 -translate-y-1/2',
  };

  return (
    <div className={`absolute ${atEdge ? edgeClasses[position] : positionClasses[position]} ${isTurn ? 'z-10' : 'z-0'}`}>
      <div className={`relative transition-all ${isTurn ? 'ring-2 ring-amber-400 rounded-xl p-1' : ''}`}>
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 text-[10px] font-bold text-slate-300 bg-slate-800/80 rounded px-1.5 py-0.5 z-10">
          {seatLabel}
        </div>
        {isDealer && (
          <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center z-10 shadow-md">
            D
          </div>
        )}
        {isVulnerable && (
          <div className="absolute -bottom-2 -left-2 w-5 h-5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center z-10 shadow-md">
            V
          </div>
        )}
        {children}
      </div>
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
