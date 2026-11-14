# Project memory

## Product intent & audience

- Custom bridge game app for a private friend group; not a public product.
- Integrates with Bridge Base to retrieve scores from hand configurations and calculate IMPs.
- Core gameplay loop: bidding, card play, per-hand scoring/summary, replay with rotation.

## Brand personality & voice

- Production-grade polish; distinctive, non-templated UI.
- Bridge-literate audience — domain terms (declarer, dummy, IMP, seat) used without explanation.

## Visual design & UX direction

- End-of-hand summary dialog (`HandSummary.tsx`) shows cards grid plus per-player total time as M:SS with declarer/dummy labels.
- Seats labeled N/E/S/W throughout the UI.
- Icons from `lucide-react`.
- Tailwind CSS for styling; JSX with React hooks.

## Decisions, constraints & rationale

- Stack: Vite + React + Tailwind + Lucide React. `@/` path alias maps to `src/`.
- Backend: Supabase — database migrations and RPC functions applied via MCP.
- RPCs: `create_bridge_hand`, `update_bridge_hand`. Both extended to accept `timed_seat` for server-side time accumulation.
- `hands` table columns include `hand_role`, `imp_result`, `turn_started_at`, `turn_times`.
- Turn timing tracked server-side to avoid cross-browser clock disagreements; elapsed ms accumulated per seat.
- Dummy play time attributed to declarer automatically via `actingSeat()` helper (`@/lib/turn`); dummy never charged.
- `turn_started_at` set to NULL when phase reaches scoring/finished — clock stops at hand end.
- Frontend turn-transition points: `makeBid` (sends `timed_seat: bidder`) and `playCard` (sends `timed_seat` via `actingSeat()`).
- `GameContext` loads `hands` via `select('*')`, exposes `turnTimes` and `turn_started_at` through context.
- `dummySeat` defined in `@/lib/play`.
- Tests: existing `turn.test.ts` covers `actingSeat`; extended with timing-attribution tests. All tests pass; production build clean.
- Project files use CRLF line endings — account for this in string-replacement edits.

## Open questions & assumptions

- Bridge Base integration details (retrieval method, hand-config format, IMP formula) not yet documented in code seen.
- Auth/session model for the friend group not yet visible.
- Multi-session or multi-table support scope unknown.