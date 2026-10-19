import { useCallback, useEffect, useRef, useState } from 'react';

import { createConnection } from '@/connection';
import type { ConnectionState, IConnection } from '@/connection/IConnection';
import type { Role, SignalingMode } from '@/protocol/messages';
import { parseMessage, serializeMessage } from '@/protocol/messages';

export type PairingPhase =
  | 'idle'
  | 'creating-invite'
  | 'waiting-for-answer'
  | 'joining'
  | 'waiting-for-connection'
  | 'connected'
  | 'failed';

type PairingRole = Extract<Role, 'recorder' | 'admin'>;

type UsePairingResult = {
  phase: PairingPhase;
  connectionState: ConnectionState;
  localCode: string | null;
  remoteStream: MediaStream | null;
  peerRole: Role | null;
  error: string | null;
  busy: boolean;
  createInvite: () => Promise<void>;
  joinInvite: (code: string) => Promise<void>;
  acceptAnswer: (code: string) => Promise<void>;
  attachVideoTrack: (track: MediaStreamTrack) => void;
  reset: () => void;
};

const SIGNALING_MODE: SignalingMode = 'qr';

export function usePairing(role: PairingRole): UsePairingResult {
  const [phase, setPhase] = useState<PairingPhase>('idle');
  const [connectionState, setConnectionState] = useState<ConnectionState>('new');
  const [localCode, setLocalCode] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [peerRole, setPeerRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const connectionRef = useRef<IConnection | null>(null);

  const disposeConnection = useCallback(() => {
    const connection = connectionRef.current;
    connectionRef.current = null;
    connection?.close();
  }, []);

  const openConnection = useCallback(() => {
    const connection = createConnection();
    connectionRef.current = connection;

    connection.onState((nextState) => {
      if (connectionRef.current !== connection) {
        return;
      }

      setConnectionState(nextState);

      if (nextState === 'connected') {
        setPhase('connected');
        connection.sendData(
          serializeMessage({ v: 1, t: 'hello', role, caps: ['video', 'control'] }),
        );
      } else if (nextState === 'failed') {
        setPhase('failed');
        setError('The peer connection failed. Check that both devices are online and try again.');
      }
    });

    connection.onRemoteTrack((stream) => {
      if (connectionRef.current === connection) {
        setRemoteStream(stream);
      }
    });

    connection.onData((message) => {
      if (connectionRef.current !== connection || typeof message !== 'string') {
        return;
      }

      const parsed = parseMessage(message);
      if (parsed?.t === 'hello') {
        setPeerRole(parsed.role);
      }
    });

    return connection;
  }, [role]);

  const createInvite = useCallback(async () => {
    disposeConnection();
    setError(null);
    setLocalCode(null);
    setRemoteStream(null);
    setPeerRole(null);
    setConnectionState('new');
    setPhase('creating-invite');

    const connection = openConnection();

    try {
      await connection.init(role, SIGNALING_MODE);
      const offer = await connection.createOffer();

      if (connectionRef.current !== connection) {
        return;
      }

      setLocalCode(offer);
      setPhase('waiting-for-answer');
    } catch (inviteError) {
      if (connectionRef.current === connection) {
        connection.close();
        connectionRef.current = null;
        setPhase('failed');
        setError(toErrorMessage(inviteError));
      }
    }
  }, [disposeConnection, openConnection, role]);

  const joinInvite = useCallback(
    async (code: string) => {
      disposeConnection();
      setError(null);
      setLocalCode(null);
      setRemoteStream(null);
      setPeerRole(null);
      setConnectionState('new');
      setPhase('joining');

      const connection = openConnection();

      try {
        await connection.init('admin', SIGNALING_MODE);
        const answer = await connection.acceptOffer(code);

        if (connectionRef.current !== connection) {
          return;
        }

        setLocalCode(answer);
        setPhase('waiting-for-connection');
      } catch (joinError) {
        if (connectionRef.current === connection) {
          connection.close();
          connectionRef.current = null;
          setPhase('failed');
          setError(toErrorMessage(joinError));
        }
      }
    },
    [disposeConnection, openConnection],
  );

  const acceptAnswer = useCallback(async (code: string) => {
    const connection = connectionRef.current;
    if (!connection) {
      setError('Create an invite first, then scan the Admin answer.');
      return;
    }

    setError(null);
    setPhase('waiting-for-connection');

    try {
      await connection.acceptAnswer(code);
    } catch (answerError) {
      if (connectionRef.current === connection) {
        setPhase('failed');
        setError(toErrorMessage(answerError));
      }
    }
  }, []);

  const attachVideoTrack = useCallback((track: MediaStreamTrack) => {
    connectionRef.current?.attachVideoTrack(track);
  }, []);

  const reset = useCallback(() => {
    disposeConnection();
    setPhase('idle');
    setConnectionState('new');
    setLocalCode(null);
    setRemoteStream(null);
    setPeerRole(null);
    setError(null);
  }, [disposeConnection]);

  useEffect(() => {
    return () => {
      disposeConnection();
    };
  }, [disposeConnection]);

  return {
    phase,
    connectionState,
    localCode,
    remoteStream,
    peerRole,
    error,
    busy:
      phase === 'creating-invite' ||
      phase === 'joining' ||
      phase === 'waiting-for-connection',
    createInvite,
    joinInvite,
    acceptAnswer,
    attachVideoTrack,
    reset,
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Something went wrong while pairing. Try again.';
}
