import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDeck, dealToJSON, swapSeatForReplay, swapVulnerabilityForReplay } from './dealing';
import { SEATS } from '@/types/bridge';
import type { Deal, Seat, Vulnerability } from '@/types/bridge';

const GAME = '11111111-1111-4111-8111-111111111111';
const OTHER_GAME = '22222222-2222-4222-8222-222222222222';
const TABLE = '33333333-3333-4333-8333-333333333333';
const db = new PGlite();
const deck = createDeck();
const cards = dealToJSON(Object.fromEntries(SEATS.map((seat, index) => [seat, deck.slice(index * 13, index * 13 + 13)])) as unknown as Deal);

async function originalHand(dealer: Seat = 'N', vulnerability: Vulnerability = 'NS') {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO hands (game_id, hand_number, dealer, vulnerability, phase)
     VALUES ($1, 1, $2, $3, 'finished') RETURNING id`, [GAME, dealer, vulnerability],
  );
  const id = rows[0].id;
  for (const seat of SEATS) {
    await db.query('INSERT INTO hand_cards VALUES ($1, $2, $3::jsonb)', [id, seat, JSON.stringify(cards[seat])]);
  }
  return id;
}

async function replayHand(original: string | null, game = GAME) {
  const { rows } = await db.query<{ id: string }>(
    // Deliberately supply metadata that disagrees with most originals: the
    // database must derive the replay board from its original, not trust this.
    `SELECT create_bridge_hand($1, 2, 'W', 'none', 'replay', $2) AS id`, [game, original],
  );
  return rows[0].id;
}

beforeAll(async () => {
  // A minimal PostgreSQL fixture exercises the actual migration function.
  // Supabase auth/RLS and the complete migration chain require staging tests.
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE TABLE games (id uuid PRIMARY KEY, table_id uuid NOT NULL);
    CREATE TABLE hands (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), game_id uuid,
      hand_number integer, deal jsonb, dealer text, vulnerability text,
      auction jsonb, phase text, hand_role text DEFAULT 'original', original_hand_id uuid
    );
    CREATE TABLE hand_cards (hand_id uuid, seat text, cards jsonb, PRIMARY KEY (hand_id, seat));
    CREATE FUNCTION can_access_bridge_table(requested_table_id uuid) RETURNS boolean
      LANGUAGE sql AS $$ SELECT requested_table_id = '${TABLE}'::uuid $$;
    INSERT INTO games VALUES ('${GAME}', '${TABLE}'), ('${OTHER_GAME}', '${TABLE}');
  `);
  await db.exec(readFileSync(new URL('../../supabase/migrations/20261025130000_015_rotate_replay_board_clockwise.sql', import.meta.url), 'utf8'));
}, 30000);

afterAll(async () => { await db.close(); });

describe('create_bridge_hand replay migration', () => {
  it.each(SEATS)('rotates all 52 cards and board metadata when %s deals', async (dealer) => {
    for (const vulnerability of ['none', 'NS', 'EW', 'both'] as const) {
      const id = await replayHand(await originalHand(dealer, vulnerability));
      const { rows: hands } = await db.query<{ dealer: Seat; vulnerability: Vulnerability }>('SELECT dealer, vulnerability FROM hands WHERE id = $1', [id]);
      expect(hands[0]).toEqual({ dealer: swapSeatForReplay(dealer), vulnerability: swapVulnerabilityForReplay(vulnerability) });
      const { rows } = await db.query<{ seat: Seat; cards: string[] }>('SELECT seat, cards FROM hand_cards WHERE hand_id = $1', [id]);
      const rotated = Object.fromEntries(rows.map(row => [row.seat, row.cards]));
      for (const seat of SEATS) expect(rotated[swapSeatForReplay(seat)]).toEqual(cards[seat]);
      expect(new Set(rows.flatMap(row => row.cards)).size).toBe(52);
    }
  });

  it('preserves the original hand and leaves earlier replays untouched', async () => {
    const original = await originalHand();
    const existing = await replayHand(original);
    await db.query("UPDATE hands SET dealer = 'N', vulnerability = 'NS' WHERE id = $1", [existing]);
    await db.exec(readFileSync(new URL('../../supabase/migrations/20261025130000_015_rotate_replay_board_clockwise.sql', import.meta.url), 'utf8'));
    const { rows } = await db.query<{ dealer: string; vulnerability: string }>('SELECT dealer, vulnerability FROM hands WHERE id IN ($1, $2)', [original, existing]);
    expect(rows).toEqual([{ dealer: 'N', vulnerability: 'NS' }, { dealer: 'N', vulnerability: 'NS' }]);
  });

  it('rejects absent originals instead of silently dealing a new board', async () => {
    await expect(replayHand(null)).rejects.toThrow('A replay requires an original hand');
    await expect(replayHand('99999999-9999-4999-8999-999999999999')).rejects.toThrow('Completed original hand not found');
  });

  it('rejects originals from another game and replays used as originals', async () => {
    const original = await originalHand();
    await expect(replayHand(original, OTHER_GAME)).rejects.toThrow('Completed original hand not found');
    await expect(replayHand(await replayHand(original))).rejects.toThrow('Completed original hand not found');
  });

  it('rejects unfinished originals and missing card rows', async () => {
    const original = await originalHand();
    await db.query("UPDATE hands SET phase = 'playing' WHERE id = $1", [original]);
    await expect(replayHand(original)).rejects.toThrow('Completed original hand not found');
    await db.query("UPDATE hands SET phase = 'finished' WHERE id = $1", [original]);
    await db.query("DELETE FROM hand_cards WHERE hand_id = $1 AND seat = 'N'", [original]);
    await expect(replayHand(original)).rejects.toThrow('Original hand is missing cards');
  });

  it('retains the table authorization check', async () => {
    const forbidden = '44444444-4444-4444-8444-444444444444';
    await db.query('INSERT INTO games VALUES ($1, $1)', [forbidden]);
    await expect(replayHand(await originalHand(), forbidden)).rejects.toThrow('Not authorized to deal this hand');
  });

  it('continues to deal fresh originals without rotating their metadata', async () => {
    const { rows } = await db.query<{ id: string }>(`SELECT create_bridge_hand($1, 3, 'S', 'NS', 'original') AS id`, [GAME]);
    const id = rows[0].id;
    const { rows: hands } = await db.query('SELECT dealer, vulnerability FROM hands WHERE id = $1', [id]);
    expect(hands[0]).toEqual({ dealer: 'S', vulnerability: 'NS' });
    const { rows: dealt } = await db.query<{ cards: string[] }>('SELECT cards FROM hand_cards WHERE hand_id = $1', [id]);
    expect(dealt).toHaveLength(4);
    expect(dealt.every(row => row.cards.length === 13)).toBe(true);
    expect(new Set(dealt.flatMap(row => row.cards)).size).toBe(52);
  });
});
