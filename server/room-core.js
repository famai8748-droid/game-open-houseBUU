// Shared co-op room logic used by both the local Node server and the Vercel function.
//
// Model
//  - The HOST browser runs the whole game and is the only writer of room state
//    (authenticated by a secret hostToken returned once by createRoom).
//  - Phones join a role (p1 | p2) and receive a playerToken. A newer join for the
//    same role replaces the older device, so a player can always re-scan to regain control.
//  - Phone inputs go into a capped queue with increasing ids; the host drains it on
//    every sync (and the local server additionally pushes them over SSE; the host
//    de-duplicates by id).
//  - Presence (who is online) and tokens live apart from the room state so that a
//    join and a host sync can never overwrite each other in a shared store.

const crypto = require('crypto');

const CODE_RE = /^\d{4}$/;
const ROLES = ['p1', 'p2'];
const ACTIONS = new Set(['move', 'interact', 'hide', 'flashlight', 'stun_ghost', 'sixth_sense_pulse']);
const ROOM_TTL_MS = 30 * 60 * 1000;   // idle rooms disappear after 30 minutes
const ONLINE_MS = 6000;               // a device is "online" if seen within 6 s
const MAX_INPUTS = 64;                // queued inputs kept per room

const OFFERINGS = ['garland', 'incense', 'dessert'];
const FLAG_KEYS = [
  'door1Opened', 'inspectedDust', 'inspectedPortraits', 'samphawesiTriggered',
  'offeringsPlaced', 'photosRestored', 'cutscenePlaying', 'gameOver', 'victory',
  'visited2', 'visited4'
];

class RoomError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

function randomToken() {
  return crypto.randomBytes(16).toString('hex');
}

function createInitialState() {
  return {
    character: 'male',
    started: false,
    scene: 1,
    player: { x: 160, dir: 1, frame: 0, flashlight: true, hidden: false, sixthSense: false },
    inventory: { offerings: [], photos: [], placedPhotos: [] },
    flags: Object.fromEntries(FLAG_KEYS.map((k) => [k, false])),
    ghost: { active: false, type: 'samphawesi', x: 780, dir: -1, frame: 0, stunTimer: 0, alertLevel: 5, alpha: 1 },
    support: { bellCooldown: 0 }
  };
}

// ---------------------------------------------------------------------------
// Validation of the host's state patch (whitelist only; unknown keys are dropped)
// ---------------------------------------------------------------------------
const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined);
const bool = (v) => (typeof v === 'boolean' ? v : undefined);
const oneOf = (v, list) => (list.includes(v) ? v : undefined);
const uniqList = (v, allowed) => (Array.isArray(v) ? [...new Set(v.filter((x) => allowed.includes(x)))] : undefined);

function pick(src, schema) {
  if (!src || typeof src !== 'object' || Array.isArray(src)) return undefined;
  const out = {};
  for (const [key, check] of Object.entries(schema)) {
    if (Object.prototype.hasOwnProperty.call(src, key)) {
      const v = check(src[key]);
      if (v !== undefined) out[key] = v;
    }
  }
  return out;
}

const PATCH_SCHEMA = {
  scene: (v) => num(v, 1, 5),
  character: (v) => oneOf(v, ['male', 'female']),
  started: bool,
  player: (v) => pick(v, {
    x: (n) => num(n, 0, 1280), dir: (n) => oneOf(n, [-1, 1]), frame: (n) => num(n, 0, 7),
    flashlight: bool, hidden: bool, sixthSense: bool
  }),
  inventory: (v) => pick(v, {
    offerings: (l) => uniqList(l, OFFERINGS),
    photos: (l) => uniqList(l, [1, 2, 3]),
    placedPhotos: (l) => uniqList(l, [1, 2, 3])
  }),
  flags: (v) => pick(v, Object.fromEntries(FLAG_KEYS.map((k) => [k, bool]))),
  ghost: (v) => pick(v, {
    active: bool, type: (t) => oneOf(t, ['samphawesi', 'dancer']), x: (n) => num(n, -200, 1480),
    dir: (n) => oneOf(n, [-1, 1]), frame: (n) => num(n, 0, 7), stunTimer: (n) => num(n, 0, 10),
    alertLevel: (n) => num(n, 0, 100), alpha: (n) => num(n, 0, 1)
  }),
  support: (v) => pick(v, { bellCooldown: (n) => num(n, 0, 60) })
};

function sanitizePatch(patch) {
  return pick(patch, PATCH_SCHEMA) || {};
}

function applyPatch(state, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      state[key] = Object.assign({}, state[key], value);
    } else {
      state[key] = value;
    }
  }
}

function sanitizeInputValue(action, value) {
  if (action === 'move') return value === -1 || value === 1 ? value : 0;
  return true;
}

// ---------------------------------------------------------------------------
// Room service
// ---------------------------------------------------------------------------
function createRoomService(store, { now = () => Date.now() } = {}) {
  function requireCode(code) {
    const c = String(code == null ? '' : code).trim();
    if (!CODE_RE.test(c)) throw new RoomError(400, 'bad_code', 'Room code must be 4 digits');
    return c;
  }

  async function loadRoom(code) {
    const room = await store.getRoom(code);
    if (!room) throw new RoomError(404, 'room_not_found', 'Room not found');
    return room;
  }

  function presenceView(presence, t) {
    const seen = (k) => Number(presence[`${k}_seen`] || 0);
    return {
      p1: t - seen('p1') < ONLINE_MS,
      p2: t - seen('p2') < ONLINE_MS,
      host: t - seen('host') < ONLINE_MS
    };
  }

  function publicView(room, presence, t) {
    const players = presenceView(presence, t);
    return { code: room.code, updatedAt: room.updatedAt, ...room.state, players, hostOnline: players.host };
  }

  async function createRoom(body = {}) {
    const t = now();
    let code = null;
    for (let i = 0; i < 60; i++) {
      const candidate = String(crypto.randomInt(1000, 10000));
      if (!(await store.getRoom(candidate))) { code = candidate; break; }
    }
    if (!code) throw new RoomError(503, 'no_free_code', 'No free room code, try again');

    const state = createInitialState();
    state.character = oneOf(body.character, ['male', 'female']) || 'male';
    const room = { code, hostToken: randomToken(), createdAt: t, updatedAt: t, stateSeq: 0, state };
    await store.putRoom(room, ROOM_TTL_MS);
    await store.setPresence(code, { host_seen: t }, ROOM_TTL_MS);
    return { ok: true, code, hostToken: room.hostToken, room: publicView(room, { host_seen: t }, t) };
  }

  async function joinRoom(body = {}) {
    const code = requireCode(body.code);
    const role = oneOf(body.role, ROLES);
    if (!role) throw new RoomError(400, 'bad_role', 'Role must be p1 or p2');
    const room = await loadRoom(code);
    const t = now();
    const playerToken = randomToken();
    await store.setPresence(code, { [`${role}_token`]: playerToken, [`${role}_seen`]: t }, ROOM_TTL_MS);
    const presence = await store.getPresence(code);
    return { ok: true, code, role, playerToken, room: publicView(room, presence, t) };
  }

  async function authPlayer(code, role, token) {
    if (!oneOf(role, ROLES)) throw new RoomError(400, 'bad_role', 'Role must be p1 or p2');
    const presence = await store.getPresence(code);
    if (!token || presence[`${role}_token`] !== token) {
      throw new RoomError(409, 'replaced', 'This device is no longer connected to the room');
    }
    return presence;
  }

  async function syncState(body = {}) {
    const code = requireCode(body.code);
    const room = await loadRoom(code);
    if (!body.hostToken || body.hostToken !== room.hostToken) {
      throw new RoomError(403, 'not_host', 'Only the host can sync state');
    }
    const t = now();
    const seq = Number(body.seq) || 0;
    if (body.statePatch && seq > (room.stateSeq || 0)) {
      applyPatch(room.state, sanitizePatch(body.statePatch));
      room.stateSeq = seq;
      room.updatedAt = t;
      await store.putRoom(room, ROOM_TTL_MS);
    } else {
      await store.touchRoom(code, ROOM_TTL_MS);
    }
    await store.setPresence(code, { host_seen: t }, ROOM_TTL_MS);
    const [inputs, presence] = await Promise.all([store.drainInputs(code), store.getPresence(code)]);
    return { ok: true, inputs, players: presenceView(presence, t) };
  }

  async function playerInput(body = {}) {
    const code = requireCode(body.code);
    await loadRoom(code);
    const role = body.role;
    await authPlayer(code, role, body.playerToken);
    const action = String(body.action || '');
    if (!ACTIONS.has(action)) throw new RoomError(400, 'bad_action', 'Unknown action');
    if (action === 'stun_ghost' || action === 'sixth_sense_pulse') {
      if (role !== 'p2') throw new RoomError(403, 'wrong_role', 'Only P2 can use this skill');
    } else if (role !== 'p1') {
      throw new RoomError(403, 'wrong_role', 'Only P1 can move the character');
    }
    const t = now();
    const input = {
      from: role,
      action,
      value: sanitizeInputValue(action, body.value),
      seq: Number.isFinite(Number(body.seq)) ? Number(body.seq) : 0
    };
    const stored = await store.pushInput(code, input, MAX_INPUTS, ROOM_TTL_MS);
    await store.setPresence(code, { [`${role}_seen`]: t }, ROOM_TTL_MS);
    return { ok: true, input: stored };
  }

  async function roomState(query = {}) {
    const code = requireCode(query.code);
    const room = await loadRoom(code);
    const t = now();
    let presence;
    if (query.role && query.token) {
      presence = await authPlayer(code, query.role, query.token);
      await store.setPresence(code, { [`${query.role}_seen`]: t }, ROOM_TTL_MS);
      presence[`${query.role}_seen`] = t;
    } else {
      presence = await store.getPresence(code);
    }
    return { ok: true, room: publicView(room, presence, t) };
  }

  return { createRoom, joinRoom, syncState, playerInput, roomState, publicView };
}

// ---------------------------------------------------------------------------
// Tiny fixed-window rate limiter (per process; good enough to stop code guessing)
// ---------------------------------------------------------------------------
function createRateLimiter({ limit, windowMs, now = () => Date.now() }) {
  const hits = new Map();
  return function allow(key) {
    const t = now();
    let entry = hits.get(key);
    if (!entry || t - entry.start >= windowMs) {
      entry = { start: t, count: 0 };
      hits.set(key, entry);
      if (hits.size > 5000) {
        for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
      }
    }
    entry.count++;
    return entry.count <= limit;
  };
}

module.exports = {
  createRoomService,
  createRateLimiter,
  createInitialState,
  sanitizePatch,
  RoomError,
  CODE_RE,
  ACTIONS,
  ROOM_TTL_MS,
  ONLINE_MS,
  MAX_INPUTS
};
