# PeerDrop Deployment Guide

PeerDrop is a browser-based peer-to-peer file transfer app using WebRTC DataChannels and a Socket.IO signaling service.

## What runs in production

- **Frontend app**: this TanStack/React app (`npm run build`)
- **Signaling server**: `signaling-server/server.js` (`npm run signal`)

## Environment variables

Create your own `.env` from `.env.example` and set:

- `VITE_SIGNALING_URL`: public URL for signaling server (for browser clients)
- `VITE_PUBLIC_SITE_URL`: canonical public site URL (used for metadata/SEO links)
- `SIGNALING_PORT`: port for signaling server (default `4001`)
- `SIGNAL_ALLOWED_ORIGIN`: exact frontend origin in production (recommended)
- `SIGNAL_MAX_SESSIONS`: max active sessions to protect server

## Local run (pre-deploy smoke test)

1. Install dependencies:
   - `npm install`
2. Start signaling server:
   - `npm run signal`
3. Start web app:
   - `npm run dev`
4. Open two devices on same network and test:
   - sender: `/send`
   - receiver: `/receive`

## Production checklist (today)

- Deploy signaling service first and verify `GET /health` returns `{ "ok": true }`
- Set `VITE_SIGNALING_URL` to the deployed signaling URL
- Set `SIGNAL_ALLOWED_ORIGIN` to your deployed frontend URL
- Build frontend: `npm run build`
- Deploy frontend bundle
- Run one live transfer test with:
  - one small file (< 10MB)
  - one large file (> 200MB)
  - receiver reconnect attempt

## Reliability hardening included

- Signaling connect/join/create timeouts
- ICE candidate queueing until remote SDP is set
- Better connection/disconnect error states
- Session validation and origin checks on signaling server
- Receiver-slot locking (single receiver per session)
