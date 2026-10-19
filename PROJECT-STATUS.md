# ClearRelay — Project Status

> **Live progress tracker.** This file answers: what is done, what is not, and where we stopped.
> The canonical spec is [`ClearRelay-Build-Plan.md`](./ClearRelay-Build-Plan.md). When the spec and
> this file disagree on progress, this file wins; when they disagree on architecture, the plan wins
> unless a decision is recorded below.

**Last updated:** 2026-10-19
**Current milestone:** M0 scaffold complete on web; M1 (WebRTC loopback + QR pairing) is next.
**Current stop point:** Access gate (client-side built-in key), Projector naming, Admin/Projector UI skeletons, GitHub push, and the Pages deployment workflow are in place. No WebRTC, camera, or media code exists yet.
**Next action:** Publish the Pages build and verify the live key gate, then implement M1 (web `IConnection` + QR offer/answer).

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

- [ ] `IConnection` web implementation (data channel only)
- [ ] `IConnection` native implementation (`react-native-webrtc`)
- [ ] Non-trickle ICE gathering for QR mode
- [ ] SDP gzip + base64 compression
- [ ] Chunked/animated QR fallback and reassembly
- [ ] QR scan plus answer-QR round trip
- [ ] Two-browser-tab data-channel echo test
- [ ] Unit tests for SDP compression and QR chunk reassembly

### M2 — Live video Recorder → Admin

- [ ] Web camera source (`getUserMedia`) behind `ICameraSource`
- [ ] Native camera source (Vision Camera) + format selection
- [ ] Remote video track render in Admin
- [ ] Encoder params: `maintain-resolution`, low FPS, high bitrate
- [ ] Recorder waits for Admin and shows pairing state
- [ ] Battery guard: pause camera/CV/encoder when the app backgrounds, resume on return
- [ ] Only the active role's pipeline runs; no background capture from the role picker

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
- [ ] Web deploy workflow
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
- [ ] Live feed rendering (M2)
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
- [ ] Enable GitHub Pages (Source: GitHub Actions)
- [ ] First successful `Deploy web` run
- [ ] Verify the live key gate at `https://naveenmorla1901.github.io/omni-relay/`
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

## Open questions / decisions needed

- [ ] Confirm GitHub Pages vs. self-hosted Caddy for the Admin/Projector web app.
- [ ] Decide whether a stronger pairing PIN/session secret is needed for real access control.
- [ ] Choose the Android application ID if `com.clearrelay.app` is not desired.
- [ ] Decide whether web Recorder is supported in v1 or native-only.

## Session log

- **2026-10-19** — Scaffolded the Expo workspace, role routes, protocol/config modules, tests, lint, and static web export. Added the access-key gate (including a guard for direct role URLs), Projector naming, Admin/Projector UI skeletons, app identity, project status tracker, deployment notes, and a GitHub Actions CI workflow. Verified with 10 unit tests, typecheck, lint, and web export. Next: M1 WebRTC loopback.
- **2026-10-19** — Initialized git, committed M0, and pushed `main` to `https://github.com/naveenmorla1901/omni-relay`. Added the GitHub Pages deploy workflow, dynamic `EXPO_BASE_URL` support, fail-closed production access keys, and the private-repo Pages notes. Pages activation and the access-key secret are the remaining deploy steps.
- **2026-10-19** — Repo made public; CI is green. `Deploy web` is blocked only on the missing `EXPO_PUBLIC_ACCESS_KEYS` repository secret, so Pages is not enabled yet.
- **2026-10-19** — Moved to a built-in client-side access key (`ACCESS_KEY`), removed the Pages secret requirement, and simplified the gate. No server-side key storage.
