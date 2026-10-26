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

## Double-dummy comparison

History's board comparison uses DDS through the pinned `bridge-dds` WebAssembly
package. Each panel loads its engine in a background Web Worker. One solve
returns all legal-card results; equivalent ranks are expanded so no legal card
is omitted. Visited positions are cached, obsolete queued requests are dropped,
and stalled workers time out with a retry option instead of blocking the page.

Dots use declarer's final trick total minus the tricks required by the contract:
red negative values for undertricks, green `=` for exactly making, and green
positive values for overtricks. Center cards retain the result immediately after
that card was played, before any later mistakes. No database migration is needed
for this comparison change. The separate after-game Analyze Hand panel continues
to use the existing solver.

`npm test` checks the DDS adapter against independent exhaustive endgames in
all strains and seat positions, forced plays, equivalent cards, center-card
values, and background request caching/cancellation/timeout recovery.
Upstream notices and the Apache 2.0 license are served in `public/dds-notices.txt`
and `public/dds-license.txt`.

## Audio behavior

Microphone mute and participant-audio mute are independent controls. Capture
requests echo cancellation, noise suppression, automatic gain control, and
mono speech audio when supported by the browser. When several players are in
the same physical room, use headphones or leave only one device's microphone
and speakers enabled.

## Live player information and camera startup

Apply `supabase/migrations/20261026010000_016_realtime_profile_updates.sql`
in the Supabase SQL Editor when deploying the player-sync update. It adds
profiles to the Realtime publication without changing existing access policies.
Lobby, seating, and game views listen for profile edits and reload after joining
or reconnecting. A visible-tab check every 15 seconds and a focus check recover
missed events. These checks update player information without restarting cameras.

Camera discovery uses Realtime Presence, with a single initial caller per pair
and serialized offer/answer/ICE processing. Refreshed sessions replace stale peer
connections, and cancelled camera requests release their tracks. Capture targets
15 frames per second (maximum 20) to reduce four-player encoding load. TURN
configuration remains necessary on networks that cannot connect directly.

After publishing, all participants should reload once to use the new connection
protocol. Automated tests simulate four-player joins and refreshes; a live
four-person test across the participants' networks is still required.
