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

## Audio behavior

Microphone mute and participant-audio mute are independent controls. Capture
requests echo cancellation, noise suppression, automatic gain control, and
mono speech audio when supported by the browser. When several players are in
the same physical room, use headphones or leave only one device's microphone
and speakers enabled.
