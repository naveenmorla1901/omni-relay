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
  TARGET_FPS: 8,
  HIGH_BITRATE_BPS: 8_000_000,
  DEGRADATION: 'maintain-resolution',
  CAPTURE_RESOLUTION: { width: 1920, height: 1080 },
  QUAD_MOVE_THRESHOLD: 0.03,
  QUAD_SMOOTHING_ALPHA: 0.4,
  JPEG_WEBP_QUALITY: 0.95,
  DATACHANNEL_CHUNK: 16 * 1024,
  DC_HIGH_WATER: 1 * 1024 * 1024,
  HEARTBEAT_MS: 2000,
  MISSED_BEATS_DEGRADE: 3,
  ICE_SERVERS: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  SIGNALING_WS_URL: '',
  OCR_MIN_CONFIDENCE: 0.75,
} as const;
