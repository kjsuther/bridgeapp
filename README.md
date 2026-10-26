# bridgeapp

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-5yzzvxkd)

A four-player rubber bridge table built with React, WebRTC, and Supabase.

## Local development

```bash
npm install
npm run dev
```

Required environment variables:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Optional TURN configuration for participants who cannot connect directly:

```env
VITE_TURN_URLS=turn:turn.example.com:3478,turns:turn.example.com:5349
VITE_TURN_USERNAME=...
VITE_TURN_CREDENTIAL=...
```

Use time-limited TURN credentials in production. Vite variables are delivered
to the browser and therefore must not contain a permanent provider secret.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Database migrations

Apply every migration in `supabase/migrations` in filename order. Migration
`010_private_hands_and_policy_fixes.sql` is required by this version of the
client. It:

- moves cards into seat-scoped rows so opponents cannot inspect hidden hands;
- generates new deals inside Postgres;
- adds optimistic version checks for simultaneous game actions;
- corrects table-player and play-history row-level security; and
- fixes the play-history timestamp used by undo.

Apply the migration before deploying the matching frontend. Existing hands are
migrated automatically and their legacy shared deal payload is cleared.

## Replay rotation deployment

Replays rotate the original board one seat clockwise: N's cards go to E,
E's to S, S's to W, and W's to N. Dealer and vulnerability follow the cards.
This exchanges partnerships while preserving bidding order and opening lead.

Apply `supabase/migrations/20261025130000_015_rotate_replay_board_clockwise.sql`
to the existing database **before** deploying this frontend. The function
derives replay dealer and vulnerability from the original hand, rather than
trusting client parameters. Finish active replay hands before rollout and
have every player refresh onto the new frontend before starting another.
Earlier hands and recorded scores are not rewritten by the migration.

`npm test` includes replay order/scoring tests and runs the actual SQL function
in embedded PostgreSQL (PGlite) with a minimal schema. It does not verify the
full migration chain or Supabase authentication and RLS. Before live rollout,
verify a complete original/replay pair with four players in staging, including
a board where only one partnership is vulnerable.

For a Bolt-managed database, confirm database administration access before
applying SQL. GitHub source sync alone does not apply this migration.

## Audio behavior

Microphone mute and participant-audio mute are independent controls. Capture
requests echo cancellation, noise suppression, automatic gain control, and
mono speech audio when supported by the browser. When several players are in
the same physical room, use headphones or leave only one device's microphone
and speakers enabled.
