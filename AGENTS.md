# AGENTS.md

ClearRelay is a greenfield Expo + WebRTC app. `ClearRelay-Build-Plan.md` is the canonical spec: read §1–5, §11, and §21 before architectural work. Build in M0→M9 order (§15) and keep each milestone demoable.

**Current state:** M0–M5 complete (web + Android APK v0.1.6). All three roles connect via 6-char room codes through the Railway WebSocket relay. Admin captures enhanced stills (unsharp mask + auto-levels in `src/lib/cv.ts`), detects and perspective-warps document quads in pure TS (`src/lib/quad.ts`, no OpenCV.js), and pushes images to the Projector full-screen via the WS relay. The 2026-10-20 device-testing backlog is implemented: 4K/detail camera tuning, fixed quad candidate NMS + regression tests, Re-lock redetect, auto-crop with Undo, 1–4× zoom, capture Download, front-camera mirror sync, and web Projector drag/drop + paste image/code. Follow-up work adds Admin per-capture Delete / Clear all (confirmed, session-only) and a Recorder physical rear-lens picker: Auto requests the default rear camera at up to 4K, with Ultra-wide / Main · high quality / Telephoto chips when the OS or browser exposes them. Native `IConnection`/`ICameraSource` use `react-native-webrtc`; `assembleRelease` APKs are published to GitHub Releases. Known blockers: the deployed Railway relay still runs pre-`push` code, so Admin→Projector push fails in production until `services/signaling` is redeployed; the camera/detection/zoom/delete/lens work still needs real-device verification, and some Android builds expose only one logical rear camera. Next: test Admin delete/clear and Recorder lens switching (Auto vs. Ultra-wide vs. Main) on APK v0.1.6, redeploy the relay, then the M5 remainder (CLAHE, raw-frame fallback) or M6 camera tuning. iOS personal use via PWA (GitHub Pages → Safari → Add to Home Screen).

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

- No central media server, database, auth, or persistence. The signaling helper (`services/signaling`, live on Railway) forwards SDP/ICE and Admin→Projector image pushes only; live media stays P2P.
- v1 is one Recorder→one Admin and one Admin→one Projector. Multi-projector, Admin→Recorder hints, and media recording are out of scope.
- Distribution target: static web export on GitHub Pages and a signed APK on GitHub Releases. Do not introduce EAS cloud or a hosted media server as a requirement.
- Work one backlog item from plan §16 at a time. If a genuine product decision blocks progress, ask instead of inventing scope.
- Update the current-state line above and the plan's roadmap when a milestone lands.

## Working with other agents

- One agent per working tree. For parallel work, create a separate `git worktree`; never run two agents in this checkout.
- Start every session by reading `PROJECT-STATUS.md` and comparing its **As of commit** to `git log`. If the notes and the code disagree, the code wins — fix the note.
- If `git status` shows changes you did not make, stop and ask before editing.
- Commit in small, logical chunks and push before switching agents. Uncommitted work never crosses machines.
- End every session by updating `PROJECT-STATUS.md`: current stop point, next action, session log, and the new **As of commit**.
