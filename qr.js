// Minimal zero-dependency ISO-18004 QR Code SVG Data-URL generator (Byte mode, ECC L, Versions 1-6)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  return (a === 0 || b === 0) ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, ecLen) {
  const gen = rsGeneratorPoly(ecLen);
  const msg = new Uint8Array(data.length + ecLen);
  msg.set(data, 0);
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return msg.slice(data.length);
}

// Version table (1..6, ECC Level L: [totalDataBytes, ecBytesPerBlock, numBlocks, alignCenters])
const VERSION_TABLE = [
  null,
  { dataBytes: 19, ecBytes: 7, align: [] },
  { dataBytes: 34, ecBytes: 10, align: [6, 18] },
  { dataBytes: 55, ecBytes: 15, align: [6, 22] },
  { dataBytes: 80, ecBytes: 20, align: [6, 26] },
  { dataBytes: 108, ecBytes: 26, align: [6, 30] },
  { dataBytes: 136, ecBytes: 18, blocks: 2, align: [6, 34] }
];

function generateQrSvgDataUrl(text) {
  const bytes = Array.from(Buffer.from(String(text), 'utf8'));
  let ver = 1;
  while (ver <= 5 && bytes.length + 2 > VERSION_TABLE[ver].dataBytes) ver++;
  if (ver > 5) ver = 5;
  const vInfo = VERSION_TABLE[ver];
  const size = 17 + ver * 4;

  // Build bit stream: Byte mode (0100), 8-bit count, bytes, terminator
  const bits = [];
  const pushBits = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(bytes.length, 8);
  bytes.forEach((b) => pushBits(b, 8));
  for (let i = 0; i < 4 && bits.length < vInfo.dataBytes * 8; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataCw = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    dataCw.push(b);
  }
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (dataCw.length < vInfo.dataBytes) {
    dataCw.push(padBytes[padIdx % 2]);
    padIdx++;
  }

  const ecCw = Array.from(rsEncode(dataCw, vInfo.ecBytes));
  const allCodewords = dataCw.concat(ecCw);

  const grid = Array.from({ length: size }, () => new Array(size).fill(0));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

  const setFinder = (r0, c0) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r, cc = c0 + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        reserved[rr][cc] = true;
        if (r >= 0 && r <= 6 && c >= 0 && c <= 6 &&
            (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4))) {
          grid[rr][cc] = 1;
        }
      }
    }
  };
  setFinder(0, 0);
  setFinder(0, size - 7);
  setFinder(size - 7, 0);

  if (vInfo.align.length > 0) {
    const r0 = vInfo.align[1], c0 = vInfo.align[1];
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        reserved[r0 + r][c0 + c] = true;
        if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) {
          grid[r0 + r][c0 + c] = 1;
        }
      }
    }
  }

  for (let i = 8; i < size - 8; i++) {
    reserved[6][i] = reserved[i][6] = true;
    grid[6][i] = grid[i][6] = (i % 2 === 0) ? 1 : 0;
  }

  // Reserve format info areas
  for (let i = 0; i < 9; i++) {
    if (i < size) { reserved[8][i] = true; reserved[i][8] = true; }
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }
  grid[size - 8][8] = 1;

  // Place data bits (with mask 0: (r + c) % 2 === 0)
  let bitIdx = 0;
  const totalBits = allCodewords.length * 8;
  let up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let step = 0; step < size; step++) {
      const r = up ? (size - 1 - step) : step;
      for (let dx = 0; dx < 2; dx++) {
        const c = col - dx;
        if (!reserved[r][c]) {
          let bit = 0;
          if (bitIdx < totalBits) {
            bit = (allCodewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1;
            bitIdx++;
          }
          if ((r + c) % 2 === 0) bit ^= 1;
          grid[r][c] = bit;
        }
      }
    }
    up = !up;
  }

  // Format bits for ECC Level L (01) + Mask 0 (000) -> 0x77c4
  const fmt = 0x77c4;
  const fmtCoords1 = [
    [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],
    [7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]
  ];
  fmtCoords1.forEach(([r, c], i) => {
    grid[r][c] = (fmt >> i) & 1;
  });
  for (let i = 0; i < 7; i++) grid[size - 1 - i][8] = (fmt >> i) & 1;
  for (let i = 7; i < 15; i++) grid[8][size - 15 + i] = (fmt >> i) & 1;

  const scale = 6;
  const margin = 2;
  const dim = (size + margin * 2) * scale;
  let paths = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c]) {
        paths += `M${(c + margin) * scale},${(r + margin) * scale}h${scale}v${scale}h-${scale}z`;
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim}" height="${dim}"><rect width="100%" height="100%" fill="#121116"/><path d="${paths}" fill="#e6dcc8"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

module.exports = { generateQrSvgDataUrl };
