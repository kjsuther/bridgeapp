import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('publishes profiles once without changing existing access policies', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE public.profiles (id uuid PRIMARY KEY, display_name text);
      ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
      CREATE POLICY profile_read ON public.profiles FOR SELECT USING (true);
      CREATE PUBLICATION supabase_realtime;
    `);
    const sql = readFileSync(new URL('../../supabase/migrations/20261026010000_016_realtime_profile_updates.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec(sql);
    const { rows } = await db.query(`SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'`);
    expect(rows).toEqual([{ tablename: 'profiles' }]);
    const policies = await db.query(`SELECT policyname FROM pg_policies WHERE tablename = 'profiles'`);
    expect(policies.rows).toEqual([{ policyname: 'profile_read' }]);
  } finally {
    await db.close();
  }
}, 30000);
