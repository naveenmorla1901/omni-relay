import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { createConnection } from '@/connection';
import type { ConnectionState, IConnection } from '@/connection/IConnection';
import { SignalClient } from '@/connection/signal-ws';
import type { SignalMsg } from '@/connection/signal-ws';
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

export type StageImage = { id: string; data: string; mime: string };

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

  /**
   * Recorder / Display: the relay socket or Link A dropped and the hook is
   * rejoining the same room on its own. The phase keeps its last value.
   */
  reconnecting: boolean;

  /** Display: last stage frame from Admin. `data` is raw base64 (no data-URL prefix). */
  receivedImage: StageImage | null;

  /** Display: a current Admin answered our viewport (older Admins never do). */
  adminStageReady: boolean;

  /** Display: increments on every successful room join, including silent rejoins. */
  linkEpoch: number;

  /** Admin: the Projector's reported screen, or null until it reports. */
  projectorViewport: Viewport | null;

  /** Admin: increments on every Projector viewport report — the stage resends its frame. */
  projectorEpoch: number;

  /** Admin: id of the last stage frame the Projector confirmed on screen. */
  lastAckId: string | null;

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

  /** Admin: show a rendered stage bitmap (data URL) full-screen. Returns the frame id, or null if not sent. */
  sendStageFrame(dataUrl: string, width: number, height: number): string | null;

  /** Admin: blank the Projector screen. */
  clearStage(): void;

  /** Display: report this screen so Admin can shape its stage to match. */
  sendViewport(viewport: Viewport): void;

  /** Display: confirm a stage frame is on screen. */
  ackStageFrame(id: string): void;

  /** Close everything and return to idle. */
  reset(): void;
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePairing(role: PairingRole): UsePairingResult {
  const [phase, setPhaseState] = useState<PairingPhase>('idle');
  const [connectionState, setConnectionState] = useState<ConnectionState>('new');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [recorderJoined, setRecorderJoined] = useState(false);
  const [projectorJoined, setProjectorJoined] = useState(false);
  const [remoteCameraMirrored, setRemoteCameraMirrored] = useState(false);
  const [redetectRequested, setRedetectRequested] = useState(0);
  const [peerRole, setPeerRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [receivedImage, setReceivedImage] = useState<StageImage | null>(null);
  const [adminStageReady, setAdminStageReady] = useState(false);
  const [linkEpoch, setLinkEpoch] = useState(0);
  const [projectorViewport, setProjectorViewport] = useState<Viewport | null>(null);
  const [projectorEpoch, setProjectorEpoch] = useState(0);
  const [lastAckId, setLastAckId] = useState<string | null>(null);

  const signalRef = useRef<SignalClient | null>(null);
  const connectionRef = useRef<IConnection | null>(null);
  const phaseRef = useRef<PairingPhase>('idle');
  /** Room joined by this Recorder/Display; kept for silent rejoins. */
  const codeRef = useRef<string | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkRestartingRef = useRef(false);
  const localTrackRef = useRef<MediaStreamTrack | null>(null);
  const cameraStateRef = useRef<{ facingMode: CameraFacingMode; mirrored: boolean } | null>(null);
  const projectorViewportRef = useRef<Viewport | null>(null);
  const connStateRef = useRef<ConnectionState>('new');
  /** Recorder: an offer that gets no answer means the relay lost our room slot. */
  const answerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Display: last reported screen, re-sent as a heartbeat. */
  const lastViewportRef = useRef<Viewport | null>(null);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const adminEverReadyRef = useRef(false);
  /** Admin: resend the stage after the Projector (re)joins, not on every heartbeat. */
  const projectorNeedsFrameRef = useRef(true);

  const setPhase = useCallback((next: PairingPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  // ── Cleanup ────────────────────────────────────────────────────────────────

  const clearTimers = useCallback(() => {
    for (const timer of [retryTimerRef, graceTimerRef, answerTimerRef, readyTimerRef]) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const disposeAll = useCallback(() => {
    clearTimers();
    signalRef.current?.close();
    signalRef.current = null;
    connectionRef.current?.close();
    connectionRef.current = null;
    connStateRef.current = 'new';
    linkRestartingRef.current = false;
  }, [clearTimers]);

  const reset = useCallback(() => {
    disposeAll();
    codeRef.current = null;
    retryAttemptRef.current = 0;
    projectorViewportRef.current = null;
    lastViewportRef.current = null;
    adminEverReadyRef.current = false;
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
    setReconnecting(false);
    setReceivedImage(null);
    setAdminStageReady(false);
    setProjectorViewport(null);
    setLastAckId(null);
  }, [disposeAll, setPhase]);

  useEffect(() => disposeAll, [disposeAll]);

  /** Recorder / Display: stop retrying and show why. */
  const failSession = useCallback((message: string) => {
    disposeAll();
    codeRef.current = null;
    setReconnecting(false);
    setPhase('failed');
    setError(message);
  }, [disposeAll, setPhase]);

  const connectAndJoinRef = useRef<(code: string, silent: boolean) => Promise<void>>(async () => undefined);

  const scheduleRejoin = useCallback(() => {
    const code = codeRef.current;
    if (!code) return;
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    const delay = Math.min(CONFIG.RECONNECT_MAX_MS, CONFIG.RECONNECT_BASE_MS * 2 ** retryAttemptRef.current);
    retryAttemptRef.current += 1;
    setReconnecting(true);
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      if (codeRef.current === code) void connectAndJoinRef.current(code, true);
    }, delay);
  }, []);

  // ── WebRTC connection factory ───────────────────────────────────────────────

  const restartLinkRef = useRef<() => void>(() => undefined);

  const openConnection = useCallback((): IConnection => {
    connectionRef.current?.close();
    if (graceTimerRef.current) clearTimeout(graceTimerRef.current);
    graceTimerRef.current = null;

    const conn = createConnection();
    connectionRef.current = conn;
    connStateRef.current = 'new';

    conn.onState((state) => {
      if (connectionRef.current !== conn) return;
      connStateRef.current = state;
      setConnectionState(state);
      if (state === 'connected') {
        if (graceTimerRef.current) clearTimeout(graceTimerRef.current);
        if (answerTimerRef.current) clearTimeout(answerTimerRef.current);
        graceTimerRef.current = null;
        answerTimerRef.current = null;
        linkRestartingRef.current = false;
        setPhase('connected');
        setReconnecting(false);
        setError(null);
        conn.sendData(serializeMessage({ v: 1, t: 'hello', role, caps: ['video', 'control'] }));
      } else if (state === 'disconnected' && role === 'recorder') {
        // ICE often recovers by itself; re-offer only if it stays down.
        if (graceTimerRef.current) clearTimeout(graceTimerRef.current);
        graceTimerRef.current = setTimeout(() => {
          graceTimerRef.current = null;
          if (connectionRef.current === conn) restartLinkRef.current();
        }, CONFIG.LINK_DISCONNECT_GRACE_MS);
      } else if (state === 'failed') {
        if (role === 'recorder') {
          restartLinkRef.current();
        } else {
          // Admin: the Recorder re-offers on its own; keep the room open.
          setRemoteStream(null);
          setPhase('waiting-for-peer');
        }
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
  }, [role, setPhase]);

  /** Recorder: build a fresh peer connection (with the live camera track) and offer it to Admin. */
  const startLink = useCallback(async (signal: SignalClient) => {
    const conn = openConnection();
    try {
      await conn.init('recorder', 'ws');
      const track = localTrackRef.current;
      if (track && track.readyState !== 'ended') conn.attachVideoTrack(track);
      const camera = cameraStateRef.current;
      if (camera) conn.sendData(serializeMessage({ v: 1, t: 'camera', ...camera }));
      const offer = await conn.createOffer();
      if (connectionRef.current !== conn || signalRef.current !== signal) return;
      signal.relaySdp('admin', offer, 'offer');
      if (phaseRef.current !== 'connected') setPhase('connecting');
      // Admin gathers ICE for up to ICE_GATHERING_TIMEOUT_MS before answering.
      if (answerTimerRef.current) clearTimeout(answerTimerRef.current);
      answerTimerRef.current = setTimeout(() => {
        answerTimerRef.current = null;
        if (connectionRef.current === conn && connStateRef.current !== 'connected') {
          linkRestartingRef.current = false;
          scheduleRejoin();
        }
      }, CONFIG.ICE_GATHERING_TIMEOUT_MS * 2);
    } catch (err) {
      if (connectionRef.current !== conn) return;
      linkRestartingRef.current = false;
      if (phaseRef.current === 'connected') {
        scheduleRejoin();
      } else {
        setPhase('failed');
        setError(toMsg(err));
      }
    }
  }, [openConnection, scheduleRejoin, setPhase]);

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
    projectorViewportRef.current = null;
    setLastAckId(null);
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
        if (msg.role === 'recorder') setRecorderJoined(true);
        else if (msg.role === 'display') {
          setProjectorJoined(true);
          setLastAckId(null);
          projectorNeedsFrameRef.current = true;
        }
      }

      else if (msg.t === 'sdp' && msg.from === 'recorder' && msg.kind === 'offer') {
        // Every offer gets a fresh peer connection, so a Recorder that woke up
        // or lost ICE can re-offer without the Admin doing anything.
        const conn = openConnection();
        if (phaseRef.current !== 'connected') setPhase('exchanging');
        try {
          await conn.init('admin', 'ws');
          const answer = await conn.acceptOffer(msg.sdp);
          if (connectionRef.current !== conn || signalRef.current !== signal) return;
          signal.relaySdp('recorder', answer, 'answer');
          if (phaseRef.current !== 'connected') setPhase('connecting');
        } catch (err) {
          if (connectionRef.current !== conn) return;
          setPhase('waiting-for-peer');
          setError(toMsg(err));
        }
      }

      else if (msg.t === 'sdp' && msg.from === 'display' && msg.kind === 'stage') {
        const parsed = parseMessage(msg.sdp);
        if (parsed?.t === 'viewport') {
          const previous = projectorViewportRef.current;
          const next = { w: parsed.w, h: parsed.h, dpr: parsed.dpr };
          // Keep the object stable when nothing changed so the stage does not re-layout.
          if (!previous || previous.w !== next.w || previous.h !== next.h || previous.dpr !== next.dpr) {
            projectorViewportRef.current = next;
            setProjectorViewport(next);
          }
          setProjectorJoined(true);
          if (projectorNeedsFrameRef.current) {
            projectorNeedsFrameRef.current = false;
            setProjectorEpoch((epoch) => epoch + 1);
          }
          signal.relayStage('display', serializeMessage({ v: 1, t: 'stage-ready' }));
        } else if (parsed?.t === 'stage-ack') {
          setLastAckId(parsed.id);
        }
      }

      else if (msg.t === 'left') {
        if (msg.role === 'recorder') setRecorderJoined(false);
        else if (msg.role === 'display') {
          setProjectorJoined(false);
          setProjectorViewport(null);
          projectorViewportRef.current = null;
          projectorNeedsFrameRef.current = true;
        }
      }

      else if (msg.t === 'error') {
        // A stage frame raced a Projector disconnect; that is not a session failure.
        if (/^display is not in the room|^Projector is not connected/.test(msg.msg)) {
          setProjectorJoined(false);
          setProjectorViewport(null);
          projectorViewportRef.current = null;
          projectorNeedsFrameRef.current = true;
          return;
        }
        if (/^recorder is not in the room/.test(msg.msg)) {
          setRecorderJoined(false);
          return;
        }
        if (/^Not in a room/.test(msg.msg)) {
          signal.close();
          signalRef.current = null;
          setRoomCode(null);
          setProjectorJoined(false);
          setRecorderJoined(false);
          setPhase('failed');
          setError('The relay closed this session (it expires after 30 minutes). Create a new session and enter the new code on the Recorder and Projector.');
          return;
        }
        setPhase('failed');
        setError(msg.msg);
      }
    });

    signal.onDisconnect(() => {
      if (signalRef.current !== signal) return;
      signalRef.current = null;
      setRoomCode(null);
      setProjectorJoined(false);
      setRecorderJoined(false);
      setError('Lost the relay connection. The live feed keeps running, but the Projector and new joins need a new session.');
      if (phaseRef.current !== 'connected') setPhase('failed');
    });
  }, [disposeAll, openConnection, setPhase]);

  // ── Recorder / Display: join room ──────────────────────────────────────────

  const connectAndJoin = useCallback(async (code: string, silent: boolean) => {
    const url = CONFIG.SIGNALING_WS_URL;
    if (!url) {
      setPhase('failed');
      setError('No signaling server configured. Set EXPO_PUBLIC_SIGNALING_URL and rebuild.');
      return;
    }

    signalRef.current?.close();
    signalRef.current = null;
    if (!silent) {
      disposeAll();
      setError(null);
      setRoomCode(null);
      setConnectionState('new');
      setRemoteStream(null);
      setRemoteCameraMirrored(false);
      setRedetectRequested(0);
      setPeerRole(null);
      setReceivedImage(null);
      setAdminStageReady(false);
      setReconnecting(false);
      retryAttemptRef.current = 0;
      setPhase('joining');
    }
    codeRef.current = code;

    const signal = new SignalClient();
    signalRef.current = signal;

    try {
      await signal.connect(url);
    } catch (err) {
      if (signalRef.current !== signal) return;
      signal.close();
      signalRef.current = null;
      if (silent) scheduleRejoin();
      else failSession(toMsg(err));
      return;
    }
    if (signalRef.current !== signal) {
      signal.close();
      return;
    }

    signal.joinRoom(code, role === 'admin' ? 'admin' : role === 'display' ? 'display' : 'recorder');

    signal.onMsg(async (msg: SignalMsg) => {
      if (signalRef.current !== signal) return;

      if (msg.t === 'room-ok') {
        retryAttemptRef.current = 0;
        if (role === 'recorder') {
          // Only the relay socket dropped: the P2P video is still flowing.
          if (silent && connStateRef.current === 'connected') {
            setReconnecting(false);
            return;
          }
          // Recorder creates the offer and sends it to Admin.
          if (phaseRef.current !== 'connected') setPhase('exchanging');
          linkRestartingRef.current = true;
          await startLink(signal);
        } else {
          // Display: the room is the link (Link B rides the relay).
          setAdminStageReady(false);
          setLinkEpoch((epoch) => epoch + 1);
          setReconnecting(false);
          setPhase('connected');
        }
      }

      else if (msg.t === 'sdp' && msg.from === 'admin' && msg.kind === 'answer') {
        const conn = connectionRef.current;
        if (!conn) return;
        try {
          await conn.acceptAnswer(msg.sdp);
        } catch (err) {
          if (phaseRef.current === 'connected') setReconnecting(true);
          else {
            setPhase('failed');
            setError(toMsg(err));
          }
        }
      }

      else if (msg.t === 'sdp' && msg.from === 'admin' && msg.kind === 'stage') {
        const parsed = parseMessage(msg.sdp);
        if (parsed?.t === 'stage-frame' || parsed?.t === 'stage-clear' || parsed?.t === 'stage-ready') {
          adminEverReadyRef.current = true;
          if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
          readyTimerRef.current = null;
        }
        if (parsed?.t === 'stage-frame') {
          setAdminStageReady(true);
          setReceivedImage({ id: parsed.id, data: parsed.data, mime: parsed.mime });
        } else if (parsed?.t === 'stage-clear') {
          setAdminStageReady(true);
          setReceivedImage(null);
        } else if (parsed?.t === 'stage-ready') {
          setAdminStageReady(true);
        }
      }

      // Legacy relay push (relays deployed after M4).
      else if (msg.t === 'push') {
        setReceivedImage({ id: `push-${Date.now()}`, data: msg.data, mime: msg.mime });
      }

      else if (msg.t === 'error') {
        if (/^admin is not in the room/.test(msg.msg)) return;
        failSession(
          /^Room not found/.test(msg.msg) && silent
            ? 'The Admin session has ended. Enter the new code from Admin.'
            : msg.msg,
        );
      }
    });

    signal.onDisconnect(() => {
      if (signalRef.current !== signal) return;
      signalRef.current = null;
      // The relay socket dropped (phone slept, network change). Rejoin the
      // same room; Admin keeps it open while its own socket lives.
      if (codeRef.current) scheduleRejoin();
      else failSession('Lost connection to the signaling server.');
    });
  }, [disposeAll, failSession, role, scheduleRejoin, setPhase, startLink]);

  useEffect(() => {
    connectAndJoinRef.current = connectAndJoin;
  }, [connectAndJoin]);

  const joinRoom = useCallback((code: string) => connectAndJoin(code, false), [connectAndJoin]);

  /** Recorder: re-offer Link A on the current relay socket, or rejoin if that is gone too. */
  const restartLink = useCallback(() => {
    if (role !== 'recorder' || !codeRef.current || linkRestartingRef.current) return;
    const signal = signalRef.current;
    setReconnecting(true);
    if (signal?.isOpen()) {
      linkRestartingRef.current = true;
      void startLink(signal);
    } else {
      scheduleRejoin();
    }
  }, [role, scheduleRejoin, startLink]);

  useEffect(() => {
    restartLinkRef.current = restartLink;
  }, [restartLink]);

  // A phone that slept or backgrounded comes back with a dead socket or ICE.
  useEffect(() => {
    if (role === 'admin') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !codeRef.current) return;
      if (!signalRef.current?.isOpen()) {
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
        retryAttemptRef.current = 0;
        void connectAndJoinRef.current(codeRef.current, true);
      } else if (role === 'recorder' && phaseRef.current === 'connected' && connStateRef.current !== 'connected') {
        restartLinkRef.current();
      }
    });
    return () => subscription.remove();
  }, [role]);

  // ── Link B stage over the WS relay ────────────────────────────────────────

  const sendStageFrame = useCallback((dataUrl: string, width: number, height: number) => {
    const signal = signalRef.current;
    if (!signal?.isOpen() || !projectorJoined) return null;
    const commaIdx = dataUrl.indexOf(',');
    const mime = commaIdx > 0 ? dataUrl.slice(5, commaIdx).replace(';base64', '') : 'image/jpeg';
    const data = commaIdx > 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
    const id = `f${Date.now().toString(36)}`;
    signal.relayStage('display', serializeMessage({
      v: 1,
      t: 'stage-frame',
      id,
      mime,
      data,
      w: width,
      h: height,
    }));
    return id;
  }, [projectorJoined]);

  const clearStage = useCallback(() => {
    if (!projectorJoined) return;
    signalRef.current?.relayStage('display', serializeMessage({ v: 1, t: 'stage-clear' }));
  }, [projectorJoined]);

  const sendViewport = useCallback((viewport: Viewport) => {
    const signal = signalRef.current;
    lastViewportRef.current = viewport;
    if (!signal?.isOpen()) return;
    signal.relayStage('admin', serializeMessage({
      v: 1,
      t: 'viewport',
      w: viewport.w,
      h: viewport.h,
      dpr: viewport.dpr,
    }));
    // A current Admin always answers. Silence means the relay dropped our
    // room slot (a dead socket closing late evicts its replacement): rejoin.
    if (readyTimerRef.current || !adminEverReadyRef.current) return;
    readyTimerRef.current = setTimeout(() => {
      readyTimerRef.current = null;
      const code = codeRef.current;
      if (!code) return;
      if (signalRef.current?.isOpen()) signalRef.current.joinRoom(code, 'display');
      else scheduleRejoin();
    }, CONFIG.STAGE_READY_TIMEOUT_MS);
  }, [scheduleRejoin]);

  // Display heartbeat: keeps the room slot honest and the Admin frame current.
  useEffect(() => {
    if (role !== 'display' || phase !== 'connected') return;
    const timer = setInterval(() => {
      if (lastViewportRef.current) sendViewport(lastViewportRef.current);
    }, CONFIG.STAGE_HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [phase, role, sendViewport]);

  const ackStageFrame = useCallback((id: string) => {
    signalRef.current?.relayStage('admin', serializeMessage({ v: 1, t: 'stage-ack', id }));
  }, []);

  // ── Recorder: attach camera track ─────────────────────────────────────────

  const attachVideoTrack = useCallback((track: MediaStreamTrack) => {
    localTrackRef.current = track;
    connectionRef.current?.attachVideoTrack(track);
  }, []);

  const updateCameraFacingMode = useCallback((facingMode?: string, mirrored = false) => {
    const normalized: CameraFacingMode =
      facingMode === 'user' || facingMode === 'environment' ? facingMode : 'unknown';
    cameraStateRef.current = { facingMode: normalized, mirrored };
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
    reconnecting,
    receivedImage,
    adminStageReady,
    linkEpoch,
    projectorViewport,
    projectorEpoch,
    lastAckId,
    createRoom,
    joinRoom,
    attachVideoTrack,
    updateCameraFacingMode,
    requestRedetection,
    sendStageFrame,
    clearStage,
    sendViewport,
    ackStageFrame,
    reset,
  };
}

function toMsg(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong. Try again.';
}
