// Room stores used by room-core.js
//
//  - createMemoryStore(): one process, in memory. Right for local-server.js.
//    On Vercel it only works while every request reaches the same instance.
//  - createUpstashStore(): Upstash Redis / Vercel KV over the REST API, shared by
//    every serverless instance. Enabled automatically on Vercel when
//    UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL +
//    KV_REST_API_TOKEN) are set.

function createMemoryStore({ now = () => Date.now(), sweepMs = 60 * 1000 } = {}) {
  const rooms = new Map();    // code -> { room, expiresAt }
  const presence = new Map(); // code -> { fields, expiresAt }
  const inputs = new Map();   // code -> { nextId, list, expiresAt }

  const alive = (entry) => entry && entry.expiresAt > now();
  function get(map, code) {
    const entry = map.get(code);
    if (!entry) return null;
    if (!alive(entry)) { map.delete(code); return null; }
    return entry;
  }

  function sweep() {
    for (const map of [rooms, presence, inputs]) {
      for (const [code, entry] of map) if (!alive(entry)) map.delete(code);
    }
  }
  if (sweepMs > 0) {
    const timer = setInterval(sweep, sweepMs);
    if (timer.unref) timer.unref();
  }

  return {
    kind: 'memory',
    async getRoom(code) {
      const entry = get(rooms, code);
      return entry ? entry.room : null;
    },
    async putRoom(room, ttlMs) {
      rooms.set(room.code, { room, expiresAt: now() + ttlMs });
    },
    async touchRoom(code, ttlMs) {
      const entry = get(rooms, code);
      if (entry) entry.expiresAt = now() + ttlMs;
    },
    async setPresence(code, fields, ttlMs) {
      const entry = get(presence, code) || { fields: {} };
      Object.assign(entry.fields, fields);
      entry.expiresAt = now() + ttlMs;
      presence.set(code, entry);
    },
    async getPresence(code) {
      const entry = get(presence, code);
      return entry ? { ...entry.fields } : {};
    },
    async pushInput(code, input, max, ttlMs) {
      const entry = get(inputs, code) || { nextId: 1, list: [] };
      const stored = { id: entry.nextId++, ...input };
      entry.list.push(stored);
      if (entry.list.length > max) entry.list.splice(0, entry.list.length - max);
      entry.expiresAt = now() + ttlMs;
      inputs.set(code, entry);
      return stored;
    },
    async drainInputs(code) {
      const entry = get(inputs, code);
      if (!entry) return [];
      return entry.list.splice(0, entry.list.length);
    },
    _sweep: sweep,
    _size: () => ({ rooms: rooms.size, presence: presence.size, inputs: inputs.size })
  };
}

function createUpstashStore({ url, token, fetchImpl = globalThis.fetch }) {
  const base = url.replace(/\/+$/, '');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  async function call(path, body) {
    const res = await fetchImpl(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Upstash ${path || '/'} HTTP ${res.status}`);
    return res.json();
  }
  async function command(...args) {
    const out = await call('', args);
    if (out.error) throw new Error(`Upstash: ${out.error}`);
    return out.result;
  }
  async function pipeline(cmds, transaction = false) {
    const out = await call(transaction ? '/multi-exec' : '/pipeline', cmds);
    return out.map((r) => {
      if (r.error) throw new Error(`Upstash: ${r.error}`);
      return r.result;
    });
  }

  const k = {
    room: (c) => `buu:room:${c}`,
    presence: (c) => `buu:room:${c}:presence`,
    inputs: (c) => `buu:room:${c}:inputs`,
    inputSeq: (c) => `buu:room:${c}:inputseq`
  };

  return {
    kind: 'upstash',
    async getRoom(code) {
      const raw = await command('GET', k.room(code));
      return raw ? JSON.parse(raw) : null;
    },
    async putRoom(room, ttlMs) {
      await command('SET', k.room(room.code), JSON.stringify(room), 'PX', String(ttlMs));
    },
    async touchRoom(code, ttlMs) {
      await command('PEXPIRE', k.room(code), String(ttlMs));
    },
    async setPresence(code, fields, ttlMs) {
      const flat = Object.entries(fields).flatMap(([f, v]) => [f, String(v)]);
      await pipeline([['HSET', k.presence(code), ...flat], ['PEXPIRE', k.presence(code), String(ttlMs)]]);
    },
    async getPresence(code) {
      const arr = (await command('HGETALL', k.presence(code))) || [];
      const out = {};
      if (Array.isArray(arr)) {
        for (let i = 0; i + 1 < arr.length; i += 2) out[arr[i]] = arr[i + 1];
      } else if (arr && typeof arr === 'object') {
        Object.assign(out, arr);
      }
      return out;
    },
    async pushInput(code, input, max, ttlMs) {
      const id = Number(await command('INCR', k.inputSeq(code)));
      const stored = { id, ...input };
      await pipeline([
        ['RPUSH', k.inputs(code), JSON.stringify(stored)],
        ['LTRIM', k.inputs(code), String(-max), '-1'],
        ['PEXPIRE', k.inputs(code), String(ttlMs)],
        ['PEXPIRE', k.inputSeq(code), String(ttlMs)]
      ]);
      return stored;
    },
    async drainInputs(code) {
      const [list] = await pipeline([['LRANGE', k.inputs(code), '0', '-1'], ['DEL', k.inputs(code)]], true);
      return (list || []).map((s) => JSON.parse(s)).sort((a, b) => a.id - b.id);
    }
  };
}

function createStoreFromEnv(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (url && token) return createUpstashStore({ url, token });
  return createMemoryStore();
}

module.exports = { createMemoryStore, createUpstashStore, createStoreFromEnv };
