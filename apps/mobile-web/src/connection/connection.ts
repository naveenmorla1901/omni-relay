import type { IConnection } from './IConnection';

/**
 * Native WebRTC (react-native-webrtc) is the next platform implementation.
 * Until it lands, native builds fail with a clear message instead of silently
 * claiming a connection exists.
 */
export function createConnection(): IConnection {
  throw new Error('Native WebRTC is not implemented yet. Use the web build for pairing.');
}
