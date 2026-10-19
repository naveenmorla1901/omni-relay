import { gzipSync, gunzipSync } from 'fflate';

export type SignalKind = 'offer' | 'answer';

export type SignalPayload = {
  t: SignalKind;
  sdp: string;
};

const SIGNAL_PREFIX = 'CR1.';
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

/** Compresses an SDP offer/answer into a compact, QR-friendly string. */
export function encodeSignal(payload: SignalPayload): string {
  const json = JSON.stringify(payload);
  const compressed = gzipSync(textEncoder.encode(json), { level: 9 });
  return `${SIGNAL_PREFIX}${bytesToBase64Url(compressed)}`;
}

/** Parses a pair code from a QR scan or manual paste. Throws a user-safe error. */
export function decodeSignal(code: string): SignalPayload {
  const normalized = code.trim().replace(/\s+/g, '');

  if (!normalized.startsWith(SIGNAL_PREFIX)) {
    throw new Error('That is not a ClearRelay pair code.');
  }

  let json: string;
  try {
    json = textDecoder.decode(gunzipSync(base64UrlToBytes(normalized.slice(SIGNAL_PREFIX.length))));
  } catch {
    throw new Error('The pair code is damaged or incomplete.');
  }

  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error('The pair code is damaged or incomplete.');
  }

  if (
    typeof value !== 'object' ||
    value === null ||
    !('t' in value) ||
    (value.t !== 'offer' && value.t !== 'answer') ||
    !('sdp' in value) ||
    typeof value.sdp !== 'string' ||
    value.sdp.length === 0
  ) {
    throw new Error('The pair code is not a valid offer or answer.');
  }

  return { t: value.t, sdp: value.sdp };
}
