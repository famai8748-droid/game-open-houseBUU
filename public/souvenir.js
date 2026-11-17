// Survivor card: drawn on the booth screen's ending AND on the visitor's phone (card.html).
// The booth shows a QR whose URL carries the run in a tiny base64url fragment, so the phone
// draws the same card itself: no upload, no server storage, and the fragment never reaches a server log.
// Loaded before game.js (classic script, shared globals).

const SOUVENIR_ORIGIN = 'https://game-open-housebuu.vercel.app';
const SOUVENIR_VERSION = 1;

function formatTime(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function rankFor(time, deaths) {
  if (deaths === 0 && time < 420) return 'ผู้กล้าแห่งบูรพา';
  if (deaths <= 1 && time < 600) return 'ผู้มีสัมผัสพิเศษ';
  if (deaths <= 3) return 'ผู้รอดชีวิตจากเรือนไทย';
  return 'ดวงจิตที่หลงทาง (แต่ก็รอดมาได้!)';
}

// The QR generator tops out at ~106 bytes, so Thai letters are packed one byte each
// (U+0E00..U+0E7F -> 0x80..0xFF), printable ASCII stays as is, anything else is dropped.
function encodeSouvenir(d) {
  const bytes = [
    SOUVENIR_VERSION,
    (d.female ? 1 : 0) | (d.buu ? 2 : 0) | (d.coop ? 4 : 0) | ((Math.max(0, Math.min(3, d.lore | 0))) << 3) | (d.night2 ? 32 : 0),
    Math.max(0, Math.min(255, d.deaths | 0))
  ];
  const t = Math.max(0, Math.min(65535, Math.round(d.time || 0)));
  bytes.push(t >> 8, t & 255);
  for (const ch of String(d.name || '').slice(0, 14)) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x20 && cp <= 0x7e) bytes.push(cp);
    else if (cp >= 0x0e00 && cp <= 0x0e7f) bytes.push(0x80 + cp - 0x0e00);
  }
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeSouvenir(str) {
  try {
    const b64 = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    const b = Array.from(bin, (c) => c.charCodeAt(0));
    if (b.length < 5 || b[0] !== SOUVENIR_VERSION) return null;
    let name = '';
    b.slice(5, 19).forEach((x) => {
      if (x >= 0x80) name += String.fromCodePoint(0x0e00 + x - 0x80);
      else if (x >= 0x20 && x <= 0x7e) name += String.fromCharCode(x);
    });
    return {
      female: !!(b[1] & 1),
      buu: !!(b[1] & 2),
      coop: !!(b[1] & 4),
      lore: (b[1] >> 3) & 3,
      night2: !!(b[1] & 32),
      deaths: b[2],
      time: (b[3] << 8) | b[4],
      name: name.replace(/\s+/g, ' ').trim()
    };
  } catch (_) {
    return null;
  }
}

function souvenirUrl(d) {
  const host = window.location.hostname;
  const origin = /\.vercel\.app$/i.test(host) ? window.location.origin : SOUVENIR_ORIGIN;
  return `${origin}/card.html#${encodeSouvenir(d)}`;
}

function souvenirImagePaths(d) {
  return {
    bg: d.lore === 3 ? 'assets/ending_true.jpg' : (d.female ? 'assets/hospital_wake_rin.jpg' : 'assets/hospital_wake.jpg')
  };
}

const souvenirReady = (img) => !!(img && img.complete && img.naturalWidth > 0);

// Draws the 1200x630 card. imgs = { bg } (an HTMLImageElement; skipped if missing).
function drawSouvenirCard(c, d, imgs = {}) {
  c.width = 1200;
  c.height = 630;
  const g = c.getContext('2d');
  const name = d.name || (d.female ? 'ริน' : 'นนท์');

  g.fillStyle = '#070508';
  g.fillRect(0, 0, 1200, 630);
  const bg = imgs.bg;
  if (souvenirReady(bg)) {
    const scale = Math.max(1200 / bg.naturalWidth, 630 / bg.naturalHeight);
    const bw = bg.naturalWidth * scale;
    const bh = bg.naturalHeight * scale;
    g.globalAlpha = 0.72;
    g.drawImage(bg, (1200 - bw) / 2, (630 - bh) / 2, bw, bh);
    g.globalAlpha = 1;
  }

  const shade = g.createLinearGradient(0, 0, 1200, 0);
  shade.addColorStop(0, 'rgba(5, 4, 7, 0.92)');
  shade.addColorStop(0.58, 'rgba(5, 4, 7, 0.76)');
  shade.addColorStop(1, 'rgba(5, 4, 7, 0.35)');
  g.fillStyle = shade;
  g.fillRect(0, 0, 1200, 630);

  // Subtle top/bottom red-gold hairline matching the game's UI frames
  const line = g.createLinearGradient(0, 0, 1200, 0);
  line.addColorStop(0, 'rgba(200, 52, 40, 0.95)');
  line.addColorStop(0.55, 'rgba(240, 207, 149, 0.8)');
  line.addColorStop(1, 'rgba(240, 207, 149, 0)');
  g.fillStyle = line;
  g.fillRect(0, 0, 1200, 4);
  g.fillRect(0, 626, 1200, 4);

  g.strokeStyle = 'rgba(240, 207, 149, 0.28)';
  g.lineWidth = 1.5;
  g.strokeRect(24, 24, 1152, 582);

  // No standing sprite: the hospital paintings already show the player in bed (a sprite made it
  // look like two of them), and on the true ending it would cover the uncle on the right.

  g.textAlign = 'left';
  g.fillStyle = '#ff6b5e';
  g.font = 'bold 20px "Chakra Petch", Sarabun, sans-serif';
  g.fillText('THE VEILED THAI HOUSE · SURVIVOR RECORD', 64, 86);

  g.fillStyle = '#f6dda9';
  g.font = 'bold 54px "Chakra Petch", Sarabun, sans-serif';
  g.fillText('เรือนซ่อนวิญญาณ', 64, 148);

  g.fillStyle = '#ddd2be';
  g.font = '600 28px Sarabun, sans-serif';
  g.fillText(`ผู้รอดชีวิต: ${name}`, 64, 224);

  g.fillStyle = '#ffd36b';
  g.font = 'bold 38px Sarabun, sans-serif';
  g.fillText(rankFor(d.time, d.deaths), 64, 282);

  g.fillStyle = '#e7dcc6';
  g.font = '600 24px Sarabun, sans-serif';
  g.fillText(`เวลา ${formatTime(d.time)}  ·  ถูกวิญญาณจับ ${d.deaths} ครั้ง  ·  บันทึกของเรือน ${d.lore}/3`, 64, 336);

  let by = 396;
  const badges = [];
  if (d.buu) badges.push('ผู้รักษาคำสัญญา — พบใบปลิว Open House ในป่า');
  if (d.lore === 3) badges.push('ผู้ไขความลับแห่งเรือน — อ่านบันทึกหลวงสุนทรครบทุกหน้า');
  if (d.night2) badges.push('ผู้รอดคืนที่สอง — ผ่านเรือนในโหมดยาก');
  if (d.coop) badges.push('Co-op 2 ผู้เล่น — รอดมาด้วยกัน');
  badges.forEach((b) => {
    g.fillStyle = 'rgba(240, 207, 149, 0.12)';
    g.fillRect(64, by - 28, 680, 38);
    g.strokeStyle = 'rgba(240, 207, 149, 0.35)';
    g.strokeRect(64, by - 28, 680, 38);
    g.fillStyle = '#9fe3cf';
    g.font = '600 20px Sarabun, sans-serif';
    g.fillText(b, 80, by - 3);
    by += 48;
  });

  g.fillStyle = '#f0cf95';
  g.font = 'bold 26px "Chakra Petch", Sarabun, sans-serif';
  g.fillText('OPEN HOUSE BUU · วันที่ 20 – 21 นี้ ณ มหาวิทยาลัยบูรพา', 64, 566);
  return c;
}
