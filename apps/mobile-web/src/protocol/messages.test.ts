import { describe, expect, it } from 'vitest';

import {
  PROTOCOL_VERSION,
  parseMessage,
  serializeMessage,
  type DisplayPush,
} from '@/protocol/messages';

describe('parseMessage', () => {
  it('round-trips a control message', () => {
    const message = {
      v: PROTOCOL_VERSION,
      t: 'heartbeat' as const,
      ts: 1_700_000_000_000,
    };

    expect(parseMessage(serializeMessage(message))).toEqual(message);
  });

  it('round-trips a camera state message', () => {
    const message = {
      v: PROTOCOL_VERSION,
      t: 'camera' as const,
      facingMode: 'user' as const,
      mirrored: true,
    };

    expect(parseMessage(serializeMessage(message))).toEqual(message);
  });

  it('round-trips a redetect request', () => {
    const message = {
      v: PROTOCOL_VERSION,
      t: 'redetect' as const,
    };

    expect(parseMessage(serializeMessage(message))).toEqual(message);
  });

  it('rejects a camera message with an invalid facing mode', () => {
    expect(
      parseMessage(
        JSON.stringify({ v: PROTOCOL_VERSION, t: 'camera', facingMode: 'sideways', mirrored: false }),
      ),
    ).toBeNull();
  });

  it('accepts a complete image-begin push', () => {
    const message: DisplayPush = {
      v: PROTOCOL_VERSION,
      t: 'render-image-begin',
      id: 'capture-1',
      mime: 'image/webp',
      bytes: 1_048_576,
      w: 1920,
      h: 1080,
      fit: 'contain',
    };

    expect(parseMessage(serializeMessage(message))).toEqual(message);
  });

  it('rejects malformed JSON', () => {
    expect(parseMessage('{not-json')).toBeNull();
  });

  it('rejects a mismatched protocol version', () => {
    expect(parseMessage(JSON.stringify({ v: PROTOCOL_VERSION + 1, t: 'status', state: 'ok' }))).toBeNull();
  });

  it('rejects unknown message types', () => {
    expect(parseMessage(JSON.stringify({ v: PROTOCOL_VERSION, t: 'not-a-message' }))).toBeNull();
  });

  it('rejects display pushes with missing required fields', () => {
    expect(
      parseMessage(JSON.stringify({ v: PROTOCOL_VERSION, t: 'render-image-chunk', id: 'x' })),
    ).toBeNull();
  });

  it('round-trips stage viewport, frame, and clear messages', () => {
    const messages = [
      { v: PROTOCOL_VERSION, t: 'viewport' as const, w: 390, h: 844, dpr: 3 },
      { v: PROTOCOL_VERSION, t: 'stage-frame' as const, id: 'f1', mime: 'image/jpeg', data: 'AAAA', w: 1170, h: 2532 },
      { v: PROTOCOL_VERSION, t: 'stage-clear' as const },
      { v: PROTOCOL_VERSION, t: 'stage-ready' as const },
      { v: PROTOCOL_VERSION, t: 'stage-ack' as const, id: 'f1' },
    ];

    for (const message of messages) {
      expect(parseMessage(serializeMessage(message))).toEqual(message);
    }
  });

  it('rejects stage messages with unusable sizes or non-image payloads', () => {
    expect(parseMessage(JSON.stringify({ v: PROTOCOL_VERSION, t: 'viewport', w: 0, h: 844, dpr: 3 }))).toBeNull();
    expect(
      parseMessage(
        JSON.stringify({ v: PROTOCOL_VERSION, t: 'stage-frame', id: 'f', mime: 'text/html', data: 'x', w: 1, h: 1 }),
      ),
    ).toBeNull();
    expect(parseMessage(JSON.stringify({ v: PROTOCOL_VERSION, t: 'stage-ack', id: '' }))).toBeNull();
  });

  it('rejects an unknown role', () => {
    expect(
      parseMessage(
        JSON.stringify({ v: PROTOCOL_VERSION, t: 'hello', role: 'viewer', caps: [] }),
      ),
    ).toBeNull();
  });
});
