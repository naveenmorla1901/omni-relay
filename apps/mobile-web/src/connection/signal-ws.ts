/**
 * Browser WebSocket client for the ClearRelay signaling relay.
 * Used when EXPO_PUBLIC_SIGNALING_URL is set in the environment.
 */

export type WsRole = 'admin' | 'recorder' | 'display';

export type SignalMsg =
  | { t: 'created'; code: string }
  | { t: 'room-ok'; role: WsRole }
  | { t: 'joined'; role: WsRole }
  | { t: 'left'; role: WsRole }
  | { t: 'sdp'; from: WsRole; sdp: string; kind: 'offer' | 'answer' | 'stage' }
  | { t: 'push'; data: string; mime: string }
  | { t: 'error'; msg: string };

export class SignalClient {
  private ws: WebSocket | null = null;
  private msgHandlers: ((msg: SignalMsg) => void)[] = [];
  private closeHandlers: (() => void)[] = [];

  async connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) { reject(err); } else { resolve(); }
      };

      const timer = setTimeout(() => {
        ws.close();
        settle(new Error('Signaling server timed out. Is it running and reachable?'));
      }, 10_000);

      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => settle();
      ws.onerror = () => settle(new Error('Cannot reach the signaling server. Check the URL.'));
      ws.onclose = () => {
        settle(new Error('Signaling server closed the connection.'));
        this.closeHandlers.forEach((h) => h());
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as SignalMsg;
          this.msgHandlers.forEach((h) => h(msg));
        } catch {
          // Ignore malformed frames.
        }
      };
    });
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  createRoom(): void {
    this.send({ t: 'create' });
  }

  joinRoom(code: string, role: WsRole): void {
    this.send({ t: 'join', code: code.toUpperCase().trim(), role });
  }

  relaySdp(to: WsRole, sdp: string, kind: 'offer' | 'answer'): void {
    this.send({ t: 'sdp', to, sdp, kind });
  }

  /**
   * Send a serialized Link B stage message to another peer. It rides the
   * relay's `sdp` forward because that is the one peer-to-peer message every
   * deployed relay version passes through; older relays drop `push`.
   */
  relayStage(to: WsRole, payload: string): void {
    this.send({ t: 'sdp', to, sdp: payload, kind: 'stage' });
  }

  /** Subscribe to incoming messages. Returns an unsubscribe function. */
  onMsg(handler: (msg: SignalMsg) => void): () => void {
    this.msgHandlers.push(handler);
    return () => {
      this.msgHandlers = this.msgHandlers.filter((h) => h !== handler);
    };
  }

  onDisconnect(handler: () => void): void {
    this.closeHandlers.push(handler);
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
    this.msgHandlers = [];
    this.closeHandlers = [];
  }
}
