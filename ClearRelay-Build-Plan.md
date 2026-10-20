# ClearRelay — Technical Build Plan & Architecture Spec

> **Working codename:** ClearRelay (rename freely).
> **Document purpose:** A complete, self-contained engineering specification detailed enough that an AI coding agent (or several, in parallel) can build the entire system with minimal ambiguity. Read the "How to use this document" section at the very bottom first if you are an AI agent.
> **Status:** v1 draft — architecture locked, ready to implement.
>
> **Addendum (2026-10-19):** Live progress is tracked in [`PROJECT-STATUS.md`](./PROJECT-STATUS.md). Product updates: the app is gated by a local access key before role selection; the third role is presented as **Projector** in the UI while retaining the wire role name `display`; "serverless" means no cloud backend or media server (static web hosting and a self-hosted signaling helper are allowed); the release target is a shareable signed APK published on GitHub Releases.

---

## 0. One-paragraph summary

ClearRelay is a three-role, peer-to-peer app (iOS, Android, web) that lets one phone (**Recorder**) point its camera at a screen or page, auto-tune the camera and image so **text/code is razor-sharp**, and stream a **low-framerate, high-resolution** live video to a second device (**Admin**). The Admin runs a dashboard, **freezes a clean screenshot** from the live feed, optionally crops/enhances/OCRs it, and **pushes the image or extracted code to a third device (Display)**, which shows it full-screen. Data flows **one way** (Recorder → Admin → Display) and travels **directly device-to-device over WebRTC** — there is **no media server**. Pairing is **serverless by default** (QR code), with an **optional ~120-line signaling helper** for easy remote pairing.

---

## 1. Product overview

### 1.1 Roles & data flow

```
   ┌──────────────┐        low-FPS, high-res          ┌──────────────┐     image / code         ┌──────────────┐
   │   RECORDER   │  ───── live video (WebRTC) ─────▶ │    ADMIN     │ ──── (WebRTC data ch) ──▶ │   DISPLAY    │
   │  (phone cam) │         video track               │  dashboard   │     discrete pushes       │ full-screen  │
   └──────────────┘                                   └──────────────┘                           └──────────────┘
     captures screen,                                   watches feed,                               renders image
     locks + enhances,                                  grabs screenshot,                           or syntax-
     sends clean frames                                 crop / OCR, forward                         highlighted code

   Data direction is strictly one-way:  Recorder ──▶ Admin ──▶ Display
```

- **Recorder** (mobile, camera-first): locks camera settings for the session, detects the on-screen region, keeps text sharp/steady, streams a **low-FPS high-resolution** video track to Admin.
- **Admin** (mobile **or** desktop/monitor — fully responsive): dashboard that shows the live incoming feed, lets the operator **capture a still** (screenshot) into a gallery, optionally crop/enhance/OCR it, then **send an image or code string to the Display**.
- **Display** (mobile, desktop, TV browser, projector): receives discrete pushes from Admin and renders them full-screen — an image, or syntax-highlighted code.

### 1.2 Core principles (non-negotiable)

1. **Clarity first.** Legible letters beat smooth motion. Resolution and sharpness are never sacrificed for framerate.
2. **Serverless by default.** No central media server. Optional tiny signaling helper only to ease remote pairing.
3. **Low latency, high bandwidth OK.** Assume good internet; optimize for speed + quality, not data frugality.
4. **One codebase.** Expo + React Native Web across iOS, Android, web. Platform-specific code lives behind clean interfaces.
5. **Private by design.** WebRTC media/data is end-to-end encrypted (DTLS-SRTP) by default. Nothing is stored off-device.
6. **Incremental & demoable.** Every milestone (Section 15) is independently runnable.

---

## 2. High-level architecture

### 2.1 Connection model

- **Transport:** WebRTC. Once two peers connect, media and data flow **directly** between them (P2P). No relay in the common case.
- **Two independent WebRTC sessions:**
  - **Link A — Recorder → Admin:** one **video track** (low-FPS, high-res, high-bitrate). Plus a small **control data channel** (metadata, heartbeats, quality hints).
  - **Link B — Admin → Display:** one **data channel** only (discrete image blobs + code strings + render commands). No video track needed.
- **Why split transports:** Link A needs continuous video; Link B needs reliable discrete file/text delivery. A data channel gives Admin→Display full control over image quality and simple, ordered, reliable delivery.

### 2.2 Signaling (how peers find each other)

WebRTC needs a one-time exchange of connection info (SDP offer/answer + ICE candidates). ClearRelay supports **two signaling modes**, selectable in settings:

- **Mode 1 — QR / manual (default, zero infrastructure):** The "offerer" device renders its SDP offer as a QR code (or short pastable code); the "answerer" scans it and shows an answer QR back. Best when devices are physically together (common for Recorder↔Display). Uses **non-trickle ICE** (gather candidates fully before encoding the QR) to keep it a single exchange.
- **Mode 2 — Signaling helper (optional, for remote pairing):** A tiny WebSocket relay that only forwards signaling messages (never media). Devices join a **room code**; the helper matches offer/answer/ICE. Deploy on the home server (Docker) or any cheap host. ~120 lines. See Section 18.4.

> STUN is always used (free public servers) to discover public IPs. **TURN** (media relay) is only needed when both peers are behind restrictive/symmetric NAT and can't connect directly — optional, documented in Section 7.4.

### 2.3 Platform split (critical for agents)

React Native Web **cannot** use `react-native-webrtc` or `react-native-vision-camera` on the web target. So the camera + WebRTC layers are **abstracted behind interfaces**, with two implementations:

| Capability        | Native (iOS/Android)                 | Web (browser)                          |
|-------------------|--------------------------------------|----------------------------------------|
| Camera capture    | `react-native-vision-camera`         | `navigator.mediaDevices.getUserMedia`  |
| Frame CV pipeline | Vision Camera **frame processor**    | `OpenCV.js` + `<canvas>`/WebGL         |
| WebRTC            | `react-native-webrtc`                | native browser `RTCPeerConnection`     |
| QR scan/generate  | `vision-camera-code-scanner` + `qrcode` | `html5-qrcode` + `qrcode`           |

Everything else (UI, state, protocol, signaling logic, app flow) is **shared**. Recommended platform per role:

- **Recorder:** native mobile (needs deep camera control). Web recorder = optional/limited.
- **Admin:** both. Desktop web is a first-class target (big monitor dashboard).
- **Display:** both. Web is natural (projector/TV/monitor).

---

## 3. Technology stack

### 3.1 App (all three roles — one project)

| Concern            | Choice                                              | Why |
|--------------------|-----------------------------------------------------|-----|
| Framework          | **Expo (SDK latest) + React Native + React Native Web** | One TS codebase → iOS/Android/web |
| Language           | **TypeScript (strict)**                             | Agent-friendly, type-safe protocol |
| Build mode         | **Expo Prebuild + Dev Client** (NOT Expo Go)        | Native modules (WebRTC, Vision Camera) need a custom dev client |
| Navigation         | **expo-router** (file-based)                        | Simple role-based routing |
| State              | **Zustand**                                         | Minimal, works great for session/stream state |
| Camera (native)    | **react-native-vision-camera** (v4+)                | Manual exposure/focus/zoom/torch + frame processors |
| WebRTC (native)    | **react-native-webrtc**                             | Full RTCPeerConnection parity |
| CV (native)        | Vision Camera **frame processor plugin** (OpenCV or MLKit-backed) | Real-time per-frame detection |
| CV (web)           | **opencv.js** (WASM)                                | Quad detection + warp in browser |
| OCR (optional)     | **ML Kit Text Recognition** (native) / **tesseract.js** (web) | Image → code text |
| QR                 | **qrcode** (gen) + **vision-camera-code-scanner** (native scan) / **html5-qrcode** (web scan) | Serverless signaling |
| Image encode       | native canvas/bitmap → JPEG/WebP; web `<canvas>.toBlob` | Admin screenshot + Display payloads |
| Syntax highlight   | **Shiki** or **Prism** (Display role, code render)  | Clean code display |
| Styling            | **Tamagui** or NativeWind                           | Cross-platform styling |

### 3.2 Optional signaling helper (only for Mode 2)

| Concern | Choice | Why |
|---------|--------|-----|
| Server  | **Node + `ws`** (TypeScript) OR **Python + `websockets`/FastAPI** | ~120 LOC, trivial to run |
| Deploy  | **Docker container** on home server, or Fly.io/Render free tier | Keep it tiny and disposable |
| State   | In-memory room map only | No DB, no persistence |

### 3.3 Optional TURN (only for hard-NAT remote cases)

- **coturn** in Docker on the home server, or a managed TURN (e.g., Metered/Twilio).

---

## 4. Repository structure (monorepo)

```
clearrelay/
├─ apps/
│  └─ mobile-web/                 # the Expo app (all 3 roles)
│     ├─ app/                     # expo-router routes
│     │  ├─ index.tsx             # role picker / home
│     │  ├─ recorder.tsx
│     │  ├─ admin.tsx
│     │  ├─ display.tsx
│     │  └─ pair.tsx              # QR / room-code pairing screen
│     ├─ src/
│     │  ├─ connection/           # WebRTC abstraction
│     │  │  ├─ IConnection.ts     # interface (shared)
│     │  │  ├─ native.ts          # react-native-webrtc impl
│     │  │  ├─ web.ts             # browser RTCPeerConnection impl
│     │  │  ├─ signaling/
│     │  │  │  ├─ qr.ts           # Mode 1
│     │  │  │  └─ ws.ts           # Mode 2
│     │  │  └─ index.ts           # platform-select export
│     │  ├─ camera/               # capture + CV abstraction
│     │  │  ├─ ICameraSource.ts
│     │  │  ├─ native.ts          # Vision Camera + frame processor
│     │  │  ├─ web.ts             # getUserMedia + opencv.js
│     │  │  └─ pipeline/          # quad detect, warp, enhance (shared math)
│     │  ├─ protocol/             # message schemas + codecs (shared)
│     │  │  └─ messages.ts
│     │  ├─ ocr/                  # optional
│     │  ├─ store/                # zustand stores
│     │  ├─ ui/                   # shared components
│     │  └─ config/               # tunables (Section 20)
│     ├─ app.json / app.config.ts # Expo config + plugins
│     └─ package.json
├─ services/
│  └─ signaling/                  # optional Mode 2 helper
│     ├─ src/server.ts
│     ├─ Dockerfile
│     └─ README.md
├─ infra/
│  └─ coturn/                     # optional TURN docker-compose
├─ docs/
│  └─ (this file, protocol.md, testing.md)
└─ README.md
```

---

## 5. Connection layer (WebRTC) — detailed spec

### 5.1 Shared interface

```ts
// src/connection/IConnection.ts
export type Role = 'recorder' | 'admin' | 'display';
export type SignalingMode = 'qr' | 'ws';

export interface IConnection {
  // lifecycle
  init(role: Role, mode: SignalingMode): Promise<void>;
  createOffer(): Promise<string>;           // returns serialized SDP (for QR) or resolves via ws
  acceptOffer(offer: string): Promise<string>; // returns serialized answer
  acceptAnswer(answer: string): Promise<void>;
  close(): void;

  // media (Link A)
  attachVideoTrack(track: MediaStreamTrack): void;     // recorder side
  onRemoteTrack(cb: (stream: MediaStream) => void): void; // admin side

  // data (control + Link B)
  sendData(msg: Uint8Array | string): void;
  onData(cb: (msg: ArrayBuffer | string) => void): void;

  // status
  onState(cb: (s: RTCPeerConnectionState) => void): void;
}
```

### 5.2 ICE configuration

```ts
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Optional TURN (only if configured):
  // { urls: 'turn:YOUR_HOME_SERVER:3478', username: '...', credential: '...' },
];
```

- **QR mode:** `iceCandidatePoolSize` high; **wait for ICE gathering complete** before serializing SDP (non-trickle) so the QR contains everything.
- **WS mode:** trickle ICE (send candidates as they arrive) for faster connect.

### 5.3 QR pairing protocol (Mode 1)

Because a full SDP can exceed a single QR's capacity, use one of:
- **Compress** the SDP (gzip → base64) — usually fits in one QR at high error-correction level L/M.
- If still too big, **chunk** into multiple sequential QR frames (animated) with an index header `CRQR|<i>/<n>|<base64chunk>`; scanner reassembles.

Handshake:
1. Offerer (e.g., Recorder) builds offer, waits for ICE complete, compresses, renders QR.
2. Answerer (Admin) scans → `acceptOffer` → builds answer → renders answer QR.
3. Offerer scans answer QR → `acceptAnswer`. Connected.

### 5.4 Room-code pairing (Mode 2)

- Both devices connect to `wss://<helper>/ws`, send `{type:'join', room:'ABCD-1234', role}`.
- Helper pairs the two peers in a room and forwards `offer`/`answer`/`candidate` messages between them verbatim.
- Helper never inspects or stores media. Rooms are ephemeral (deleted on disconnect).

### 5.5 Session lifecycle & resilience

- **Heartbeat** on the control channel every 2s; if 3 missed → mark `degraded`, show reconnect UI.
- **Auto-reconnect:** keep last room code / allow re-scan; rebuild the peer connection.
- **Single consumer:** Link A is one-to-one (one Recorder → one Admin). Link B is one Admin → one Display. (Multi-display is a documented future extension — Section 19.)

---

## 6. Recorder device — detailed spec

### 6.1 Responsibilities

1. Acquire camera, **lock settings for the session** (prevent flicker/hunting).
2. **Detect the screen/paper region** in each frame; perspective-correct it.
3. **Enhance** for text legibility (contrast, sharpening, de-glare, anti-moiré).
4. **Stabilize** (lock to detected quad); if the region moves beyond a threshold, **re-detect** and resume.
5. Feed enhanced frames into a **low-FPS, high-resolution, high-bitrate** WebRTC video track.
6. Expose minimal UI: live preview, lock indicator, "region found" status, torch toggle, FPS/quality selector, connection status.

### 6.2 Camera control (native, Vision Camera)

On session start: run auto-exposure/focus/white-balance to converge (~1–2s), then **lock** them so the image doesn't pulse as screen content changes.

```ts
// Target configuration (native)
const format = pickFormat(device, {
  videoResolution: { width: 1920, height: 1080 }, // or highest ≤ 4K the encoder handles
  fps: TARGET_FPS,            // low, e.g. 6–10 (see config)
});
// After convergence:
camera.current?.setExposureMode?.('locked');
camera.current?.setFocusMode?.('locked');   // or lock focus distance
camera.current?.setWhiteBalanceMode?.('locked');
// torch on if the user is in a dim room (optional, user toggle)
```

**Web equivalent** (best-effort; Safari support is limited — document gracefully):
```ts
const track = stream.getVideoTracks()[0];
await track.applyConstraints({
  width: 1920, height: 1080, frameRate: { max: TARGET_FPS },
  advanced: [{ exposureMode: 'manual' }, { focusMode: 'manual' }, { whiteBalanceMode: 'manual' }],
});
```

### 6.3 CV enhancement pipeline

Run per frame (native: Vision Camera frame processor on the GPU/worklet thread; web: opencv.js on a worker + canvas):

1. **Downscale a copy** (e.g., to 640px wide) for detection speed.
2. **Edge/contour detection** → find the **largest 4-point convex quad** (the screen/page). Smooth the quad across frames (EMA) to avoid jitter; only re-warp when it moves > `QUAD_MOVE_THRESHOLD`.
3. **Perspective warp** the full-res frame to a rectified rectangle (`getPerspectiveTransform` + `warpPerspective`).
4. **Enhance for text:**
   - Convert to grayscale-aware local contrast (CLAHE) OR adaptive unsharp mask.
   - **Anti-moiré / de-banding:** mild Gaussian denoise before sharpening; optionally capture at higher res and downscale (natural anti-alias).
   - **De-glare:** detect blown-out highlights; if large, hint the user ("reduce glare / angle the phone").
5. Output the rectified, enhanced frame to the encoder as the video track source.

> If no quad is confidently found, **fall back to the raw (locked, enhanced) full frame** so streaming never stops. Show a subtle "framing lost — hold steady" hint.

### 6.4 Encoder / track configuration for CLARITY (the key section)

This is the heart of the user's "clear letters" requirement.

```ts
const sender = pc.getSenders().find(s => s.track?.kind === 'video');
const params = sender.getParameters();
params.degradationPreference = 'maintain-resolution'; // ⬅ drop FPS, NEVER resolution
params.encodings = [{
  maxFramerate: TARGET_FPS,       // low on purpose (e.g. 8)
  maxBitrate: HIGH_BITRATE_BPS,   // generous, e.g. 6–12 Mbps (good internet assumed)
  scaleResolutionDownBy: 1.0,     // no downscale
}];
await sender.setParameters(params);
```

Clarity rules of thumb:
- **Resolution ≥ 1080p**, as high as the encoder/network allows.
- **Framerate low (6–10 fps)** — text doesn't move fast; spend the bitrate budget on each frame.
- **Bitrate high (6–12+ Mbps)** — prevents block artifacts around letters.
- **`maintain-resolution`** so congestion lowers FPS, not sharpness.
- Prefer a codec that keeps detail; if VP8/VP9/H.264/H.265 selectable, test which preserves small text best on target devices (document findings).

### 6.5 Recorder UI (minimal)

- Fullscreen preview with the detected quad outlined.
- Status chips: `Connected`, `Locked`, `Region OK/Lost`, current FPS/bitrate.
- Controls: Torch, Re-lock (re-converge exposure/focus), Quality preset (Clarity / Balanced), Flip camera, End session.

---

## 7. Admin device — detailed spec

### 7.1 Responsibilities

1. Receive and display the **live low-FPS feed** from Recorder.
2. **Capture a screenshot** (freeze the current frame at full resolution) on demand.
3. Store captures in a **dashboard gallery** (timestamped, thumbnailed).
4. Optional **crop / rotate / enhance** a capture; optional **OCR → editable code text**.
5. **Send** a selected image **or** code string to the Display over Link B.
6. Work equally on **desktop monitor and mobile** (responsive two-pane on desktop, stacked on mobile).

### 7.2 Screenshot capture

- **Web:** draw the `<video>` element's current frame to a `<canvas>` at the video's intrinsic resolution → `canvas.toBlob('image/webp' | 'image/jpeg', 0.95)`.
- **Native:** grab the current decoded frame from the remote track (or snapshot the rendering surface) → encode to a high-quality JPEG/WebP file.
- Save to in-memory gallery store with `{id, ts, blob, width, height, source:'live'}`.

### 7.3 Dashboard UI

```
Desktop (two-pane):
┌───────────────────────────────┬───────────────────────────┐
│  LIVE FEED (from Recorder)    │  GALLERY (captures)        │
│  [ video ]        ● Connected │  [thumb][thumb][thumb]...  │
│  [ Capture ] [ Quality: Clarity] │  selected → preview      │
│                               │  [Crop][Rotate][Enhance]   │
│                               │  [OCR → code]              │
│                               │  ───────────────────────   │
│                               │  SEND TO DISPLAY           │
│                               │  ( ) Image  ( ) Code       │
│                               │  [ Send ]   ● Display: OK  │
└───────────────────────────────┴───────────────────────────┘
Mobile: same, stacked / tabbed (Live | Gallery | Send).
```

### 7.4 Forwarding to Display (Link B)

- Admin holds a **second** WebRTC connection to the Display (data channel).
- On "Send": serialize per protocol (Section 11) and transmit.
- Large images: **chunk** over the data channel (16 KB chunks) with reassembly headers; respect `bufferedAmountLowThreshold` backpressure.

### 7.5 Control

"Admin can be controlled from monitor or mobile" = the Admin role is simply fully responsive; the same build runs on a desktop browser and a phone. No separate remote-control channel is required for v1.

---

## 8. Display device — detailed spec

### 8.1 Responsibilities

1. Maintain the incoming data channel from Admin.
2. Render whatever arrives, **full-screen**:
   - **Image:** fit-to-screen (contain) with optional pan/zoom; black background; no chrome.
   - **Code:** syntax-highlighted (Shiki/Prism), auto-detected or Admin-specified language, large readable font, light/dark theme, optional auto-fit font size.
3. Smooth transition when a new item replaces the current one.
4. Minimal/no UI (it's a projector/monitor surface). A hidden corner tap reveals connection status.

### 8.2 Render rules

- Keep the **last received** item on screen until the next arrives (no flicker/blank between sends).
- Respect a `renderMode` field (`image` | `code`) and optional `meta` (language, title, fit mode).

---

## 9. Image & text clarity engineering (deep dive)

The user's #1 requirement. Consolidated checklist for agents:

**At capture (Recorder):**
- Converge then **lock** exposure, focus, white balance for the whole session.
- Capture at the **highest stable resolution** the device + encoder allow.
- Keep **FPS low** (6–10) to free bitrate per frame.
- Offer **torch**; warn on glare/over-exposure.

**In the pipeline:**
- Perspective-correct to a flat rectangle (removes keystoning → letters are upright and evenly sized).
- **CLAHE / adaptive local contrast** to make text pop regardless of lighting.
- **Unsharp mask** tuned for edges (letter strokes), not noise.
- **Anti-moiré:** capturing a *screen* (not paper) produces interference patterns and refresh banding. Mitigate: mild pre-denoise, capture-high-then-downscale, slightly non-parallel angle, avoid exact pixel-grid alignment. Document this prominently — it's the hardest real-world issue.

**On the wire:**
- `degradationPreference: 'maintain-resolution'`, high `maxBitrate`, low `maxFramerate`.
- Test codecs for small-text fidelity on target hardware; pick the best; record the choice in `config`.

**At Admin capture:**
- Grab the **full intrinsic resolution** frame (not the on-screen scaled size).
- Encode screenshots at **WebP/JPEG quality ≥ 0.92**.

**For Display:**
- For code, prefer **OCR → real text → syntax highlight** when OCR confidence is high (crispest possible); otherwise forward the **image** (always reliable).

---

## 10. Performance targets

| Metric | Target |
|---|---|
| Recorder → Admin glass-to-glass latency (same LAN) | < 400 ms |
| Recorder → Admin latency (remote, good internet) | < 1.5 s |
| Admin capture → Display render | < 500 ms |
| Streamed resolution | ≥ 1080p (up to device/encoder max) |
| Streamed framerate | 6–10 fps (clarity mode) |
| Streamed bitrate | 6–12 Mbps (adaptive, capped) |
| Text legibility | 10–12px on-screen source code readable after capture |
| Reconnect after drop | < 5 s |

---

## 11. Message protocol (shared, versioned)

All non-media messages are JSON (control) or length-prefixed binary (image chunks). Keep it tiny and versioned.

```ts
// src/protocol/messages.ts
export const PROTOCOL_VERSION = 1;

export type ControlMsg =
  | { v: 1; t: 'hello'; role: Role; caps: string[] }
  | { v: 1; t: 'heartbeat'; ts: number }
  | { v: 1; t: 'quality'; fps: number; bitrate: number } // admin→recorder hint (future)
  | { v: 1; t: 'status'; state: string };

// Link B (Admin → Display) payloads:
export type DisplayPush =
  | { v: 1; t: 'render-code'; id: string; lang?: string; title?: string; code: string }
  | { v: 1; t: 'render-image-begin'; id: string; mime: string; bytes: number; w: number; h: number; fit?: 'contain'|'cover' }
  | { v: 1; t: 'render-image-chunk'; id: string; seq: number; data: /*base64 or binary*/ string }
  | { v: 1; t: 'render-image-end'; id: string };
```

**Image chunking rules:** 16 KB chunks; sender pauses when `dataChannel.bufferedAmount > HIGH_WATER`, resumes on `bufferedamountlow`. Receiver reassembles by `id`+`seq`, renders on `end`.

---

## 12. Security & privacy

- **Media & data are end-to-end encrypted** by WebRTC (DTLS-SRTP) — no extra work needed for the transport.
- **Pairing secrecy:** QR codes / room codes are the shared secret; room codes should be random (e.g., 8 chars). Optional **session PIN** the answerer must enter.
- **No persistence:** signaling helper holds rooms in memory only; no media ever touches it. Captures live in device memory (optional explicit "save to device").
- **Permissions:** request camera (Recorder) just-in-time with clear copy. No mic needed (don't request it).

---

## 13. Error handling & edge cases

| Case | Behavior |
|---|---|
| No quad detected | Fall back to locked full-frame; show "hold steady" hint; keep streaming |
| Glare / overexposed | Warn; suggest torch off / change angle |
| Network congestion | FPS drops (resolution preserved); show bitrate indicator |
| Peer disconnect | Mark degraded → auto-reconnect / re-pair prompt |
| QR too large | Compress; else animated multi-QR chunks |
| iOS Safari camera limits | Degrade manual controls gracefully; recommend native app for Recorder |
| OCR low confidence | Don't send garbled code; forward image instead, flag to operator |

---

## 14. Testing strategy

- **Unit:** protocol serialize/parse, chunk/reassemble, quad-smoothing math, SDP compress/decompress.
- **CV fixtures:** a set of photos of screens/code at various angles/lighting → assert warp + enhancement output (visual snapshot review).
- **Integration (local):** two browser tabs / two simulators on same LAN → full Recorder→Admin→Display flow.
- **Real-device matrix:** at minimum 1 iOS + 1 Android as Recorder; desktop Chrome + a phone as Admin/Display. Test same-LAN and cross-network (phone on cellular, desktop on Wi-Fi) to exercise STUN/TURN.
- **Clarity acceptance test:** photograph a screen of ~11px source code; verify it's readable after Admin capture on the Display. This is the go/no-go test.
- See `docs/testing.md` for the device matrix checklist.

---

## 15. Phased build roadmap (each milestone is demoable)

> Build in order. Each milestone produces something runnable, so work can be parallelized/handed off cleanly.

**M0 — Scaffold (½ day)**
- Expo app, TypeScript strict, expo-router, Zustand, role picker screen, Tamagui/NativeWind.
- Prebuild + Dev Client working on iOS + Android; web builds.
- ✅ Demo: pick a role, see a placeholder screen on all three platforms.
- **Progress (2026-10-19):** ✅ Web scaffold, access gate, role routes, and web export done. Styling uses plain `StyleSheet`; Tamagui/NativeWind deferred. Native prebuild/dev-client still pending. See `PROJECT-STATUS.md`.

**M1 — WebRTC loopback (core risk, do early)**
- `IConnection` + web impl + native impl. QR signaling (Mode 1) only.
- Prove a **data channel** connects two devices via QR; echo messages.
- ✅ Demo: two devices pair by QR and exchange text.

**M2 — Live video Recorder→Admin**
- Recorder: Vision Camera (native) / getUserMedia (web) → attach video track → Link A.
- Admin: render remote track. Apply low-FPS/high-res/`maintain-resolution` config.
- ✅ Demo: Admin sees Recorder's live camera, clearly, low FPS.

**M3 — Admin capture + gallery**
- Freeze full-res screenshot → gallery store → preview.
- ✅ Demo: tap Capture, see crisp still in dashboard.

**M4 — Admin→Display (Link B)**
- Second WebRTC session (data channel), image chunking + reassembly, Display full-screen image render.
- ✅ Demo: Admin sends a capture; Display shows it full-screen.

**M5 — CV enhancement pipeline (clarity)**
- Quad detection + perspective warp + CLAHE/unsharp on Recorder (native frame processor; web opencv.js). Quad smoothing + re-detect on movement. Fallback path.
- ✅ Demo: angled/dim screen comes out flat, sharp, steady.

**M6 — Camera lock + clarity tuning**
- Exposure/focus/WB lock, torch, quality presets, anti-moiré. Codec/bitrate tuning. Run the clarity acceptance test.
- ✅ Demo: 11px code readable end-to-end.

**M7 — Code mode + OCR (optional)**
- OCR capture → editable text → send as `render-code`; Display syntax-highlights (Shiki/Prism), auto-fit font.
- ✅ Demo: send actual selectable code to Display.

**M8 — Signaling helper (Mode 2) + remote pairing**
- Node/Python `ws` helper, room codes, Dockerfile. Trickle ICE. Optional TURN config.
- ✅ Demo: pair two devices on different networks via a room code.

**M9 — Resilience, polish, packaging**
- Heartbeats, auto-reconnect, status UI, session PIN. Responsive Admin desktop layout. Error hints.
- Build pipelines: web deploy, Android APK/AAB, iOS TestFlight.
- ✅ Demo: production-ish builds on all targets.

---

## 16. Concrete task backlog (agent pick-up list)

Grouped by area; each is a self-contained PR-sized unit.

- **CONN-1** Implement `IConnection` interface + web `RTCPeerConnection` impl (data channel only).
- **CONN-2** Native `react-native-webrtc` impl behind same interface.
- **CONN-3** QR signaling: SDP gzip+base64, single + chunked animated QR, scan/reassemble.
- **CONN-4** Add video track to Link A; apply encoder params (`maintain-resolution`, bitrate, fps).
- **CONN-5** Signaling helper service (`services/signaling`) + Dockerfile + room matching.
- **CAM-1** `ICameraSource` + web getUserMedia impl + preview.
- **CAM-2** Native Vision Camera impl + format/fps selection.
- **CAM-3** Exposure/focus/WB lock + torch (native) + best-effort web constraints.
- **CV-1** Quad detection (web opencv.js) on worker; return 4 points.
- **CV-2** Native frame-processor quad detection.
- **CV-3** Perspective warp + CLAHE + unsharp (shared tuning params).
- **CV-4** Quad smoothing (EMA) + movement threshold + re-detect + fallback.
- **ADMIN-1** Remote track render + Capture (full-res canvas/bitmap → WebP).
- **ADMIN-2** Gallery store + thumbnails + preview + crop/rotate.
- **ADMIN-3** Responsive two-pane (desktop) / stacked (mobile) dashboard.
- **LINKB-1** Image chunker + backpressure + Display reassembly/render.
- **DISP-1** Full-screen image render (contain/cover, pan/zoom).
- **DISP-2** Code render (Shiki/Prism) + auto-fit font + themes.
- **OCR-1** ML Kit (native) + tesseract.js (web) → text + confidence.
- **PROTO-1** `messages.ts` schemas + codec + version guard + tests.
- **RES-1** Heartbeats, reconnection, status UI, session PIN.
- **DEPLOY-1** Web static deploy; **DEPLOY-2** Android build; **DEPLOY-3** iOS build; **DEPLOY-4** coturn docker-compose.

---

## 17. Configuration & tunables (single source of truth)

```ts
// src/config/index.ts
export const CONFIG = {
  TARGET_FPS: 8,                 // clarity mode
  HIGH_BITRATE_BPS: 16_000_000,  // 16 Mbps ceiling; congestion control still adapts
  DEGRADATION: 'maintain-resolution' as const,
  CAPTURE_RESOLUTION: { width: 1920, height: 1080 },
  QUAD_MOVE_THRESHOLD: 0.03,     // fraction of frame; re-warp if quad shifts more
  QUAD_SMOOTHING_ALPHA: 0.4,     // EMA
  JPEG_WEBP_QUALITY: 0.95,
  DATACHANNEL_CHUNK: 16 * 1024,
  DC_HIGH_WATER: 1 * 1024 * 1024,
  HEARTBEAT_MS: 2000,
  MISSED_BEATS_DEGRADE: 3,
  ICE_SERVERS: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  SIGNALING_WS_URL: '',          // set for Mode 2
  OCR_MIN_CONFIDENCE: 0.75,
};
```

---

## 18. Deployment

### 18.1 Web (Admin/Display primary; Recorder optional)
- `expo export --platform web` → static site. Host on home server (Nginx), Vercel, Netlify, or Cloudflare Pages. **HTTPS is mandatory** (camera + WebRTC require secure context).

### 18.2 Android
- `eas build -p android` → APK (sideload/test) or AAB (Play Store). Declare camera permission; Vision Camera + WebRTC config plugins in `app.config.ts`.

### 18.3 iOS
- `eas build -p ios` → TestFlight → App Store. `NSCameraUsageDescription` set. Note App Store review needs clear camera-use justification.

### 18.4 Signaling helper (optional, Mode 2)
- `docker build` the `services/signaling` image; run on home server with a public hostname + TLS (Caddy/Nginx reverse proxy for `wss://`). In-memory rooms; restart-safe is fine since sessions are ephemeral.

### 18.5 TURN (optional, hard-NAT remote)
- `infra/coturn` docker-compose on home server (ports 3478/5349 + relay range), static credentials; add to `ICE_SERVERS`. Only needed if direct P2P fails across networks.

---

## 19. Known challenges & honest caveats

- **Screen-capture moiré/refresh banding** is the toughest real-world issue (M5/M6). Budget time; the anti-moiré mitigations in Section 9 help but won't be perfect at all angles.
- **iOS Safari** limits manual camera control and some WebRTC features — that's *why* Recorder is native-first. Web Recorder is a convenience, not the clarity path.
- **OCR on code** is imperfect (symbols, indentation, ligatures). Default to forwarding the **image**; treat OCR→text as an assist the operator verifies.
- **QR SDP size** can require chunked/animated QR — handle it or default remote users to Mode 2.
- **Single Display in v1.** Multi-display fan-out (Admin → N displays) and Admin→Recorder control hints are documented future work, not v1 scope.
- **Battery/thermal** on Recorder during long CV+streaming sessions — allow a "Balanced" preset (lower res/bitrate) for endurance.

---

## 20. Glossary

- **SDP** — Session Description Protocol; the connection "business card" peers exchange.
- **ICE/STUN/TURN** — NAT-traversal machinery; STUN finds your public address, TURN relays media if direct fails.
- **Data channel** — WebRTC's reliable/ordered message pipe (used for control + Admin→Display).
- **Quad** — the 4-corner region of the detected screen/page.
- **CLAHE** — Contrast-Limited Adaptive Histogram Equalization (local contrast for legible text).
- **degradationPreference** — WebRTC knob choosing what to sacrifice under load (we choose *framerate*, not resolution).

---

## 21. How to use this document (for AI coding agents)

1. **Read Sections 1–5 and 11 first** — they define the product, the platform split, and the shared protocol. Everything depends on them.
2. **Build strictly in the M0→M9 order** (Section 15). Each milestone is demoable; do not skip ahead. M1 (WebRTC loopback) and M5 (CV clarity) are the two highest-risk milestones — validate them early with throwaway spikes if needed.
3. **Respect the platform split** (Section 2.3): never import `react-native-webrtc` or `react-native-vision-camera` into web code. Program against `IConnection` / `ICameraSource` and select the implementation at build/runtime.
4. **Keep the protocol versioned** (Section 11). Any new message type bumps handling, never breaks `v:1`.
5. **Treat Section 9 (clarity) as acceptance criteria**, not suggestions — the 11px-code readability test is go/no-go.
6. **Put every tunable in `src/config`** (Section 17). No magic numbers in feature code.
7. **One task per PR** from the backlog (Section 16); update this doc's roadmap checkboxes as milestones land.
8. **When blocked by a genuine product decision** (e.g., multi-display, auth), stop and ask the human — don't invent scope.

---

*End of ClearRelay build plan v1.*
