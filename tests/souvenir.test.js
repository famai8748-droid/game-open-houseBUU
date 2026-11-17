// The survivor-card QR carries the run in a URL fragment; it must round-trip and fit the QR.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { MAX_BYTES } = require('../server/qr');

const sandbox = { btoa, atob, window: { location: { hostname: 'localhost', origin: 'http://localhost:3000' } } };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/souvenir.js'), 'utf8'), sandbox);
const { encodeSouvenir, decodeSouvenir, souvenirUrl } = vm.runInContext('({ encodeSouvenir, decodeSouvenir, souvenirUrl })', sandbox);

test('survivor card data round-trips through the QR fragment', () => {
  const run = { female: true, buu: true, coop: true, lore: 3, night2: true, deaths: 4, time: 755, name: 'มายด์ May' };
  assert.deepEqual({ ...decodeSouvenir(encodeSouvenir(run)) }, run);
});

test('survivor card values are clamped and odd characters dropped', () => {
  const out = decodeSouvenir(encodeSouvenir({ lore: 9, deaths: 999, time: 99999, name: 'a😀b<' }));
  assert.equal(out.lore, 3);
  assert.equal(out.deaths, 255);
  assert.equal(out.time, 65535);
  assert.equal(out.name, 'ab<');
  assert.equal(decodeSouvenir('garbage!!'), null);
  assert.equal(decodeSouvenir(''), null);
});

test('the longest survivor card URL still fits the QR generator', () => {
  const url = souvenirUrl({ female: true, buu: true, coop: true, lore: 3, deaths: 255, time: 65535, name: 'ฐฐฐฐฐฐฐฐฐฐฐฐฐฐฐฐฐฐ' });
  assert.ok(url.startsWith('https://game-open-housebuu.vercel.app/card.html#'));
  assert.ok(Buffer.byteLength(url) <= MAX_BYTES, `${Buffer.byteLength(url)} bytes`);
});
