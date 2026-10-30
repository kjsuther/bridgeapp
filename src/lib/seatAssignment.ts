import { supabase } from '@/lib/supabase';
import type { Seat } from '@/types/bridge';

export async function assignSeatByEmail(tableId: string, seat: Seat, enteredEmail: string) {
  const email = enteredEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  // ILIKE is case insensitive; escape its pattern characters for an exact lookup.
  const pattern = email.replace(/[\\%_]/g, char => `\\${char}`);
  const { data: account, error: lookupError } = await supabase.from('profiles')
    .select('id').ilike('email', pattern).maybeSingle();
  if (lookupError) throw new Error('Could not look up this email. Please try again.');
  if (!account) throw new Error('No account found for this email. Ask the player to sign in first.');
  const { data: existing, error: seatError } = await supabase.from('table_players')
    .select('seat, user_id').eq('table_id', tableId);
  if (seatError) throw new Error('Could not check the seats. Please try again.');
  if (existing?.some(player => player.user_id === account.id && player.seat !== seat)) {
    throw new Error('This player already has another seat. Remove them there before assigning this seat.');
  }
  const occupant = existing?.find(player => player.seat === seat);
  if (occupant?.user_id === account.id) return;
  if (occupant) throw new Error('This seat is already assigned. Remove its player before assigning someone else.');
  const { error } = await supabase.from('table_players').insert({ table_id: tableId, seat, user_id: account.id });
  if (error) throw new Error('Could not assign this seat. Refresh the seats and try again.');
}
