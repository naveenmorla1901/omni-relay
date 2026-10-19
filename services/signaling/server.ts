/**
 * ClearRelay — minimal WebSocket signaling relay.
 *
 * Purpose: let Admin, Recorder, and Projector find each other by a short room
 * code.  Only SDP offers/answers travel through here — never media.
 *
 * Run locally:   npx ts-node server.ts
 * Build + run:   npm run build && npm start
 * Deploy:        any host that keeps a process alive (Railway, Render, Fly.io)
 *                and exposes a WebSocket port — set PORT env var if needed.
 *
 * Protocol (JSON over WebSocket):
 *
 *   Client → Server
 *   ─────────────────────────────────────────────────────────────────────────
 *   { t:'create' }                      Admin creates a room, gets a code back
 *   { t:'join', code, role }            Recorder or Display joins by code
 *   { t:'sdp', to, sdp, kind }          Relay an SDP offer or answer
 *
 *   Server → Client
 *   ─────────────────────────────────────────────────────────────────────────
 *   { t:'created', code }               Room code for Admin to share
 *   { t:'room-ok', role }               Confirmed join
 *   { t:'joined', role }                Admin notified: a peer entered the room
 *   { t:'left', role }                  Admin notified: a peer disconnected
 *   { t:'sdp', from, sdp, kind }        Relayed SDP message
 *   { t:'error', msg }                  Friendly error text
 */

import { createServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';

type WsRole = 'admin' | 'recorder' | 'display';
type SdpKind = 'offer' | 'answer';

interface Peer {
  ws: WebSocket;
  role: WsRole;
  roomCode: string | null;
}

interface Room {
  code: string;
  peers: Map<WsRole, Peer>;
  createdAt: number;
}

const rooms = new Map<string, Room>();
const peers = new Map<WebSocket, Peer>();

// ── Helpers ──────────────────────────────────────────────────────────────────

function push(ws: WebSocket, msg: object): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function generateCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // omit 0/O/1/I
  let code: string;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

// Expire rooms older than 30 minutes to keep memory clean.
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [code, room] of rooms) {
    if (room.createdAt < cutoff) {
      for (const peer of room.peers.values()) {
        peer.roomCode = null;
      }
      rooms.delete(code);
    }
  }
}, 60_000);

// ── WebSocket server ──────────────────────────────────────────────────────────

const http = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ClearRelay signaling server OK\n');
});

const wss = new WebSocketServer({ server: http });

wss.on('connection', (ws) => {
  const peer: Peer = { ws, role: 'admin', roomCode: null };
  peers.set(ws, peer);

  ws.on('message', (raw) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(String(raw)) as Record<string, unknown>; } catch { return; }

    switch (msg.t) {
      case 'create': {
        // Admin creates a room.
        const code = generateCode();
        peer.role = 'admin';
        peer.roomCode = code;
        rooms.set(code, { code, peers: new Map([['admin', peer]]), createdAt: Date.now() });
        push(ws, { t: 'created', code });
        break;
      }

      case 'join': {
        // Recorder or Display joins an existing room.
        const code = String(msg.code ?? '').toUpperCase().trim();
        const role = msg.role as WsRole;

        if (role !== 'recorder' && role !== 'display') {
          push(ws, { t: 'error', msg: 'Invalid role.' });
          return;
        }

        const room = rooms.get(code);
        if (!room) {
          push(ws, { t: 'error', msg: 'Room not found. Check the code.' });
          return;
        }

        peer.role = role;
        peer.roomCode = code;
        room.peers.set(role, peer);

        push(ws, { t: 'room-ok', role });

        // Notify Admin.
        const admin = room.peers.get('admin');
        if (admin) push(admin.ws, { t: 'joined', role });
        break;
      }

      case 'sdp': {
        // Relay an SDP offer or answer to the target role.
        const to = msg.to as WsRole;
        const sdp = String(msg.sdp ?? '');
        const kind = msg.kind as SdpKind;

        const room = peer.roomCode ? rooms.get(peer.roomCode) : null;
        if (!room) { push(ws, { t: 'error', msg: 'Not in a room.' }); return; }

        const target = room.peers.get(to);
        if (!target) { push(ws, { t: 'error', msg: `${to} is not in the room yet.` }); return; }

        push(target.ws, { t: 'sdp', from: peer.role, sdp, kind });
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => {
    peers.delete(ws);

    const { roomCode, role } = peer;
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    room.peers.delete(role);

    if (role === 'admin') {
      // Admin left: tear down the whole room.
      for (const p of room.peers.values()) {
        push(p.ws, { t: 'error', msg: 'Admin disconnected. The session has ended.' });
        p.roomCode = null;
      }
      rooms.delete(roomCode);
    } else {
      // Non-admin left: let Admin know.
      const admin = room.peers.get('admin');
      if (admin) push(admin.ws, { t: 'left', role });
    }
  });
});

const PORT = Number(process.env.PORT ?? 3001);
http.listen(PORT, () => {
  console.log(`ClearRelay signaling server listening on :${PORT}`);
  console.log('Set EXPO_PUBLIC_SIGNALING_URL=ws://YOUR_IP:' + PORT + ' in the app .env');
});
