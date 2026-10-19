import { describe, expect, it } from 'vitest';

import { decodeSignal, encodeSignal } from './signal';

const offer = {
  t: 'offer' as const,
  sdp: [
    'v=0',
    'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'a=group:BUNDLE 0 1',
    'm=video 9 UDP/TLS/RTP/SAVPF 96',
    'a=mid:0',
    'a=sendonly',
    'a=rtpmap:96 VP8/90000',
    'a=candidate:1 1 udp 2113937151 192.168.1.10 54400 typ host generation 0',
    'a=candidate:2 1 udp 2113937151 203.0.113.40 54400 typ srflx generation 0',
    'a=end-of-candidates',
  ].join('\r\n'),
};

describe('pairing signal codes', () => {
  it('round-trips a compressed SDP', () => {
    const code = encodeSignal(offer);

    expect(code.startsWith('CR1.')).toBe(true);
    expect(code.length).toBeLessThan(900);
    expect(decodeSignal(code)).toEqual(offer);
  });

  it('tolerates whitespace from a manual paste', () => {
    const code = encodeSignal(offer);

    expect(decodeSignal(`  ${code.slice(0, 40)}\n${code.slice(40)}  `)).toEqual(offer);
  });

  it('rejects a code without the ClearRelay prefix', () => {
    expect(() => decodeSignal('not-a-pair-code')).toThrow('not a ClearRelay pair code');
  });

  it('rejects a damaged code', () => {
    const code = encodeSignal(offer);

    expect(() => decodeSignal(`${code.slice(0, -8)}AAAA`)).toThrow();
  });
});
