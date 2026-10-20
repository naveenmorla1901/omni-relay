/**
 * Native WebRTC implementation using react-native-webrtc.
 * The API mirrors the browser's RTCPeerConnection closely enough that most of
 * the logic is identical to connection.web.ts; the differences are:
 *   - RTCPeerConnection / RTCSessionDescription come from the package, not globals
 *   - createOffer/createAnswer return the description directly (no implicit setLocalDescription)
 *   - type casts are needed where react-native-webrtc's types diverge from browser DOM types
 */
import {
  MediaStream,
  RTCPeerConnection,
  RTCSessionDescription,
} from 'react-native-webrtc';

import { CONFIG } from '@/config';
import type { Role, SignalingMode } from '@/protocol/messages';

import type { ConnectionState, IConnection } from './IConnection';
import { decodeSignal, encodeSignal } from './signal';

class NativeConnection implements IConnection {
  private pc: any = null;
  private channel: any = null;
  private videoSender: any = null;
  private pendingData: (Uint8Array | string)[] = [];
  private remoteTrackCallback: ((stream: MediaStream) => void) | null = null;
  private dataCallback: ((message: ArrayBuffer | string) => void) | null = null;
  private stateCallback: ((state: ConnectionState) => void) | null = null;

  async init(role: Role, _mode: SignalingMode): Promise<void> {
    this.close();

    const pc = new RTCPeerConnection({
      iceServers: CONFIG.ICE_SERVERS.map((s) => ({ urls: s.urls })),
      iceCandidatePoolSize: 4,
    } as any);

    this.pc = pc;
    pc.onconnectionstatechange = () => this.emitState();
    pc.oniceconnectionstatechange = () => this.emitState();

    pc.ontrack = (event: any) => {
      const stream: MediaStream = event.streams?.[0] ?? new MediaStream([event.track]);
      this.remoteTrackCallback?.(stream);
    };

    if (role === 'recorder') {
      this.channel = pc.createDataChannel('clearrelay-control', { ordered: true });
      this.bindChannel(this.channel);
      const transceiver = pc.addTransceiver('video', { direction: 'sendonly' });
      this.videoSender = transceiver?.sender ?? null;
    } else {
      pc.ondatachannel = (event: any) => {
        this.channel = event.channel;
        this.bindChannel(this.channel);
      };
    }
  }

  async createOffer(): Promise<string> {
    const pc = this.requirePc();
    const offer = await pc.createOffer({});
    await pc.setLocalDescription(new RTCSessionDescription(offer));
    await waitForIceGathering(pc);
    return encodeSignal({ t: 'offer', sdp: pc.localDescription?.sdp ?? '' });
  }

  async acceptOffer(offer: string): Promise<string> {
    const pc = this.requirePc();
    const signal = decodeSignal(offer);
    if (signal.t !== 'offer') throw new Error('That code is an answer, not an invite.');
    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(new RTCSessionDescription(answer));
    await waitForIceGathering(pc);
    return encodeSignal({ t: 'answer', sdp: pc.localDescription?.sdp ?? '' });
  }

  async acceptAnswer(answer: string): Promise<void> {
    const pc = this.requirePc();
    const signal = decodeSignal(answer);
    if (signal.t !== 'answer') throw new Error('That code is an invite, not an answer.');
    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
  }

  close(): void {
    this.pendingData = [];
    try { this.channel?.close(); } catch { /* already closed */ }
    try { this.pc?.close(); } catch { /* already closed */ }
    this.channel = null;
    this.pc = null;
    this.videoSender = null;
  }

  attachVideoTrack(track: MediaStreamTrack): void {
    if (this.videoSender) {
      void this.videoSender
        .replaceTrack(track)
        .then(() => this.applyEncoderParams())
        .catch((error: unknown) => console.warn('Could not attach the camera track.', error));
    } else {
      this.pc?.addTrack(track);
    }
  }

  onRemoteTrack(callback: (stream: globalThis.MediaStream) => void): void {
    this.remoteTrackCallback = callback as any;
  }

  sendData(message: Uint8Array | string): void {
    if (this.channel?.readyState === 'open') {
      this.channel.send(message);
      return;
    }
    this.pendingData.push(message);
  }

  onData(callback: (message: ArrayBuffer | string) => void): void {
    this.dataCallback = callback;
  }

  onState(callback: (state: ConnectionState) => void): void {
    this.stateCallback = callback;
    this.emitState();
  }

  private requirePc(): any {
    if (!this.pc) throw new Error('Connection not initialized.');
    return this.pc;
  }

  private bindChannel(channel: any): void {
    channel.onopen = () => {
      for (const msg of this.pendingData.splice(0)) {
        channel.send(msg);
      }
    };
    channel.onmessage = (event: any) => {
      if (typeof event.data === 'string') this.dataCallback?.(event.data);
      else if (event.data instanceof ArrayBuffer) this.dataCallback?.(event.data);
    };
  }

  private emitState(): void {
    if (!this.stateCallback) return;
    const raw: string = this.pc?.connectionState ?? this.pc?.iceConnectionState ?? 'new';
    const state: ConnectionState =
      raw === 'completed' ? 'connected' :
      raw === 'checking' ? 'connecting' :
      (raw === 'connected' || raw === 'disconnected' || raw === 'failed' || raw === 'closed' || raw === 'new')
        ? (raw as ConnectionState) : 'connecting';

    if (state === 'connected' && this.videoSender) void this.applyEncoderParams();
    this.stateCallback(state);
  }

  private async applyEncoderParams(): Promise<void> {
    const sender = this.videoSender;
    if (!sender) return;
    try {
      const params = sender.getParameters();
      const [first] = params.encodings?.length > 0 ? params.encodings : [{}];
      params.degradationPreference = CONFIG.DEGRADATION;
      params.encodings = [{
        ...first,
        maxFramerate: CONFIG.TARGET_FPS,
        maxBitrate: CONFIG.HIGH_BITRATE_BPS,
        scaleResolutionDownBy: 1,
      }];
      await sender.setParameters(params);
    } catch { /* best-effort */ }
  }
}

function waitForIceGathering(pc: any): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const timeout = setTimeout(() => {
      if (!done) { done = true; resolve(); }
    }, CONFIG.ICE_GATHERING_TIMEOUT_MS);
    pc.addEventListener('icegatheringstatechange', function check() {
      if (pc.iceGatheringState === 'complete' && !done) {
        done = true;
        clearTimeout(timeout);
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    });
  });
}

export function createConnection(): IConnection {
  return new NativeConnection();
}
