// Local / booth server: static files + co-op API + Server-Sent Events push.
//
//   npm run local                 -> http://localhost:3000 and http://<LAN-IP>:3000
//   PUBLIC_TUNNEL=1 npm run local -> also opens a public https URL via localhost.run (needs `ssh`)
//   PORT=8080 npm run local       -> different port
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { URL } = require('url');
const { createApiHandler, sendJson } = require('./server/http-api');
const { createMemoryStore } = require('./server/stores');
const { getLocalLanIp } = require('./server/lan-ip');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const WANT_TUNNEL = process.env.PUBLIC_TUNNEL === '1';
let currentPublicUrl = null;

// ----------------------------------------------------------------------------
// Optional public tunnel (opt-in). Never crashes the server if ssh is missing.
// ----------------------------------------------------------------------------
function startPublicTunnel(attempt = 0) {
  let ssh;
  try {
    ssh = spawn('ssh', [
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ServerAliveInterval=30',
      '-R', `80:localhost:${PORT}`,
      'nokey@localhost.run'
    ]);
  } catch (err) {
    console.warn(`[tunnel] cannot start ssh: ${err.message}`);
    return;
  }
  let gaveUp = false;
  ssh.on('error', (err) => {
    gaveUp = true;
    console.warn(`[tunnel] ssh unavailable (${err.code || err.message}); public URL disabled. LAN play still works.`);
  });
  const onData = (buf) => {
    const m = buf.toString('utf8').match(/https:\/\/[a-z0-9-]+\.(?:app\.)?lhr\.life/i);
    if (m && m[0] !== currentPublicUrl) {
      currentPublicUrl = m[0];
      console.log(`PUBLIC HTTPS URL: ${currentPublicUrl}`);
    }
  };
  ssh.stdout.on('data', onData);
  ssh.stderr.on('data', onData);
  ssh.on('close', () => {
    currentPublicUrl = null;
    if (gaveUp) return;
    const delay = Math.min(60000, 3000 * 2 ** Math.min(attempt, 5));
    setTimeout(() => startPublicTunnel(attempt + 1), delay).unref();
  });
}

// Booth phone test (tools/booth-check.js): a phone that opens /phone-check proves it can reach
// this laptop over the venue Wi-Fi (no client isolation, firewall open).
let lastPhoneCheck = null;
const PHONE_CHECK_PAGE = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ทดสอบมือถือ</title><style>body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#070508;color:#f6dda9;font-family:sans-serif;text-align:center;padding:24px}
b{font-size:28px;color:#9fe3cf}p{color:#ddd2be;line-height:1.6}</style></head><body><b>มือถือต่อโน้ตบุ๊กบูธได้</b>
<p>โหมดเล่น 2 คนใช้ได้บน Wi-Fi นี้<br>ดูหน้าต่างเช็คบนโน้ตบุ๊กได้เลย</p></body></html>`;

// ----------------------------------------------------------------------------
// SSE clients: code -> Set<{ res, role }>
// ----------------------------------------------------------------------------
const store = createMemoryStore();
const sseClients = new Map();
const lastBroadcastAt = new Map(); // code -> room.updatedAt already pushed to phones

function sendEvent(client, event, payload) {
  try { client.res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`); } catch (_) {}
}
function broadcast(code, event, payload, filter) {
  const set = sseClients.get(code);
  if (!set) return;
  for (const client of set) if (!filter || filter(client)) sendEvent(client, event, payload);
}

async function pushPresence(code) {
  const room = await store.getRoom(code);
  if (!room) return;
  const view = api.service.publicView(room, await store.getPresence(code), Date.now());
  broadcast(code, 'room_updated', { players: view.players, hostOnline: view.hostOnline });
}

async function pushState(code) {
  const room = await store.getRoom(code);
  if (!room || lastBroadcastAt.get(code) === room.updatedAt) return;
  lastBroadcastAt.set(code, room.updatedAt);
  const view = api.service.publicView(room, await store.getPresence(code), Date.now());
  broadcast(code, 'state_synced', view, (c) => c.role !== 'host');
}

const api = createApiHandler({
  store,
  serverInfo: () => ({ isVercel: false, sse: true, lanIp: getLocalLanIp(), port: PORT, publicUrl: currentPublicUrl }),
  onInput: (code, input) => broadcast(code, 'remote_input', input, (c) => c.role === 'host'),
  onPresence: (code) => { pushPresence(code).catch(() => {}); },
  onSync: (code) => { pushState(code).catch(() => {}); }
});

async function handleEvents(req, res, query) {
  const code = String(query.get('code') || '');
  const role = String(query.get('role') || '');
  const token = String(query.get('token') || '');
  const room = await store.getRoom(code);
  if (!room) return sendJson(res, 404, { ok: false, error: 'room_not_found' });
  const presence = await store.getPresence(code);
  const authorized = role === 'host' ? token === room.hostToken : (['p1', 'p2'].includes(role) && presence[`${role}_token`] === token);
  if (!authorized) return sendJson(res, 403, { ok: false, error: 'forbidden' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  res.write('retry: 2000\n\n');
  const client = { res, role };
  if (!sseClients.has(code)) sseClients.set(code, new Set());
  sseClients.get(code).add(client);
  sendEvent(client, 'connected', { ok: true });
  if (role !== 'host') sendEvent(client, 'state_synced', api.service.publicView(room, presence, Date.now()));

  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) {} }, 15000);
  req.on('close', () => {
    clearInterval(ping);
    const set = sseClients.get(code);
    if (set) {
      set.delete(client);
      if (set.size === 0) {
        sseClients.delete(code);
        lastBroadcastAt.delete(code);
      }
    }
  });
}

// ----------------------------------------------------------------------------
// Static files
// ----------------------------------------------------------------------------
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2'
};

function serveStatic(pathname, res) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch (_) { decoded = null; }
  const filePath = decoded && path.resolve(PUBLIC_DIR, '.' + (decoded === '/' ? '/index.html' : decoded));
  if (!filePath || !(filePath === PUBLIC_DIR || filePath.startsWith(PUBLIC_DIR + path.sep))) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 Not Found');
  }
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' || ext === '.js' || ext === '.css' ? 'no-cache' : 'public, max-age=3600'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, 'http://localhost');
  const pathname = parsed.pathname;

  if (pathname === '/phone-check') {
    const addr = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    if (addr !== '127.0.0.1' && addr !== '::1') lastPhoneCheck = { at: Date.now(), from: addr };
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(PHONE_CHECK_PAGE);
  }
  if (pathname === '/phone-check/status') {
    return sendJson(res, 200, { ok: true, lastPhoneCheck });
  }

  if (pathname.startsWith('/api/')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    if (pathname === '/api/events') {
      handleEvents(req, res, parsed.searchParams).catch((err) => {
        console.error('[sse]', err);
        if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'server_error' });
      });
      return;
    }
    return api(req, res);
  }
  serveStatic(pathname, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Thai Horror Game Server running at http://localhost:${PORT} (LAN: http://${getLocalLanIp()}:${PORT})`);
  if (WANT_TUNNEL) startPublicTunnel();
  else console.log('Public tunnel disabled (set PUBLIC_TUNNEL=1 to enable).');
});
