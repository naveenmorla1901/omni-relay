# ClearRelay — Project Status

> **Live progress tracker.** This file answers: what is done, what is not, and where we stopped.
> The canonical spec is [`ClearRelay-Build-Plan.md`](./ClearRelay-Build-Plan.md). When the spec and
> this file disagree on progress, this file wins; when they disagree on architecture, the plan wins
> unless a decision is recorded below.

**Last updated:** 2026-10-19
**Current milestone:** M1–M4 web complete + M8 signaling server live. All three roles connect via 6-char room codes. Admin pushes enhanced captures to Projector full-screen via WS relay. CV enhancement pipeline (unsharp mask + auto-levels) applied on every capture.
**Current stop point:** Admin can push JPEG captures to the Projector full-screen via the existing WS relay connection. CV pipeline: contrast boost → unsharp mask (amount 1.8) → percentile auto-levels → JPEG 97%. Camera `contentHint='detail'` set on web to bias WebRTC encoder toward sharpness. M5 (OpenCV.js quad detection + perspective warp) is next.
**Next action:** M5 — quad/document detection on video frames (OpenCV.js worker), perspective warp, and CLAHE.

## How to update this file

At the end of every working session:

1. Flip checkboxes and set `[~]` for partial work.
2. Update **Last updated**, **Current stop point**, and **Next action**.
3. Add one dated line to the session log.
4. If a product or architecture decision changed, add it to **Decisions**.

Legend: `[x]` done · `[~]` in progress/partial · `[ ]` not started · `[!]` blocked/needs a decision

## Milestones

### M0 — Scaffold

- [x] npm workspace root with scripts and lockfile
- [x] Expo 58 app with expo-router, strict TypeScript, and Zustand
- [x] Role picker with Recorder, Admin, Projector
- [x] Access-key gate before role selection
- [x] Shared protocol module and unit tests
- [x] Central config module
- [x] ESLint, Vitest, typecheck, static web export
- [x] Web export verified (all routes render statically)
- [x] App identity: `com.clearrelay.app`, scheme `clearrelay`
- [~] Native prebuild — Android permissions + react-native-webrtc wired; prebuild not run in CI yet (APK tag not pushed)
- [ ] Native prebuild + dev-client build on iOS (requires macOS or EAS)
- [x] Styling decision: Tamagui/NativeWind deferred; plain StyleSheet is in use

### M1 — WebRTC loopback + pairing

- [x] `IConnection` web implementation (data channel + video transceiver)
- [x] `IConnection` native implementation (`react-native-webrtc`) — `connection.ts`
- [x] Non-trickle ICE gathering with timeout
- [x] SDP gzip + base64 compression (`fflate`, `CR1.` prefix)
- [ ] Chunked/animated QR fallback — not needed; room-code path supersedes QR for remote pairing
- [x] Room-code pairing (6-char codes via WebSocket signaling relay) — replaces QR as primary pairing method
- [x] Two-browser-tab data-channel echo test (E2E verified: offer/answer, hello message, live video)
- [x] Unit tests for SDP compression (14 total passing)

### M2 — Live video Recorder → Admin

- [x] Web camera source (`getUserMedia`) behind `ICameraSource`
- [x] Native camera source (`react-native-webrtc` mediaDevices) — `camera.ts`
- [x] 3-attempt getUserMedia fallback chain with HD min-floor constraints
- [x] Rear camera default (`facingMode: environment`)
- [x] `flipCamera()`, `getActualSettings()`, `lockExposureFocusWhiteBalance()`
- [x] Remote video track render in Admin
- [x] Encoder params re-applied at WebRTC connected state (`maintain-resolution`, low FPS, high bitrate)
- [x] Camera settings display (resolution × fps · facingMode) in Recorder UI
- [x] Recorder shows connection status chip and camera controls (Re-lock, Flip, Stop/Start)
- [ ] Battery guard: pause camera/encoder when app backgrounds

### M3 — Admin capture + gallery

- [x] Capture at intrinsic video resolution (`video.videoWidth × video.videoHeight`)
- [x] CSS filter on canvas (`contrast(1.3) brightness(1.05) saturate(0.75)`) for text clarity
- [x] In-memory gallery with thumbnails and full preview pane
- [x] `VideoView` exposes `onVideoElement` so Admin can draw to canvas from the live `<video>` element
- [ ] Crop / rotate / enhance controls
- [x] Two-pane Admin layout: live feed left, send-to-Projector right

### M4 — Admin → Projector (Link B)

- [~] Second WebRTC session — deferred; using WS relay for push (simpler, already connected)
- [~] Image chunking — deferred; single WS message works for JPEG ≤1 MB
- [x] Projector reassembly and full-screen image render
- [x] Projector keeps the last item until the next push
- [x] Admin sends from gallery (image tab) to Projector — "Send to Projector" button live
- [ ] Code push (M7 — needs OCR/render pipeline first)

### M5 — CV enhancement pipeline

- [x] Unsharp mask (amount 1.8) + percentile auto-levels in `src/lib/cv.ts`
- [x] `contentHint='detail'` on web video track for WebRTC encoder quality
- [ ] Quad detection on web (OpenCV.js worker)
- [ ] Quad detection on native (frame processor)
- [ ] Perspective warp + CLAHE
- [ ] EMA smoothing, movement threshold, re-detect
- [ ] Raw-frame fallback when no quad is found

### M6 — Camera lock + clarity tuning

- [~] Exposure/focus/white-balance lock after convergence (web best-effort via `applyConstraints`; native same)
- [ ] Torch control and glare warning
- [ ] Quality presets (Clarity / Balanced)
- [ ] Anti-moiré and codec tests
- [ ] Clarity acceptance test: ~11px source code remains readable after Admin capture

### M7 — Code mode + OCR

- [ ] OCR capture (ML Kit native / tesseract.js web)
- [ ] Editable extracted text with confidence gate
- [ ] `render-code` push and syntax highlighting
- [ ] Auto-fit font size and themes on Projector

### M8 — Signaling helper + remote pairing

- [x] `services/signaling/server.js` WebSocket room server (plain JS, no build step)
- [x] 6-char room codes (confusable chars excluded); rooms expire after 30 min
- [x] Deployed to Railway: `wss://omni-relay-production-d45c.up.railway.app` (root dir `services/signaling`, PORT=8081)
- [x] `SignalClient` browser class (`signal-ws.ts`) with 10 s connect timeout
- [x] URL baked into `config/index.ts` default; overridable via `EXPO_PUBLIC_SIGNALING_URL`
- [ ] Dockerfile / self-host notes
- [ ] Optional TURN for hard NAT

### M9 — Resilience, polish, packaging

- [ ] Heartbeats and auto-reconnect
- [ ] Status UI and session PIN
- [ ] Full responsive Admin polish
- [x] Web deploy workflow (GitHub Pages, auto on push to main)
- [x] GitHub Actions Android APK workflow (`build-android.yml`, triggers on `v*` tags)
- [ ] Push `v0.1.0` tag to produce first APK in GitHub Releases
- [ ] Install and smoke-test the APK on a physical Android device
- [ ] iOS build (PWA via Pages is the personal-use path; EAS for wider distribution)
- [ ] Final device matrix and release checklist

## Access and identity

- [x] Local access-key gate on the home screen and every role route
- [x] Built-in client-side key `ACCESS_KEY = 'Thiswillbekey1901'` in `config/index.ts`
- [x] Optional extra keys via `EXPO_PUBLIC_ACCESS_KEYS`
- [x] Session-only unlock; **Lock session** returns to the gate
- [x] Access gate unit tests (accept, reject, lock clears role)
- [x] Key rotation by editing `ACCESS_KEY` and redeploying
- [!] Not authentication — key is in the public bundle. Do not treat as a security boundary.

## Admin / Projector UX

- [x] Admin: left live-feed pane + right send-to-Projector pane
- [x] Admin: session panel with room code display and per-device status chips
- [x] Admin: screenshot gallery with thumbnail strip and preview
- [x] Admin: Image / Code tabs in send pane (Code tab is draft UI; send action is M4)
- [x] Projector: 6-char code entry → "Connected to Admin" badge → content placeholder
- [x] Recorder: code entry → camera auto-starts on connect → Re-lock / Flip / Stop controls
- [ ] Projector full-screen image render (M4)
- [ ] Mobile Admin layout verification on physical device

## Distribution

- [x] GitHub repo public at `https://github.com/naveenmorla1901/omni-relay`
- [x] GitHub Actions CI: typecheck, lint, tests, web export
- [x] GitHub Pages deploy workflow — live at `https://naveenmorla1901.github.io/omni-relay/`
- [x] `.npmrc` with fetch-retry hardening for CI
- [x] iOS personal use: add GitHub Pages URL to Safari home screen as PWA
- [x] Android APK CI workflow ready (`build-android.yml` — `assembleDebug`, triggers on `v*` tag or manual)
- [x] Download APK button on home screen links to `github.com/naveenmorla1901/omni-relay/releases/latest`
- [ ] Push `v0.1.0` tag → first APK in GitHub Releases
- [ ] Android keystore + signed release APK (future)

## Decisions

- **Serverless definition:** no cloud backend, media server, or database. Static GitHub Pages for web UI; signaling relay for room codes only; media stays P2P.
- **Pairing:** room codes via WebSocket signaling relay (M8 pulled forward). QR/copy-paste path still works but is no longer the primary UI.
- **Signaling server:** plain JS (`server.js`) on Railway, root dir `services/signaling`, `node server.js`, PORT=8081. URL baked into `config/index.ts` default.
- **Projector naming:** UI uses **Projector**; wire role stays `display`.
- **Access key:** client-side gate only; `ACCESS_KEY` in `config/index.ts`; not a security boundary.
- **GitHub Pages base path:** `EXPO_BASE_URL=/omni-relay` injected by deploy workflow.
- **Android APK:** `assembleDebug` (no keystore needed); publish to GitHub Releases via `v*` tag.
- **iOS personal use:** PWA via GitHub Pages (Safari → Add to Home Screen). No Apple Developer account needed.
- **Native WebRTC:** `react-native-webrtc` for both `IConnection` and `ICameraSource`. Do NOT add it to `expo.plugins` in `app.json` — it has no config plugin and crashes the web export.
- **Camera capture quality:** intrinsic resolution (`video.videoWidth × video.videoHeight`) + canvas CSS filter (`contrast(1.3) brightness(1.05) saturate(0.75)`).

## Open questions / decisions needed

- [ ] Push `v0.1.0` tag when ready to produce the first Android APK.
- [ ] Confirm end-to-end three-device session on real hardware (Admin laptop + Recorder phone + Projector screen).
- [ ] M4 Link B design: direct WebRTC session between Admin and Projector, or relay through signaling server?
- [ ] Decide whether pairing PIN/session secret is needed for real access control.

## Session log

- **2026-10-19** — M0 scaffold: Expo workspace, role routes, protocol/config modules, tests, lint, web export, access-key gate, GitHub Actions CI.
- **2026-10-19** — Git init, push to GitHub, Pages deploy workflow, dynamic `EXPO_BASE_URL`, public repo, Pages enabled.
- **2026-10-19** — Built-in access key, Pages live, M0 UI shell deployed.
- **2026-10-19** — M1/M2 web: browser `IConnection`, ICE, SDP compression, `ICameraSource`, QR/copy-paste pairing, live Recorder→Admin feed. 14 unit tests. E2E verified.
- **2026-10-19** — M3 + M8 + native + Android CI: room-code pairing via WebSocket relay (`signal-ws.ts` + `server.js`), Admin screenshot gallery at intrinsic resolution, camera improvements (fallback chain, rear-camera default, flip, re-lock, settings display), encoder params fix, `IConnection`/`ICameraSource` native implementations (`react-native-webrtc`), Android APK GitHub Actions workflow, Download APK button on home screen. Signaling server deployed to Railway (`wss://omni-relay-production-d45c.up.railway.app`). All three roles connecting end-to-end. CLAUDE.md added.
- **2026-10-19** — M4 + CV pipeline: "Send to Projector" button live — Admin pushes JPEG captures to Projector via WS relay; Projector renders full-screen. CV enhancement: contrast boost → unsharp mask (amount 1.8) → percentile auto-levels → JPEG 97%. `contentHint='detail'` on camera track for sharper WebRTC encoding. Server.js `push` relay case added.
