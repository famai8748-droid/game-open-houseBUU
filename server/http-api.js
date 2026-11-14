// HTTP adapter for room-core: shared by local-server.js and api/index.js.
const { URL } = require('url');
const { createRoomService, createRateLimiter, RoomError } = require('./room-core');
const { generateQrSvgDataUrl } = require('./qr');

const MAX_BODY_BYTES = 16 * 1024;

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  // Vercel may have parsed the body already.
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
    const text = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
    if (text.length > MAX_BODY_BYTES) return Promise.reject(new RoomError(413, 'too_large'));
    try { return Promise.resolve(JSON.parse(text || '{}')); } catch (_) { return Promise.reject(new RoomError(400, 'bad_json')); }
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', (chunk) => {
      if (tooLarge) return; // keep draining so the 413 response can still be delivered
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        reject(new RoomError(413, 'too_large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (_) { reject(new RoomError(400, 'bad_json')); }
    });
    req.on('error', () => reject(new RoomError(400, 'bad_body')));
  });
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

/**
 * @param {object} opts
 * @param {object} opts.store            room store (see stores.js)
 * @param {function} [opts.serverInfo]   (req) => extra fields for /api/server-info
 * @param {function} [opts.onInput]      (code, input) => void  (local SSE push)
 * @param {function} [opts.onPresence]   (code) => void         (local SSE push)
 * @param {function} [opts.onSync]       (code) => void         (local SSE push)
 */
function createApiHandler({ store, serverInfo = () => ({}), onInput = null, onPresence = null, onSync = null }) {
  const service = createRoomService(store);
  const createLimiter = createRateLimiter({ limit: 30, windowMs: 60 * 1000 });
  const joinLimiter = createRateLimiter({ limit: 40, windowMs: 60 * 1000 });

  async function handle(req, res, route, query) {
    const method = req.method || 'GET';
    const post = method === 'POST';

    if (route === 'server-info') {
      return sendJson(res, 200, { ok: true, store: store.kind, ...serverInfo(req) });
    }

    if (route === 'qr') {
      const text = query.get('text') || '';
      if (!/^https?:\/\//i.test(text)) throw new RoomError(400, 'bad_text', 'QR text must be an http(s) URL');
      return sendJson(res, 200, { ok: true, dataUrl: generateQrSvgDataUrl(text), text });
    }

    if (route === 'room-state' && method === 'GET') {
      const out = await service.roomState({ code: query.get('code'), role: query.get('role'), token: query.get('token') });
      return sendJson(res, 200, out);
    }

    if (!post) throw new RoomError(405, 'method_not_allowed');
    const body = await readJsonBody(req);

    if (route === 'create-room') {
      if (!createLimiter(clientIp(req))) throw new RoomError(429, 'rate_limited', 'Too many rooms created');
      return sendJson(res, 200, await service.createRoom(body));
    }
    if (route === 'join-room') {
      if (!joinLimiter(clientIp(req))) throw new RoomError(429, 'rate_limited', 'Too many join attempts');
      const out = await service.joinRoom(body);
      if (onPresence) onPresence(out.code);
      return sendJson(res, 200, out);
    }
    if (route === 'sync-state') {
      const out = await service.syncState(body);
      if (onSync) onSync(String(body.code));
      return sendJson(res, 200, out);
    }
    if (route === 'player-input') {
      const out = await service.playerInput(body);
      if (onInput) onInput(String(body.code), out.input);
      return sendJson(res, 200, { ok: true, id: out.input.id });
    }
    throw new RoomError(404, 'not_found', `Unknown route ${route}`);
  }

  async function apiHandler(req, res, routeOverride) {
    const parsed = new URL(req.url, 'http://localhost');
    const route = (routeOverride || parsed.searchParams.get('route') || parsed.pathname.replace(/^\/api\/?/, ''))
      .replace(/^\/+|\/+$/g, '');
    try {
      await handle(req, res, route, parsed.searchParams);
    } catch (err) {
      if (err instanceof RoomError) {
        sendJson(res, err.status, { ok: false, error: err.code, message: err.message });
      } else {
        console.error('[api]', route, err);
        sendJson(res, 500, { ok: false, error: 'server_error' });
      }
    }
  }
  apiHandler.service = service;
  return apiHandler;
}

module.exports = { createApiHandler, sendJson, readJsonBody, clientIp };
