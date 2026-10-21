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
  /** Capture several live frames and keep the sharpest before enhancement. */
  CAPTURE_SAMPLE_COUNT: 3,
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
  JPEG_WEBP_QUALITY: 0.95,
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
