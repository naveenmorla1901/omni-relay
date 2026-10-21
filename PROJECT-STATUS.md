# ClearRelay — Project Status

> **Live progress tracker.** This file answers: what is done, what is not, and where we stopped.
> The canonical spec is [`ClearRelay-Build-Plan.md`](./ClearRelay-Build-Plan.md). When the spec and
> this file disagree on progress, this file wins; when they disagree on architecture, the plan wins
> unless a decision is recorded below.

**Last updated:** 2026-10-21
**Current milestone:** M0–M5 complete (web + Android APK v0.1.11 released; v0.1.12 building). v0.1.11 (user-confirmed) added screen-off Recorder streaming, live-feed rotation and a wider Projector pane. v0.1.12 is a clarity pass from 10 device captures: defocus-aware focus recovery, chroma anti-moiré, bicubic crop warp, sharp-everywhere frame selection, and a focus tip naming the soft edge.
**Current stop point:** v0.1.12 implemented (`4a5dcb8`). Diagnosis from 5 originals + 5 crops (all 3840×2160): edge sharpness fell from ~0.9 at the bottom to ~0.6 at the top, equal in x and y → defocus from the tilted phone (far edge outside the depth of field), not motion; crops were softer everywhere (~0.55) because the warp sampled bilinearly (0.79 → 0.61 on a shift test; bicubic 0.67). Measured on the same samples through the new code: captures top band 0.64 → 0.80, crops 0.55 → 0.85 (Gemini) and 0.68 → 0.88 (Gmail), visually crisper without halos. Focus recovery costs ~1.6 s per 4K frame. Checks: typecheck, lint, 64 tests, web export green; capture → auto-crop verified in Chrome on a real sample with no console errors.
**Next action:** Reload Admin (v0.1.12) and install APK v0.1.12, capture the same Gemini/Gmail screens and compare the top lines with the old downloads. If the tip says the top/left was out of focus, try holding the phone square to the monitor or one step back. If text is still too soft, the next lever is a native full-resolution still (Camera2) instead of a video frame.
**As of commit:** `4a5dcb8` (focus recovery + bicubic warp; tagged v0.1.12 with the docs commit)
**Blocker:** none for Link B — the deployed relay drops `push`, so the Projector stage rides the relay's `sdp` forward (`kind: 'stage'`), verified live. Real-device verification of the quality/lens/delete work is still pending. `react-native-webrtc` ignores advanced focus/exposure constraints on native, so Re-lock is only best-effort there; manual ISO/shutter/focus and native still-photo capture need a Vision Camera/Camera2 path. Some Android builds expose only one logical rear camera, and some explicit lenses only support 720p, so Ultra-wide may remain unavailable or be rejected by the text floor.

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
- [x] Unit tests for SDP compression (suite now 33 total)

### M2 — Live video Recorder → Admin

- [x] Web camera source (`getUserMedia`) behind `ICameraSource`
- [x] Native camera source (`react-native-webrtc` mediaDevices) — `camera.ts`
- [x] 3-attempt getUserMedia fallback chain: 4K preferred → 1080p → 480p; `contentHint='detail'`
- [x] Camera sensor runs at `CAMERA_CAPTURE_FPS` (30) so auto-exposure cannot pick ~1/8 s shutters that smear handheld text; the encoder still caps at `TARGET_FPS` (8). Web keeps focus/exposure continuous and locks only white balance after `CAMERA_AUTO_SETTLE_MS`. Native tuning calls are no-ops: react-native-webrtc's `applyConstraints({advanced})` fills missing size/fps with 1280×720@30 defaults, which silently dropped the live stream to 720×1280 and reset the selected lens.
- [x] Rear camera default (`facingMode: environment`)
- [x] `flipCamera()`, `getActualSettings()`, `lockWhiteBalance()`; facing mode + mirror state sent to Admin over the data channel
- [x] Physical rear-lens discovery + picker: Auto (4K preferred), Ultra-wide, Main · high quality, Telephoto, and numbered Android cameras. Web uses `enumerateDevices`/`deviceId`; native uses react-native-webrtc Camera2/AVFoundation devices. A failed switch falls back to Auto.
- [x] Text-quality floor for explicit lenses: streams below 1080p (including the observed 528×960 and 720×1280 lens profiles) are rejected and Auto is restored with a visible explanation. Recorder and Admin both warn when the active stream is below 1080p.
- [x] Remote video track render in Admin (web `<video>` element via `onVideoElement` prop)
- [x] Native local camera preview via `RTCView` in `video-view.tsx`
- [x] Encoder params re-applied at WebRTC connected state and after native lens track replacement (`maintain-resolution`, 8 FPS, 16 Mbps ceiling)
- [x] `contentHint='detail'` on web video track for sharper WebRTC encoding
- [x] Camera settings display (resolution × fps · facingMode) in Recorder UI
- [x] Recorder shows connection status chip and camera controls (Re-lock, Flip, Stop/Start)
- [x] Recorder streams with the screen off (Android APK): camera-type foreground service with notification, partial wake lock, and high-perf Wi-Fi lock while connected and streaming; stops with the session. Falls back to keep-awake + camera restart on wake if Android refuses the service. Browsers cannot stream with the screen off.
- [ ] Battery guard: pause camera/encoder when app backgrounds

### M3 — Admin capture + gallery

- [x] Capture at intrinsic video resolution (up to 4K if camera supports it)
- [x] Capture the sharpest of 3 live frames before enhancement
- [x] CV pipeline on capture: contrast/brightness → percentile auto-levels → CLAHE local contrast → luma-only unsharp mask → JPEG 97%
- [x] Low-resolution stream warning in Admin (below 1080p) with guidance
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
- [x] Image push via WS relay (`push` message type in server.js + signal-ws.ts) — superseded: the deployed relay drops `push`
- [x] Projector stage over the relay's `sdp` forward (`kind: 'stage'`): `viewport` (Projector → Admin), `stage-frame` / `stage-clear` (Admin → Projector); verified against the live relay
- [x] Projector full-screen when connected: black stage, keep-awake, status bar hidden, tap for Full screen / Disconnect / local drop-paste
- [x] Admin phone-shaped stage (`components/projector-stage.web.tsx`): phone body with camera cut-out at the Projector's exact aspect, always live (no Send/Live toggle), drop anywhere on the panel or Choose from files / paste / use selected capture, drag to move with automatic text-vs-image picking, zoom toward cursor or pinch, −/+ and slider, Fit/Fill/Center/rotate/remove, double-click Fit↔Fill, typed or pasted text (size, color, code font, no language needed), Upright/Sideways, black/white background, Clear Projector
- [x] Projector reassembles data-URL and renders image full-screen
- [x] Projector keeps last image until next push
- [x] Projector manual input (web): drag & drop image files, "Choose image…" picker, Ctrl+V image/code; local-only, no upload
- [x] Projector local content is clearly labeled with "Show Admin content" / "Clear local content" controls; paste into the room-code field is ignored
- [x] Admin content reaches the Projector only from the stage (always live), never automatically on capture
- [x] Admin↔Projector handshake: Admin answers `viewport` with `stage-ready`; Projector acks frames with `stage-ack`; Projector warns when no current Admin answers, Admin warns when a frame is not confirmed
- [x] Projector double-buffers frames (decode hidden, then swap) so live typing never flashes black
- [x] Projector heartbeat (viewport every 15 s) and rejoin when Admin stops answering
- [x] Right pane shows LINK B · READY / WAITING status
- [ ] Code push from Admin (M7 — needs OCR/render pipeline first); local paste already displays code on the Projector
- [ ] WebRTC data channel + chunking for large images (if WS relay becomes a bottleneck)

### M5 — CV enhancement pipeline

- [x] `src/lib/cv.ts` — sharpest-of-5 capture (3×3 grid geometric-mean score) → contrast/brightness → percentile auto-levels (0.5% clip) → CLAHE → luma-only unsharp mask → focus recovery (`lib/focus-recovery.ts`: chroma-only anti-moiré smoothing, per-tile defocus map, two-scale luma sharpening weighted by it, overshoot clamped to the local 5×5 range) → JPEG 97%
- [x] `src/lib/image-quality.ts` — pure luma sharpness score, auto-levels, CLAHE (8×8 tiles, bilinear LUTs), and luma-only unsharp; tested in `image-quality.test.ts`
- [x] `rotateImage()` — canvas-based 90/180/270/-90° JPEG rotation
- [x] `contentHint='detail'` on camera track
- [x] Quad/document edge detection (pure-TS: Sobel + Otsu + diagonal projection; no OpenCV.js needed)
- [x] Perspective warp to rectangle (DLT homography + Catmull-Rom bicubic inverse-map, then a light focus-recovery pass; bilinear used to soften every crop)
- [x] Fixed candidate NMS bug — the detector used to delete real corners and return `null` on a clean synthetic screen; it now keeps the highest-scoring spatially distinct candidates. Regression tests in `src/lib/quad.test.ts` (axis-aligned, perspective, flat image).
- [x] Detection budget: max 10 candidates per quadrant + 1.5 s time cap so a capture cannot freeze the UI
- [x] EMA quad smoothing, movement threshold, re-detect — applied when re-detecting a still; live-frame continuous smoothing is not wired
- [x] CLAHE adaptive contrast
- [x] Anti-moiré: chroma-only low-pass inside focus recovery (glyph edges are luma, so text is untouched)
- [ ] Codec tests
- [ ] Raw-frame fallback when no quad found

### M6 — Camera lock + clarity tuning

- [~] Exposure/focus/white-balance lock — auto-adjust (`continuous`) then settle, then best-effort manual lock via `applyConstraints`; web support varies. Native `react-native-webrtc` drops advanced focus/exposure constraints, so native focus stays hardware-auto and Re-lock has no effect there.
- [~] Recorder quality — 4K preferred, `contentHint='detail'`, encoder `maintain-resolution`, 8 FPS, 16 Mbps ceiling; encoder params are re-applied after native lens track replacement. Admin keeps the sharpest of three frames and runs CLAHE + luma-only sharpening. Needs real-device verification.
- [~] Physical lens access — use Ultra-wide for a close screen and Main · high quality for maximum text clarity. Support depends on the phone/browser exposing physical lenses as separate devices; some Android builds merge them. Explicit lenses below 1080p are rejected and Auto is restored. Needs device verification.
- [ ] Native still-photo capture and manual ISO/shutter/focus (Vision Camera or Camera2) — current captures are enhanced WebRTC video frames, not sensor stills.
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
- [x] `SignalClient` — `relayStage()` sends Link B over the `sdp` forward (`pushToDisplay()` removed; `push` still received for newer relays)
- [x] URL baked into `config/index.ts` default; overridable via `EXPO_PUBLIC_SIGNALING_URL`
- [ ] Dockerfile / self-host notes
- [ ] Optional TURN for hard NAT (needed when both peers on different carrier NAT)

### M9 — Resilience, polish, packaging

- [x] Auto-reconnect: Recorder/Projector rejoin the same room with backoff when the relay socket drops or the app returns to the foreground; Recorder re-offers Link A on ICE failure (4 s grace on `disconnected`) and on an unanswered offer; Admin builds a fresh peer connection per offer
- [~] Heartbeats: Projector viewport heartbeat only; no Link A heartbeat
- [ ] Status UI and session PIN
- [~] Admin layout: compact session bar, full-width workspace, live feed sized to the window on the left, phone stage on the right; stacked below 1000 px
- [x] Web deploy workflow (GitHub Pages, auto on push to main)
- [x] GitHub Actions Android APK workflow (`build-android.yml` — `assembleRelease` + debug keystore, triggers on `v*` tag or manual)
- [~] APK v0.1.11 release — screen-off Recorder streaming (foreground service), live-feed rotation, wider Projector pane; GitHub Actions build and device test pending
- [x] APK v0.1.10 release — always-live stage, handshake/acks, auto-reconnect; user confirmed the stage works as expected
- [x] APK v0.1.9 release — full-screen Projector + Admin phone-shaped stage; device test found the stale-Admin and Recorder-sleep issues fixed in v0.1.10
- [x] APK v0.1.8 release — native 720p-reset fix + 30 fps capture; built by GitHub Actions, camera quality confirmed on device
- [x] APK v0.1.7 release — tagged from `f890fba`; superseded by v0.1.8
- [x] APK v0.1.6 published to GitHub Releases — built from `01a7a59`; superseded by v0.1.7
- [x] APK v0.1.5 published to GitHub Releases — previous build, superseded by v0.1.6
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
- [x] Admin: right pane is the phone-shaped Projector stage
- [x] Admin: compact session bar — room code, Recorder/Projector chips, build, End session, Lock
- [x] Admin: gallery thumbnail strip (horizontal scroll, max 20 captures)
- [x] Admin: per-capture Delete, per-thumbnail Delete, and Clear all with a confirmation modal. Deleting the active frame selects the next capture or clears the preview and cancels in-flight detection/crop.
- [x] Admin: large captured image preview with rotate CCW/CW + 1–4× zoom
- [x] Admin: Download, Detect again, Auto-crop toggle, Undo crop
- [x] Admin: no Send button — the stage is always live
- [x] Admin: LINK B READY/WAITING status in right pane header
- [x] Projector: 6-char code entry → true full-screen stage that mirrors Admin's phone frame
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
- [x] APK v0.1.6 live at `github.com/naveenmorla1901/omni-relay/releases/latest` (superseded by the v0.1.7 build)
- [~] APK v0.1.11 build — GitHub Actions publish pending
- [x] Download APK button on home screen links to latest release
- [ ] Android keystore + signed release APK (for Play Store / wider distribution)

## Decisions

- **Serverless:** no cloud backend, media server, or database. Static GitHub Pages for web; signaling relay for room codes + Link B stage frames only; media stays P2P.
- **Pairing:** room codes via WebSocket signaling relay. QR/copy-paste path removed from primary UI.
- **Signaling server:** plain JS (`server.js`) on Railway, root dir `services/signaling`, `node server.js`, PORT=8081.
- **Link B transport:** via the existing WS relay connection, not a second WebRTC session. Originally the `push` message; since 2026-10-20 the relay's `sdp` forward with `kind: 'stage'`, because the deployed relay drops `push`. Single message, no chunking — stage JPEGs are ≤ ~1 MB and the live relay forwards 8 MB (measured 2026-10-21).
- **Stage handshake (2026-10-21):** `stage-ready` (Admin → Projector, answering `viewport`) and `stage-ack` (Projector → Admin, frame id) are new v1 stage messages. They make a stale Admin visible instead of silent, and let the Projector detect a lost relay slot and rejoin.
- **Always-live stage:** no Send button or Live toggle; every settled edit (250 ms debounce) and every Projector rejoin sends the current frame. Shape presets were removed: the stage is the Projector phone's real shape, Upright or Sideways.
- **Auto-reconnect:** Recorder/Projector keep their room code and rejoin silently (1 s → 15 s backoff). A Recorder whose P2P link is still connected does not re-offer after a socket-only drop. The deployed relay deletes a role's slot when *any* socket of that role closes, so a dead socket closing late can evict its replacement; the client self-heals (unanswered offer → rejoin; Projector heartbeat without `stage-ready` → rejoin). `server.js` now ignores such late closes and expires rooms after 30 idle minutes, effective on the next relay redeploy.
- **Screen-off streaming (2026-10-21):** Android revokes camera access from apps without a camera foreground service once the screen is off, and react-native-webrtc has no lifecycle hooks of its own, so a camera-type foreground service is enough to keep capture + encode running. It is a local Expo module (`apps/mobile-web/modules/recorder-service`, Kotlin, autolinked by prebuild) rather than a third-party package. It must start while the Recorder is visible and after camera permission (Android 14). It also holds a partial wake lock and a high-perf Wi-Fi lock; battery use is the trade-off the user asked for. JS timers pause in the background on Android, so relay reconnects run when the app is next opened; the P2P video does not depend on them.
- **Live-feed rotation:** display-only CSS rotation of the Admin `<video>` plus the same rotation applied to captures (`rotateImage`). The Recorder still sends sensor frames unchanged.
- **Build label:** `APP_BUILD` in `config/index.ts` is shown in every role and must be bumped with each `v*` tag.
- **Projector naming:** UI uses **Projector**; wire role stays `display`.
- **Access key:** client-side gate only; `ACCESS_KEY` in `config/index.ts`; not a security boundary.
- **GitHub Pages base path:** `EXPO_BASE_URL=/omni-relay` injected by deploy workflow.
- **Android APK:** `assembleRelease` signed with the pre-installed debug keystore (appended to generated `build.gradle` in CI). No separate keystore secret needed for sideloading. `assembleDebug` was abandoned — debug builds load JS from Metro server and hang on real devices.
- **expo-dev-client removed:** caused the APK to show a "connect to dev server" launcher instead of the app. Not needed for a standalone build.
- **Unused native packages removed:** `react-native-worklets` (Vision Camera JSI module), `@expo/ui`, `expo-glass-effect`, `expo-image`, `expo-symbols`, `expo-device`, `expo-font`, `expo-web-browser` — all caused potential startup crashes or APK bloat. None were imported in source.
- **iOS personal use:** PWA via GitHub Pages (Safari → Add to Home Screen). No Apple Developer account needed.
- **Native WebRTC:** `react-native-webrtc` for both `IConnection` and `ICameraSource`. Do NOT add it to `expo.plugins` in `app.json` — it has no config plugin and crashes `expo export`.
- **Camera resolution:** first `getUserMedia` attempt asks for 4K (3840×2160) with 1280×720 floor; falls back to 1080p, then 480p. `contentHint='detail'` set on track. The encoder ceiling is 16 Mbps and `degradationPreference='maintain-resolution'`; native params are re-applied after `replaceTrack` on a lens switch.
- **CV pipeline:** `src/lib/cv.ts` — capture the sharpest of 5 live frames (3×3-grid geometric mean of Laplacian variance on a 480px thumbnail, so a frame sharp only at its near edge loses) → CSS contrast 1.15/brightness 1.03 → percentile auto-levels (0.5% tail clip) → CLAHE (8×8 tiles, clip 2.2, strength 0.55) → luma-only unsharp mask (amount 1.2, threshold 2) → focus recovery → JPEG 97%. The pure pixel functions live in `src/lib/image-quality.ts` and `src/lib/focus-recovery.ts`; the base pass benchmarks around 0.4 s and focus recovery ~1.6 s per 4K frame on this machine.
- **Focus recovery (2026-10-21):** device captures of a tilted monitor are defocused toward the far edge; sharpening is therefore spatially adaptive (defocus map on a 12×8 grid, deficit vs the 85th-percentile tile) instead of uniform, and every result is clamped to its local 5×5 range + 3 levels (crops: +0) so text gets steeper edges without halos. A second, lighter pass runs after the crop warp. Tunables: `CAPTURE_FOCUS_*`, `CAPTURE_CHROMA_SIGMA`, `CROP_FOCUS_*`, `FOCUS_SOFT_EDGE_SPREAD`. Optics still win: Admin names the soft edge and suggests holding the phone square to the screen or stepping back.
- **Explicit-lens text floor:** explicit rear-lens selections that deliver fewer than 1920×1080 pixels are rejected and the Recorder restarts Auto. This was added after device samples showed explicit-lens streams at 528×960 and 720×1280, which post-processing cannot make text-readable. Both Recorder and Admin display a warning for any remaining low-resolution stream.
- **Native camera-control limit:** `react-native-webrtc`'s native constraint normalizer only forwards deviceId/facingMode/frameRate/width/height, so `focusMode`/`exposureMode`/`whiteBalanceMode` are ignored on Android/iOS. Manual ISO/shutter/focus and `photoQualityPrioritization` require a Vision Camera/Camera2 still-capture path; the current Admin capture is an enhanced WebRTC frame.
- **Image rotation:** canvas-based, applied in-place — updates `activeCapture.dataUrl` and mirrors into gallery array.
- **Quad detector candidate NMS:** keep the highest-scoring spatially distinct edge points per quadrant (max 10); never delete an existing candidate when a nearby point arrives. The old logic deleted real corners and made detection return `null`. Synthetic regression tests live in `src/lib/quad.test.ts`.
- **Auto-crop:** `AUTO_CROP_ON_DETECT = true` by default. After a 450 ms overlay preview, the detected quad is warped into a **new** gallery entry; the original stays in the gallery, and Undo crop restores it. Turn the toggle off to inspect the blue overlay and crop manually.
- **Download:** web-only anchor download of the active JPEG (`src/lib/download.web.ts`); native `Alert` fallback because Admin capture uses `HTMLVideoElement`/canvas and is effectively web-only today.
- **Projector local input:** web-only drag/drop, file picker, and Ctrl+V image/code. Content stays in the browser tab (no upload). The paste listener ignores `INPUT`/`TEXTAREA`/contenteditable targets so it cannot hijack the room-code field. Native shows a web-only hint.
- **Mirror sync:** Recorder sends `camera` with `facingMode` + `mirrored`; front camera (`facingMode='user'`) mirrors both the local Recorder preview and the Admin remote `<video>`/`RTCView`. Physical orientation sync (rotating the whole Admin view) is **not** implemented.
- **Rear-lens selection:** the Recorder lists physical rear cameras via `enumerateDevices` and restarts the camera with the selected `deviceId`. Auto uses the default rear camera and keeps the 4K request. Lenses are classified from labels when possible (Ultra-wide / Main · high quality / Telephoto); numbered Android cameras are shown as `Rear camera N`. A failed switch restarts Auto. Explicit selections that resolve below 1080p are also treated as failed and restart Auto, because the observed 528×960/720×1280 lens profiles cannot preserve small text. This cannot invent an ultra-wide lens if the OS/browser exposes only one rear camera.
- **Capture quality pass (2026-10-20):** downloaded samples showed the 4K frames were readable but soft, while three explicit-lens frames were 528×960/720×1280 and unrecoverable. Keep the 4K Auto lens as the quality default, select the sharpest of 3 frames, apply local contrast and luma-only sharpening, and raise the bitrate ceiling to 16 Mbps. Do not upscale low-resolution captures; warn and fix the lens/stream instead.
- **Admin delete/clear:** deletion is session-only and confirmed in a modal. Deleting the active capture selects the next one or clears the preview; in-flight detection/crop is cancelled. Clear all empties the 20-item gallery and resets the active preview. No upload or persistence.

## Open questions / decisions needed

- [ ] TURN server needed for cross-carrier NAT (Recorder on mobile data + Admin on WiFi may fail ICE).
- [x] M5 quad detection: shipped pure-TS in `src/lib/quad.ts` — no OpenCV.js/WASM needed.
- [ ] Confirm end-to-end on real hardware across different networks.
- [ ] Decide whether pairing PIN/session secret is needed for real access control.
- [ ] Confirm flip semantics: current implementation mirrors the front camera on both Recorder and Admin. If "flip" meant rotating the Admin view when the phone is physically rotated to landscape, that orientation-sync feature is still missing.
- [ ] On the physical Android test, note which numbered rear camera gives the widest view and which gives 4K. v0.1.7 rejects explicit streams below 1080p and restores Auto; confirm the labels/fallbacks match the observed 528×960 and 720×1280 cameras. If the OS exposes only one rear camera, Ultra-wide remains unavailable until we add a custom Camera2/Vision Camera native path.
- [ ] Decide whether to adopt a native still-photo path (Vision Camera/Camera2) for manual ISO/shutter/focus and `photoQualityPrioritization`; this is the main remaining gap versus a dedicated camera app.

## Requested backlog (2026-10-20, from device testing)

> All seven items now have working code and green local checks. `[~]` means the code is in place but still needs the real-device test that motivated the request.

- [~] Recorder video quality: 4K preferred with 1080p/480p fallback, `contentHint='detail'`, `maintain-resolution` + 16 Mbps, best-of-3 Admin frame selection, CLAHE + luma-only sharpening, auto exposure/focus/WB settle + best-effort lock. **Needs device verification**; use the new Download button to inspect the final JPEG.
- [~] Capture-quality review from 12 downloaded samples: the three 4K originals/final crops were readable but soft, with some moiré; the three explicit-lens captures were only 528×960/720×1280 and unrecoverable. Added the sharpest-frame/CLAHE/luma-sharpen pipeline and the 1080p explicit-lens floor. **Needs v0.1.7 device verification.**
- [~] Quad auto-detection reliability: fixed the candidate NMS bug that made the detector return `null` even on a clean synthetic screen; synthetic regression tests pass. Re-lock now re-triggers Admin detection, and Admin has a Detect again button. **Needs a real-screen test** (glare/angle/texture).
- [~] Auto-fit: detection auto-crops after 450 ms by default; original is kept in the gallery and Undo crop restores it; camera auto-adjust/lock runs on start and Re-lock. **Needs device verification** of detection accuracy and whether the browser honors the camera constraints.
- [x] Zoom: 1–4× modal with +/− controls and scroll/drag to pan; the old static modal is gone.
- [x] Download after capture: visible Download button in the capture section; saves the active JPEG (web). Native shows a web-only hint.
- [~] Flip mirroring: front-camera flip mirrors the Recorder preview and Admin remote view; `camera`/`redetect` protocol messages have tests. **Confirm whether mirroring (current) or physical orientation sync is what you meant.**
- [x] Projector manual input: visible drop zone on the Projector page (even before joining), file picker, Ctrl+V image/code, local preview, and Show Admin content/Clear controls (web). Native shows a web-only hint.

## Follow-up backlog (2026-10-20, second pass)

- [~] Admin: delete individual pictures and clear the gallery for a clearer view. Per-capture Delete, per-thumbnail Delete, and Clear all are implemented with confirmation; live web bundle verified, interactive browser test pending.
- [~] Recorder: access wide-angle and high-quality lenses. Physical rear-lens picker implemented: Auto (4K preferred), Ultra-wide, Main · high quality, Telephoto, and numbered Android cameras when exposed; failed switches fall back to Auto, and explicit lenses below 1080p now restore Auto with an explanation. APK v0.1.7 build is pending; needs Android/iOS device test.

## Requested backlog (2026-10-21, from the v0.1.9 device test)

- [x] Projector showed "Connected… waiting" while Admin said "Sent": the Admin was a stale pre-v0.1.9 build (its Send to Projector button and Language field no longer exist) still sending `push`. Fixed by the handshake/acks and the visible build label. **Reload Admin to v0.1.10.**
- [x] Admin stage looked like a monitor: now a phone body (rounded, camera cut-out, side buttons) at the Projector's real shape.
- [x] No Send button: the stage is always live, including typed text; no language field.
- [x] Image from files: drop anywhere on the stage panel, Choose from files button inside the empty phone, paste, or use the selected capture.
- [x] Easier image editing: zoom toward cursor/pinch, −/+ buttons and slider, Fit / Fill / Center / rotate, double-click Fit↔Fill.
- [x] Big session box removed: compact session bar; live feed takes the left, the phone stage the right.
- [~] Recorder stopped after the phone screen went off: v0.1.10 added keep-awake, camera restart on wake, Link A re-offer and room rejoin; v0.1.11 adds the camera foreground service so the camera keeps streaming with the screen off. **Needs device verification.**

## Requested backlog (2026-10-21, second pass)

- [x] Rotate the live feed 0/90/180/270 from the Admin feed header; remembered per browser; captures come out with the same rotation so a sideways Recorder phone gives upright stills.
- [x] Less space for the live feed, more for the Projector: right pane ~55% of the width, phone beside its controls, feed sized to its pane.
- [~] Camera must keep running with the screen off (mandatory): Android camera foreground service in `modules/recorder-service`. **Needs device verification**; the web Recorder cannot do this.

## Requested backlog (2026-10-21, clarity pass)

- [x] Top of captures blurry: measured as defocus from the tilted phone (not motion, not resolution — captures are 3840×2160). Added defocus-aware focus recovery, bicubic crop warp, grid frame scoring, and a soft-edge tip in Admin. Measured top-band edge sharpness 0.55–0.68 → 0.85–0.88 on the user's crops. **Needs device comparison.**
- [ ] If still not clear enough: native full-resolution still capture (Camera2 via the local Expo module; pause WebRTC capture for ~1 s) instead of a WebRTC video frame.

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
- **2026-10-20** — Admin delete/clear + physical lens picker: added per-capture Delete, per-thumbnail Delete, and Clear all with a confirmation modal; deleting the active frame selects the next or clears the preview and cancels in-flight detection/crop. Added `src/camera/lenses.ts` + tests to classify iPhone/Android lens labels and a Recorder lens picker (Auto 4K preferred, Ultra-wide, Main · high quality, Telephoto, numbered Android cameras). Added `setFacingMode`/`deviceId` to camera settings, mapped native `facing`, avoided the web enumerateDevices probe while streaming, and fall back to Auto if a lens switch fails. Checks: typecheck, lint, 26 tests, web export green. Code commit `01a7a59`.
- **2026-10-20** — Pushed `214e9a5` (docs); CI and Deploy web green. Live bundle verified to contain the new Admin Delete/Clear all and Recorder Camera lens / Auto 4K / Ultra-wide / high-quality UI. Tagged `v0.1.6` at `01a7a59`; the Android workflow built and published `ClearRelay-v0.1.6.apk` (135,044,026 bytes). Railway relay redeploy and real-device verification still pending.
- **2026-10-21** — v0.1.12 clarity pass: analysed 10 device captures (bands of edge sharpness; x≈y so defocus), prototyped in Python on the samples, ported to `lib/focus-recovery.ts` and verified the TS output on the same files (top band 0.64 → 0.80, crops 0.55 → 0.85). Bicubic warp, grid frame score, soft-edge tip. 64 tests, web export green; capture/crop verified in Chrome. Code commit `4a5dcb8`.
- **2026-10-21** — v0.1.11: user confirmed v0.1.10 stage. Added `modules/recorder-service` (Expo local module: camera-type foreground service, partial wake lock, Wi-Fi lock) and `lib/background-camera` wrapper; Recorder starts it while streaming and drops keep-awake when it runs. Admin live-feed rotation 0/90/180/270 with rotated captures; Projector pane ~55% wide with phone beside controls. Verified: module compiles, merged manifest has the camera FGS; rotation + rotated capture in Chrome. Checks green (52 tests, web export). Code commit `5ec0afe`.
- **2026-10-21** — v0.1.9 device-test fixes: found the "nothing sent" report came from a stale Admin build; added `stage-ready`/`stage-ack`, Projector double-buffer + heartbeat, `APP_BUILD` labels, always-live phone stage with image-editor toolbar, compact Admin bar with a big live feed, Recorder/Projector auto-reconnect, Recorder keep-awake + camera restart, Admin fresh connection per offer, relay late-close/idle-expiry fixes (pending redeploy). Measured live relay forwarding 8 MB frames. Checks: typecheck, lint, 52 tests, web export green; Admin↔Projector rejoin verified in Chrome. Code commit `2adfb30`.
- **2026-10-20** — Projector stage: confirmed the live relay silently drops `push` (Projector stuck on "Waiting for content"). Link B now uses the relay's `sdp` forward with `kind: 'stage'`. Projector goes full-screen and reports its viewport; Admin composes a phone-shaped stage (image drag/zoom/fit/fill/rotate, text, shape, direction, background) rendered at the Projector's physical pixels and sent live. Capture now keeps the sharpest of five frames. Checks: typecheck, lint, 47 tests, web export green; Admin↔Projector verified in Chrome against the live relay.
- **2026-10-20** — Capture-quality pass from 12 downloaded samples. Found six captures: three at 2160×3840 (readable but soft/moiré) and three explicit-lens captures at 528×960/720×1280 (unrecoverable). Added sharpest-of-3 capture, CLAHE, luma-only unsharp mask, JPEG 97, a 16 Mbps encoder ceiling, and encoder-param reapplication after native lens replacement. Added a 1080p text floor: explicit lenses below it restore Auto with an explanation, and both Recorder and Admin warn on low-resolution streams. Fixed the web VideoView ref callback identity so Admin resolution tracking cannot loop. Checks: typecheck, lint, 33 tests, web export green. Code commit `f890fba`; APK v0.1.7 pending.
