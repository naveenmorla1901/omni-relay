/**
 * ClearRelay — minimal WebSocket signaling relay (plain JS, no build step).
 * Railway runs: node server.js
 */
const { createServer } = require('http');
const { WebSocket, WebSocketServer } = require('ws');

const rooms = new Map();
const peers = new Map();

function push(ws, msg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function generateCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

// Rooms expire after 100 idle minutes; any relayed message (the Projector's
// 15 s heartbeat included) keeps them alive, so a session in use never expires.
const ROOM_IDLE_MS = 100 * 60 * 1000;
setInterval(() => {
  const cutoff = Date.now() - ROOM_IDLE_MS;
  for (const [code, room] of rooms) {
    if (room.lastActive < cutoff) {
      for (const peer of room.peers.values()) peer.roomCode = null;
      rooms.delete(code);
    }
  }
}, 60_000);

const http = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ClearRelay signaling OK\n');
});

const wss = new WebSocketServer({ server: http });

wss.on('connection', (ws) => {
  const peer = { ws, role: 'admin', roomCode: null };
  peers.set(ws, peer);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }

    switch (msg.t) {
      case 'create': {
        const code = generateCode();
        peer.role = 'admin';
        peer.roomCode = code;
        rooms.set(code, { code, peers: new Map([['admin', peer]]), createdAt: Date.now(), lastActive: Date.now() });
        push(ws, { t: 'created', code });
        break;
      }
      case 'join': {
        const code = String(msg.code ?? '').toUpperCase().trim();
        const role = msg.role;
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
        room.lastActive = Date.now();
        push(ws, { t: 'room-ok', role });
        const admin = room.peers.get('admin');
        if (admin) push(admin.ws, { t: 'joined', role });
        break;
      }
      case 'sdp': {
        const room = peer.roomCode ? rooms.get(peer.roomCode) : null;
        if (!room) { push(ws, { t: 'error', msg: 'Not in a room.' }); return; }
        const target = room.peers.get(msg.to);
        if (!target) { push(ws, { t: 'error', msg: `${msg.to} is not in the room yet.` }); return; }
        room.lastActive = Date.now();
        push(target.ws, { t: 'sdp', from: peer.role, sdp: msg.sdp, kind: msg.kind });
        break;
      }
      case 'push': {
        if (peer.role !== 'admin') { push(ws, { t: 'error', msg: 'Only admin can push content.' }); return; }
        const room = peer.roomCode ? rooms.get(peer.roomCode) : null;
        if (!room) { push(ws, { t: 'error', msg: 'Not in a room.' }); return; }
        const display = room.peers.get('display');
        if (!display) { push(ws, { t: 'error', msg: 'Projector is not connected.' }); return; }
        push(display.ws, { t: 'push', data: msg.data, mime: msg.mime ?? 'image/jpeg' });
        break;
      }
    }
  });

  ws.on('close', () => {
    peers.delete(ws);
    const { roomCode, role } = peer;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;
    // A rejoined peer replaces its dead socket; that socket closing late must
    // not evict the replacement.
    if (room.peers.get(role) !== peer) return;
    room.peers.delete(role);
    if (role === 'admin') {
      for (const p of room.peers.values()) {
        push(p.ws, { t: 'error', msg: 'Admin disconnected. Session ended.' });
        p.roomCode = null;
      }
      rooms.delete(roomCode);
    } else {
      const admin = room.peers.get('admin');
      if (admin) push(admin.ws, { t: 'left', role });
    }
  });
});

const PORT = Number(process.env.PORT ?? 3001);
http.listen(PORT, () => console.log(`ClearRelay signaling listening on :${PORT}`));
