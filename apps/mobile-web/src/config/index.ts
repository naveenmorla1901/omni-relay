/**
 * Single source of truth for product tunables (ClearRelay-Build-Plan.md §17).
 * Feature code must import from here instead of hard-coding magic numbers.
 */

/**
 * Client-side access key. It is bundled into the app, so it is a UI gate only,
 * not authentication. Change this string to change the key.
 */
export const ACCESS_KEY = 'Thiswillbekey1901';

const EXTRA_ACCESS_KEYS = (process.env.EXPO_PUBLIC_ACCESS_KEYS ?? '')
  .split(',')
  .map((key) => key.trim())
  .filter(Boolean);

/** The built-in key always works; env vars can add extra keys at build time. */
export const ACCESS_KEYS = Array.from(new Set([ACCESS_KEY, ...EXTRA_ACCESS_KEYS]));

/** Shown in every role's top bar so stale tabs/APKs are obvious. Bump with each `v*` tag. */
export const APP_BUILD = 'v0.1.13';

export const CONFIG = {
  /** Low FPS is intentional: preserve pixels for photographed text. Encoder cap only. */
  TARGET_FPS: 8,
  /**
   * Sensor frame rate. Requesting 8 fps from the camera lets auto-exposure use
   * ~1/8 s shutters, which smears handheld text; 30 fps caps exposure near 1/30 s.
   * The encoder still drops to TARGET_FPS, so bandwidth per frame is unchanged.
   */
  CAMERA_CAPTURE_FPS: 30,
  /** Text clarity is the goal; congestion control still lowers the actual rate. */
  HIGH_BITRATE_BPS: 16_000_000,
  DEGRADATION: 'maintain-resolution',
  /** Preferred camera request; devices may negotiate a lower actual size. */
  CAMERA_PREFERRED_RESOLUTION: { width: 3840, height: 2160 },
  CAMERA_MIN_RESOLUTION: { width: 1280, height: 720 },
  CAMERA_FALLBACK_RESOLUTION: { width: 640, height: 480 },
  /** Explicit lenses below this cannot resolve photographed small text reliably. */
  CAMERA_TEXT_MIN_PIXELS: 1920 * 1080,
  CAPTURE_RESOLUTION: { width: 1920, height: 1080 },
  CAMERA_AUTO_SETTLE_MS: 1_500,
  QUAD_MOVE_THRESHOLD: 0.03,
  QUAD_SMOOTHING_ALPHA: 0.4,
  QUAD_MAX_CANDIDATES: 10,
  QUAD_DETECTION_BUDGET_MS: 1_500,
  AUTO_CROP_ON_DETECT: true,
  /** Capture several live frames and keep the sharpest (~125 ms each at 8 fps). */
  CAPTURE_SAMPLE_COUNT: 5,
  CAPTURE_FRAME_TIMEOUT_MS: 400,
  CAPTURE_CONTRAST: 1.15,
  CAPTURE_BRIGHTNESS: 1.03,
  CAPTURE_JPEG_QUALITY: 0.97,
  /** Luma-only sharpening avoids colored halos around white screen text. */
  CAPTURE_UNSHARP_AMOUNT: 1.2,
  CAPTURE_UNSHARP_BLUR_PX: 1.2,
  CAPTURE_UNSHARP_THRESHOLD: 2,
  /** CLAHE recovers local contrast from dark screens and uneven glare. */
  CAPTURE_CLAHE_TILES: 8,
  CAPTURE_CLAHE_CLIP_LIMIT: 2.2,
  CAPTURE_CLAHE_STRENGTH: 0.55,
  /**
   * Focus recovery (lib/focus-recovery.ts): a tilted phone leaves the far edge
   * of the screen out of focus. Blurry tiles get extra fine + coarse luma
   * sharpening; overshoot is clamped to the local range so there are no halos.
   * Tuned on 4K device captures: top-band edge sharpness 0.64 → 0.80.
   */
  CAPTURE_FOCUS_FINE: 0.5,
  CAPTURE_FOCUS_COARSE: 1.2,
  CAPTURE_FOCUS_OVERSHOOT: 3,
  /** Chroma-only blur that removes screen moiré colour without touching text. */
  CAPTURE_CHROMA_SIGMA: 2.5,
  /** Lighter pass after the perspective warp, which resamples (and stretches the far edge). */
  CROP_FOCUS_FINE: 0.25,
  CROP_FOCUS_COARSE: 0.5,
  CROP_FOCUS_OVERSHOOT: 0,
  /** Report a soft edge when its tiles lack this much sharpness versus the opposite edge. */
  FOCUS_SOFT_EDGE_SPREAD: 0.15,
  JPEG_WEBP_QUALITY: 0.95,
  /** Projector stage: rendered at the Projector's physical pixels, capped here. */
  STAGE_MAX_LONG_SIDE: 2560,
  STAGE_JPEG_QUALITY: 0.92,
  /** Live stage edits are batched so a drag sends a frame, not a flood. */
  STAGE_SEND_DEBOUNCE_MS: 250,
  STAGE_PREVIEW_MAX_HEIGHT: 560,
  /** Projector re-reports its screen until Admin answers `stage-ready`. */
  STAGE_VIEWPORT_RETRY_MS: 3_000,
  /** Projector warns when no current Admin has answered in this time. */
  STAGE_READY_TIMEOUT_MS: 8_000,
  /** Projector re-reports its screen this often so a lost relay slot is noticed. */
  STAGE_HEARTBEAT_MS: 15_000,
  /** Admin warns when the Projector has not confirmed a frame in this time. */
  STAGE_ACK_TIMEOUT_MS: 6_000,
  /** Recorder/Projector rejoin the room after the relay socket drops (backoff). */
  RECONNECT_BASE_MS: 1_000,
  RECONNECT_MAX_MS: 15_000,
  /**
   * Admin moves the session to a fresh relay room this often. The deployed
   * relay expires rooms 30 min after creation; connected devices follow the
   * move on their own, so a session lasts as long as Admin stays open.
   */
  ROOM_MOVE_MS: 25 * 60_000,
  ROOM_MOVE_RETRY_MS: 30_000,
  /** The old room's socket stays open this long to redirect late peers, past the relay's expiry. */
  ROOM_RETIRE_MS: 7 * 60_000,
  /** A Link A ICE `disconnected` lasting this long is treated as failed and re-offered. */
  LINK_DISCONNECT_GRACE_MS: 4_000,
  DATACHANNEL_CHUNK: 16 * 1024,
  DC_HIGH_WATER: 1 * 1024 * 1024,
  HEARTBEAT_MS: 2000,
  MISSED_BEATS_DEGRADE: 3,
  ICE_GATHERING_TIMEOUT_MS: 12_000,
  ICE_SERVERS: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  SIGNALING_WS_URL: process.env.EXPO_PUBLIC_SIGNALING_URL ?? 'wss://omni-relay-production-d45c.up.railway.app',
  OCR_MIN_CONFIDENCE: 0.75,
} as const;
