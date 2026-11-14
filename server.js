const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { URL } = require('url');
const { generateQrSvgDataUrl } = require('./qr');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
let currentPublicUrl = null;

function startPublicTunnel() {
  try {
    const ssh = spawn('ssh', [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ServerAliveInterval=30',
      '-R', `80:localhost:${PORT}`,
      'nokey@localhost.run'
    ]);
    const onData = (buf) => {
      const text = buf.toString('utf8');
      const m = text.match(/https:\/\/[a-z0-9\-]+\.app\.lhr\.life/i) || text.match(/https:\/\/[a-z0-9\-]+\.lhr\.life/i);
      if (m && m[0] !== currentPublicUrl) {
        currentPublicUrl = m[0];
        try { fs.writeFileSync(path.join(__dirname, 'public_url.txt'), currentPublicUrl, 'utf8'); } catch (_) {}
        console.log(`PUBLIC HTTPS URL: ${currentPublicUrl}`);
      }
    };
    ssh.stdout.on('data', onData);
    ssh.stderr.on('data', onData);
    ssh.on('close', () => {
      setTimeout(startPublicTunnel, 3000);
    });
  } catch (_) {}
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function getLocalLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// Active rooms & SSE clients
const rooms = new Map();
const sseClients = new Map(); // code -> Set of res

function createInitialRoomState(code) {
  return {
    code,
    mode: 'coop',
    character: 'male',
    started: false,
    scene: 1,
    player: {
      x: 160,
      dir: 1,
      moving: false,
      frame: 0,
      flashlight: true,
      hidden: false,
      sixthSense: false
    },
    inventory: {
      offerings: [],
      photos: [],
      placedPhotos: []
    },
    flags: {
      door1Opened: false,
      inspectedDust: false,
      inspectedPortraits: false,
      samphawesiTriggered: false,
      offeringsPlaced: false,
      photosRestored: false,
      gameOver: false,
      victory: false
    },
    ghost: {
      active: false,
      type: 'samphawesi',
      x: 780,
      dir: -1,
      frame: 0,
      stunTimer: 0,
      alertLevel: 5
    },
    players: {
      p1: false,
      p2: false
    }
  };
}

function broadcastToRoom(code, eventName, payload) {
  const set = sseClients.get(code);
  if (!set) return;
  const msg = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try {
      res.write(msg);
    } catch (_) {}
  }
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (_) {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // CORS headers for local/remote access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // API: Server Info
  if (pathname === '/api/server-info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      lanIp: getLocalLanIp(),
      port: PORT,
      publicUrl: currentPublicUrl,
      activeRooms: Array.from(rooms.keys())
    }));
  }

  // API: Room State (Polling fallback)
  if (pathname === '/api/room-state') {
    const code = String(parsedUrl.searchParams.get('code') || '');
    const room = rooms.get(code) || null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: !!room, room }));
  }

  // API: QR Code SVG Data URL
  if (pathname === '/api/qr') {
    const text = parsedUrl.searchParams.get('text') || 'http://localhost:3000';
    const dataUrl = generateQrSvgDataUrl(text);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ dataUrl, text }));
  }

  // API: Create Room
  if (pathname === '/api/create-room' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const room = createInitialRoomState(code);
    room.mode = body.mode || 'coop';
    room.character = body.character || 'male';
    rooms.set(code, room);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, room }));
  }

  // API: Join Room
  if (pathname === '/api/join-room' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const code = String(body.code || '').trim() || '1234';
    let room = rooms.get(code);
    if (!room) {
      room = createInitialRoomState(code);
      rooms.set(code, room);
    }
    if (body.role === 'p1') room.players.p1 = true;
    if (body.role === 'p2') room.players.p2 = true;
    broadcastToRoom(code, 'room_updated', room);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, room }));
  }

  // API: Sync State (Host -> Room)
  if (pathname === '/api/sync-state' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const room = rooms.get(String(body.code || ''));
    if (room && body.statePatch) {
      const p = body.statePatch;
      if (p.scene !== undefined) room.scene = p.scene;
      if (p.character !== undefined) room.character = p.character;
      if (p.started !== undefined) room.started = p.started;
      if (p.player) Object.assign(room.player, p.player);
      if (p.inventory) Object.assign(room.inventory, p.inventory);
      if (p.flags) Object.assign(room.flags, p.flags);
      if (p.ghost) Object.assign(room.ghost, p.ghost);
      broadcastToRoom(room.code, 'state_synced', room);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  // API: Player Input (Mobile P1/P2 -> Host)
  if (pathname === '/api/player-input' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const code = String(body.code || '');
    broadcastToRoom(code, 'remote_input', {
      from: body.role || 'remote',
      action: body.action,
      value: body.value
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  // API: SSE Stream per Room
  if (pathname === '/api/events') {
    const code = String(parsedUrl.searchParams.get('code') || '');
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(`event: connected\ndata: {"ok":true}\n\n`);
    if (!sseClients.has(code)) sseClients.set(code, new Set());
    sseClients.get(code).add(res);

    const room = rooms.get(code);
    if (room) {
      res.write(`event: state_synced\ndata: ${JSON.stringify(room)}\n\n`);
    }

    req.on('close', () => {
      if (sseClients.has(code)) {
        sseClients.get(code).delete(res);
      }
    });
    return;
  }

  // Static file serving
  let safePath = path.normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Thai Horror Game Server running at http://localhost:${PORT} (LAN: http://${getLocalLanIp()}:${PORT})`);
  startPublicTunnel();
});
