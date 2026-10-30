import { beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ from: vi.fn(), pattern: '', account: { id: 'player' } as { id: string } | null,
  players: [] as { seat: string; user_id: string }[], insert: vi.fn(), lookupError: null as unknown }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: db.from } }));
import { assignSeatByEmail } from './seatAssignment';

beforeEach(() => {
  db.account = { id: 'player' }; db.players = []; db.lookupError = null;
  db.insert.mockReset().mockResolvedValue({ error: null });
  db.from.mockImplementation((table: string) => ({
    select() { return this; }, eq() { return this; },
    ilike(_field: string, pattern: string) { db.pattern = pattern; return this; },
    maybeSingle: async () => ({ data: db.account, error: db.lookupError }),
    insert: db.insert,
    then(resolve: (result: unknown) => unknown) { return Promise.resolve({ data: table === 'table_players' ? db.players : null, error: null }).then(resolve); },
  }));
});
it('matches an exact email case-insensitively, escaping lookup wildcards', async () => {
  await assignSeatByEmail('table', 'E', '  TEST_Name%tag@Example.com  ');
  expect(db.pattern).toBe('test\\_name\\%tag@example.com');
  expect(db.insert).toHaveBeenCalledWith({ table_id: 'table', seat: 'E', user_id: 'player' });
});
it('rejects invalid and unknown emails without changing seats', async () => {
  await expect(assignSeatByEmail('table', 'N', 'invalid')).rejects.toThrow('valid email');
  db.account = null;
  await expect(assignSeatByEmail('table', 'N', 'unknown@example.com')).rejects.toThrow('sign in first');
  expect(db.insert).not.toHaveBeenCalled();
});
it('keeps existing assignments when the player or target seat is already taken', async () => {
  db.players = [{ seat: 'S', user_id: 'player' }];
  await expect(assignSeatByEmail('table', 'N', 'test@example.com')).rejects.toThrow('another seat');
  db.players = [{ seat: 'N', user_id: 'other-player' }];
  await expect(assignSeatByEmail('table', 'N', 'test@example.com')).rejects.toThrow('already assigned');
  expect(db.insert).not.toHaveBeenCalled();
});
it('reports lookup and assignment failures', async () => {
  db.lookupError = { message: 'offline' };
  await expect(assignSeatByEmail('table', 'N', 'test@example.com')).rejects.toThrow('look up');
  db.lookupError = null;
  db.insert.mockResolvedValue({ error: { message: 'conflicting seat assignment' } });
  await expect(assignSeatByEmail('table', 'N', 'test@example.com')).rejects.toThrow('Could not assign');
});
