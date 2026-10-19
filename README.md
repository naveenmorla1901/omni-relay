# ClearRelay

A serverless, one-way screen relay built around legible text: **Recorder → Admin → Projector** over direct WebRTC connections.

- **Recorder** (phone camera) locks exposure/focus, finds the screen or page, and streams low-FPS/high-resolution video.
- **Admin** watches the live feed, captures full-resolution stills, and pushes an image or code string onward.
- **Projector** renders the latest push full-screen (called `display` in the original plan/protocol).

There is no cloud backend, media server, or persistence. An optional signaling helper eases remote pairing; media always stays peer-to-peer.

## Status

M0 scaffold is in place (access-key gate, Expo Router role picker, Admin/Projector shells, pairing-mode selection, shared protocol/config modules, and unit tests), plus the web half of M1/M2: the browser Recorder pairs with Admin by compressed QR code or copy/paste text, streams camera video over WebRTC, and Admin renders the live remote track. Native `IConnection`/`ICameraSource` are stubs; no APK yet. M3 capture/gallery is next.

Live progress and the exact stop point are tracked in [`PROJECT-STATUS.md`](./PROJECT-STATUS.md). The canonical architecture, milestones, protocol, and acceptance criteria live in [`ClearRelay-Build-Plan.md`](./ClearRelay-Build-Plan.md). Read sections 1–5, 11, and 21 before changing architecture. Distribution and APK notes are in [`docs/deployment.md`](./docs/deployment.md).

## Web app

The GitHub Pages target is **https://naveenmorla1901.github.io/omni-relay/** once the deploy workflow has run. One-time setup:

1. Open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Run the **Deploy web** workflow or push to `main`.

The first toggle must be done in Settings; the workflow cannot enable Pages with the default token. After that, deployments are automatic. No repository secret is needed — the access key is built into the client. This repository is public, so Pages is available on the Free plan; a Pages site is publicly reachable regardless of repo visibility.

### Live feed quick start (Recorder → Admin)

Both devices must open the HTTPS URL (camera access is blocked on plain HTTP) and enter the access key.

1. **Recorder phone:** tap **Recorder → Create invite**. A QR code and a text code appear.
2. **Admin device:** tap **Admin → Scan Recorder invite** (or paste the text code into the invite field) and press **Create answer**.
3. **Recorder phone:** tap **Scan QR** and point it at the Admin answer, or paste the answer code and press **Connect**.
4. The Recorder camera starts automatically, and the Admin live-feed pane shows the stream.

If scanning is awkward, use **Copy code** on one side and paste it on the other; both paths are first-class. Keep both browser tabs awake — locking the phone screen pauses the camera. The phone's rear camera is used by default.

## Requirements

- Node.js `22.13+` (`.nvmrc` pins 22.13.0; Expo 58 requires it)
- npm 10+
- For camera testing: a browser on `localhost` or any HTTPS origin

## Access key

The app asks for a key before showing roles, including when a role URL is opened directly. The built-in key is the `ACCESS_KEY` constant in `apps/mobile-web/src/config/index.ts`; change that string to change the key. No server or GitHub secret is involved. Optional extra keys can be added with the build-time `EXPO_PUBLIC_ACCESS_KEYS` variable.

This is a client-side gate, not authentication — the key is embedded in the public bundle and can be extracted. See `docs/deployment.md` for the limitation and the pairing-PIN follow-up.

## Commands

Run from the repository root:

| Command | Purpose |
| --- | --- |
| `npm install` | Install all workspace dependencies |
| `npm run web` | Start the Expo web dev server |
| `npm run start` | Start Expo for a native dev client |
| `npm run android` / `npm run ios` | Start on an Android/iOS target |
| `npm run typecheck` | TypeScript, strict mode |
| `npm run lint` | ESLint via `expo lint` |
| `npm test` | Vitest unit tests |
| `npm run export:web` | Static web export to `apps/mobile-web/dist` |

Single test file:

```bash
npm test -- src/protocol/messages.test.ts
```

## Repository layout

```
apps/mobile-web/          Expo app (all three roles)
  src/app/                expo-router routes: index, recorder, admin, projector, pair
  src/connection/         IConnection WebRTC boundary
  src/camera/             ICameraSource camera boundary
  src/protocol/           versioned wire protocol + tests
  src/store/              Zustand session state
  src/config/             all tunables
services/                 reserved for the optional signaling helper (M8)
```

Native projects are not committed; generate them with `npx expo prebuild` when native modules land. Android application ID: `com.clearrelay.app`.
