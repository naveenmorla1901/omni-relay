# ClearRelay

A serverless, one-way screen relay built around legible text: **Recorder → Admin → Projector** over direct WebRTC connections.

- **Recorder** (phone camera) locks exposure/focus, finds the screen or page, and streams low-FPS/high-resolution video.
- **Admin** watches the live feed, captures full-resolution stills, and pushes an image or code string onward.
- **Projector** renders the latest push full-screen (called `display` in the original plan/protocol).

There is no cloud backend, media server, or persistence. An optional signaling helper eases remote pairing; media always stays peer-to-peer.

## Status

M0 scaffold is in place: access-key gate, Expo Router role picker, Admin/Projector shells, pairing-mode selection, shared protocol/config modules, and unit tests. The web export is verified; native prebuild/dev-client builds have not been run yet. WebRTC, camera, and CV work start at M1.

Live progress and the exact stop point are tracked in [`PROJECT-STATUS.md`](./PROJECT-STATUS.md). The canonical architecture, milestones, protocol, and acceptance criteria live in [`ClearRelay-Build-Plan.md`](./ClearRelay-Build-Plan.md). Read sections 1–5, 11, and 21 before changing architecture. Distribution and APK notes are in [`docs/deployment.md`](./docs/deployment.md).

## Requirements

- Node.js `22.13+` (`.nvmrc` pins 22.13.0; Expo 58 requires it)
- npm 10+
- For camera testing: a browser on `localhost` or any HTTPS origin

## Access key

The app asks for a key before showing roles, including when a role URL is opened directly. Copy `.env.example` to `.env` and replace the placeholder, or set the build-time key list (comma-separated) before sharing a build:

```powershell
$env:EXPO_PUBLIC_ACCESS_KEYS = "key-one,key-two"
npm run export:web
```

```bash
EXPO_PUBLIC_ACCESS_KEYS="key-one,key-two" npm run export:web
```

The development fallback is `clearrelay-demo`. This is a local front-door, not authentication — the key is embedded in the bundle and can be extracted. See `docs/deployment.md` for the limitation and the pairing-PIN follow-up.

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
