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

  it('rejects an unknown role', () => {
    expect(
      parseMessage(
        JSON.stringify({ v: PROTOCOL_VERSION, t: 'hello', role: 'viewer', caps: [] }),
      ),
    ).toBeNull();
  });
});
