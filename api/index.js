// Vercel serverless entry point. All routes are rewritten here by vercel.json
// (/api/<route> -> /api/index.js?route=<route>).
//
// Room storage:
//  - With UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or Vercel KV's
//    KV_REST_API_URL + KV_REST_API_TOKEN) rooms live in Redis and are shared by
//    every instance -> co-op works reliably.
//  - Without them rooms live in this instance's memory only; co-op then works
//    only while Vercel keeps routing every request to the same warm instance.
const { createApiHandler, sendJson } = require('../server/http-api');
const { createStoreFromEnv } = require('../server/stores');

global.__BUU_STORE__ = global.__BUU_STORE__ || createStoreFromEnv();
const store = global.__BUU_STORE__;

const api = createApiHandler({
  store,
  serverInfo: () => ({ isVercel: true, sse: false, sharedStore: store.kind !== 'memory' })
});

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  const route = new URL(req.url, 'http://localhost').searchParams.get('route') || '';
  if (route === 'events') {
    // No long-lived connections on serverless. 204 tells EventSource to stop reconnecting.
    res.statusCode = 204;
    return res.end();
  }
  if (route === '') return sendJson(res, 404, { ok: false, error: 'not_found' });
  return api(req, res, route);
};
