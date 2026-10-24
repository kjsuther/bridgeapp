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
      <rect x={0.75} y={0.75} width={VB_W - 1.5} height={VB_H - 1.5} rx={4} ry={4} fill="#fefefe" stroke="#d1d5db" strokeWidth={0.8} />
      <rect x={1.5} y={1.5} width={VB_W - 3} height={VB_H - 3} rx={3} ry={3} fill="none" stroke="#e5e7eb" strokeWidth={0.4} />

      <text x={4} y={11} fontSize={CORNER_FONT} fontWeight={700} fill={color} textAnchor="start" fontFamily="ui-sans-serif, system-ui, sans-serif">{rankStr}</text>
      <text x={4} y={18} fontSize={CORNER_SUIT_FONT} fill={color} textAnchor="start" fontFamily="ui-sans-serif, system-ui, sans-serif">{glyph}</text>

      <g transform={`rotate(180 ${VB_W / 2} ${VB_H / 2})`}>
        <text x={4} y={11} fontSize={CORNER_FONT} fontWeight={700} fill={color} textAnchor="start" fontFamily="ui-sans-serif, system-ui, sans-serif">{rankStr}</text>
        <text x={4} y={18} fontSize={CORNER_SUIT_FONT} fill={color} textAnchor="start" fontFamily="ui-sans-serif, system-ui, sans-serif">{glyph}</text>
      </g>

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
  const px = 6;
  const py = 11;
  const pw = VB_W - 12;
  const ph = VB_H - 22;

  return (
    <>
      <rect x={px - 0.5} y={py - 0.5} width={pw + 1} height={ph + 1} rx={2} ry={2} fill="none" stroke={color} strokeWidth={0.6} opacity={0.3} />
      <image
        href={imgHref}
        x={px}
        y={py}
        width={pw}
        height={ph}
        preserveAspectRatio="xMidYMid meet"
      />
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
        transition-all duration-200 bg-white overflow-hidden shadow-sm
        ${disabled ? 'cursor-default' : 'cursor-pointer hover:-translate-y-2'}
        ${highlight ? '-translate-y-2' : ''}
      `}
      style={{ width: w, height: h }}
    >
      {disabled && (
        <span className="absolute inset-0 bg-slate-500/25 z-20 pointer-events-none" />
      )}
      {highlight && (
        <span
          className="absolute inset-0 rounded ring-2 ring-amber-400 z-10"
          style={{ boxShadow: '0 0 8px rgba(251,191,36,0.6)' }}
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
  compact?: boolean;
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
  compact = true,
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
  for (const card of hand) bySuit[card.suit].push(card);

  const cardW = cardWidth ?? CARD_WIDTH[size];

  if (!compact) {
    // Player's own hand: horizontal fan with generous visible area per card
    const overlap = cardW * 0.38;
    const cardAdvance = cardW - overlap;
    const suitGap = cardW * 0.2;
    const nonEmptySuits = suits.filter((s) => bySuit[s].length > 0);
    const totalWidth = hand.length > 0
      ? cardW + (hand.length - 1) * cardAdvance + Math.max(0, nonEmptySuits.length - 1) * suitGap
      : 0;

    return (
      <div className={`flex flex-col items-center gap-1 transition-all ${isTurn ? 'ring-2 ring-amber-400/60 rounded-lg p-2' : ''}`}>
        {label && <span className="text-xs font-semibold text-slate-200">{label}</span>}
        <div className="flex items-end justify-center" style={{ minWidth: totalWidth }}>
          {suits.map((suit, suitIdx) => bySuit[suit].length > 0 && (
            <div key={suit} className="flex items-end" style={suitIdx > 0 ? { marginLeft: suitGap } : undefined}>
              {bySuit[suit].map((card, cardIdx) => {
                const cardKey = `${card.rank}${card.suit}`;
                const isLegal = legalCards?.has(cardKey) ?? false;
                const canClick = !!onCardClick && (legalCards ? isLegal : true);
                return (
                  <div key={cardKey} className="relative" style={{ zIndex: cardIdx, ...(cardIdx > 0 ? { marginLeft: -overlap } : {}) }}>
                    <CardDisplay
                      card={card}
                      size={size}
                      cardWidth={cardW}
                      onClick={canClick ? () => onCardClick(card) : undefined}
                      disabled={!canClick}
                      highlight={isLegal && !!onCardClick}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Compact mode: BBO-style vertical suit columns with real card faces
  return (
    <div className={`flex flex-col gap-0.5 transition-all ${isTurn ? 'ring-2 ring-amber-400/60 rounded-lg p-1.5' : ''}`}>
      {label && (
        <span className={`text-xs font-semibold ${isDummy ? 'text-amber-400' : 'text-slate-200'}`}>
          {label}{isDummy && ' · Dummy'}
        </span>
      )}
      <SuitColumnHand
        suits={suits}
        bySuit={bySuit}
        cardW={cardW}
        onCardClick={onCardClick}
        legalCards={legalCards}
      />
    </div>
  );
}

// Shared component: renders cards as vertical columns grouped by suit,
// with each card overlapping vertically so the rank+suit corner is visible.
function SuitColumnHand({
  suits,
  bySuit,
  cardW,
  onCardClick,
  legalCards,
}: {
  suits: Suit[];
  bySuit: Record<Suit, Card[]>;
  cardW: number;
  onCardClick?: (card: Card) => void;
  legalCards?: Set<string>;
}) {
  const cardH = cardW * 1.4;
  const vOverlap = cardH * 0.72;
  const vAdvance = cardH - vOverlap;
  const suitGap = cardW * 0.12;
  const nonEmptySuits = suits.filter((s) => bySuit[s].length > 0);
  const maxColCards = Math.max(1, ...nonEmptySuits.map((s) => bySuit[s].length));
  const totalWidth = nonEmptySuits.length * cardW + Math.max(0, nonEmptySuits.length - 1) * suitGap;
  const totalHeight = cardH + (maxColCards - 1) * vAdvance;

  return (
    <div
      className="flex items-start justify-center"
      style={{ width: totalWidth, height: totalHeight }}
    >
      {suits.map((suit, suitIdx) => {
        if (bySuit[suit].length === 0) return null;
        return (
          <div
            key={suit}
            className="flex flex-col"
            style={suitIdx > 0 ? { marginLeft: suitGap } : undefined}
          >
            {bySuit[suit].map((card, cardIdx) => {
              const cardKey = `${card.rank}${card.suit}`;
              const isLegal = legalCards?.has(cardKey) ?? false;
              const canClick = !!onCardClick && (legalCards ? isLegal : true);
              return (
                <div
                  key={cardKey}
                  className="relative"
                  style={{
                    zIndex: cardIdx,
                    ...(cardIdx > 0 ? { marginTop: -vOverlap } : {}),
                  }}
                >
                  <CardDisplay
                    card={card}
                    cardWidth={cardW}
                    onClick={canClick ? () => onCardClick(card) : undefined}
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
  isTurn?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  cardWidth?: number;
  trumpStrain?: string;
}

export function DummyHandDisplay({
  hand,
  onCardClick,
  legalCards,
  isTurn,
  cardWidth,
  trumpStrain,
}: DummyHandDisplayProps) {
  const suits = suitOrderFor(trumpStrain);
  const bySuit: Record<Suit, Card[]> = { S: [], H: [], D: [], C: [] };
  for (const card of hand) bySuit[card.suit].push(card);
  const cardW = cardWidth ?? CARD_WIDTH.xs;

  return (
    <div className={`flex flex-col gap-0.5 transition-all ${isTurn ? 'ring-2 ring-amber-400/60 rounded-lg p-1.5' : ''}`}>
      <span className="text-xs font-semibold text-amber-400">Dummy</span>
      <SuitColumnHand
        suits={suits}
        bySuit={bySuit}
        cardW={cardW}
        onCardClick={onCardClick}
        legalCards={legalCards}
      />
    </div>
  );
}
