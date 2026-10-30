import { supabase } from '@/lib/supabase';
import { jsonToDeal } from '@/lib/dealing';
import type { HandDetail, SeatNames } from '@/types/review';
import type { Seat, Contract, AuctionEntry, PlayState, Vulnerability, HandScore } from '@/types/bridge';

export async function loadSeatNames(tableId: string): Promise<SeatNames> {
  const { data: players } = await supabase
    .from('table_players')
    .select('seat, user_id')
    .eq('table_id', tableId);

  if (!players || players.length === 0) {
    return { N: 'N', E: 'E', S: 'S', W: 'W' };
  }

  const userIds = players.map((p) => p.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', userIds);

  const nameMap: Record<string, string> = {};
  (profiles || []).forEach((p) => { nameMap[p.id] = p.display_name; });

  const result: SeatNames = { N: 'N', E: 'E', S: 'S', W: 'W' };
  for (const p of players) {
    const seat = p.seat as Seat;
    result[seat] = nameMap[p.user_id] ?? seat;
  }
  return result;
}

export async function loadHandDetail(handId: string): Promise<(HandDetail & { tableId: string }) | null> {
  const { data: hand, error } = await supabase
    .from('hands')
    .select('id, game_id, phase, dealer, vulnerability, auction, contract, score, play_state')
    .eq('id', handId)
    .maybeSingle();

  if (error || !hand || !['scoring', 'finished'].includes(hand.phase) || !hand.contract || !hand.score || !hand.play_state) return null;
  const { data: game } = await supabase.from('games').select('table_id').eq('id', hand.game_id).maybeSingle();
  if (!game) return null;

  const { data: cardRows } = await supabase
    .from('hand_cards')
    .select('seat, cards')
    .eq('hand_id', handId);

  if (!cardRows || cardRows.length !== 4 || cardRows.some(row => !Array.isArray(row.cards) || row.cards.length !== 13)) return null;

  const cardMap: Record<string, string[]> = { N: [], E: [], S: [], W: [] };
  for (const row of cardRows) {
    cardMap[row.seat as Seat] = row.cards as string[];
  }

  return {
    handId: hand.id,
    tableId: game.table_id,
    deal: jsonToDeal(cardMap),
    auction: (hand.auction as AuctionEntry[]) || [],
    contract: hand.contract as Contract,
    score: hand.score as HandScore,
    playState: hand.play_state as PlayState,
    vulnerability: hand.vulnerability as Vulnerability,
    dealer: hand.dealer as Seat,
  };
}

