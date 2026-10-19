# ClearRelay — Project Status

> **Live progress tracker.** This file answers: what is done, what is not, and where we stopped.
> The canonical spec is [`ClearRelay-Build-Plan.md`](./ClearRelay-Build-Plan.md). When the spec and
> this file disagree on progress, this file wins; when they disagree on architecture, the plan wins
> unless a decision is recorded below.

**Last updated:** 2026-10-19
**Current milestone:** M1 web half and M2 web half are implemented and E2E-verified: Recorder camera → Admin live video over WebRTC, paired by QR or copy/paste code. Native `IConnection`/`ICameraSource` are still stubs. M3 (Admin capture + gallery) is next.
**Current stop point:** The web Recorder creates an invite, Admin scans/pastes it and returns an answer, the Recorder scans/pastes the answer, the camera starts, and Admin renders the live remote track. Verified with a two-context headless E2E run (pairing, data-channel hello, and video on both sides). No native camera/WebRTC, no QR chunk fallback, no APK.
**Next action:** Implement M3: freeze a full-intrinsic-resolution still in Admin and add the in-memory gallery/thumbnails.

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
- [ ] Native prebuild + dev-client build on Android (not run yet)
- [ ] Native prebuild + dev-client build on iOS (requires macOS)
- [x] Styling decision: Tamagui/NativeWind deferred; plain StyleSheet is in use

### M1 — WebRTC loopback + QR pairing

- [x] `IConnection` web implementation (data channel + video transceiver)
- [ ] `IConnection` native implementation (`react-native-webrtc`) — deferred until the native prebuild phase
- [x] Non-trickle ICE gathering for QR mode (with a timeout so a slow STUN server cannot block pairing)
- [x] SDP gzip + base64 compression (`fflate`, `CR1.` prefix)
- [ ] Chunked/animated QR fallback and reassembly — not needed at current sizes (~2.4 KB fits one version-40-L QR)
- [~] QR scan plus answer-QR round trip — scanner and manual code entry are both wired; manual round trip E2E-verified, physical QR scanning not yet exercised on two phones
- [x] Two-browser-tab data-channel echo test (two-context headless E2E: offer/answer exchange, `hello` role message, live video)
- [~] Unit tests for SDP compression and QR chunk reassembly — compression/invalid-code tests added; chunk reassembly not applicable yet

### M2 — Live video Recorder → Admin

- [x] Web camera source (`getUserMedia`) behind `ICameraSource`
- [ ] Native camera source (Vision Camera) + format selection — deferred until the native prebuild phase
- [x] Remote video track render in Admin
- [x] Encoder params: `maintain-resolution`, low FPS, high bitrate (`scaleResolutionDownBy: 1`, `maxFramerate`, `maxBitrate`)
- [x] Recorder waits for Admin and shows pairing state
- [ ] Battery guard: pause camera/CV/encoder when the app backgrounds, resume on return
- [x] Only the active role's pipeline runs; no background capture from the role picker

### M3 — Admin capture + gallery

- [ ] Freeze a full-intrinsic-resolution still
- [ ] In-memory gallery with thumbnails and preview
- [ ] Crop / rotate / enhance
- [ ] Responsive two-pane desktop and stacked mobile layout

### M4 — Admin → Projector (Link B)

- [ ] Second WebRTC session; data channel only
- [ ] Image begin/chunk/end protocol with 16 KB chunks
- [ ] Backpressure via `bufferedAmountLowThreshold`
- [ ] Projector reassembly and full-screen image render
- [ ] Projector keeps the last item until the next push
- [ ] Admin can send text/code and images from the right-hand panel

### M5 — CV enhancement pipeline

- [ ] Quad detection on web (OpenCV.js worker)
- [ ] Quad detection on native (frame processor)
- [ ] Perspective warp + CLAHE + unsharp mask
- [ ] EMA smoothing, movement threshold, re-detect
- [ ] Raw-frame fallback when no quad is found

### M6 — Camera lock + clarity tuning

- [ ] Exposure/focus/white-balance lock after convergence
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

- [ ] `services/signaling` WebSocket room server
- [ ] Room codes and trickle ICE
- [ ] Dockerfile + Caddy/wss deployment notes
- [ ] Optional TURN (`infra/coturn`) only for hard NAT
- [ ] Remote pairing demo across two networks

### M9 — Resilience, polish, packaging

- [ ] Heartbeats and auto-reconnect
- [ ] Status UI and session PIN
- [ ] Full responsive Admin polish
- [x] Web deploy workflow
- [ ] Android release build + signing
- [ ] iOS build/TestFlight
- [ ] Final device matrix and release checklist

## Access and identity

- [x] Local access-key gate on the home screen and every role route/deep link
- [x] Built-in client-side key in `src/config/index.ts`; no server or repository secret
- [x] Optional extra keys via `EXPO_PUBLIC_ACCESS_KEYS`
- [x] Session-only unlock; **Lock session** returns to the gate
- [x] Access gate unit tests (accept, reject, lock clears role)
- [ ] Pairing-level PIN/session secret (real per-session control)
- [x] Key rotation by editing `ACCESS_KEY` and redeploying
- [!] Real authentication is **not** provided by the local key: it is embedded in the public bundle and can be extracted. Do not treat it as a security boundary.

## Admin / Projector UX

- [x] Admin route has a left live-feed pane and a right send-to-Projector pane
- [x] Image / Code tabs in the send pane (draft UI only)
- [x] Projector route uses the user-facing name and preserves `/display` as a redirect alias
- [x] Live feed rendering (M2, web): remote track + pairing state + data-channel role check
- [ ] Capture and send actions enabled (M3/M4)
- [ ] Projector orientation and full-screen behavior
- [ ] Mobile Admin layout verification on a physical device

## Distribution

- [x] Initialize the local git repository and push `main` to GitHub
- [x] GitHub Actions CI workflow: typecheck, lint, tests, web export
- [x] First green CI run on GitHub
- [x] GitHub Pages deployment workflow with `/omni-relay` base path
- [x] Repository is public, so GitHub Pages is eligible on the Free plan
- [x] No repository secret required; the access key is built into the client
- [x] Enable GitHub Pages (Source: GitHub Actions)
- [x] First successful `Deploy web` run
- [x] Verify the live key gate at `https://naveenmorla1901.github.io/omni-relay/`
- [x] Pages SPA fallback (`404.html`) so direct role URLs survive a reload
- [ ] Android release keystore + signing secrets
- [ ] GitHub Actions APK build
- [ ] Upload signed APK to GitHub Releases
- [ ] Install and smoke-test the APK on a physical Android device
- [ ] Share install link + access key with intended users

## Decisions

- **Serverless definition:** no cloud backend, database, or media server. Static hosting for the web UI is allowed; media/data stays peer-to-peer.
- **Web hosting recommendation:** GitHub Pages for the static Expo web export. It is free, HTTPS, and has no runtime backend. The optional signaling helper stays self-hosted for remote pairing.
- **Projector naming:** UI and route use **Projector**; the wire role remains `display` for compatibility with the plan/protocol.
- **Access key:** a local front-door for casual access control, not authentication. The built-in `ACCESS_KEY` in `src/config/index.ts` is bundled into the public client; change it and redeploy to rotate. No server or GitHub secret involved.
- **GitHub Pages base path:** `EXPO_BASE_URL=/omni-relay` is injected by the deploy workflow so local dev stays at the root.
- **APK path:** build locally or with GitHub Actions; do not require EAS cloud. Publish to GitHub Releases.
- **Default pairing:** QR (serverless). Room-code signaling is optional until M8.
- **Web-first live feed:** the browser Recorder and Admin are the v1 default because GitHub Pages is the current distribution surface. Native `IConnection`/`ICameraSource` implementations stay behind the same interfaces and are deferred until the native prebuild/APK phase.
- **Pairing codes:** gzip + base64url (`CR1.` prefix). Both QR and copy/paste are first-class; the QR is a convenience, not a requirement.

## Open questions / decisions needed

- [x] GitHub Pages is the Admin/Projector web target; the live site is up.
- [x] Web Recorder is supported in v1; native is an optimization/APK path, not a requirement for the browser workflow.
- [ ] Decide whether a stronger pairing PIN/session secret is needed for real access control.
- [ ] Choose the Android application ID if `com.clearrelay.app` is not desired.

## Session log

- **2026-10-19** — Scaffolded the Expo workspace, role routes, protocol/config modules, tests, lint, and static web export. Added the access-key gate (including a guard for direct role URLs), Projector naming, Admin/Projector UI skeletons, app identity, project status tracker, deployment notes, and a GitHub Actions CI workflow. Verified with 10 unit tests, typecheck, lint, and web export. Next: M1 WebRTC loopback.
- **2026-10-19** — Initialized git, committed M0, and pushed `main` to `https://github.com/naveenmorla1901/omni-relay`. Added the GitHub Pages deploy workflow, dynamic `EXPO_BASE_URL` support, fail-closed production access keys, and the private-repo Pages notes. Pages activation and the access-key secret are the remaining deploy steps.
- **2026-10-19** — Repo made public; CI is green. `Deploy web` is blocked only on the missing `EXPO_PUBLIC_ACCESS_KEYS` repository secret, so Pages is not enabled yet.
- **2026-10-19** — Moved to a built-in client-side access key (`ACCESS_KEY`), removed the Pages secret requirement, and simplified the gate. No server-side key storage. Pages was enabled; `Deploy web` succeeded and the live key gate at `https://naveenmorla1901.github.io/omni-relay/` was verified. The build is still the M0 UI shell: no WebRTC, camera, media, or APK.
- **2026-10-19** — Implemented the web half of M1/M2: browser `IConnection` (data channel + video transceiver + encoder clarity params), non-trickle ICE with timeout, gzip/base64url pairing codes (`CR1.`), `ICameraSource` web implementation (`getUserMedia`), QR generate/scan, manual copy/paste fallback, and working Recorder → Admin pairing/live-feed screens. Added 4 signal unit tests (14 total). Verified with a two-context headless E2E run: offer → answer → connect, data-channel `hello`, and live 320×240 video on both sides. Native implementations remain stubs; M3 capture/gallery is next.
