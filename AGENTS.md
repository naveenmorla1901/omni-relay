# AGENTS.md

ClearRelay is a greenfield Expo + WebRTC app. `ClearRelay-Build-Plan.md` is the canonical spec: read §1–5, §11, and §21 before architectural work. Build in M0→M9 order (§15) and keep each milestone demoable.

**Current state:** M1–M3 web + M8 signaling are done. All three roles connect via 6-char room codes through a Railway WebSocket relay (`wss://omni-relay-production-d45c.up.railway.app`). Admin shows live feed from Recorder and captures full-resolution stills in an in-memory gallery. Native `IConnection`/`ICameraSource` are implemented via `react-native-webrtc`. Android APK CI workflow is ready (push a `v*` tag to build). iOS personal use via PWA (GitHub Pages → Safari → Add to Home Screen). M4 (Admin→Projector Link B) is next.

**Progress tracking:** `PROJECT-STATUS.md` is the live checklist and stop point. At the end of every working session, update its checkboxes, current stop point, next action, and session log. Do not let it drift from the code.

## Environment and commands

- Run npm commands from the repository root. `npm install` uses npm workspaces (`apps/*`, `services/*`); installing inside `apps/mobile-web` bypasses the root lockfile.
- Node `22.13+` is required by Expo 58 (`.nvmrc` pins 22.13.0). Older Node produces unsupported-engine warnings and may break newer tooling.
- On Windows, npm 10 can miss platform-native optional binaries. If Vitest or a web export fails with a missing `*.node` module, install that exact package at the root with `npm i --no-save <pkg>@<version>`.
- Native projects are not committed. After native modules land, use `npx expo prebuild` then `npx expo run:ios` / `npx expo run:android`; iOS requires macOS. Expo Go cannot load Vision Camera or `react-native-webrtc`.
- The access key is the client-side `ACCESS_KEY` constant in `src/config/index.ts`; change it there and redeploy. `EXPO_PUBLIC_ACCESS_KEYS` can add extra keys, but no repository secret is required. The key is public in the bundle. Distribution, GitHub Pages, and APK signing are covered in `docs/deployment.md`.
- `EXPO_BASE_URL` adds a static export base path (the GitHub Pages workflow sets `/omni-relay`). Do not set it for local dev.

```bash
npm run web            # Expo web dev server
npm run start          # Expo dev server for a native dev client
npm run typecheck      # strict TypeScript
npm run lint           # ESLint (expo lint)
npm test               # Vitest unit tests
npm test -- src/protocol/messages.test.ts   # single test file
npm run export:web     # static export to apps/mobile-web/dist
```

`npm run export:web` is the check that catches native-only imports leaking into the web bundle. Run it after touching connection, camera, or CV imports.

## Architecture and conventions

- Expo Router's root is `apps/mobile-web/src/app`, not `app/`; the tree in the build plan is aspirational. `@/*` maps to `apps/mobile-web/src/*`.
- **Projector is the UI name for the plan's `display` role.** The wire role stays `display`; `/display` is a redirect alias for `/projector`. Keep this mapping unless the protocol is deliberately versioned.
- Put every tunable in `src/config/index.ts` (plan §17). Do not hard-code FPS, bitrate, resolution, chunk size, or thresholds in feature code.
- `src/protocol/messages.ts` is the versioned wire contract. Do not change the meaning of existing `v: 1` messages; add new types and tests instead. `parseMessage` must stay strict about malformed JSON, unknown types, and wrong versions.
- The platform split is non-negotiable (plan §2.3): shared code imports only `IConnection` and `ICameraSource`. Never import `react-native-webrtc` or `react-native-vision-camera` from web code. Put implementations behind `.web.ts` / `.native.ts` and verify with `npm run export:web`.
- M0 styling is plain React Native `StyleSheet` with tokens in `src/constants/theme.ts`. The plan allows Tamagui or NativeWind, but adding a styling library requires a deliberate choice, a web-export check, and an update here.
- Session state is ephemeral Zustand (`src/store/session.ts`). No persistence, analytics, or uploads.
- The access key is a local front-door checked in `src/store/session.ts`, not authentication. It is embedded in builds. Do not build authorization or secret media access on top of it; use pairing PINs/signaling for that. Role routes are wrapped in `AccessBoundary` so direct URLs cannot skip the gate.
- Keep `tsconfig.json` extending `expo/tsconfig.base.json` with the `.json` suffix. Vitest 3's Vite resolver fails on the bare `expo/tsconfig.base` specifier.

## Testing and acceptance

- Vitest covers pure TS units only; there is no component or end-to-end harness yet. Follow `src/protocol/messages.test.ts`.
- Integration testing needs two browser contexts on `localhost` or HTTPS with camera permission. The real-device matrix is in plan §14.
- Clarity is the go/no-go criterion (plan §9): ~11px source code photographed from a screen must remain readable after Admin capture. Do not trade resolution for frame rate.

## Scope guardrails

- No central media server, database, auth, or persistence. The optional signaling helper only forwards SDP/ICE, never media, and belongs in `services/signaling` (M8, not built).
- v1 is one Recorder→one Admin and one Admin→one Projector. Multi-projector, Admin→Recorder hints, and media recording are out of scope.
- Distribution target: static web export on GitHub Pages and a signed APK on GitHub Releases. Do not introduce EAS cloud or a hosted media server as a requirement.
- Work one backlog item from plan §16 at a time. If a genuine product decision blocks progress, ask instead of inventing scope.
- Update the current-state line above and the plan's roadmap when a milestone lands.
