# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the repository root (npm workspaces).

```bash
npm install                   # Install all workspace dependencies
npm run web                   # Start Expo web dev server
npm run typecheck             # TypeScript strict mode check
npm run lint                  # ESLint via expo lint
npm test                      # Vitest unit tests
npm test -- <file>            # Single test file
npm run export:web            # Static web export to apps/mobile-web/dist
```

Node 22.13+ required (see `.nvmrc`). Run `npm run export:web` after touching connection, camera, or CV imports — it catches native-only imports leaking into the web bundle.

## Architecture

ClearRelay is a serverless P2P screen relay. Three roles communicate over WebRTC with no media server:

- **Recorder** (phone) — streams camera video (1920×1080, 8 FPS) to Admin via Link A
- **Admin** — watches live feed, captures stills, sends images/code to Projector via Link B
- **Projector** — renders full-screen whatever Admin sends (called `display` on the wire)

**Link A:** Recorder → Admin — WebRTC video track + control data channel
**Link B:** Admin → Projector — WebRTC data channel only (M4, not yet implemented)
**Signaling:** WebSocket relay at `wss://omni-relay-production-d45c.up.railway.app` — Admin creates a 6-char room code, Recorder/Projector enter it to connect.

### Code layout

The single app lives in `apps/mobile-web/src/`:

| Path | Purpose |
|------|---------|
| `app/` | expo-router file-based routes: index, recorder, admin, projector, pair |
| `connection/` | WebRTC abstraction — `IConnection` interface, `connection.web.ts` (browser), `connection.ts` (native react-native-webrtc), `signal-ws.ts` (WebSocket signaling client) |
| `camera/` | Camera abstraction — `ICameraSource` interface, `camera.web.ts` (getUserMedia), `camera.ts` (native react-native-webrtc) |
| `protocol/` | Wire protocol — `messages.ts` types + parse/serialize, `messages.test.ts` |
| `store/session.ts` | Zustand session state (unlock, role) |
| `hooks/use-pairing.ts` | Pairing state machine: idle → creating → waiting-for-peer → joining → exchanging → connecting → connected → failed |
| `config/index.ts` | All tunables — FPS, bitrate, ICE servers, signaling URL, chunk sizes |
| `services/signaling/` | WebSocket relay server (`server.js`, plain Node.js, deployed on Railway) |

### Platform abstraction pattern

`foo.ts` = native implementation, `foo.web.ts` = browser implementation. Metro picks `.web.ts` for web builds automatically. **Never import `.web.ts` directly** — always import through the index file. **Never add `react-native-webrtc` to `expo.plugins` in `app.json`** — it has no config plugin and crashes `expo export`.

### Pairing flow

1. Admin calls `pairing.createRoom()` → connects WS → sends `{t:'create'}` → receives `{t:'created', code}` → displays 6-char code
2. Recorder/Projector calls `pairing.joinRoom(code)` → connects WS → sends `{t:'join', code, role}` → receives `{t:'room-ok'}`
3. Recorder creates WebRTC offer → relays via WS → Admin accepts → relays answer → ICE connects
4. Projector joins WS room only (no WebRTC yet — Link B is M4)

### Admin screenshot capture

Canvas drawn from `<video>` element at intrinsic resolution (`video.videoWidth × video.videoHeight`). CSS filter applied: `contrast(1.3) brightness(1.05) saturate(0.75)`. `VideoView` exposes `onVideoElement` prop to pass the DOM element to the parent. Captures stored in-memory as `{ id, ts, dataUrl, width, height }`.

### Protocol rules

`src/protocol/messages.ts` is versioned and immutable once deployed. Don't change existing message shapes — add new fields as optional. `parseMessage()` validates untrusted JSON and returns `null` on malformed input.

### Key config values (config/index.ts)

- `ACCESS_KEY = 'Thiswillbekey1901'` — client-side gate, overridable via `EXPO_PUBLIC_ACCESS_KEYS`
- `SIGNALING_WS_URL` — defaults to Railway URL; override with `EXPO_PUBLIC_SIGNALING_URL`
- `TARGET_FPS: 8` — never trade text clarity for smooth motion
- `DEGRADATION: 'maintain-resolution'` — never drop pixel count

## Current status

**Live at:** `https://naveenmorla1901.github.io/omni-relay/`
**Signaling server:** `wss://omni-relay-production-d45c.up.railway.app` (Railway, `services/signaling/`, PORT=8081)

Completed: M0 scaffold, M1 WebRTC + room-code pairing, M2 live video, M3 Admin capture gallery, M8 signaling server.

Not yet implemented: Link B / M4 (Admin→Projector push), M5 CV pipeline, M6 camera tuning, M7 OCR, Android signed APK (push `v0.1.0` tag to build debug APK via GitHub Actions).

Next: M4 — Admin → Projector data channel, image chunking, full-screen render.
