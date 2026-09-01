import type { Card, Seat, Suit, Rank } from '@/types/bridge';
import { SUIT_SYMBOLS, RANK_DISPLAY } from '@/types/bridge';

interface CardDisplayProps {
  card: Card;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  cardWidth?: number;
  onClick?: () => void;
  disabled?: boolean;
  highlight?: boolean;
  played?: boolean;
}

// All cards use the same aspect ratio (2.5:3.5) and scale by width
const CARD_WIDTH: Record<NonNullable<CardDisplayProps['size']>, number> = {
  xs: 44,
  sm: 64,
  md: 84,
  lg: 104,
  xl: 128,
};

function isRedSuit(suit: Suit): boolean {
  return suit === 'H' || suit === 'D';
}

function isFaceCard(rank: Rank): boolean {
  return rank === 'J' || rank === 'Q' || rank === 'K';
}

function faceCardPath(rank: Rank, suit: Suit): string {
  return `/${rank}${suit}.webp`;
}

// Standard pip positions as fractions (0-1) of the inner card body
const PIP_LAYOUTS: Record<string, [number, number][]> = {
  '2': [[0.5, 0.20], [0.5, 0.80]],
  '3': [[0.5, 0.20], [0.5, 0.50], [0.5, 0.80]],
  '4': [[0.32, 0.20], [0.68, 0.20], [0.32, 0.80], [0.68, 0.80]],
  '5': [[0.32, 0.20], [0.68, 0.20], [0.5, 0.50], [0.32, 0.80], [0.68, 0.80]],
  '6': [[0.32, 0.20], [0.68, 0.20], [0.32, 0.50], [0.68, 0.50], [0.32, 0.80], [0.68, 0.80]],
  '7': [[0.32, 0.20], [0.68, 0.20], [0.5, 0.35], [0.32, 0.50], [0.68, 0.50], [0.32, 0.80], [0.68, 0.80]],
  '8': [[0.32, 0.20], [0.68, 0.20], [0.32, 0.40], [0.68, 0.40], [0.32, 0.60], [0.68, 0.60], [0.32, 0.80], [0.68, 0.80]],
  '9': [[0.32, 0.20], [0.68, 0.20], [0.32, 0.38], [0.68, 0.38], [0.5, 0.50], [0.32, 0.62], [0.68, 0.62], [0.32, 0.80], [0.68, 0.80]],
  'T': [[0.32, 0.18], [0.68, 0.18], [0.5, 0.32], [0.32, 0.42], [0.68, 0.42], [0.32, 0.58], [0.68, 0.58], [0.5, 0.68], [0.32, 0.82], [0.68, 0.82]],
};

// SVG viewBox is fixed at 50x70 for all cards; CSS scales the rendered size
const VB_W = 50;
const VB_H = 70;
const PIP_SIZE = 9;
const ACE_SIZE = 28;
const CORNER_FONT = 8;
const CORNER_SUIT_FONT = 6.5;

function CardFaceSVG({ card }: { card: Card }) {
  const color = isRedSuit(card.suit) ? '#c41e3a' : '#1a1a1a';
  const glyph = SUIT_SYMBOLS[card.suit];
  const rankStr = RANK_DISPLAY[card.rank];
  const face = isFaceCard(card.rank);
  const isAce = card.rank === 'A';

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className="block w-full h-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Card body */}
      <rect x={0.75} y={0.75} width={VB_W - 1.5} height={VB_H - 1.5} rx={4} ry={4} fill="#fefefe" stroke="#d1d5db" strokeWidth={0.8} />
      <rect x={1.5} y={1.5} width={VB_W - 3} height={VB_H - 3} rx={3} ry={3} fill="none" stroke="#e5e7eb" strokeWidth={0.4} />

      {/* Top-left corner index */}
      <text x={4} y={11} fontSize={CORNER_FONT} fontWeight={700} fill={color} textAnchor="start" fontFamily="ui-sans-serif, system-ui, sans-serif">{rankStr}</text>
      <text x={4} y={18} fontSize={CORNER_SUIT_FONT} fill={color} textAnchor="start" fontFamily="ui-sans-serif, system-ui, sans-serif">{glyph}</text>

      {/* Bottom-right corner index (rotated) */}
      <g transform={`rotate(180 ${VB_W / 2} ${VB_H / 2})`}>
        <text x={4} y={11} fontSize={CORNER_FONT} fontWeight={700} fill={color} textAnchor="start" fontFamily="ui-sans-serif, system-ui, sans-serif">{rankStr}</text>
        <text x={4} y={18} fontSize={CORNER_SUIT_FONT} fill={color} textAnchor="start" fontFamily="ui-sans-serif, system-ui, sans-serif">{glyph}</text>
      </g>

      {/* Center content */}
      {face ? (
        <FaceCardImage card={card} color={color} />
      ) : isAce ? (
        <text x={VB_W / 2} y={VB_H / 2 + ACE_SIZE * 0.35} fontSize={ACE_SIZE} fill={color} textAnchor="middle" fontFamily="ui-sans-serif, system-ui, sans-serif">{glyph}</text>
      ) : (
        <NumberCardPips card={card} color={color} glyph={glyph} />
      )}
    </svg>
  );
}

function NumberCardPips({ card, color, glyph }: { card: Card; color: string; glyph: string }) {
  const pips = PIP_LAYOUTS[card.rank] || [];
  return (
    <>
      {pips.map(([xFrac, yFrac], i) => {
        const x = xFrac * VB_W;
        const y = yFrac * VB_H;
        const inverted = yFrac > 0.5 && card.rank !== 'A';
        return (
          <text
            key={i}
            x={x}
            y={y + PIP_SIZE * 0.35}
            fontSize={PIP_SIZE}
            fill={color}
            textAnchor="middle"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            transform={inverted ? `rotate(180 ${x} ${y})` : undefined}
          >
            {glyph}
          </text>
        );
      })}
    </>
  );
}

function FaceCardImage({ card, color }: { card: Card; color: string }) {
  const glyph = SUIT_SYMBOLS[card.suit];
  const rankStr = RANK_DISPLAY[card.rank];
  const imgHref = faceCardPath(card.rank, card.suit);
  // Inner panel area for the face card artwork
  const px = 6;
  const py = 11;
  const pw = VB_W - 12;
  const ph = VB_H - 22;

  return (
    <>
      {/* Decorative border frame around face card area */}
      <rect x={px - 0.5} y={py - 0.5} width={pw + 1} height={ph + 1} rx={2} ry={2} fill="none" stroke={color} strokeWidth={0.6} opacity={0.3} />
      {/* Face card image, clipped to the inner panel */}
      <image
        href={imgHref}
        x={px}
        y={py}
        width={pw}
        height={ph}
        preserveAspectRatio="xMidYMid meet"
      />
      {/* Subtle rank+suit label at bottom of face card panel */}
      <text x={VB_W / 2} y={VB_H - 4} fontSize={5.5} fill={color} textAnchor="middle" opacity={0.6} fontFamily="ui-sans-serif, system-ui, sans-serif">
        {rankStr}{glyph}
      </text>
    </>
  );
}

export function CardDisplay({ card, size = 'sm', cardWidth, onClick, disabled, highlight }: CardDisplayProps) {
  const w = cardWidth ?? CARD_WIDTH[size];
  const h = w * 1.4;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        relative rounded flex-shrink-0 flex items-center justify-center p-0 border-0
        transition-all duration-200 bg-white overflow-hidden
        ${disabled ? 'cursor-default' : 'cursor-pointer hover:-translate-y-3'}
        ${highlight ? '-translate-y-3' : ''}
      `}
      style={{ width: w, height: h }}
    >
      {disabled && (
        <span className="absolute inset-0 bg-slate-500/30 z-20 pointer-events-none" />
      )}
      {highlight && (
        <span
          className="absolute inset-0 rounded ring-2 ring-amber-400 z-10"
          style={{ boxShadow: '0 0 10px rgba(251,191,36,0.5)' }}
        />
      )}
      <CardFaceSVG card={card} />
    </button>
  );
}

function suitOrderFor(trumpStrain?: string): Suit[] {
  const base: Suit[] = ['S', 'H', 'D', 'C'];
  if (trumpStrain && trumpStrain !== 'NT' && (trumpStrain === 'S' || trumpStrain === 'H' || trumpStrain === 'D' || trumpStrain === 'C')) {
    const trump = trumpStrain as Suit;
    const others = base.filter((s) => s !== trump);
    return [trump, ...others];
  }
  return base;
}

interface HandDisplayProps {
  hand: Card[];
  seat: Seat;
  onCardClick?: (card: Card) => void;
  legalCards?: Set<string>;
  hidden?: boolean;
  label?: string;
  isDummy?: boolean;
  isTurn?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  cardWidth?: number;
  trumpStrain?: string;
}

export function HandDisplay({
  hand,
  onCardClick,
  legalCards,
  hidden,
  label,
  isDummy,
  isTurn,
  size = 'sm',
  cardWidth,
  trumpStrain,
}: HandDisplayProps) {
  if (hidden) {
    return (
      <div className={`flex flex-col items-center gap-1 ${isTurn ? 'ring-2 ring-amber-400/50 rounded-lg p-1.5' : ''}`}>
        {label && <span className="text-xs text-slate-400 font-medium">{label}</span>}
        <CardBackFan size={size} cardWidth={cardWidth} />
      </div>
    );
  }

  const suits = suitOrderFor(trumpStrain);
  const bySuit: Record<Suit, Card[]> = { S: [], H: [], D: [], C: [] };
  for (const card of hand) {
    bySuit[card.suit].push(card);
  }

  // Overlap factor: each card shows only its left edge
  const cardW = cardWidth ?? CARD_WIDTH[size];
  const overlap = cardW * 0.62;
  const cardAdvance = cardW - overlap;
  const suitGap = cardW * 0.25;

  // Calculate total width needed
  let totalCards = 0;
  for (const s of suits) totalCards += Math.max(0, bySuit[s].length);
  const totalWidth = totalCards > 0
    ? cardW + (totalCards - 1) * cardAdvance + Math.max(0, suits.filter((s) => bySuit[s].length > 0).length - 1) * suitGap
    : 0;

  return (
    <div className={`flex flex-col items-center gap-1 transition-all ${isTurn ? 'ring-2 ring-amber-400/50 rounded-lg p-1.5' : ''}`}>
      {label && (
        <span className={`text-xs font-medium ${isDummy ? 'text-amber-400' : 'text-slate-300'}`}>
          {label}{isDummy && ' (Dummy)'}
        </span>
      )}
      <div className="flex items-center justify-center" style={{ minWidth: totalWidth }}>
        {suits.map((suit, suitIdx) => {
          if (bySuit[suit].length === 0) return null;
          return (
            <div key={suit} className="flex items-center" style={suitIdx > 0 ? { marginLeft: suitGap } : undefined}>
              {bySuit[suit].map((card, cardIdx) => {
                const cardKey = `${card.rank}${card.suit}`;
                const isLegal = legalCards?.has(cardKey) ?? false;
                const canClick = onCardClick && (legalCards ? isLegal : true);
                return (
                  <div
                    key={cardKey}
                    className="relative"
                    style={{ zIndex: cardIdx, ...(cardIdx > 0 ? { marginLeft: -overlap } : {}) }}
                  >
                    <CardDisplay
                      card={card}
                      size={size}
                      cardWidth={cardWidth}
                      onClick={canClick ? () => onCardClick!(card) : undefined}
                      disabled={!canClick}
                      highlight={isLegal && !!onCardClick}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CardBackFan({ size = 'sm', cardWidth }: { size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; cardWidth?: number }) {
  const w = cardWidth ?? CARD_WIDTH[size];
  const h = w * 1.4;
  return (
    <div className="flex items-center justify-center" style={{ width: w * 1.2, height: h }}>
      <div className="relative" style={{ width: w, height: h }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded shadow-sm overflow-hidden"
            style={{
              width: w * 0.7,
              height: h * 0.92,
              left: `${w * 0.15 + i * (w * 0.04)}px`,
              top: 0,
              transform: `rotate(${(i - 2) * 5}deg)`,
              transformOrigin: 'bottom center',
              zIndex: i,
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-700 to-emerald-950" />
            <div
              className="absolute inset-0.5 rounded-sm border border-emerald-500/40"
              style={{
                backgroundImage: 'repeating-linear-gradient(45deg, rgba(16,185,129,0.15) 0 2px, transparent 2px 5px), repeating-linear-gradient(-45deg, rgba(16,185,129,0.15) 0 2px, transparent 2px 5px)',
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-emerald-300/60 font-bold" style={{ fontSize: h * 0.2 }}>B</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface PlayedCardProps {
  card: Card;
  seat: Seat;
  cardWidth?: number;
}

export function PlayedCard({ card, seat, cardWidth }: PlayedCardProps) {
  const positionClasses: Record<Seat, string> = {
    N: 'translate-y-[-16px]',
    S: 'translate-y-[16px]',
    E: 'translate-x-[24px]',
    W: 'translate-x-[-24px]',
  };

  return (
    <div className={`transition-all duration-300 ${positionClasses[seat]}`}>
      <CardDisplay card={card} size="xl" cardWidth={cardWidth} />
    </div>
  );
}

export function suitColorClass(suit: Suit): string {
  return isRedSuit(suit) ? 'text-red-600' : 'text-slate-900';
}

interface DummyHandDisplayProps {
  hand: Card[];
  onCardClick?: (card: Card) => void;
  legalCards?: Set<string>;
  rotation?: 'up' | 'down' | 'left' | 'right';
  isTurn?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  cardWidth?: number;
  trumpStrain?: string;
}

export function DummyHandDisplay({
  hand,
  onCardClick,
  legalCards,
  rotation = 'up',
  isTurn,
  size = 'xs',
  cardWidth,
  trumpStrain,
}: DummyHandDisplayProps) {
  // For 180° rotation, reverse suit and card order so they appear correct
  // after the CSS transform flips everything.
  const baseSuits = suitOrderFor(trumpStrain);
  const suits = rotation === 'down' ? [...baseSuits].reverse() : baseSuits;
  const bySuit: Record<Suit, Card[]> = { S: [], H: [], D: [], C: [] };
  for (const card of hand) {
    bySuit[card.suit].push(card);
  }
  // Reverse cards within each suit for 180° so highest appears on top after rotation
  if (rotation === 'down') {
    for (const s of baseSuits) bySuit[s].reverse();
  }

  const cardW = cardWidth ?? CARD_WIDTH[size];
  const cardH = cardW * 1.4;
  const vOverlap = cardH * 0.62;
  const cardAdvance = cardH - vOverlap;
  const colGap = cardW * 0.3;

  const rotationDeg: Record<string, number> = {
    up: 0,
    left: 90,
    down: 180,
    right: -90,
  };
  const deg = rotationDeg[rotation] ?? 0;

  const nonEmptySuits = suits.filter((s) => bySuit[s].length > 0);
  const numCols = nonEmptySuits.length;
  const layoutWidth = numCols > 0 ? numCols * cardW + (numCols - 1) * colGap : cardW;
  const maxColHeight = Math.max(1, ...nonEmptySuits.map((s) => bySuit[s].length));
  const layoutHeight = cardH + (maxColHeight - 1) * cardAdvance;

  return (
    <div
      className={`flex flex-col items-center gap-1 transition-all ${isTurn ? 'ring-2 ring-amber-400/50 rounded-lg p-1.5' : ''}`}
    >
      <span className="text-xs font-medium text-amber-400">Dummy</span>
      <div
        style={{
          width: deg === 0 || deg === 180 ? layoutWidth : layoutHeight,
          height: deg === 0 || deg === 180 ? layoutHeight : layoutWidth,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: `translate(-50%, -50%) rotate(${deg}deg)`,
            transformOrigin: 'center center',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: `${colGap}px`,
          }}
        >
          {suits.map((suit) => {
            if (bySuit[suit].length === 0) return null;
            return (
              <div
                key={suit}
                className="flex flex-col items-center"
                style={{ width: cardW }}
              >
                {bySuit[suit].map((card, cardIdx) => {
                  const cardKey = `${card.rank}${card.suit}`;
                  const isLegal = legalCards?.has(cardKey) ?? false;
                  const canClick = onCardClick && (legalCards ? isLegal : true);
                  return (
                    <div
                      key={cardKey}
                      className="relative"
                      style={{
                        zIndex: rotation === 'down' ? bySuit[suit].length - cardIdx : cardIdx,
                        ...(cardIdx > 0 ? { marginTop: -vOverlap } : {}),
                      }}
                    >
                      <CardDisplay
                        card={card}
                        size={size}
                        cardWidth={cardW}
                        onClick={canClick ? () => onCardClick!(card) : undefined}
                        disabled={!canClick}
                        highlight={isLegal && !!onCardClick}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
