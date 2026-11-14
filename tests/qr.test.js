// Structural checks against ISO/IEC 18004. (Decoding was also verified with OpenCV
// during the audit; see docs/audit/BUG_REPORT.md C-01.)
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateQrMatrix, generateQrSvgDataUrl, MAX_BYTES } = require('../server/qr');

// Format information for ECC level L + mask 0, after BCH + XOR mask.
const FORMAT_L_MASK0 = 0x77c4;

// Standard positions as [row, col] for bit i (bit 0 = least significant).
function formatCopy1(i) {
  if (i < 6) return [i, 8];
  if (i === 6) return [7, 8];
  if (i === 7) return [8, 8];
  if (i === 8) return [8, 7];
  return [8, 14 - i];
}
function formatCopy2(i, size) {
  return i < 8 ? [8, size - 1 - i] : [size - 15 + i, 8];
}

const SAMPLES = [
  'http://a.b/',                                                   // v1
  'http://10.0.0.12:3000/?room=1234',                              // v2/v3
  'http://192.168.1.10:3000/?room=1234&role=p2',                   // v3
  'https://game-open-house-buu.vercel.app/?room=1234&role=p1',     // v4
  `https://${'x'.repeat(72)}.app/?room=1&role=p1`                  // v5
];

for (const text of SAMPLES) {
  test(`format information is placed per spec (${text.length} bytes)`, () => {
    const { size, grid, version } = generateQrMatrix(text);
    assert.equal(size, 17 + 4 * version);
    for (let i = 0; i < 15; i++) {
      const bit = (FORMAT_L_MASK0 >> i) & 1;
      const [r1, c1] = formatCopy1(i);
      const [r2, c2] = formatCopy2(i, size);
      assert.equal(grid[r1][c1], bit, `copy 1 bit ${i}`);
      assert.equal(grid[r2][c2], bit, `copy 2 bit ${i}`);
    }
    assert.equal(grid[size - 8][8], 1, 'dark module');
  });
}

test('versions grow with payload length', () => {
  const versions = SAMPLES.map((s) => generateQrMatrix(s).version);
  assert.deepEqual([...versions].sort((a, b) => a - b), versions);
  assert.equal(versions[0], 1);
  assert.equal(versions[versions.length - 1], 5);
});

test('payloads beyond capacity throw instead of producing a broken code', () => {
  assert.doesNotThrow(() => generateQrMatrix('a'.repeat(MAX_BYTES)));
  assert.throws(() => generateQrMatrix('a'.repeat(MAX_BYTES + 1)), RangeError);
});

test('svg uses dark modules on a light background', () => {
  const svg = Buffer.from(generateQrSvgDataUrl('http://a.b/').split(',')[1], 'base64').toString();
  assert.match(svg, /<rect[^>]*fill="#f4ecdc"/);
  assert.match(svg, /<path[^>]*fill="#121116"/);
});
