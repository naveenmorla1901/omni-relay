import type { Role, SignalingMode } from '@/protocol/messages';

/** Mirrors the subset of RTCPeerConnectionState the UI cares about. */
export type ConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

/**
 * Platform-neutral WebRTC boundary (ClearRelay-Build-Plan.md §5).
 * Implementations: native.ts (react-native-webrtc) and web.ts (browser).
 * Never import a platform implementation from shared code.
 */
export interface IConnection {
  init(role: Role, mode: SignalingMode): Promise<void>;
  createOffer(): Promise<string>;
  acceptOffer(offer: string): Promise<string>;
  acceptAnswer(answer: string): Promise<void>;
  close(): void;

  attachVideoTrack(track: MediaStreamTrack): void;
  onRemoteTrack(callback: (stream: MediaStream) => void): void;

  sendData(message: Uint8Array | string): void;
  onData(callback: (message: ArrayBuffer | string) => void): void;

  onState(callback: (state: ConnectionState) => void): void;
}
