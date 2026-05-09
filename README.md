# PeerDrop

PeerDrop is a browser-based peer-to-peer file transfer app using WebRTC DataChannels with Supabase Realtime for signaling.

## Runtime architecture

- **Frontend app**: Next.js app with routes `/`, `/send`, `/receive`
- **Signaling layer (default)**: Supabase Realtime broadcast channels (`peerdrop:<sessionId>`)
- **Optional local fallback**: `signaling-server/server.js` via `npm run signal`

## Environment variables

Create your own `.env` from `.env.example` and set:

- `NEXT_PUBLIC_SUPABASE_URL`: your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: your Supabase publishable key (or use `NEXT_PUBLIC_SUPABASE_ANON_KEY` with the anon JWT)

You can also set **`SUPABASE_URL`** and **`SUPABASE_PUBLISHABLE_KEY`** (no `NEXT_PUBLIC_` prefix). `next.config.mjs` copies them into the client bundle at build time so signaling still works on Vercel.
- `NEXT_PUBLIC_SITE_URL`: canonical public site URL (metadata/SEO)
- `NEXT_PUBLIC_CONNECT_TIMEOUT_MS`: signaling/channel connect timeout (default `25000`)
- `NEXT_PUBLIC_SIGNALING_URL`: optional local Socket.IO signaling URL (leave empty for Supabase Realtime)

Optional local signaling server variables:

- `SIGNALING_PORT`: port for signaling server (default `4001`)
- `SIGNAL_SESSION_TTL_MS`: session lifetime in milliseconds (default `1800000`)
- `SIGNAL_ALLOWED_ORIGIN`: exact frontend origin
- `SIGNAL_MAX_SESSIONS`: max active sessions

## Local run (smoke test)

1. `npm install`
2. Start app: `npm run dev`
3. Open two browsers/devices:
   - sender: `/send`
   - receiver: `/receive`

If you want to test the legacy local signaling server too:

1. Start server: `npm run signal`
2. Set `NEXT_PUBLIC_SIGNALING_URL=http://localhost:4001`
3. Restart app and retest

## Production checklist

- Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in Vercel
- Confirm Supabase Realtime is enabled for the project
- Build: `npm run build`
- Deploy Next.js app
- Run one real device-to-device transfer test:
  - small file (< 10MB)
  - large file (> 200MB)
  - reconnect/retry scenario
