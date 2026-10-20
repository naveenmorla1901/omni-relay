# ClearRelay — Project Status

> **Live progress tracker.** This file answers: what is done, what is not, and where we stopped.
> The canonical spec is [`ClearRelay-Build-Plan.md`](./ClearRelay-Build-Plan.md). When the spec and
> this file disagree on progress, this file wins; when they disagree on architecture, the plan wins
> unless a decision is recorded below.

**Last updated:** 2026-10-20
**Current milestone:** M1–M4 complete (web + Android APK). M5 CV pipeline complete (unsharp mask + auto-levels + quad detection + perspective warp). Android APK v0.1.4 runs on device.
**Current stop point:** Three-device session works end-to-end. After each capture, Admin auto-detects the document/screen quad (blue overlay shown), "Auto-crop" button warps perspective to a flat rectangle. Pure-TS implementation (no OpenCV.js needed) — grayscale → blur → Sobel → Otsu → diagonal corner projection → DLT homography → bilinear warp.
**Next action:** Test auto-crop on device; optionally add CLAHE adaptive contrast (M5 remainder) or move to M6 camera tuning.
**As of commit:** `a59d1ba` (main, clean tree)
**Blocker:** the deployed Railway relay runs pre-M4 code — Admin→Projector `push` fails in production until `services/signaling` is redeployed.

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
- [x] Native prebuild — Android permissions + react-native-webrtc wired; APK built via CI (`v*` tag)
- [ ] Native prebuild + dev-client build on iOS (requires macOS or EAS)
- [x] Styling decision: Tamagui/NativeWind deferred; plain StyleSheet is in use

### M1 — WebRTC loopback + pairing

- [x] `IConnection` web implementation (data channel + video transceiver)
- [x] `IConnection` native implementation (`react-native-webrtc`) — `connection.ts`
- [x] Non-trickle ICE gathering with timeout
- [x] SDP gzip + base64 compression (`fflate`, `CR1.` prefix)
- [x] Room-code pairing (6-char codes via WebSocket signaling relay) — primary pairing method
- [x] Two-browser-tab data-channel echo test (E2E verified: offer/answer, hello message, live video)
- [x] Unit tests for SDP compression (14 total passing)

### M2 — Live video Recorder → Admin

- [x] Web camera source (`getUserMedia`) behind `ICameraSource`
- [x] Native camera source (`react-native-webrtc` mediaDevices) — `camera.ts`
- [x] 3-attempt getUserMedia fallback chain; 4K ideal → HD min-floor → bare fallback
- [x] Rear camera default (`facingMode: environment`)
- [x] `flipCamera()`, `getActualSettings()`, `lockExposureFocusWhiteBalance()`
- [x] Remote video track render in Admin (web `<video>` element via `onVideoElement` prop)
- [x] Native local camera preview via `RTCView` in `video-view.tsx`
- [x] Encoder params re-applied at WebRTC connected state (`maintain-resolution`, low FPS, high bitrate)
- [x] `contentHint='detail'` on web video track for sharper WebRTC encoding
- [x] Camera settings display (resolution × fps · facingMode) in Recorder UI
- [x] Recorder shows connection status chip and camera controls (Re-lock, Flip, Stop/Start)
- [ ] Battery guard: pause camera/encoder when app backgrounds

### M3 — Admin capture + gallery

- [x] Capture at intrinsic video resolution (up to 4K if camera supports it)
- [x] CV pipeline on capture: contrast boost → unsharp mask (1.8) → percentile auto-levels → JPEG 97%
- [x] In-memory gallery (max 20) with thumbnail strip
- [x] `VideoView` exposes `onVideoElement` so Admin can draw to canvas from live `<video>` element
- [x] Large captured image preview in left pane with dimensions + timestamp
- [x] Rotate CCW / CW buttons (90° canvas rotation, updates gallery)
- [x] Zoom button opens image full-screen in Modal overlay (tap to dismiss)
- [x] Admin layout: left pane (flex:2) live feed + gallery + capture preview; right pane (flex:1) send controls

### M4 — Admin → Projector (Link B)

- [~] Second WebRTC session — deferred; using existing WS relay for push (already connected, sufficient for JPEG < 1 MB)
- [x] Image push via WS relay (`push` message type in server.js + signal-ws.ts)
- [x] Projector reassembles data-URL and renders image full-screen
- [x] Projector keeps last image until next push
- [x] "Send to Projector" button — explicit user action, not auto-triggered on capture
- [x] Right pane shows LINK B · READY / WAITING status
- [ ] Code push (M7 — needs OCR/render pipeline first)
- [ ] WebRTC data channel + chunking for large images (if WS relay becomes a bottleneck)

### M5 — CV enhancement pipeline

- [x] `src/lib/cv.ts` — unsharp mask (amount 1.8) + percentile auto-levels (0.5% clip) + JPEG 97%
- [x] `rotateImage()` — canvas-based 90/180/270/-90° JPEG rotation
- [x] `contentHint='detail'` on camera track
- [x] Quad/document edge detection (pure-TS: Sobel + Otsu + diagonal projection; no OpenCV.js needed)
- [x] Perspective warp to rectangle (DLT homography + bilinear inverse-map)
- [ ] CLAHE adaptive contrast
- [ ] EMA quad smoothing, movement threshold, re-detect
- [ ] Raw-frame fallback when no quad found

### M6 — Camera lock + clarity tuning

- [~] Exposure/focus/white-balance lock — web best-effort via `applyConstraints`; best-effort on native
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
- [x] `push` relay: forwards image data from admin to display peer
- [x] Deployed to Railway: `wss://omni-relay-production-d45c.up.railway.app` (root dir `services/signaling`, PORT=8081)
- [x] `SignalClient` — `pushToDisplay()` method, `push` message type
- [x] URL baked into `config/index.ts` default; overridable via `EXPO_PUBLIC_SIGNALING_URL`
- [ ] Dockerfile / self-host notes
- [ ] Optional TURN for hard NAT (needed when both peers on different carrier NAT)

### M9 — Resilience, polish, packaging

- [ ] Heartbeats and auto-reconnect
- [ ] Status UI and session PIN
- [ ] Full responsive Admin polish
- [x] Web deploy workflow (GitHub Pages, auto on push to main)
- [x] GitHub Actions Android APK workflow (`build-android.yml` — `assembleRelease` + debug keystore, triggers on `v*` tag or manual)
- [x] APK v0.1.4 published to GitHub Releases — runs on physical Android device
- [~] Smoke-test on physical Android device — app launches, camera shows, video transmits to Admin
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

- [x] Admin: left pane (flex:2) live feed + gallery + captured image preview
- [x] Admin: right pane (flex:1) explicit send-to-Projector controls
- [x] Admin: session panel with room code display and per-device status chips
- [x] Admin: gallery thumbnail strip (horizontal scroll, max 20 captures)
- [x] Admin: large captured image preview with rotate CCW/CW + zoom buttons
- [x] Admin: Image / Code tabs in send pane; send is explicit user action
- [x] Admin: LINK B READY/WAITING status in right pane header
- [x] Projector: 6-char code entry → "Connected to Admin" badge → full-screen image render
- [x] Recorder: code entry → camera auto-starts on connect → Re-lock / Flip / Stop controls
- [x] Recorder (native): local camera preview via RTCView
- [ ] Mobile Admin layout verification on physical device (tablet/large phone)

## Distribution

- [x] GitHub repo public at `https://github.com/naveenmorla1901/omni-relay`
- [x] GitHub Actions CI: typecheck, lint, tests, web export
- [x] GitHub Pages deploy workflow — live at `https://naveenmorla1901.github.io/omni-relay/`
- [x] `.npmrc` with fetch-retry hardening for CI
- [x] iOS personal use: add GitHub Pages URL to Safari home screen as PWA
- [x] Android APK CI: `assembleRelease` + debug-keystore signing; triggers on `v*` tag
- [x] APK v0.1.4 live at `github.com/naveenmorla1901/omni-relay/releases/latest`
- [x] Download APK button on home screen links to latest release
- [ ] Android keystore + signed release APK (for Play Store / wider distribution)

## Decisions

- **Serverless:** no cloud backend, media server, or database. Static GitHub Pages for web; signaling relay for room codes + image push only; media stays P2P.
- **Pairing:** room codes via WebSocket signaling relay. QR/copy-paste path removed from primary UI.
- **Signaling server:** plain JS (`server.js`) on Railway, root dir `services/signaling`, `node server.js`, PORT=8081.
- **Image push (M4):** via existing WS relay connection (`push` message type), not a second WebRTC session. Single message, no chunking — sufficient for JPEG ≤ 1 MB.
- **Projector naming:** UI uses **Projector**; wire role stays `display`.
- **Access key:** client-side gate only; `ACCESS_KEY` in `config/index.ts`; not a security boundary.
- **GitHub Pages base path:** `EXPO_BASE_URL=/omni-relay` injected by deploy workflow.
- **Android APK:** `assembleRelease` signed with the pre-installed debug keystore (appended to generated `build.gradle` in CI). No separate keystore secret needed for sideloading. `assembleDebug` was abandoned — debug builds load JS from Metro server and hang on real devices.
- **expo-dev-client removed:** caused the APK to show a "connect to dev server" launcher instead of the app. Not needed for a standalone build.
- **Unused native packages removed:** `react-native-worklets` (Vision Camera JSI module), `@expo/ui`, `expo-glass-effect`, `expo-image`, `expo-symbols`, `expo-device`, `expo-font`, `expo-web-browser` — all caused potential startup crashes or APK bloat. None were imported in source.
- **iOS personal use:** PWA via GitHub Pages (Safari → Add to Home Screen). No Apple Developer account needed.
- **Native WebRTC:** `react-native-webrtc` for both `IConnection` and `ICameraSource`. Do NOT add it to `expo.plugins` in `app.json` — it has no config plugin and crashes `expo export`.
- **Camera resolution:** first `getUserMedia` attempt asks for 4K (3840×2160) with 1280×720 floor; falls back gracefully. `contentHint='detail'` set on track.
- **CV pipeline:** `src/lib/cv.ts` — contrast boost (CSS filter) → unsharp mask (amount 1.8) → percentile auto-levels (0.5% tail clip) → JPEG 97%.
- **Image rotation:** canvas-based, applied in-place — updates `activeCapture.dataUrl` and mirrors into gallery array.

## Open questions / decisions needed

- [ ] TURN server needed for cross-carrier NAT (Recorder on mobile data + Admin on WiFi may fail ICE).
- [x] M5 quad detection: shipped pure-TS in `src/lib/quad.ts` — no OpenCV.js/WASM needed.
- [ ] Confirm end-to-end on real hardware across different networks.
- [ ] Decide whether pairing PIN/session secret is needed for real access control.

## Requested backlog (2026-10-20, from device testing)

- [ ] Recorder video quality: live feed still not clear enough for text — tune resolution/FPS/bitrate/encoder params and focus/exposure/white balance (web + native).
- [ ] Quad auto-detection reliability: blue overlay often missing on captures; clicking "Re-lock" should also re-trigger detection/auto-fit.
- [ ] Auto-fit: once a screen/document is detected, warp it into one flat frame automatically and adjust camera settings (exposure/focus/WB) automatically.
- [ ] Zoom: captured-image zoom modal / camera zoom doesn't zoom properly; source image is clear enough to zoom into.
- [ ] Download after capture: visible Download button on every Admin capture so the JPEG can be saved and inspected.
- [ ] Flip mirroring: when Recorder flips/switches camera, Admin's remote view must flip the same way (no mirrored text).
- [ ] Projector manual input: drag & drop image files from folders + paste (Ctrl+V) an image or code, with clearly visible UI affordances.

## Session log

- **2026-10-19** — M0 scaffold: Expo workspace, role routes, protocol/config modules, tests, lint, web export, access-key gate, GitHub Actions CI.
- **2026-10-19** — Git init, push to GitHub, Pages deploy workflow, dynamic `EXPO_BASE_URL`, public repo, Pages enabled.
- **2026-10-19** — Built-in access key, Pages live, M0 UI shell deployed.
- **2026-10-19** — M1/M2 web: browser `IConnection`, ICE, SDP compression, `ICameraSource`, QR/copy-paste pairing, live Recorder→Admin feed. 14 unit tests. E2E verified.
- **2026-10-19** — M3 + M8 + native + Android CI: room-code pairing, Admin screenshot gallery, camera improvements, encoder params, native `IConnection`/`ICameraSource`, Android APK CI workflow. Signaling server on Railway. All three roles end-to-end.
- **2026-10-19** — M4 + CV pipeline: Send to Projector live via WS relay push. CV: unsharp mask + auto-levels. `contentHint='detail'` on camera.
- **2026-10-20** — Android APK fixes: CI permissions (`contents: write`), `setup-java@v5`, removed `expo-dev-client` (dev launcher), removed unused native packages (`react-native-worklets` etc. causing silent startup crash), switched `assembleDebug` → `assembleRelease` + debug-keystore signing (debug builds don't embed JS bundle). APK v0.1.4 runs on device.
- **2026-10-20** — Native camera preview, admin redesign: `video-view.tsx` now renders `RTCView` for local stream on Android. Admin left pane wider (flex:2), capture stays in left pane (not auto-sent to right), rotate CCW/CW buttons, zoom modal. Camera tries 4K first. `rotateImage()` added to cv.ts.
- **2026-10-20** — M5 quad detection + perspective warp: `src/lib/quad.ts` — pure-TS, no OpenCV.js. Pipeline: grayscale → blur5x5 → Sobel → Otsu → diagonal corner projection → convexity validation → DLT homography → bilinear warp. Admin shows blue quad overlay after capture; "Auto-crop" button warps to flat rectangle.
- **2026-10-20** — Backlog recorded from device testing: Recorder quality, quad auto-detection reliability (incl. Re-lock re-trigger), auto-fit + auto camera settings, zoom fix, capture download button, flip mirroring on Admin, Projector drag-drop/paste input.
