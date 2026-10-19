# Deployment & Distribution

ClearRelay has two deliverables:

1. **Web app** for Admin and Projector in a browser.
2. **Signed Android APK** shared through GitHub Releases.

There is no cloud backend, database, or media server. Static hosting is only used to serve the web
bundle; WebRTC media and data stay peer-to-peer.

## Recommendation

- **Web:** deploy the static Expo export to **GitHub Pages**. It is free, HTTPS, reliable, and has
  no runtime backend. This is still "serverless" in the sense that no application server or media
  server is involved.
- **APK:** build locally or in **GitHub Actions** and attach the signed APK to a GitHub Release.
  Do not make EAS cloud builds a requirement.
- **Signaling:** QR pairing needs no server. Add the optional `services/signaling` helper later
  (M8) only for remote room-code pairing, and self-host it.

If you want zero third-party hosting at all, serve the same `dist/` folder from a home server with
Caddy or Nginx. That is reliable on your LAN but requires HTTPS and a reachable address for remote
use.

## Access keys

Set the key list when building; Expo inlines `EXPO_PUBLIC_*` values into the bundle:

```powershell
$env:EXPO_PUBLIC_ACCESS_KEYS = "family-key-1,family-key-2"
npm run export:web
```

```bash
EXPO_PUBLIC_ACCESS_KEYS="family-key-1,family-key-2" npm run export:web
```

Without the variable, the development fallback `clearrelay-demo` is used. Set the variable before
any build you share.

> The key is a local front-door, not authentication. It is embedded in the JS bundle and can be
> extracted from a web build or APK. It keeps casual users out of the role picker; it does not
> authorize WebRTC peers. A pairing PIN/session secret is tracked in `PROJECT-STATUS.md`.

## GitHub Pages

1. Set `EXPO_PUBLIC_ACCESS_KEYS` in the workflow environment.
2. Run `npm run export:web`; output is `apps/mobile-web/dist`.
3. Publish that folder with `actions/upload-pages-artifact` + `actions/deploy-pages`.
4. For a project page at `https://<user>.github.io/<repo>/`, set the static base path:

   ```json
   {
     "expo": {
       "experiments": {
         "baseUrl": "/<repo>"
       }
     }
   }
   ```

   Verify the exported asset URLs before publishing. A custom domain can avoid the subpath entirely.

HTTPS is required for browser camera access. The Recorder is native-first; Admin and Projector only
need WebRTC.

## Android APK

The app identity is already set to `com.clearrelay.app` and the scheme is `clearrelay`.

Local release build outline:

```bash
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
```

On Windows use `.\gradlew.bat assembleRelease`. The APK is under
`android/app/build/outputs/apk/release/`. A shareable build needs a release keystore; configure the
signing block in `android/app/build.gradle` or use Expo's Android signing guide. Do not distribute a
debug-signed APK as the final artifact.

GitHub Actions outline:

1. `actions/checkout` + Node `22.13+` + `npm ci`.
2. Set `EXPO_PUBLIC_ACCESS_KEYS` from a repository secret or environment variable.
3. `npx expo prebuild --platform android`.
4. Decode the release keystore from `ANDROID_KEYSTORE_BASE64` and configure signing.
5. `./gradlew assembleRelease`.
6. Upload the APK as a GitHub Release asset (`softprops/action-gh-release` or `gh release upload`).

Keep the keystore and passwords in GitHub Actions secrets. Losing the keystore prevents updates to
an installed APK under the same application ID.

## Home-server option

- Serve `apps/mobile-web/dist` with Caddy (automatic TLS) or Nginx.
- Keep the optional signaling helper in Docker; only signaling traffic goes through it, never media.
- For remote pairing without a public IP, Tailscale Funnel or a Cloudflare Tunnel can expose the
  signaling helper over HTTPS. That is a third-party signaling relay, not a media relay; confirm
  that tradeoff before using it.
- TURN (`infra/coturn`) is only needed when both peers are behind hard NAT. It relays media, so it
  breaks the pure P2P guarantee and is optional.

## Release checklist

- [ ] Set a real `EXPO_PUBLIC_ACCESS_KEYS` value
- [ ] Bump app version / Android versionCode
- [ ] Build and sign the release APK
- [ ] Install the APK on a physical device and run the clarity test
- [ ] Verify Admin and Projector in a browser over HTTPS
- [ ] Publish the APK to GitHub Releases
- [ ] Share the install link and access key only with intended users
