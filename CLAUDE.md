# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. Cross-tool conventions live in `AGENTS.md`; project progress lives in `PROJECT-STATUS.md`.

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

- **Recorder** (phone) — streams camera video (tries 4K, falls back to HD, 8 FPS) to Admin via Link A
- **Admin** — watches the live feed, captures stills, sends images to the Projector
- **Projector** — renders full-screen whatever Admin sends (called `display` on the wire)

**Link A:** Recorder → Admin — WebRTC video track + control data channel
**Link B:** Admin → Projector — image push over the WebSocket signaling relay (`push` message; no second WebRTC session)
**Signaling:** WebSocket relay at `wss://omni-relay-production-d45c.up.railway.app` — Admin creates a 6-char room code, Recorder/Projector enter it to connect.

### Code layout

The single app lives in `apps/mobile-web/src/`:

| Path | Purpose |
|------|---------|
| `app/` | expo-router file-based routes: index, recorder, admin, projector, pair |
| `connection/` | WebRTC abstraction — `IConnection`, `connection.web.ts` (browser), `connection.ts` (native), `signal-ws.ts` (WS signaling + push client) |
| `camera/` | Camera abstraction — `ICameraSource`, `camera.web.ts` (getUserMedia), `camera.ts` (native react-native-webrtc), `lenses.ts` (physical rear-lens classification) |
| `lib/cv.ts` | Web-only capture enhancement: contrast → unsharp mask → auto-levels → JPEG; `rotateImage()` |
| `lib/quad.ts` | Web quad detection + perspective warp — `detectQuad`/`warpPerspective` on `ImageData`; overlay helpers use canvas |
| `protocol/` | Wire protocol — `messages.ts` types + parse/serialize, `messages.test.ts` |
| `store/session.ts` | Zustand session state (unlock, role) |
| `hooks/use-pairing.ts` | Pairing state machine + `pushImage()` for Link B |
| `config/index.ts` | All tunables — FPS, bitrate, ICE servers, signaling URL, chunk sizes |
| `services/signaling/` | WebSocket relay server (`server.js`, plain Node.js, deployed on Railway) |

### Platform abstraction pattern

`foo.ts` = native implementation, `foo.web.ts` = browser implementation. Metro picks `.web.ts` for web builds automatically. **Never import `.web.ts` directly** — always import through the index file. **Never add `react-native-webrtc` to `expo.plugins` in `app.json`** — it has no config plugin and crashes `expo export`.

### Pairing flow

1. Admin calls `pairing.createRoom()` → connects WS → sends `{t:'create'}` → receives `{t:'created', code}` → displays 6-char code
2. Recorder/Projector calls `pairing.joinRoom(code)` → connects WS → sends `{t:'join', code, role}` → receives `{t:'room-ok'}`
3. Recorder creates WebRTC offer → relays via WS → Admin accepts → relays answer → ICE connects
4. Projector receives `push` image messages from Admin over the same WS relay (Link B)

### Admin capture pipeline

Canvas draws the live `<video>` at intrinsic resolution, then `enhanceCapture()` in `lib/cv.ts` (contrast 1.25 + brightness 1.05 → unsharp mask 1.8 → percentile auto-levels → JPEG 97%). `lib/quad.ts` detects the document quad (blue overlay) and "Auto-crop" applies perspective warp. `VideoView` exposes `onVideoElement` to pass the DOM element to the parent. Captures are in-memory: `{ id, ts, dataUrl, width, height }` (max 20).

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
**Latest APK:** v0.1.6 on GitHub Releases (`assembleRelease`, debug-keystore signing)

Completed: M0–M5 — scaffold, room-code pairing, live video, Admin capture gallery, Admin→Projector image push, pure-TS quad detection + perspective warp. APK v0.1.6 was built from `01a7a59` and published to GitHub Releases. The 2026-10-20 device-testing backlog is implemented in code: 4K/detail camera tuning, fixed quad candidate NMS + synthetic regression tests, Re-lock redetect, auto-crop with Undo, 1–4× zoom, capture Download, front-camera mirror sync, and web Projector drag/drop + paste image/code. Follow-up work adds Admin per-capture Delete / per-thumbnail Delete / Clear all with confirmation, and a Recorder physical rear-lens picker (Auto 4K preferred, Ultra-wide, Main · high quality, Telephoto, numbered Android cameras; failed switches fall back to Auto). Local checks are green (typecheck, lint, 26 tests, web export); live web bundle verified.

Known issues: the deployed Railway relay runs pre-M4 code — Admin→Projector `push` fails in production until `services/signaling` is redeployed. The camera quality/detection/zoom/delete/lens work still needs real-device verification. Some Android builds expose only one logical rear camera, so Ultra-wide is not available there.

Next: browser-test Admin delete/clear, install APK v0.1.6 to compare Auto vs. Ultra-wide vs. Main/high-quality lenses on a close screen, redeploy the relay, then the M5 remainder (CLAHE, raw-frame fallback) or M6 camera tuning.
