# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the repository root (npm workspaces).

```bash
npm install                   # Install all workspace dependencies
npm run web                   # Start Expo web dev server
npm run typecheck             # TypeScript strict mode check
npm run lint                  # ESLint via expo lint
npm test                      # Vitest unit tests
npm test -- <file>            # Single test file, e.g. src/protocol/messages.test.ts
npm run export:web            # Static web export to apps/mobile-web/dist
```

Node 22.13+ is required (see `.nvmrc`).

## Architecture

ClearRelay is a serverless P2P screen relay. Three roles communicate over WebRTC with no media server:

- **Recorder** (phone) — streams camera video (1920×1080, 8 FPS) to Admin via Link A
- **Admin** — watches live feed, captures stills, sends images/code to Projector via Link B
- **Projector** — renders full-screen whatever Admin sends

**Link A:** Recorder → Admin — WebRTC video track + control data channel  
**Link B:** Admin → Projector — WebRTC data channel only (reliable, ordered)  
**Signaling:** QR codes by default (SDP compressed via gzip + base64url, prefixed `CR1.`); WebSocket helper is unimplemented.

### Code layout

The single app lives in `apps/mobile-web/src/`:

| Path | Purpose |
|------|---------|
| `app/` | expo-router file-based routes (index, recorder, admin, projector, pair) |
| `connection/` | WebRTC abstraction — `IConnection` interface, `connection.web.ts` impl, `signal.ts` SDP codec |
| `camera/` | Camera abstraction — `ICameraSource` interface, `camera.web.ts` impl |
| `protocol/` | Wire protocol — `messages.ts` types + parse/serialize, `messages.test.ts` |
| `store/session.ts` | Zustand session state (unlock, role, signalingMode) |
| `hooks/use-pairing.ts` | Pairing state machine (idle → creating-invite → waiting-for-answer → connected) |
| `config/index.ts` | All tunables (FPS, bitrate, ICE servers, chunk sizes, etc.) |

### Platform abstraction pattern

Platform-specific code lives in sibling files: `foo.ts` selects the implementation, `foo.web.ts` is the browser version, native will be `foo.native.ts` (not yet written). Never import `.web.ts` directly — always import through the index/selector.

### Protocol rules

`src/protocol/messages.ts` is **versioned and immutable once deployed**. Don't change existing message shapes — add new fields as optional. `parseMessage()` validates untrusted JSON from the wire and returns `null` on any malformed input.

### Key config values (config/index.ts)

- `ACCESS_KEY = 'Thiswillbekey1901'` — client-side gate, overridable via `EXPO_PUBLIC_ACCESS_KEYS` env var
- `TARGET_FPS: 8` — intentionally low; never trade text clarity for smooth motion
- `DEGRADATION: 'maintain-resolution'` — never drop pixel count
- `ICE_GATHERING_TIMEOUT_MS: 12_000` — non-trickle ICE for QR pairing

### Current status

M0 (scaffold) is complete: routing, access gate, role picker, protocol module + tests, Zustand store, UI shells, CI, GitHub Pages deploy (live at https://naveenmorla1901.github.io/omni-relay/).

**Not yet implemented:** WebRTC (`connection.web.ts` skeleton only), camera capture, CV pipeline, native builds.

Next milestone (M1): implement `IConnection` for web with non-trickle ICE, QR generation/scanning, two-browser-tab echo test.

## Key reference files

Before changing architecture, read:
- `ClearRelay-Build-Plan.md` — sections 1–5 (product), 11 (protocol), 21 (milestones)
- `AGENTS.md` — AI agent guidelines for this repo
- `PROJECT-STATUS.md` — milestone checklist and open decisions
