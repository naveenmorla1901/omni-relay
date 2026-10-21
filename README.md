# ClearRelay

A serverless, one-way screen relay built around legible text: **Recorder → Admin → Projector** over direct WebRTC connections.

- **Recorder** (phone camera) locks exposure/focus and streams low-FPS/high-resolution video to Admin over WebRTC (Link A).
- **Admin** watches the live feed, captures enhanced stills (sharpest of 5 frames, CLAHE, sharpening), and composes the Projector screen in a phone-shaped stage (Link B).
- **Projector** goes full-screen and shows exactly what is inside Admin's phone frame (called `display` in the protocol).

No cloud backend, media server, or persistence. A WebSocket relay handles room-code pairing only; media and images stay peer-to-peer or relay-routed at the application layer.

## Live links

| Target | URL |
| --- | --- |
| Web app | **https://naveenmorla1901.github.io/omni-relay/** |
| Signaling server | `wss://omni-relay-production-d45c.up.railway.app` |
| Android APK | **https://github.com/naveenmorla1901/omni-relay/releases/latest** |

## Status

M0–M5 + M8 complete. All three roles connect via 6-char room codes. Admin captures CV-enhanced stills and composes a phone-shaped Projector stage that appears full-screen on the Projector. Native Android camera/WebRTC wired; push a `v*` tag to build an APK via GitHub Actions (pushing `main` only redeploys the web app).

Full progress is in [`PROJECT-STATUS.md`](./PROJECT-STATUS.md). Architecture, milestones, protocol, and acceptance criteria are in [`ClearRelay-Build-Plan.md`](./ClearRelay-Build-Plan.md) (read §1–5, §11, §21 before changing architecture). Deployment notes are in [`docs/deployment.md`](./docs/deployment.md).

## Quick start — three-device session

All devices must open the HTTPS URL and enter the access key first.

### 1 — Admin: create a session

1. Open the web app → **Admin**.
2. Press **Create session** — a 6-character code appears (e.g. `AB3K7Z`).
3. Share the code verbally or by text with the Recorder and Projector operators.

### 2 — Recorder (phone): join and stream

1. Open the web app on the phone (or install the Android APK) → **Recorder**.
2. Enter the 6-character code and press **Connect**.
3. The rear camera starts automatically. Keep the phone steady — low-FPS, high-resolution mode prioritises text clarity.
4. Use **Re-lock** to re-apply exposure/focus lock after the scene stabilises. Use **Flip** to switch cameras.
5. In the Android app you can turn the screen off: a "ClearRelay Recorder" notification shows while the camera keeps streaming. Browsers stop the camera when the screen turns off.

### 3 — Projector (screen): join and display

1. Open the web app on the projector screen → **Projector**.
2. Enter the same 6-character code and press **Connect**.
3. The screen turns full-screen black and says **Connected to Admin**. Tap it for Full screen, Disconnect, the build number, or local drop/paste. If it says Admin is not answering, reload the Admin page so it runs the same version.

### 4 — Admin: capture and compose the Projector screen

1. Once the Recorder is live, press **Capture still** to grab the sharpest of five frames, enhanced for text.
2. The captured image appears in the gallery — tap any thumbnail to select it.
3. In **Projector screen** (the phone frame, matching the Projector's real shape), drop an image anywhere on the panel, press **Choose from files**, paste, or press **Use selected capture**. Drag to move; scroll or pinch to zoom toward the pointer, or use −/+ and the slider; **Fit**, **Fill**, **Center**, and **↻ 90°** reshape it; double-click switches Fit/Fill.
4. Type or paste text or code into the Text box — it appears on the Projector as you type. Set size, color, or code font; drag the text on the phone to place it.
5. Everything is live — there is no Send button. The status line reads **showing on the Projector** once the phone confirms a frame. **Upright/Sideways** turns the frame, **Black/White** sets the background, and **Clear Projector** blanks it.

If the network drops, the Recorder and Projector reconnect with the same code on their own.

Holding the Recorder phone sideways? Use **Rotate** (0° / 90° / 180° / 270°) above the Admin live feed; captures come out with the same rotation.

> The deployed relay expires rooms 30 minutes after creation. Admin says so when it happens — start a new session and enter the new code.

## Requirements

- Node.js `22.13+` (`.nvmrc` pins 22.13.0; Expo 58 requires it)
- npm 10+
- Camera testing requires `localhost` or an HTTPS origin

## Access key

The app asks for a key before showing roles. The built-in key is `ACCESS_KEY` in `apps/mobile-web/src/config/index.ts`. Change that string and redeploy to rotate it. No server or GitHub secret is involved.

This is a client-side gate, not authentication — the key is in the public JS bundle. See [`docs/deployment.md`](./docs/deployment.md) for details.

## Commands

Run from the repository root:

| Command | Purpose |
| --- | --- |
| `npm install` | Install all workspace dependencies |
| `npm run web` | Start the Expo web dev server |
| `npm run start` | Start Expo for a native dev client |
| `npm run typecheck` | TypeScript strict mode |
| `npm run lint` | ESLint via `expo lint` |
| `npm test` | Vitest unit tests |
| `npm run export:web` | Static web export (run after touching connection/camera/CV imports) |

Single test file: `npm test -- src/protocol/messages.test.ts`

## Repository layout

```
apps/mobile-web/
  src/app/            expo-router routes: index, recorder, admin, projector, pair
  src/connection/     IConnection WebRTC boundary (connection.web.ts / connection.ts)
  src/camera/         ICameraSource boundary (camera.web.ts / camera.ts)
  src/lib/cv.ts       Image enhancement: unsharp mask + auto-levels (web-only)
  src/protocol/       Versioned wire protocol + unit tests
  src/hooks/          use-pairing: room-code state machine
  src/store/          Zustand session state
  src/config/         All tunables (FPS, bitrate, signaling URL, …)
services/signaling/   WebSocket relay server (server.js — plain Node.js, deployed on Railway)
docs/                 Deployment and distribution notes
```

Native projects are not committed. Generate with `npx expo prebuild` when targeting native. Android application ID: `com.clearrelay.app`.
