/**
 * Shared wire protocol. The plan is the source of truth: ClearRelay-Build-Plan.md §11.
 * Rules: never change the meaning of a v:1 message; add a new message type instead.
 */

export const PROTOCOL_VERSION = 1 as const;

export type ProtocolVersion = typeof PROTOCOL_VERSION;
/** `display` is the wire/plan name; the app presents it as Projector. */
export type Role = 'recorder' | 'admin' | 'display';
export type SignalingMode = 'qr' | 'ws';
export type CameraFacingMode = 'user' | 'environment' | 'unknown';

/** Link A control channel and general session control. */
export type ControlMsg =
  | { v: ProtocolVersion; t: 'hello'; role: Role; caps: string[] }
  | { v: ProtocolVersion; t: 'heartbeat'; ts: number }
  | { v: ProtocolVersion; t: 'quality'; fps: number; bitrate: number }
  | { v: ProtocolVersion; t: 'status'; state: string }
  /** Recorder state used to keep the Admin preview orientation in sync. */
  | { v: ProtocolVersion; t: 'camera'; facingMode: CameraFacingMode; mirrored: boolean }
  /** Recorder asks Admin to re-run capture detection after a camera re-lock. */
  | { v: ProtocolVersion; t: 'redetect' };

/** Link B (Admin -> Display) payloads. */
export type DisplayPush =
  | {
      v: ProtocolVersion;
      t: 'render-code';
      id: string;
      lang?: string;
      title?: string;
      code: string;
    }
  | {
      v: ProtocolVersion;
      t: 'render-image-begin';
      id: string;
      mime: string;
      bytes: number;
      w: number;
      h: number;
      fit?: 'contain' | 'cover';
    }
  | { v: ProtocolVersion; t: 'render-image-chunk'; id: string; seq: number; data: string }
  | { v: ProtocolVersion; t: 'render-image-end'; id: string };

/**
 * Link B stage (Projector <-> Admin). Sent through the WS relay's `sdp`
 * forward with `kind: 'stage'`, which every deployed relay version passes
 * through untouched.
 */
export type StageMsg =
  /** Projector screen in CSS px plus device pixel ratio. */
  | { v: ProtocolVersion; t: 'viewport'; w: number; h: number; dpr: number }
  /** A rendered stage bitmap; `data` is raw base64 (no data-URL prefix). */
  | { v: ProtocolVersion; t: 'stage-frame'; id: string; mime: string; data: string; w: number; h: number }
  | { v: ProtocolVersion; t: 'stage-clear' }
  /** Admin answers a `viewport`: its stage editor is open (older Admins never send it). */
  | { v: ProtocolVersion; t: 'stage-ready' }
  /** Projector confirms a `stage-frame` is decoded and on screen. */
  | { v: ProtocolVersion; t: 'stage-ack'; id: string }
  /**
   * Admin moved the session to a fresh relay room (the deployed relay expires
   * rooms 30 min after creation). Recorder/Projector rejoin `code` silently.
   * Sent over the relay and, to the Recorder, over Link A too.
   */
  | { v: ProtocolVersion; t: 'room-move'; code: string };

export type ProtocolMessage = ControlMsg | DisplayPush | StageMsg;

const ROLES: readonly Role[] = ['recorder', 'admin', 'display'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && ROLES.includes(value as Role);
}

function isControlMsg(value: Record<string, unknown>): value is ControlMsg {
  switch (value.t) {
    case 'hello':
      return (
        isRole(value.role) &&
        Array.isArray(value.caps) &&
        value.caps.every((cap) => typeof cap === 'string')
      );
    case 'heartbeat':
      return isFiniteNumber(value.ts);
    case 'quality':
      return isFiniteNumber(value.fps) && isFiniteNumber(value.bitrate);
    case 'status':
      return typeof value.state === 'string';
    case 'camera':
      return (
        (value.facingMode === 'user' || value.facingMode === 'environment' || value.facingMode === 'unknown') &&
        typeof value.mirrored === 'boolean'
      );
    case 'redetect':
      return true;
    default:
      return false;
  }
}

function isDisplayPush(value: Record<string, unknown>): value is DisplayPush {
  switch (value.t) {
    case 'render-code':
      return (
        isNonEmptyString(value.id) &&
        isNonEmptyString(value.code) &&
        isOptionalString(value.lang) &&
        isOptionalString(value.title)
      );
    case 'render-image-begin':
      return (
        isNonEmptyString(value.id) &&
        isNonEmptyString(value.mime) &&
        isFiniteNumber(value.bytes) &&
        isFiniteNumber(value.w) &&
        isFiniteNumber(value.h) &&
        (value.fit === undefined || value.fit === 'contain' || value.fit === 'cover')
      );
    case 'render-image-chunk':
      return (
        isNonEmptyString(value.id) &&
        isFiniteNumber(value.seq) &&
        typeof value.data === 'string'
      );
    case 'render-image-end':
      return isNonEmptyString(value.id);
    default:
      return false;
  }
}

function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isStageMsg(value: Record<string, unknown>): value is StageMsg {
  switch (value.t) {
    case 'viewport':
      return isPositiveNumber(value.w) && isPositiveNumber(value.h) && isPositiveNumber(value.dpr);
    case 'stage-frame':
      return (
        isNonEmptyString(value.id) &&
        typeof value.mime === 'string' &&
        value.mime.startsWith('image/') &&
        isNonEmptyString(value.data) &&
        isPositiveNumber(value.w) &&
        isPositiveNumber(value.h)
      );
    case 'stage-clear':
    case 'stage-ready':
      return true;
    case 'stage-ack':
      return isNonEmptyString(value.id);
    case 'room-move':
      return typeof value.code === 'string' && /^[A-Z0-9]{6}$/.test(value.code);
    default:
      return false;
  }
}

/** Parse untrusted JSON. Returns null for malformed, unknown, or wrong-version payloads. */
export function parseMessage(raw: string): ProtocolMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(value) || value.v !== PROTOCOL_VERSION) {
    return null;
  }

  if (isControlMsg(value) || isDisplayPush(value) || isStageMsg(value)) {
    return value;
  }

  return null;
}

export function serializeMessage(message: ProtocolMessage): string {
  return JSON.stringify(message);
}
