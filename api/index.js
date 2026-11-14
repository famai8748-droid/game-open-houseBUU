const { URL } = require('url');
const { generateQrSvgDataUrl } = require('../qr');

// In-memory store for warm serverless instance + polling queue
global.__ROOMS__ = global.__ROOMS__ || new Map();
const rooms = global.__ROOMS__;

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
    },
    pendingInputs: []
  };
}

module.exports = async (req, res) => {
  const parsedUrl = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  if (pathname === '/api/server-info') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      lanIp: req.headers.host || 'localhost',
      port: '',
      isVercel: true
    }));
  }

  if (pathname === '/api/qr') {
    const text = parsedUrl.searchParams.get('text') || `https://${req.headers.host}`;
    const dataUrl = generateQrSvgDataUrl(text);
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ dataUrl, text }));
  }

  if (pathname === '/api/create-room') {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const room = createInitialRoomState(code);
    room.mode = body.mode || 'coop';
    room.character = body.character || 'male';
    rooms.set(code, room);
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true, room }));
  }

  if (pathname === '/api/join-room') {
    const code = String(body.code || '').trim() || '1234';
    let room = rooms.get(code);
    if (!room) {
      room = createInitialRoomState(code);
      rooms.set(code, room);
    }
    if (body.role === 'p1') room.players.p1 = true;
    if (body.role === 'p2') room.players.p2 = true;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true, room }));
  }

  if (pathname === '/api/sync-state') {
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
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true, players: room.players, inputs }));
  }

  if (pathname === '/api/player-input') {
    const code = String(body.code || '');
    let room = rooms.get(code);
    if (!room) {
      room = createInitialRoomState(code);
      rooms.set(code, room);
    }
    room.pendingInputs.push({
      from: body.role || 'remote',
      action: body.action,
      value: body.value
    });
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true }));
  }

  if (pathname === '/api/room-state') {
    const code = String(parsedUrl.searchParams.get('code') || '');
    const room = rooms.get(code) || createInitialRoomState(code);
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true, room }));
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
};
