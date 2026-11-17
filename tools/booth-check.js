// Booth start-up check, run by booth-start.bat right after the server starts (before Chrome
// goes full-screen and hides this window). It answers "will phones be able to join?":
//   1. does the laptop have a LAN address (and which one the QR codes will use)
//   2. is the server answering on that address
//   3. Windows: network profile + firewall rule for node.exe (a Public network blocks phones
//      unless node is allowed, and the "Allow access?" popup hides behind the kiosk window)
//   4. internet (Vercel fallback + the survivor-card QR need it)
//   5. a phone test: scan the QR printed here; the venue Wi-Fi may isolate clients, which only
//      a real phone can reveal
// Exit code 1 when something needs attention, so the .bat can pause.
//
//   node tools/booth-check.js [--wait=25] [--port=3000]
const http = require('http');
const https = require('https');
const { execFile } = require('child_process');
const { listLanCandidates } = require('../server/lan-ip');
const { generateQrMatrix } = require('../server/qr');

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const PORT = Number(args.port || process.env.PORT) || 3000;
const WAIT_S = Math.max(0, Number(args.wait == null ? 25 : args.wait));
const VERCEL = 'https://game-open-housebuu.vercel.app/card.html';

const C = process.stdout.isTTY ? { g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', d: '\x1b[2m', x: '\x1b[0m' } : { g: '', y: '', r: '', d: '', x: '' };
const warnings = [];
const ok = (msg) => console.log(`${C.g}  [OK]${C.x} ${msg}`);
const warn = (msg, fix, reach = false) => {
  warnings.push({ msg, reach });
  console.log(`${C.y}  [!!]${C.x} ${msg}`);
  if (fix) fix.split('\n').forEach((l) => console.log(`${C.d}       ${l}${C.x}`));
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJson(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (_) { resolve(null); } });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

function headOk(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'HEAD', timeout: timeoutMs }, (res) => { res.resume(); resolve(res.statusCode < 500); });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
    req.end();
  });
}

function windowsFirewall(ip) {
  if (process.platform !== 'win32') return Promise.resolve(null);
  const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$o = @{}
$a = Get-NetIPAddress -IPAddress '${ip}'
$p = if ($a) { Get-NetConnectionProfile -InterfaceIndex $a.InterfaceIndex } else { $null }
$o.category = if ($p) { "$($p.NetworkCategory)" } else { '' }
$fp = if ($o.category) { Get-NetFirewallProfile -Name ($o.category -replace 'DomainAuthenticated','Domain') } else { $null }
$o.firewallOn = if ($fp) { "$($fp.Enabled)" } else { '' }
$node = Get-NetFirewallApplicationFilter | Where-Object { $_.Program -like '*\\node.exe' } | Get-NetFirewallRule | Where-Object { $_.Direction -eq 'Inbound' -and "$($_.Enabled)" -eq 'True' }
$port = Get-NetFirewallPortFilter -Protocol TCP | Where-Object { $_.LocalPort -eq '${PORT}' } | Get-NetFirewallRule | Where-Object { $_.Direction -eq 'Inbound' -and "$($_.Enabled)" -eq 'True' }
$o.rules = @(@($node) + @($port) | Where-Object { $_ } | ForEach-Object { @{ action = "$($_.Action)"; profile = "$($_.Profile)" } })
$o | ConvertTo-Json -Compress -Depth 4`;
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 20000, windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null);
      try { resolve(JSON.parse(String(stdout).trim())); } catch (_) { resolve(null); }
    });
  });
}

// Light modules as full blocks: the console is light-on-dark, so the code reads the right way round.
function printQr(text) {
  const { size, grid } = generateQrMatrix(text);
  const q = 2;
  const dark = (r, c) => r >= 0 && c >= 0 && r < size && c < size && !!grid[r][c];
  for (let r = -q; r < size + q; r += 2) {
    let line = '   ';
    for (let c = -q; c < size + q; c++) {
      const top = !dark(r, c);
      const bottom = r + 1 < size + q ? !dark(r + 1, c) : false;
      line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' ';
    }
    console.log(line);
  }
}

async function phoneTest(lanUrl) {
  if (!WAIT_S) return null;
  const since = Date.now();
  console.log('');
  console.log(`  ทดสอบมือถือ: สแกน QR นี้ด้วยมือถือที่ต่อ Wi-Fi เดียวกับโน้ตบุ๊ก (${lanUrl}/phone-check)`);
  printQr(`${lanUrl}/phone-check`);
  let skipped = false;
  const onKey = () => { skipped = true; };
  if (process.stdin.isTTY) {
    console.log(`${C.d}  รอ ${WAIT_S} วินาที — กด Enter เพื่อข้าม${C.x}`);
    process.stdin.resume();
    process.stdin.once('data', onKey);
  }
  try {
    while (!skipped && Date.now() - since < WAIT_S * 1000) {
      const s = await getJson(`http://127.0.0.1:${PORT}/phone-check/status`, 1500);
      const hit = s && s.lastPhoneCheck;
      if (hit && hit.at >= since) return hit;
      await sleep(700);
    }
    return skipped ? 'skipped' : null;
  } finally {
    process.stdin.removeListener('data', onKey);
    process.stdin.pause();
  }
}

(async () => {
  console.log('');
  console.log('  ===== เช็คบูธ: มือถือจะเข้าเล่น 2 คนได้ไหม =====');

  // the server was started a moment ago by the .bat
  let info = null;
  for (let i = 0; i < 20 && !info; i++) {
    info = await getJson(`http://127.0.0.1:${PORT}/api/server-info`, 1000);
    if (!info) await sleep(500);
  }
  if (!info) {
    warn(`เซิร์ฟเวอร์เกมไม่ตอบที่พอร์ต ${PORT}`, 'ดูหน้าต่าง "BUU game server" ว่ามี error ไหม (พอร์ตชน? ยังไม่ได้ติดตั้ง Node.js?)');
  } else {
    ok(`เซิร์ฟเวอร์เกมทำงาน (http://localhost:${PORT})`);
  }

  const cands = listLanCandidates();
  const lan = cands[0];
  if (!lan) {
    warn('ไม่มีเครือข่าย (Wi-Fi/LAN) — เล่นคนเดียวได้ แต่โหมด 2 คนใช้ไม่ได้',
      'ต่อ Wi-Fi หรือเปิดฮอตสปอตจากมือถือแล้วให้โน้ตบุ๊กต่อ จากนั้นเปิด booth-start.bat ใหม่');
  } else {
    ok(`IP ที่ QR จะใช้: ${lan.address} (${lan.name})`);
    if (lan.virtual) warn('IP นี้มาจาก adapter เสมือน (WSL/VirtualBox/VPN) — มือถือน่าจะเข้าไม่ได้', 'ปิด VPN/adapter เสมือน หรือต่อ Wi-Fi จริง', true);
    if (cands.length > 1) console.log(`${C.d}       adapter อื่น: ${cands.slice(1).map((c) => `${c.address} (${c.name})`).join(', ')}${C.x}`);
    const lanInfo = info ? await getJson(`http://${lan.address}:${PORT}/api/server-info`, 2500) : null;
    if (info && !lanInfo) warn(`เซิร์ฟเวอร์ไม่ตอบทาง ${lan.address}:${PORT}`, 'ลองปิด VPN / โปรแกรมกันไวรัสที่บล็อกเครือข่าย', true);
  }

  const fw = lan ? await windowsFirewall(lan.address) : null;
  if (fw) {
    const cat = fw.category || '?';
    const profileHit = (p) => /any/i.test(p) || p.split(/,\s*/).some((x) => x.toLowerCase() === cat.toLowerCase().replace('domainauthenticated', 'domain'));
    const rules = (fw.rules || []).filter((r) => profileHit(r.profile || ''));
    const blocked = rules.some((r) => /block/i.test(r.action));
    const allowed = rules.some((r) => /allow/i.test(r.action));
    const off = /false/i.test(fw.firewallOn || '');
    const fix = 'แก้: คลิกขวา Command Prompt > Run as administrator แล้วพิมพ์\n'
      + `netsh advfirewall firewall add rule name="BUU booth game" dir=in action=allow protocol=TCP localport=${PORT}\n`
      + 'หรือเปลี่ยน Wi-Fi นี้เป็น Private (Settings > Network > Wi-Fi > ชื่อ Wi-Fi > Private network)';
    if (off) ok(`ไฟร์วอลล์ปิดอยู่ในเครือข่ายแบบ ${cat}`);
    else if (blocked) warn(`ไฟร์วอลล์ "บล็อก" node.exe ในเครือข่ายแบบ ${cat} — มือถือเข้าไม่ได้`, 'ลบกฎ Block ของ Node.js ใน Windows Defender Firewall > Advanced settings > Inbound Rules\n' + fix, true);
    else if (allowed) ok(`ไฟร์วอลล์อนุญาต node.exe ในเครือข่ายแบบ ${cat}`);
    else warn(`ไฟร์วอลล์ยังไม่อนุญาต node.exe ในเครือข่ายแบบ ${cat} — มือถือน่าจะเข้าไม่ได้`, 'ถ้ามีหน้าต่าง "Allow access" ของ Node.js เด้งขึ้นมา กด Allow (มันอาจซ่อนอยู่หลังเกม)\n' + fix, true);
  }

  if (await headOk(VERCEL)) ok('มีอินเทอร์เน็ต (สำรองด้วย Vercel ได้, QR การ์ดผู้รอดชีวิตใช้ได้)');
  else warn('ไม่มีอินเทอร์เน็ต — เกมยังเล่นได้ แต่ QR การ์ดผู้รอดชีวิตต้องใช้เน็ตมือถือของผู้เล่น');

  if (lan && info) {
    const hit = await phoneTest(`http://${lan.address}:${PORT}`);
    if (hit && hit !== 'skipped') {
      ok(`มือถือ ${hit.from} ต่อโน้ตบุ๊กได้ — โหมด 2 คนพร้อม`);
      // a real phone got through, so any reachability guess above was wrong
      for (let i = warnings.length - 1; i >= 0; i--) if (warnings[i].reach) warnings.splice(i, 1);
    } else if (hit === 'skipped') {
      console.log(`${C.d}  ข้ามการทดสอบมือถือ${C.x}`);
    } else if (WAIT_S) {
      warn('ไม่มีมือถือสแกนเข้ามา (หรือสแกนแล้วโหลดไม่ขึ้น)',
        'ถ้าสแกนแล้วหน้าเว็บค้าง: Wi-Fi นี้อาจกันเครื่องคุยกันเอง (client isolation)\n'
        + 'ทางแก้: เปิดฮอตสปอตจากมือถือ ให้โน้ตบุ๊กและมือถือผู้เล่นต่อฮอตสปอตเดียวกัน แล้วเปิด booth-start.bat ใหม่');
    }
  }

  console.log('');
  if (warnings.length) console.log(`${C.y}  มี ${warnings.length} เรื่องที่ควรดู (เล่นคนเดียวได้ปกติ)${C.x}`);
  else console.log(`${C.g}  พร้อมเปิดบูธ${C.x}`);
  process.exit(warnings.length ? 1 : 0);
})();
