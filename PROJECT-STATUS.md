# ClearRelay — Project Status

> **Live progress tracker.** This file answers: what is done, what is not, and where we stopped.
> The canonical spec is [`ClearRelay-Build-Plan.md`](./ClearRelay-Build-Plan.md). When the spec and
> this file disagree on progress, this file wins; when they disagree on architecture, the plan wins
> unless a decision is recorded below.

**Last updated:** 2026-10-20
**Current milestone:** M0–M5 complete (web + Android APK v0.1.5). Device-testing backlog implemented: 4K/detail camera tuning, robust quad detection, auto-fit with Undo, 1–4× zoom, capture Download, camera-flip mirror sync, Projector drag/drop + paste.
**Current stop point:** All requested backlog items are implemented in code and the local checks are green (typecheck, lint, 20 unit tests, web export). The Admin capture now detects screens reliably in synthetic tests (the candidate NMS bug that made detection return null was fixed), auto-crops after a 450 ms preview by default, keeps the original in the gallery, and offers Undo. Download, 1–4× zoom, mirror sync, and Projector local input are wired. Web is deployed; APK v0.1.5 was built from `d66f92a` and published. Real-device verification is still pending.
**Next action:** Install APK v0.1.5 on the Android Recorder and test with the web Admin: 4K/detail quality, detection on a real screen, auto-crop/Undo, Download, front-camera mirror, and Projector drag/drop/paste. Then redeploy the Railway signaling relay from current `main` and re-run the remote create/join/push test.
**As of commit:** `d66f92a` (main; APK v0.1.5 built from this commit; later docs commits are metadata)
**Blocker:** the deployed Railway relay runs pre-M4 code — Admin→Projector `push` fails in production until `services/signaling` is redeployed. Real-device verification of the new detection/quality work is also pending.

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
- [x] Unit tests for SDP compression (suite now 20 total)

### M2 — Live video Recorder → Admin

- [x] Web camera source (`getUserMedia`) behind `ICameraSource`
- [x] Native camera source (`react-native-webrtc` mediaDevices) — `camera.ts`
- [x] 3-attempt getUserMedia fallback chain: 4K preferred → 1080p → 480p; `contentHint='detail'`
- [x] Auto exposure/focus/white-balance settle (`CAMERA_AUTO_SETTLE_MS`) before lock; best-effort lock on web/native
- [x] Rear camera default (`facingMode: environment`)
- [x] `flipCamera()`, `getActualSettings()`, `lockExposureFocusWhiteBalance()`; facing mode + mirror state sent to Admin over the data channel
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
- [x] Zoom button opens a 1–4× zoomable modal with +/− controls and scroll-to-pan
- [x] Download button on every capture (web anchor download; native shows a web-only hint)
- [x] Detect again button + "No screen detected" feedback; Re-lock on Recorder re-triggers detection
- [x] Auto-crop on detection (default on, 450 ms overlay preview); cropped image is added as a new gallery entry, original preserved; Undo crop restores the original
- [x] Admin layout: left pane (flex:2) live feed + gallery + capture preview; right pane (flex:1) send controls

### M4 — Admin → Projector (Link B)

- [~] Second WebRTC session — deferred; using existing WS relay for push (already connected, sufficient for JPEG < 1 MB)
- [x] Image push via WS relay (`push` message type in server.js + signal-ws.ts)
- [x] Projector reassembles data-URL and renders image full-screen
- [x] Projector keeps last image until next push
- [x] Projector manual input (web): drag & drop image files, "Choose image…" picker, Ctrl+V image/code; local-only, no upload
- [x] Projector local content is clearly labeled with "Show Admin content" / "Clear local content" controls; paste into the room-code field is ignored
- [x] "Send to Projector" button — explicit user action, not auto-triggered on capture
- [x] Right pane shows LINK B · READY / WAITING status
- [ ] Code push from Admin (M7 — needs OCR/render pipeline first); local paste already displays code on the Projector
- [ ] WebRTC data channel + chunking for large images (if WS relay becomes a bottleneck)

### M5 — CV enhancement pipeline

- [x] `src/lib/cv.ts` — unsharp mask (amount 1.8) + percentile auto-levels (0.5% clip) + JPEG 97%
- [x] `rotateImage()` — canvas-based 90/180/270/-90° JPEG rotation
- [x] `contentHint='detail'` on camera track
- [x] Quad/document edge detection (pure-TS: Sobel + Otsu + diagonal projection; no OpenCV.js needed)
- [x] Perspective warp to rectangle (DLT homography + bilinear inverse-map)
- [x] Fixed candidate NMS bug — the detector used to delete real corners and return `null` on a clean synthetic screen; it now keeps the highest-scoring spatially distinct candidates. Regression tests in `src/lib/quad.test.ts` (axis-aligned, perspective, flat image).
- [x] Detection budget: max 10 candidates per quadrant + 1.5 s time cap so a capture cannot freeze the UI
- [x] EMA quad smoothing, movement threshold, re-detect — applied when re-detecting a still; live-frame continuous smoothing is not wired
- [ ] CLAHE adaptive contrast
- [ ] Raw-frame fallback when no quad found

### M6 — Camera lock + clarity tuning

- [~] Exposure/focus/white-balance lock — auto-adjust (`continuous`) then settle, then best-effort manual lock via `applyConstraints`; web/native support varies
- [~] Recorder quality — 4K preferred, `contentHint='detail'`, encoder `maintain-resolution` + high bitrate; needs real-device verification
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
- [x] APK v0.1.5 published to GitHub Releases — built from `d66f92a`; install and run the device-testing backlog checklist
- [x] APK v0.1.4 published to GitHub Releases — previous build, superseded by v0.1.5
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
- [x] Admin: large captured image preview with rotate CCW/CW + 1–4× zoom
- [x] Admin: Download, Detect again, Auto-crop toggle, Undo crop
- [x] Admin: Image / Code tabs in send pane; send is explicit user action
- [x] Admin: LINK B READY/WAITING status in right pane header
- [x] Projector: 6-char code entry → "Connected to Admin" badge → full-screen image render
- [x] Projector: drag/drop + file picker + paste image/code, visible even before joining (web); native shows a web-only hint
- [x] Recorder: code entry → camera auto-starts on connect → Re-lock / Flip / Stop controls
- [x] Recorder: front-camera flip mirrors the local preview and the Admin remote view
- [x] Recorder (native): local camera preview via RTCView
- [ ] Mobile Admin layout verification on physical device (tablet/large phone)

## Distribution

- [x] GitHub repo public at `https://github.com/naveenmorla1901/omni-relay`
- [x] GitHub Actions CI: typecheck, lint, tests, web export
- [x] GitHub Pages deploy workflow — live at `https://naveenmorla1901.github.io/omni-relay/`
- [x] `.npmrc` with fetch-retry hardening for CI
- [x] iOS personal use: add GitHub Pages URL to Safari home screen as PWA
- [x] Android APK CI: `assembleRelease` + debug-keystore signing; triggers on `v*` tag
- [x] APK v0.1.5 live at `github.com/naveenmorla1901/omni-relay/releases/latest`
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
- **Camera resolution:** first `getUserMedia` attempt asks for 4K (3840×2160) with 1280×720 floor; falls back to 1080p, then 480p. `contentHint='detail'` set on track.
- **CV pipeline:** `src/lib/cv.ts` — contrast boost (CSS filter) → unsharp mask (amount 1.8) → percentile auto-levels (0.5% tail clip) → JPEG 97%.
- **Image rotation:** canvas-based, applied in-place — updates `activeCapture.dataUrl` and mirrors into gallery array.
- **Quad detector candidate NMS:** keep the highest-scoring spatially distinct edge points per quadrant (max 10); never delete an existing candidate when a nearby point arrives. The old logic deleted real corners and made detection return `null`. Synthetic regression tests live in `src/lib/quad.test.ts`.
- **Auto-crop:** `AUTO_CROP_ON_DETECT = true` by default. After a 450 ms overlay preview, the detected quad is warped into a **new** gallery entry; the original stays in the gallery, and Undo crop restores it. Turn the toggle off to inspect the blue overlay and crop manually.
- **Download:** web-only anchor download of the active JPEG (`src/lib/download.web.ts`); native `Alert` fallback because Admin capture uses `HTMLVideoElement`/canvas and is effectively web-only today.
- **Projector local input:** web-only drag/drop, file picker, and Ctrl+V image/code. Content stays in the browser tab (no upload). The paste listener ignores `INPUT`/`TEXTAREA`/contenteditable targets so it cannot hijack the room-code field. Native shows a web-only hint.
- **Mirror sync:** Recorder sends `camera` with `facingMode` + `mirrored`; front camera (`facingMode='user'`) mirrors both the local Recorder preview and the Admin remote `<video>`/`RTCView`. Physical orientation sync (rotating the whole Admin view) is **not** implemented.

## Open questions / decisions needed

- [ ] TURN server needed for cross-carrier NAT (Recorder on mobile data + Admin on WiFi may fail ICE).
- [x] M5 quad detection: shipped pure-TS in `src/lib/quad.ts` — no OpenCV.js/WASM needed.
- [ ] Confirm end-to-end on real hardware across different networks.
- [ ] Decide whether pairing PIN/session secret is needed for real access control.
- [ ] Confirm flip semantics: current implementation mirrors the front camera on both Recorder and Admin. If "flip" meant rotating the Admin view when the phone is physically rotated to landscape, that orientation-sync feature is still missing.

## Requested backlog (2026-10-20, from device testing)

> All seven items now have working code and green local checks. `[~]` means the code is in place but still needs the real-device test that motivated the request.

- [~] Recorder video quality: 4K preferred with 1080p/480p fallback, `contentHint='detail'`, `maintain-resolution` + 8 Mbps, auto exposure/focus/WB settle + lock. **Needs device verification**; use the new Download button to inspect the final JPEG.
- [~] Quad auto-detection reliability: fixed the candidate NMS bug that made the detector return `null` even on a clean synthetic screen; synthetic regression tests pass. Re-lock now re-triggers Admin detection, and Admin has a Detect again button. **Needs a real-screen test** (glare/angle/texture).
- [~] Auto-fit: detection auto-crops after 450 ms by default; original is kept in the gallery and Undo crop restores it; camera auto-adjust/lock runs on start and Re-lock. **Needs device verification** of detection accuracy and whether the browser honors the camera constraints.
- [x] Zoom: 1–4× modal with +/− controls and scroll/drag to pan; the old static modal is gone.
- [x] Download after capture: visible Download button in the capture section; saves the active JPEG (web). Native shows a web-only hint.
- [~] Flip mirroring: front-camera flip mirrors the Recorder preview and Admin remote view; `camera`/`redetect` protocol messages have tests. **Confirm whether mirroring (current) or physical orientation sync is what you meant.**
- [x] Projector manual input: visible drop zone on the Projector page (even before joining), file picker, Ctrl+V image/code, local preview, and Show Admin content/Clear controls (web). Native shows a web-only hint.

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
- **2026-10-20** — Audit + backlog implementation: found and fixed the quad detector NMS bug (it deleted real corners and returned `null` on clean screens), added `quad.test.ts` synthetic regression tests, capped candidates at 10 with a 1.5 s detection budget, fixed the Re-lock redetect loop with a request-id guard, added the Download helper/button, replaced the static zoom modal with a 1–4× scrollable modal, wired front-camera mirror sync (`camera` message + `mirror` prop on both VideoViews), added auto-crop-on-detect with original-preserving gallery entries + Undo, and added the web Projector drop zone/file picker/paste image-or-code (with local preview and input-safe paste). Checks: typecheck, lint, 20 tests, web export all green.
- **2026-10-20** — Pushed `b9f9354` (code) + `d66f92a` (docs); CI and Deploy web green. Tagged `v0.1.5`; the Android workflow built and published `ClearRelay-v0.1.5.apk` (135 MB). Railway relay redeploy still pending.
