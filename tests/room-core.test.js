const test = require('node:test');
const assert = require('node:assert/strict');
const { createRoomService, createRateLimiter, sanitizePatch, MAX_INPUTS } = require('../server/room-core');
const { createMemoryStore, createUpstashStore } = require('../server/stores');

function makeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

// Minimal in-process fake of the Upstash REST API (only the commands stores.js uses).
function fakeUpstashFetch() {
  const kv = new Map();
  const run = ([cmd, key, ...args]) => {
    switch (cmd) {
      case 'GET': return kv.has(key) ? kv.get(key) : null;
      case 'SET': kv.set(key, args[0]); return 'OK';
      case 'PEXPIRE': return kv.has(key) ? 1 : 0;
      case 'DEL': return kv.delete(key) ? 1 : 0;
      case 'INCR': { const v = Number(kv.get(key) || 0) + 1; kv.set(key, String(v)); return v; }
      case 'HSET': { const h = kv.get(key) || {}; for (let i = 0; i < args.length; i += 2) h[args[i]] = args[i + 1]; kv.set(key, h); return 1; }
      case 'HGETALL': { const h = kv.get(key) || {}; return Object.entries(h).flat(); }
      case 'RPUSH': { const l = kv.get(key) || []; l.push(...args); kv.set(key, l); return l.length; }
      case 'LTRIM': { const l = kv.get(key) || []; const start = Number(args[0]); kv.set(key, start < 0 ? l.slice(start) : l.slice(start)); return 'OK'; }
      case 'LRANGE': return [...(kv.get(key) || [])];
      default: throw new Error(`fake upstash: ${cmd} not implemented`);
    }
  };
  return async (url, { body }) => {
    const payload = JSON.parse(body);
    const multi = /\/(pipeline|multi-exec)$/.test(url);
    const result = multi ? payload.map((c) => ({ result: run(c) })) : { result: run(payload) };
    return { ok: true, status: 200, json: async () => result };
  };
}

const storeFactories = {
  memory: (clock) => createMemoryStore({ now: clock.now, sweepMs: 0 }),
  upstash: () => createUpstashStore({ url: 'https://fake.upstash.io', token: 't', fetchImpl: fakeUpstashFetch() })
};

for (const [kind, makeStore] of Object.entries(storeFactories)) {
  test(`[${kind}] full room lifecycle`, async () => {
    const clock = makeClock();
    const svc = createRoomService(makeStore(clock), { now: clock.now });

    const created = await svc.createRoom({ character: 'female' });
    assert.match(created.code, /^\d{4}$/);
    assert.equal(created.room.character, 'female');
    assert.equal(created.room.hostToken, undefined, 'host token must never be in the public view');

    const p1 = await svc.joinRoom({ code: created.code, role: 'p1' });
    assert.ok(p1.playerToken);
    assert.equal(p1.room.players.p1, true);

    await svc.playerInput({ code: created.code, role: 'p1', playerToken: p1.playerToken, action: 'move', value: -1, seq: 1 });
    await svc.playerInput({ code: created.code, role: 'p1', playerToken: p1.playerToken, action: 'move', value: 99, seq: 2 });

    const sync = await svc.syncState({
      code: created.code, hostToken: created.hostToken, seq: 1,
      statePatch: { scene: 3, player: { x: 500, evil: 1 }, inventory: { offerings: ['garland', 'garland', 'bomb'] } }
    });
    assert.deepEqual(sync.inputs.map((i) => [i.id, i.value]), [[1, -1], [2, 0]], 'ordered ids, invalid move value -> 0');
    assert.equal(sync.players.p1, true);

    const again = await svc.syncState({ code: created.code, hostToken: created.hostToken, seq: 2 });
    assert.equal(again.inputs.length, 0, 'queue is drained');

    const view = (await svc.roomState({ code: created.code })).room;
    assert.equal(view.scene, 3);
    assert.equal(view.player.x, 500);
    assert.equal(view.player.evil, undefined);
    assert.equal(view.player.flashlight, true, 'patch merges, does not replace');
    assert.deepEqual(view.inventory.offerings, ['garland']);
  });

  test(`[${kind}] stale or unauthenticated syncs are rejected`, async () => {
    const clock = makeClock();
    const svc = createRoomService(makeStore(clock), { now: clock.now });
    const { code, hostToken } = await svc.createRoom({});
    await svc.syncState({ code, hostToken, seq: 5, statePatch: { scene: 4 } });
    await svc.syncState({ code, hostToken, seq: 3, statePatch: { scene: 2 } });
    assert.equal((await svc.roomState({ code })).room.scene, 4, 'older seq ignored');
    await assert.rejects(svc.syncState({ code, hostToken: 'nope', seq: 9, statePatch: { scene: 5 } }), { status: 403 });
    await assert.rejects(svc.syncState({ code, seq: 9 }), { status: 403 });
  });

  test(`[${kind}] unknown rooms are 404 and never auto-created`, async () => {
    const clock = makeClock();
    const svc = createRoomService(makeStore(clock), { now: clock.now });
    await assert.rejects(svc.roomState({ code: '1234' }), { status: 404 });
    await assert.rejects(svc.joinRoom({ code: '1234', role: 'p2' }), { status: 404 });
    await assert.rejects(svc.playerInput({ code: '1234', role: 'p1', action: 'move' }), { status: 404 });
    await assert.rejects(svc.roomState({ code: '1234' }), { status: 404 });
    await assert.rejects(svc.roomState({ code: 'abcd' }), { status: 400 });
  });

  test(`[${kind}] inputs need a valid token, allowed action and the right role`, async () => {
    const clock = makeClock();
    const svc = createRoomService(makeStore(clock), { now: clock.now });
    const { code, hostToken } = await svc.createRoom({});
    const p1 = await svc.joinRoom({ code, role: 'p1' });
    const p2 = await svc.joinRoom({ code, role: 'p2' });
    await assert.rejects(svc.playerInput({ code, role: 'p1', playerToken: 'x', action: 'move', value: 1 }), { status: 409 });
    await assert.rejects(svc.playerInput({ code, role: 'p1', playerToken: p1.playerToken, action: '__proto__' }), { status: 400 });
    await assert.rejects(svc.playerInput({ code, role: 'p1', playerToken: p1.playerToken, action: 'stun_ghost' }), { status: 403 });
    await assert.rejects(svc.playerInput({ code, role: 'p2', playerToken: p2.playerToken, action: 'move', value: 1 }), { status: 403 });
    await svc.playerInput({ code, role: 'p2', playerToken: p2.playerToken, action: 'stun_ghost' });

    // Re-joining the same role replaces the old device.
    const p1b = await svc.joinRoom({ code, role: 'p1' });
    await assert.rejects(svc.playerInput({ code, role: 'p1', playerToken: p1.playerToken, action: 'interact' }), { status: 409 });
    await svc.playerInput({ code, role: 'p1', playerToken: p1b.playerToken, action: 'interact' });
    const { inputs } = await svc.syncState({ code, hostToken, seq: 1 });
    assert.deepEqual(inputs.map((i) => i.action), ['stun_ghost', 'interact']);
  });

  test(`[${kind}] input queue is capped`, async () => {
    const clock = makeClock();
    const svc = createRoomService(makeStore(clock), { now: clock.now });
    const { code, hostToken } = await svc.createRoom({});
    const p1 = await svc.joinRoom({ code, role: 'p1' });
    for (let i = 0; i < MAX_INPUTS + 20; i++) {
      await svc.playerInput({ code, role: 'p1', playerToken: p1.playerToken, action: 'interact', seq: i });
    }
    const { inputs } = await svc.syncState({ code, hostToken, seq: 1 });
    assert.equal(inputs.length, MAX_INPUTS);
    assert.equal(inputs[inputs.length - 1].seq, MAX_INPUTS + 19, 'keeps the newest');
  });
}

test('[memory] presence expires and idle rooms are removed', async () => {
  const clock = makeClock();
  const store = createMemoryStore({ now: clock.now, sweepMs: 0 });
  const svc = createRoomService(store, { now: clock.now });
  const { code } = await svc.createRoom({});
  await svc.joinRoom({ code, role: 'p2' });
  clock.advance(7000);
  const view = (await svc.roomState({ code })).room;
  assert.equal(view.players.p2, false, 'p2 offline after 6 s of silence');
  assert.equal(view.hostOnline, false);
  clock.advance(31 * 60 * 1000);
  store._sweep();
  assert.deepEqual(store._size(), { rooms: 0, presence: 0, inputs: 0 });
  await assert.rejects(svc.roomState({ code }), { status: 404 });
});

test('createRoom never reuses a live code', async () => {
  const clock = makeClock();
  const store = createMemoryStore({ now: clock.now, sweepMs: 0 });
  const svc = createRoomService(store, { now: clock.now });
  const codes = new Set();
  for (let i = 0; i < 2000; i++) codes.add((await svc.createRoom({})).code);
  assert.equal(codes.size, 2000);
});

test('sanitizePatch drops unknown keys and clamps values', () => {
  const out = sanitizePatch({
    scene: 99, hack: true, __proto__: { polluted: true },
    player: { x: 1e9, dir: 7, hidden: 'yes' },
    ghost: { type: 'vampire', alertLevel: -5 }
  });
  assert.deepEqual(out, { scene: 5, player: { x: 1280 }, ghost: { alertLevel: 0 } });
  assert.equal({}.polluted, undefined);
});

test('rate limiter', () => {
  const clock = makeClock();
  const allow = createRateLimiter({ limit: 2, windowMs: 1000, now: clock.now });
  assert.equal(allow('a'), true);
  assert.equal(allow('a'), true);
  assert.equal(allow('a'), false);
  assert.equal(allow('b'), true);
  clock.advance(1000);
  assert.equal(allow('a'), true);
});
