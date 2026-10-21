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
- **Admin** — watches the live feed, captures stills, composes the Projector screen in a phone-shaped stage
- **Projector** — renders full-screen whatever Admin sends (called `display` on the wire)

**Link A:** Recorder → Admin — WebRTC video track + control data channel
**Link B:** Admin ↔ Projector — stage messages (`viewport`, `stage-ready`, `stage-frame`, `stage-ack`, `stage-clear`) over the WebSocket relay's `sdp` forward with `kind: 'stage'`. The deployed relay predates `push` and silently drops it; every relay version forwards `sdp`, so Link B works without a redeploy.
**Signaling:** WebSocket relay at `wss://omni-relay-production-d45c.up.railway.app` — Admin creates a 6-char room code, Recorder/Projector enter it to connect.

### Code layout

The single app lives in `apps/mobile-web/src/`:

| Path | Purpose |
|------|---------|
| `app/` | expo-router file-based routes: index, recorder, admin, projector, pair |
| `connection/` | WebRTC abstraction — `IConnection`, `connection.web.ts` (browser), `connection.ts` (native), `signal-ws.ts` (WS signaling + `relayStage()`) |
| `camera/` | Camera abstraction — `ICameraSource`, `camera.web.ts` (getUserMedia), `camera.ts` (native react-native-webrtc), `lenses.ts` (physical rear-lens classification) |
| `lib/stage.ts` | Projector stage scene model: aspect/output size, image fit/fill, text wrap, `renderStage()` (Vitest-tested) |
| `components/projector-stage.web.tsx` | Admin's phone-shaped stage editor (canvas): drop/paste/choose image, drag/pinch/wheel, text, shape/direction, live send |
| `lib/cv.ts` | Web-only capture: sharpest-of-5 → contrast/brightness → auto-levels → CLAHE → luma-only unsharp → JPEG; `rotateImage()` |
| `lib/image-quality.ts` | Pure pixel helpers: Laplacian sharpness score, auto-levels, CLAHE, luma-only unsharp (Vitest-tested) |
| `lib/quad.ts` | Web quad detection + perspective warp — `detectQuad`/`warpPerspective` on `ImageData`; overlay helpers use canvas |
| `protocol/` | Wire protocol — `messages.ts` types + parse/serialize, `messages.test.ts` |
| `store/session.ts` | Zustand session state (unlock, role) |
| `hooks/use-pairing.ts` | Pairing state machine + Link B `sendStageFrame()`/`clearStage()`/`sendViewport()` |
| `config/index.ts` | All tunables — FPS, bitrate, ICE servers, signaling URL, chunk sizes |
| `services/signaling/` | WebSocket relay server (`server.js`, plain Node.js, deployed on Railway) |

### Platform abstraction pattern

`foo.ts` = native implementation, `foo.web.ts` = browser implementation. Metro picks `.web.ts` for web builds automatically. **Never import `.web.ts` directly** — always import through the index file. **Never add `react-native-webrtc` to `expo.plugins` in `app.json`** — it has no config plugin and crashes `expo export`.

### Pairing flow

1. Admin calls `pairing.createRoom()` → connects WS → sends `{t:'create'}` → receives `{t:'created', code}` → displays 6-char code
2. Recorder/Projector calls `pairing.joinRoom(code)` → connects WS → sends `{t:'join', code, role}` → receives `{t:'room-ok'}`
3. Recorder creates WebRTC offer → relays via WS → Admin accepts → relays answer → ICE connects
4. Projector goes full-screen and sends `viewport` (CSS px + dpr); Admin shapes its stage to match, renders it at the Projector's physical pixels (max 2560 long side, JPEG 92), and sends `stage-frame` (Link B)

### Admin capture pipeline

`captureAndEnhanceVideo()` in `lib/cv.ts` waits for five live `<video>` frames, scores each on a 480px thumbnail with a Laplacian-variance sharpness metric, keeps the sharpest at intrinsic resolution, then runs contrast/brightness → percentile auto-levels → CLAHE → luma-only unsharp → JPEG 97%. `lib/quad.ts` detects the document quad (blue overlay) and "Auto-crop" applies perspective warp. `VideoView` exposes `onVideoElement` to pass the DOM element to the parent and reports low-resolution streams. Captures are in-memory: `{ id, ts, dataUrl, width, height }` (max 20). Native capture is still effectively web-only because it relies on `HTMLVideoElement`/canvas; native lens selection does work for the Recorder feed.

### Protocol rules

`src/protocol/messages.ts` is versioned and immutable once deployed. Don't change existing message shapes — add new fields as optional. `parseMessage()` validates untrusted JSON and returns `null` on malformed input.

### Key config values (config/index.ts)

- `ACCESS_KEY = 'Thiswillbekey1901'` — client-side gate, overridable via `EXPO_PUBLIC_ACCESS_KEYS`
- `SIGNALING_WS_URL` — defaults to Railway URL; override with `EXPO_PUBLIC_SIGNALING_URL`
- `TARGET_FPS: 8` — never trade text clarity for smooth motion
- `DEGRADATION: 'maintain-resolution'` — never drop pixel count
- `HIGH_BITRATE_BPS: 16_000_000` — encoder ceiling; congestion control can still lower it
- `CAMERA_TEXT_MIN_PIXELS: 1920 * 1080` — explicit rear lenses below 1080p revert to Auto; low-res streams are flagged
- `CAPTURE_SAMPLE_COUNT: 5` — capture the sharpest of five live frames (~125 ms each at 8 fps)
- `STAGE_MAX_LONG_SIDE`, `STAGE_JPEG_QUALITY`, `STAGE_SEND_DEBOUNCE_MS` — Projector stage output
- `STAGE_VIEWPORT_RETRY_MS`, `STAGE_READY_TIMEOUT_MS`, `STAGE_HEARTBEAT_MS`, `STAGE_ACK_TIMEOUT_MS` — Link B handshake
- `RECONNECT_BASE_MS`/`RECONNECT_MAX_MS`, `LINK_DISCONNECT_GRACE_MS` — auto-reconnect
- `APP_BUILD` — build label shown in every role; bump with each `v*` tag
- `CAPTURE_CLAHE_*`, `CAPTURE_UNSHARP_*`, `CAPTURE_JPEG_QUALITY` — Admin enhancement tunables

## Current status

**Live at:** `https://naveenmorla1901.github.io/omni-relay/`
**Signaling server:** `wss://omni-relay-production-d45c.up.railway.app` (Railway, `services/signaling/`, PORT=8081)
**Latest APK:** built by `build-android.yml` only when a `v*` tag is pushed (`assembleRelease`, debug-keystore signing) — pushing `main` does not rebuild the APK. v0.1.9 (Projector stage) built; v0.1.10 (always-live stage, handshake/acks, auto-reconnect) building. Bump `APP_BUILD` in `config/index.ts` with every tag

Completed: M0–M5 — scaffold, room-code pairing, live video, Admin capture gallery, Admin→Projector Link B, pure-TS quad detection + perspective warp. APK v0.1.6 was built from `01a7a59` and published to GitHub Releases. The 2026-10-20 device-testing backlog is implemented in code: 4K/detail camera tuning, fixed quad candidate NMS + synthetic regression tests, Re-lock redetect, auto-crop with Undo, 1–4× zoom, capture Download, front-camera mirror sync, and web Projector drag/drop + paste image/code. Follow-up work adds Admin per-capture Delete / per-thumbnail Delete / Clear all with confirmation, and a Recorder physical rear-lens picker (Auto 4K preferred, Ultra-wide, Main · high quality, Telephoto, numbered Android cameras; failed switches fall back to Auto). The v0.1.7 quality pass adds sharpest-of-3 Admin capture, CLAHE, luma-only sharpening, a 16 Mbps ceiling, and a 1080p text floor for explicit lenses. v0.1.8 fixes the native 720p reset and handheld blur (30 fps sensor, 8 fps encoder). v0.1.9 adds the full-screen Projector and the Admin phone-shaped stage, and raises capture to sharpest-of-5. v0.1.10 fixes the v0.1.9 device test: the "nothing sent" report was a stale Admin build, now caught by `stage-ready`/`stage-ack` and the visible build label; the stage is always live with a phone body and image-editor toolbar; the Admin top is a compact session bar with a big live feed; Recorder/Projector auto-reconnect and the Recorder stays awake and restarts its camera on wake. Local checks are green (typecheck, lint, 52 tests, web export).

Known issues: the deployed Railway relay runs pre-M4 code, drops `push`, expires rooms 30 min after creation, and lets a late socket close evict a rejoined peer (the client self-heals; `server.js` fixes both on redeploy); Link B therefore rides the `sdp` forward (verified against the live relay with a 600 KB frame). The camera quality/detection/zoom/delete/lens work still needs real-device verification. Some Android builds expose only one logical rear camera or expose 720p auxiliary cameras; v0.1.7 now rejects the latter and restores Auto. Native `react-native-webrtc` ignores focus/exposure/WB constraints, so manual focus/ISO/shutter requires a Vision Camera/Camera2 path.

Next: install APK v0.1.10, reload Admin (top bar v0.1.10), test live typing/images on the Projector phone and Recorder resume after screen-off, confirm Admin sees 2160×3840 with no low-res warning, then the M5 remainder (anti-moiré/raw-frame fallback) or the native still-capture path.
