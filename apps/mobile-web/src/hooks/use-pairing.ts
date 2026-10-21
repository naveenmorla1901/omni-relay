import { useCallback, useEffect, useRef, useState } from 'react';

import { createConnection } from '@/connection';
import type { ConnectionState, IConnection } from '@/connection/IConnection';
import { SignalClient } from '@/connection/signal-ws';
import { CONFIG } from '@/config';
import type { CameraFacingMode, Role } from '@/protocol/messages';
import { parseMessage, serializeMessage } from '@/protocol/messages';
import type { Viewport } from '@/lib/stage';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PairingPhase =
  | 'idle'
  | 'creating'               // Admin: connecting to server + creating room
  | 'waiting-for-peer'       // Admin: room open, waiting for devices to join
  | 'joining'                // Recorder/Display: connecting + joining room
  | 'exchanging'             // SDP offer/answer in flight
  | 'connecting'             // ICE checks running
  | 'connected'
  | 'failed';

export type PairingRole = Extract<Role, 'recorder' | 'admin' | 'display'>;

export type UsePairingResult = {
  phase: PairingPhase;
  connectionState: ConnectionState;

  /** 6-character room code Admin shares with the other devices. */
  roomCode: string | null;

  /** Live video stream from the Recorder (Admin side only). */
  remoteStream: MediaStream | null;

  /** Whether the Recorder has joined the WS room. */
  recorderJoined: boolean;

  /** Whether the Projector/Display has joined the WS room. */
  projectorJoined: boolean;

  /** Admin: whether the Recorder's current preview should be mirrored. */
  remoteCameraMirrored: boolean;

  /** Increments when Recorder asks Admin to re-run document detection. */
  redetectRequested: number;

  peerRole: Role | null;
  error: string | null;
  busy: boolean;

  /** Display: last image pushed from Admin. `data` is raw base64 (no data-URL prefix). */
  receivedImage: { data: string; mime: string } | null;

  /** Admin: the Projector's reported screen, or null until it reports. */
  projectorViewport: Viewport | null;

  /** Admin: create a room and get a shareable code. */
  createRoom(): Promise<void>;

  /** Recorder / Display: join Admin's room by code. */
  joinRoom(code: string): Promise<void>;

  /** Recorder: attach local camera track to the WebRTC connection. */
  attachVideoTrack(track: MediaStreamTrack): void;

  /** Recorder: publish camera orientation without changing the v1 hello shape. */
  updateCameraFacingMode(facingMode?: string, mirrored?: boolean): void;

  /** Recorder: ask Admin to re-run quad detection on its current/next capture. */
  requestRedetection(): void;

  /** Admin: show a rendered stage bitmap (data URL) full-screen on the Projector. */
  sendStageFrame(dataUrl: string, width: number, height: number): void;

  /** Admin: blank the Projector screen. */
  clearStage(): void;

  /** Display: report this screen so Admin can shape its stage to match. */
  sendViewport(viewport: Viewport): void;

  /** Close everything and return to idle. */
  reset(): void;
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePairing(role: PairingRole): UsePairingResult {
  const [phase, setPhase] = useState<PairingPhase>('idle');
  const [connectionState, setConnectionState] = useState<ConnectionState>('new');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [recorderJoined, setRecorderJoined] = useState(false);
  const [projectorJoined, setProjectorJoined] = useState(false);
  const [remoteCameraMirrored, setRemoteCameraMirrored] = useState(false);
  const [redetectRequested, setRedetectRequested] = useState(0);
  const [peerRole, setPeerRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receivedImage, setReceivedImage] = useState<{ data: string; mime: string } | null>(null);
  const [projectorViewport, setProjectorViewport] = useState<Viewport | null>(null);

  const signalRef = useRef<SignalClient | null>(null);
  const connectionRef = useRef<IConnection | null>(null);

  // ── Cleanup ────────────────────────────────────────────────────────────────

  const disposeAll = useCallback(() => {
    signalRef.current?.close();
    signalRef.current = null;
    connectionRef.current?.close();
    connectionRef.current = null;
  }, []);

  const reset = useCallback(() => {
    disposeAll();
    setPhase('idle');
    setConnectionState('new');
    setRoomCode(null);
    setRemoteStream(null);
    setRecorderJoined(false);
    setProjectorJoined(false);
    setRemoteCameraMirrored(false);
    setRedetectRequested(0);
    setPeerRole(null);
    setError(null);
    setReceivedImage(null);
    setProjectorViewport(null);
  }, [disposeAll]);

  useEffect(() => disposeAll, [disposeAll]);

  // ── WebRTC connection factory ───────────────────────────────────────────────

  const openConnection = useCallback((): IConnection => {
    connectionRef.current?.close();

    const conn = createConnection();
    connectionRef.current = conn;

    conn.onState((state) => {
      if (connectionRef.current !== conn) return;
      setConnectionState(state);
      if (state === 'connected') {
        setPhase('connected');
        conn.sendData(serializeMessage({ v: 1, t: 'hello', role, caps: ['video', 'control'] }));
      } else if (state === 'failed') {
        setPhase('failed');
        setError('WebRTC connection failed. Make sure both devices are online.');
      }
    });

    conn.onRemoteTrack((stream) => {
      if (connectionRef.current === conn) setRemoteStream(stream);
    });

    conn.onData((msg) => {
      if (connectionRef.current !== conn || typeof msg !== 'string') return;
      const parsed = parseMessage(msg);
      if (!parsed) return;
      if (parsed.t === 'hello') setPeerRole(parsed.role);
      else if (parsed.t === 'camera') {
        setRemoteCameraMirrored(parsed.mirrored);
      } else if (parsed.t === 'redetect' && role === 'admin') {
        setRedetectRequested((count) => count + 1);
      }
    });

    return conn;
  }, [role]);

  // ── Admin: create room ─────────────────────────────────────────────────────

  const createRoom = useCallback(async () => {
    const url = CONFIG.SIGNALING_WS_URL;
    if (!url) {
      setPhase('failed');
      setError('No signaling server configured. Set EXPO_PUBLIC_SIGNALING_URL and rebuild.');
      return;
    }

    disposeAll();
    setError(null);
    setRoomCode(null);
    setRecorderJoined(false);
    setProjectorJoined(false);
    setRemoteStream(null);
    setRemoteCameraMirrored(false);
    setRedetectRequested(0);
    setPeerRole(null);
    setProjectorViewport(null);
    setConnectionState('new');
    setPhase('creating');

    const signal = new SignalClient();
    signalRef.current = signal;

    try {
      await signal.connect(url);
    } catch (err) {
      if (signalRef.current === signal) {
        setPhase('failed');
        setError(toMsg(err));
        signal.close();
        signalRef.current = null;
      }
      return;
    }

    signal.createRoom();

    signal.onMsg(async (msg) => {
      if (signalRef.current !== signal) return;

      if (msg.t === 'created') {
        setRoomCode(msg.code);
        setPhase('waiting-for-peer');
      }

      else if (msg.t === 'joined') {
        if (msg.role === 'recorder') {
          setRecorderJoined(true);
          // Recorder will send us their offer; set up the connection now so
          // it is ready to accept it.
          openConnection();
          await connectionRef.current!.init('admin', 'ws');
        } else if (msg.role === 'display') {
          setProjectorJoined(true);
        }
      }

      else if (msg.t === 'sdp' && msg.from === 'recorder' && msg.kind === 'offer') {
        const conn = connectionRef.current;
        if (!conn) return;
        setPhase('exchanging');
        try {
          const answer = await conn.acceptOffer(msg.sdp);
          signal.relaySdp('recorder', answer, 'answer');
          setPhase('connecting');
        } catch (err) {
          setPhase('failed');
          setError(toMsg(err));
        }
      }

      else if (msg.t === 'sdp' && msg.from === 'display' && msg.kind === 'stage') {
        const parsed = parseMessage(msg.sdp);
        if (parsed?.t === 'viewport') {
          setProjectorViewport({ w: parsed.w, h: parsed.h, dpr: parsed.dpr });
        }
      }

      else if (msg.t === 'left') {
        if (msg.role === 'recorder') setRecorderJoined(false);
        else if (msg.role === 'display') {
          setProjectorJoined(false);
          setProjectorViewport(null);
        }
      }

      else if (msg.t === 'error') {
        // A stage frame raced a Projector disconnect; that is not a session failure.
        if (/^display is not in the room|^Projector is not connected/.test(msg.msg)) {
          setProjectorJoined(false);
          setProjectorViewport(null);
          return;
        }
        setPhase('failed');
        setError(msg.msg);
      }
    });

    signal.onDisconnect(() => {
      if (signalRef.current === signal && phase !== 'connected') {
        setPhase('failed');
        setError('Lost connection to the signaling server.');
      }
    });
  }, [disposeAll, openConnection, phase]);

  // ── Recorder / Display: join room ──────────────────────────────────────────

  const joinRoom = useCallback(async (code: string) => {
    const url = CONFIG.SIGNALING_WS_URL;
    if (!url) {
      setPhase('failed');
      setError('No signaling server configured. Set EXPO_PUBLIC_SIGNALING_URL and rebuild.');
      return;
    }

    disposeAll();
    setError(null);
    setRoomCode(null);
    setConnectionState('new');
    setRemoteStream(null);
    setRemoteCameraMirrored(false);
    setRedetectRequested(0);
    setPeerRole(null);
    setPhase('joining');

    const signal = new SignalClient();
    signalRef.current = signal;

    try {
      await signal.connect(url);
    } catch (err) {
      if (signalRef.current === signal) {
        setPhase('failed');
        setError(toMsg(err));
        signal.close();
        signalRef.current = null;
      }
      return;
    }

    signal.joinRoom(code, role === 'admin' ? 'admin' : role === 'display' ? 'display' : 'recorder');

    signal.onMsg(async (msg) => {
      if (signalRef.current !== signal) return;

      if (msg.t === 'room-ok') {
        if (role === 'recorder') {
          // Recorder creates the offer and sends it to Admin.
          setPhase('exchanging');
          const conn = openConnection();
          try {
            await conn.init('recorder', 'ws');
            const offer = await conn.createOffer();
            signal.relaySdp('admin', offer, 'offer');
            setPhase('connecting');
          } catch (err) {
            if (connectionRef.current === conn) {
              setPhase('failed');
              setError(toMsg(err));
            }
          }
        } else {
          // Display joined the room — connection confirmed, no WebRTC yet (M4).
          setPhase('connected');
        }
      }

      else if (msg.t === 'sdp' && msg.from === 'admin' && msg.kind === 'answer') {
        const conn = connectionRef.current;
        if (!conn) return;
        try {
          await conn.acceptAnswer(msg.sdp);
        } catch (err) {
          setPhase('failed');
          setError(toMsg(err));
        }
      }

      else if (msg.t === 'sdp' && msg.from === 'admin' && msg.kind === 'stage') {
        const parsed = parseMessage(msg.sdp);
        if (parsed?.t === 'stage-frame') setReceivedImage({ data: parsed.data, mime: parsed.mime });
        else if (parsed?.t === 'stage-clear') setReceivedImage(null);
      }

      // Legacy relay push (relays deployed after M4).
      else if (msg.t === 'push') {
        setReceivedImage({ data: msg.data, mime: msg.mime });
      }

      else if (msg.t === 'error') {
        setPhase('failed');
        setError(msg.msg);
      }
    });

    signal.onDisconnect(() => {
      if (signalRef.current === signal && phase !== 'connected') {
        setPhase('failed');
        setError('Lost connection to the signaling server.');
      }
    });
  }, [disposeAll, openConnection, phase, role]);

  // ── Link B stage over the WS relay ────────────────────────────────────────

  const sendStageFrame = useCallback((dataUrl: string, width: number, height: number) => {
    const signal = signalRef.current;
    if (!signal || !projectorJoined) return;
    const commaIdx = dataUrl.indexOf(',');
    const mime = commaIdx > 0 ? dataUrl.slice(5, commaIdx).replace(';base64', '') : 'image/jpeg';
    const data = commaIdx > 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
    signal.relayStage('display', serializeMessage({
      v: 1,
      t: 'stage-frame',
      id: String(Date.now()),
      mime,
      data,
      w: width,
      h: height,
    }));
  }, [projectorJoined]);

  const clearStage = useCallback(() => {
    if (!projectorJoined) return;
    signalRef.current?.relayStage('display', serializeMessage({ v: 1, t: 'stage-clear' }));
  }, [projectorJoined]);

  const sendViewport = useCallback((viewport: Viewport) => {
    signalRef.current?.relayStage('admin', serializeMessage({
      v: 1,
      t: 'viewport',
      w: viewport.w,
      h: viewport.h,
      dpr: viewport.dpr,
    }));
  }, []);

  // ── Recorder: attach camera track ─────────────────────────────────────────

  const attachVideoTrack = useCallback((track: MediaStreamTrack) => {
    connectionRef.current?.attachVideoTrack(track);
  }, []);

  const updateCameraFacingMode = useCallback((facingMode?: string, mirrored = false) => {
    const normalized: CameraFacingMode =
      facingMode === 'user' || facingMode === 'environment' ? facingMode : 'unknown';
    connectionRef.current?.sendData(serializeMessage({
      v: 1,
      t: 'camera',
      facingMode: normalized,
      mirrored,
    }));
  }, []);

  const requestRedetection = useCallback(() => {
    connectionRef.current?.sendData(serializeMessage({ v: 1, t: 'redetect' }));
  }, []);

  // ── Result ─────────────────────────────────────────────────────────────────

  return {
    phase,
    connectionState,
    roomCode,
    remoteStream,
    recorderJoined,
    projectorJoined,
    remoteCameraMirrored,
    redetectRequested,
    peerRole,
    error,
    busy: phase === 'creating' || phase === 'joining' || phase === 'exchanging' || phase === 'connecting',
    receivedImage,
    projectorViewport,
    createRoom,
    joinRoom,
    attachVideoTrack,
    updateCameraFacingMode,
    requestRedetection,
    sendStageFrame,
    clearStage,
    sendViewport,
    reset,
  };
}

function toMsg(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong. Try again.';
}
