# Deployment & Distribution

ClearRelay has three deliverables:

1. **Web app** — Admin and Projector (and Recorder as a PWA fallback) served from GitHub Pages.
2. **Android APK** — Recorder camera app built via GitHub Actions and published to GitHub Releases.
3. **Signaling server** — minimal WebSocket relay deployed on Railway (room codes only, never media).

There is no cloud backend, database, or media server. WebRTC media stays peer-to-peer; captured images are relayed through the existing WebSocket connection.

---

## Signaling server (Railway)

The signaling relay lives in `services/signaling/server.js` — plain Node.js, no build step.

| Setting | Value |
| --- | --- |
| Live URL | `wss://omni-relay-production-d45c.up.railway.app` |
| Platform | Railway |
| Root directory | `services/signaling` |
| Start command | `node server.js` |
| PORT env var | `8081` |

The URL is baked into `apps/mobile-web/src/config/index.ts` as `SIGNALING_WS_URL`. Override at build time with `EXPO_PUBLIC_SIGNALING_URL` if self-hosting.

### What it does

- Admin sends `{ t: 'create' }` → receives a 6-char room code.
- Recorder/Projector send `{ t: 'join', code, role }` → server notifies Admin.
- SDP offers/answers are relayed via `{ t: 'sdp', to, sdp, kind }`.
- Link B (Admin ↔ Projector stage) rides the same `sdp` forward with `kind: 'stage'`: the Projector sends `viewport` (on connect and every 15 s) and `stage-ack`; Admin sends `stage-ready`, `stage-frame`, and `stage-clear` (JSON in the `sdp` field). The live relay forwards 8 MB messages (measured 2026-10-21).
- `{ t: 'push', data, mime }` exists in current `server.js`, but the deployed relay predates it and silently drops it, so the app no longer sends it.
- The deployed relay expires rooms 30 minutes after creation; current `server.js` expires them after 100 idle minutes (redeploy to apply). Either way clients survive it: Admin moves the session to a fresh room every 25 minutes and connected devices follow (`room-move`). Confusable characters (0/O, 1/I/L) are excluded from codes.
- Current `server.js` also ignores the late close of a socket whose role slot was already taken by a rejoin. The deployed relay does not, so clients self-heal by rejoining. Redeploy `services/signaling` on Railway to pick up both fixes (no client change needed).

The server never sees WebRTC media. Stage frames are base64 JPEGs inside the `sdp` field, forwarded verbatim to the other peer.

### Self-hosting

```bash
cd services/signaling
npm install
PORT=8081 node server.js
```

Set `EXPO_PUBLIC_SIGNALING_URL=wss://your-host` at web build time, or change `SIGNALING_WS_URL` in `config/index.ts`.

---

## Web app (GitHub Pages)

**Live:** `https://naveenmorla1901.github.io/omni-relay/`

The deploy workflow is `.github/workflows/deploy-pages.yml`. It runs on every push to `main`:

1. Installs dependencies (`npm ci`).
2. Runs `npx expo export --platform web` with `EXPO_BASE_URL=/omni-relay`.
3. Uploads `apps/mobile-web/dist` and deploys via GitHub Pages.

### One-time setup

1. Open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.
2. Push to `main` or run the workflow manually.
3. Wait for the green deployment badge, then open the URL above.

The workflow cannot enable Pages with the default `GITHUB_TOKEN`; that first toggle must be done in repository settings. After that, every push to `main` deploys automatically.

No repository secret is needed — the access key is built into the client bundle.

### Local dev server

```bash
npm run web          # http://localhost:8081 (no base path)
```

Do not set `EXPO_BASE_URL` locally — it is only for the Pages sub-path.

### iOS personal use (PWA)

No Apple Developer account is needed. On an iPhone:

1. Open `https://naveenmorla1901.github.io/omni-relay/` in **Safari**.
2. Tap the Share button → **Add to Home Screen**.
3. Launch from the home screen icon — it runs as a PWA with camera access.

---

## Android APK (GitHub Actions)

**Latest APK:** `https://github.com/naveenmorla1901/omni-relay/releases/latest`

The workflow is `.github/workflows/build-android.yml`.

### Triggers

| Trigger | What it builds |
| --- | --- |
| Push a `v*` tag (e.g. `v0.1.0`) | Debug APK → published as a GitHub Release |
| Manual `workflow_dispatch` | Debug APK → artifact only (no release) |

### How to trigger a release

```bash
git tag v0.1.0
git push origin v0.1.0
```

The build takes 10–15 minutes. When it finishes, the APK appears in **Releases** and the **Download APK** button on the home screen links directly to it.

### What the workflow does

1. Checks out the repo and sets up Node 22.
2. Runs `npm ci` (with `.npmrc` retry hardening).
3. Accepts Android SDK licenses (`yes | sdkmanager --licenses`).
4. Runs `npx expo prebuild --platform android --clean --no-install`.
5. Runs `./gradlew assembleDebug --no-daemon`.
6. On a `v*` tag: creates a GitHub Release and uploads `app-debug.apk`.

### Installing the APK

1. On the Android device, allow **Install unknown apps** from the browser or Files app.
2. Download the APK from the Releases page and tap to install.
3. Open ClearRelay, enter the access key, and choose **Recorder**.
4. When it connects, allow notifications if asked. The "ClearRelay Recorder" notification means the camera keeps streaming with the screen off (camera foreground service from `apps/mobile-web/modules/recorder-service`). Battery-saver modes that kill background apps can still stop it; exempt ClearRelay from battery optimisation if the feed stops.

### Signed release APK (future)

The current build is a debug APK — no keystore needed, suitable for personal sideloading. For wider distribution:

1. Generate a release keystore: `keytool -genkey -v -keystore clearrelay.jks ...`
2. Store it as `ANDROID_KEYSTORE_BASE64` (base64-encoded) in GitHub Actions secrets, along with `KEY_ALIAS`, `KEY_PASSWORD`, and `STORE_PASSWORD`.
3. Add a signing block to `android/app/build.gradle` and switch the Gradle task to `assembleRelease`.

Do not commit the keystore file. Losing it permanently blocks APK updates under the same application ID (`com.clearrelay.app`).

---

## Access key

The key is the `ACCESS_KEY` constant in `apps/mobile-web/src/config/index.ts`.

```typescript
export const ACCESS_KEY = 'Thiswillbekey1901';
```

- Change this string and redeploy (web export + APK rebuild) to rotate the key.
- Optional extra keys at build time: `EXPO_PUBLIC_ACCESS_KEYS=key1,key2`.
- The built-in key always works regardless of the env var.

> **Limitation:** the key is embedded in the public JS bundle and APK. Anyone with access to those files can extract it. It is a convenience gate, not authentication. Do not base real access control on it.

---

## CI pipeline

The CI workflow is `.github/workflows/ci.yml`. It runs on every push and pull request to `main`:

1. `npm run typecheck` — strict TypeScript
2. `npm run lint` — ESLint
3. `npm test` — Vitest unit tests (14 tests)
4. `npm run export:web` — static web export (catches native imports leaking into the web bundle)

All four must pass before merging.

---

## Release checklist

- [ ] Bump `ACCESS_KEY` in `config/index.ts` if rotating (then redeploy web + rebuild APK)
- [ ] Bump version in `apps/mobile-web/package.json` and `app.json` (`versionCode` for Android)
- [ ] All CI checks green on `main`
- [ ] Push a `v*` tag and wait for the APK build to complete
- [ ] Install the APK on a physical Android device
- [ ] Run a three-device session: Admin (browser) + Recorder (APK) + Projector (browser)
- [ ] Verify captured image pushes to Projector full-screen
- [ ] Confirm ~11px source code remains readable after Admin capture (clarity acceptance test)
- [ ] Publish/share the install link and access key only with intended users
