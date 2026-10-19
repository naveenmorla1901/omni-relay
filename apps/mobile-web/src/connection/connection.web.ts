import { CONFIG } from '@/config';
import type { Role, SignalingMode } from '@/protocol/messages';

import type { ConnectionState, IConnection } from './IConnection';
import { decodeSignal, encodeSignal } from './signal';

/**
 * Browser WebRTC implementation.
 *
 * Pairing is deliberately non-trickle: the offer/answer includes all gathered
 * ICE candidates so the whole payload can travel through one QR code. A
 * timeout keeps a slow STUN server from blocking pairing forever.
 */
class WebConnection implements IConnection {
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private videoSender: RTCRtpSender | null = null;
  private pendingData: (Uint8Array | string)[] = [];
  private remoteTrackCallback: ((stream: MediaStream) => void) | null = null;
  private dataCallback: ((message: ArrayBuffer | string) => void) | null = null;
  private stateCallback: ((state: ConnectionState) => void) | null = null;

  async init(_role: Role, _mode: SignalingMode): Promise<void> {
    // Signaling transport (QR vs WS) is handled at the hook level.
    // The RTCPeerConnection setup is identical for both modes.
    if (!globalThis.RTCPeerConnection) {
      throw new Error('This browser does not support WebRTC.');
    }

    this.close();

    const pc = new RTCPeerConnection({
      iceServers: CONFIG.ICE_SERVERS.map((server) => ({ urls: server.urls })),
      iceCandidatePoolSize: 4,
    });

    this.pc = pc;
    pc.onconnectionstatechange = () => this.emitState();
    pc.oniceconnectionstatechange = () => this.emitState();

    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      this.remoteTrackCallback?.(stream);
    };

    if (_role === 'recorder') {
      this.bindChannel(pc.createDataChannel('clearrelay-control', { ordered: true }));
      this.videoSender = pc.addTransceiver('video', { direction: 'sendonly' }).sender;
    } else {
      pc.ondatachannel = (event) => this.bindChannel(event.channel);
    }
  }

  async createOffer(): Promise<string> {
    const pc = this.requirePeerConnection();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGathering(pc);

    return encodeSignal({ t: 'offer', sdp: pc.localDescription?.sdp ?? offer.sdp ?? '' });
  }

  async acceptOffer(offer: string): Promise<string> {
    const pc = this.requirePeerConnection();
    const signal = decodeSignal(offer);

    if (signal.t !== 'offer') {
      throw new Error('That code is an answer, not an invite.');
    }

    await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIceGathering(pc);

    return encodeSignal({ t: 'answer', sdp: pc.localDescription?.sdp ?? answer.sdp ?? '' });
  }

  async acceptAnswer(answer: string): Promise<void> {
    const pc = this.requirePeerConnection();
    const signal = decodeSignal(answer);

    if (signal.t !== 'answer') {
      throw new Error('That code is an invite, not an answer.');
    }

    await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
  }

  close(): void {
    this.pendingData = [];

    try {
      this.channel?.close();
    } catch {
      // The channel may already be closed.
    }

    try {
      this.pc?.close();
    } catch {
      // The peer connection may already be closed.
    }

    this.channel = null;
    this.pc = null;
    this.videoSender = null;
  }

  attachVideoTrack(track: MediaStreamTrack): void {
    if (!this.videoSender) {
      this.pc?.addTrack(track, new MediaStream([track]));
      void this.configureVideoSender();
      return;
    }

    void this.videoSender
      .replaceTrack(track)
      .then(() => this.configureVideoSender())
      .catch((error: unknown) => {
        console.warn('Could not attach the camera track.', error);
      });
  }

  onRemoteTrack(callback: (stream: MediaStream) => void): void {
    this.remoteTrackCallback = callback;
  }

  sendData(message: Uint8Array | string): void {
    if (this.channel?.readyState === 'open') {
      sendNow(this.channel, message);
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

  private async configureVideoSender(): Promise<void> {
    const sender = this.videoSender;
    if (!sender) {
      return;
    }

    try {
      const params = sender.getParameters();
      const [firstEncoding] = params.encodings.length > 0 ? params.encodings : [{}];
      params.degradationPreference = CONFIG.DEGRADATION;
      params.encodings = [
        {
          ...firstEncoding,
          maxFramerate: CONFIG.TARGET_FPS,
          maxBitrate: CONFIG.HIGH_BITRATE_BPS,
          scaleResolutionDownBy: 1,
        },
      ];
      await sender.setParameters(params);
    } catch (error) {
      // Some browsers refuse bitrate hints; the stream still works.
      console.warn('Could not apply clarity encoder parameters.', error);
    }
  }

  private requirePeerConnection(): RTCPeerConnection {
    if (!this.pc) {
      throw new Error('The connection is not initialized.');
    }

    return this.pc;
  }

  private bindChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
      for (const message of this.pendingData.splice(0)) {
        sendNow(channel, message);
      }
    };

    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (typeof event.data === 'string') {
        this.dataCallback?.(event.data);
      } else if (event.data instanceof ArrayBuffer) {
        this.dataCallback?.(event.data);
      } else if (ArrayBuffer.isView(event.data)) {
        const bytes = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
        this.dataCallback?.(bytes.slice().buffer);
      }
    };
  }

  private emitState(): void {
    if (!this.stateCallback) {
      return;
    }

    const raw = this.pc?.connectionState ?? this.pc?.iceConnectionState ?? 'new';
    const state: ConnectionState =
      raw === 'completed'
        ? 'connected'
        : raw === 'checking'
          ? 'connecting'
          : raw === 'connected' ||
              raw === 'disconnected' ||
              raw === 'failed' ||
              raw === 'closed' ||
              raw === 'new'
            ? raw
            : 'connecting';

    // Re-apply clarity encoder params once DTLS handshake is complete — setParameters
    // is most reliable after the sender is fully negotiated and connected.
    if (state === 'connected' && this.videoSender) {
      void this.configureVideoSender();
    }

    this.stateCallback(state);
  }
}

function sendNow(channel: RTCDataChannel, message: Uint8Array | string): void {
  if (typeof message === 'string') {
    channel.send(message);
    return;
  }

  channel.send(new Uint8Array(message).buffer);
}

function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      pc.removeEventListener('icegatheringstatechange', onChange);
      if (timeout) {
        clearTimeout(timeout);
      }
      resolve();
    };

    const onChange = () => {
      if (pc.iceGatheringState === 'complete') {
        finish();
      }
    };

    pc.addEventListener('icegatheringstatechange', onChange);
    timeout = setTimeout(finish, CONFIG.ICE_GATHERING_TIMEOUT_MS);
  });
}

export function createConnection(): IConnection {
  return new WebConnection();
}