const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');
const { generateQrSvgDataUrl } = require('../qr');

const TMP_FILE = path.join(os.tmpdir(), 'thai_horror_buu_rooms.json');
global.__ROOMS__ = global.__ROOMS__ || new Map();
const rooms = global.__ROOMS__;

function loadRoomsFromTmp() {
  try {
    if (fs.existsSync(TMP_FILE)) {
      const data = JSON.parse(fs.readFileSync(TMP_FILE, 'utf8'));
      for (const [k, v] of Object.entries(data)) {
        if (!rooms.has(k) || (v.updatedAt || 0) > (rooms.get(k).updatedAt || 0)) {
          rooms.set(k, v);
        }
      }
    }
  } catch (_) {}
}

function saveRoomsToTmp() {
  try {
    const obj = {};
    for (const [k, v] of rooms.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(TMP_FILE, JSON.stringify(obj), 'utf8');
  } catch (_) {}
}

function createInitialRoomState(code) {
  return {
    code,
    updatedAt: Date.now(),
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
    },
    pendingInputs: []
  };
}

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body);
  }
  if (typeof req.body === 'string') {
    try { return Promise.resolve(JSON.parse(req.body || '{}')); } catch (_) { return Promise.resolve({}); }
  }
  if (Buffer.isBuffer(req.body)) {
    try { return Promise.resolve(JSON.parse(req.body.toString('utf8') || '{}')); } catch (_) { return Promise.resolve({}); }
  }
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch (_) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

module.exports = async (req, res) => {
  loadRoomsFromTmp();
  const parsedUrl = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const route = (parsedUrl.searchParams.get('route') || pathname.replace(/^\/api\/?/, '')).replace(/^\/+|\/+$/g, '');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const body = req.method === 'POST' ? await readJsonBody(req) : {};

  if (route === 'server-info') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      lanIp: req.headers.host || 'localhost',
      port: '',
      isVercel: true
    }));
  }

  if (route === 'qr') {
    const text = parsedUrl.searchParams.get('text') || `https://${req.headers.host}`;
    const dataUrl = generateQrSvgDataUrl(text);
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ dataUrl, text }));
  }

  if (route === 'create-room') {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const room = createInitialRoomState(code);
    room.mode = body.mode || 'coop';
    room.character = body.character || 'male';
    room.updatedAt = Date.now();
    rooms.set(code, room);
    saveRoomsToTmp();
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true, room }));
  }

  if (route === 'join-room') {
    const code = String(body.code || '').trim() || '1234';
    let room = rooms.get(code);
    if (!room) {
      room = createInitialRoomState(code);
      rooms.set(code, room);
    }
    if (body.role === 'p1') room.players.p1 = true;
    if (body.role === 'p2') room.players.p2 = true;
    room.updatedAt = Date.now();
    saveRoomsToTmp();
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true, room }));
  }

  if (route === 'sync-state') {
    const code = String(body.code || '');
    let room = rooms.get(code);
    if (!room) {
      room = createInitialRoomState(code);
      rooms.set(code, room);
    }
    if (body.statePatch) {
      const p = body.statePatch;
      if (p.scene !== undefined) room.scene = p.scene;
      if (p.character !== undefined) room.character = p.character;
      if (p.started !== undefined) room.started = p.started;
      if (p.player) Object.assign(room.player, p.player);
      if (p.inventory) Object.assign(room.inventory, p.inventory);
      if (p.flags) Object.assign(room.flags, p.flags);
      if (p.ghost) Object.assign(room.ghost, p.ghost);
    }
    const inputs = room.pendingInputs.splice(0, room.pendingInputs.length);
    room.updatedAt = Date.now();
    saveRoomsToTmp();
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true, players: room.players, inputs }));
  }

  if (route === 'player-input') {
    const code = String(body.code || '');
    let room = rooms.get(code);
    if (!room) {
      room = createInitialRoomState(code);
      rooms.set(code, room);
    }
    if (body.role === 'p1') room.players.p1 = true;
    if (body.role === 'p2') room.players.p2 = true;
    room.pendingInputs.push({
      from: body.role || 'remote',
      action: body.action,
      value: body.value
    });
    room.updatedAt = Date.now();
    saveRoomsToTmp();
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true }));
  }

  if (route === 'room-state') {
    const code = String(parsedUrl.searchParams.get('code') || '');
    const room = rooms.get(code) || createInitialRoomState(code);
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true, room }));
  }

  if (route === 'events') {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    return res.end(`event: connected\ndata: {"ok":true}\n\n`);
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'Not found', route, pathname }));
};
