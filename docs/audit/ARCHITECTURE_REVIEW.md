# ARCHITECTURE_REVIEW — เรือนซ่อนวิญญาณ

> **อัปเดต:** บัคส่วนใหญ่ในรายงานนี้ถูกแก้แล้ว — ดูสถานะรายข้อที่ [FIX_STATUS.md](FIX_STATUS.md) (เลขบรรทัดในรายงานนี้อ้างอิงโค้ดที่ commit `d7f294c` ก่อนแก้ไข)

> commit `d7f294c` · อ้างอิงรหัสบัคจาก [BUG_REPORT.md](BUG_REPORT.md)

## 0. หมายเหตุสำคัญเรื่องขอบเขต

คำสั่งตรวจสอบเขียนสำหรับ **เกม Roblox (Luau)** แต่โปรเจกต์นี้คือ **เกมเว็บ 2D (HTML5 Canvas + JavaScript) พร้อมเซิร์ฟเวอร์ Node.js** สำหรับงาน Open House มหาวิทยาลัยบูรพา จึงตรวจตามโค้ดจริงและเทียบแนวคิดดังนี้:

| แนวคิด Roblox | สิ่งที่เทียบเท่าในโปรเจกต์นี้ |
|---|---|
| Server Script / ServerScriptService | `api/index.js` (Vercel) และ `local-server.js` (Node LAN) |
| LocalScript / Client | `public/game.js` (บทบาท host, p1, p2 ในไฟล์เดียว) |
| RemoteEvent / RemoteFunction | HTTP endpoint `/api/*` + SSE `/api/events` |
| ReplicatedStorage (shared) | ไม่มี — โค้ด shared ไม่มี มีแต่การคัดลอก |
| DataStore | **ไม่มี** — สถานะทั้งหมดอยู่ในหน่วยความจำ |

ระบบที่คำสั่งขอให้ตรวจแต่ **ไม่มีอยู่ในโปรเจกต์** (ตรวจแล้ว ไม่ใช่ข้ามไป): Farming, Resource Gathering, Equipment, Crafting, Trading, Market, สกุลเงิน/Economy, Progression ข้ามรอบ, Quest/Achievement, Daily reward, DataStore/Save-Load, Session locking. Inventory มีเพียง 2 list (ของเซ่น 3 ชิ้น, เศษรูป 3 ชิ้น) ภายในรอบเล่นเดียว ส่วนที่เกี่ยวกับ Economy จึงตอบในเชิง "ไม่มีให้ตรวจ" และไม่เสนอเพิ่ม economy เพราะจะเปลี่ยนแนวคิดหลักของเกม

## 1. ภาพรวมระบบ

```
                 ┌─────────────────────────── public/ (static) ───────────────────────────┐
                 │ index.html (5 screens)   style.css   game.js (1,701 บรรทัด)  assets/ 1.7MB │
                 └────────────────────────────────────────────────────────────────────────┘
 Solo:   [เบราว์เซอร์] ── ไม่มี network call เลย (ทั้งเกมรันใน client) ──  ✅ เสถียรที่สุด

 Co-op:  [Host: จอกลาง]  game loop จริง, เป็นเจ้าของ state ทั้งหมด (host-authoritative)
            │  POST /api/sync-state  ~11 ครั้ง/วินาที (state ทั้งก้อน ~1KB)
            ▼
         [Server]  Vercel: global Map + /tmp (ต่อ instance)   |  Local: Map + SSE push
            ▲                                      │
            │ POST /api/player-input (ปุ่ม)        │ GET /api/room-state ทุก 320ms (+ SSE บน local)
         [P1 มือถือ: จอยเดิน]                [P2 มือถือ: เรดาร์ + กระดิ่ง]
```

**จุดแข็ง**
- Solo mode ไม่พึ่ง server เลย → ใช้งานในงานได้แม้เน็ตล่ม (ถ้าโหลดหน้าเว็บได้)
- Host-authoritative: ตรรกะเกมทั้งหมดรันที่ host, มือถือส่งแค่ "ปุ่มที่กด" → ไม่มีช่องให้มือถือส่งค่า inventory/flags ปลอมเข้าตรรกะเกม (ต่างจากการที่ server ไม่ตรวจอะไรเลย ดู §4)
- ไม่มี dependency ภายนอก (zero `node_modules`) → deploy ง่าย
- เสียงสังเคราะห์ด้วย Web Audio → ไม่มีไฟล์เสียงให้โหลด

**จุดอ่อนเชิงโครงสร้าง**
1. Multiplayer บน Vercel ไม่มี shared state (C-02) — เป็นปัญหาเชิงสถาปัตยกรรม ไม่ใช่บัคเฉพาะจุด
2. ตรรกะห้องเขียนซ้ำ 2 ชุด (`api/index.js`, `local-server.js`) และเริ่มต่างกันแล้ว (L-09)
3. `game.js` เป็นไฟล์เดียวรวม audio, loader, state, scene data, UI, network, render, P2 radar — global ทั้งหมด, เรียกผ่าน `onclick=""` ใน HTML
4. Scene data (hotspot) ผูกกับ closure ที่สร้างใหม่ทุกครั้งที่เรียก (`getSceneHotspots` ถูกเรียก ~3 ครั้ง/เฟรม)
5. State ของ UI (dialogue เปิดอยู่ไหม) อ่านจาก DOM (`classList.contains('hidden')`) แทน state object → ตรรกะเกมพึ่ง DOM

## 2. Project Structure Audit

### 2.1 โครงสร้างปัจจุบัน
```
/                      ← ปนกันระหว่าง runtime, tooling, และไฟล์ขยะ
├── api/index.js       Vercel function (route ผ่าน ?route=)
├── local-server.js    Node server + SSE + public tunnel
├── qr.js              QR encoder (ใช้ร่วม 2 server)  ← C-01
├── vercel.json        rewrite /api/(.*) → /api/index.js?route=$1
├── package.json       ไม่มี dependency, ไม่มี test/lint script
├── public/            static site (index.html, style.css, game.js, assets/)
├── process_assets.py, generate_all_frames.py   สคริปต์สร้าง asset (path ฮาร์ดโค้ดเครื่องอื่น)
└── check_all.py, chunks_manifest.json, part_0..3.txt   ไฟล์ค้างจากเครื่องมือ AI ไม่เกี่ยวกับเกม
```

### 2.2 Naming / Configuration
- ชื่อฟังก์ชันสื่อความหมายดี (`triggerSamphawesiEncounter`, `playDoorCutscene`) ✅
- **ไม่มีไฟล์ config/constants:** ค่าเกม (ความเร็ว 230/115/95, ระยะจับ 58, stun 4.0s, sync 120ms/320ms, ตำแหน่ง hotspot) กระจายเป็น magic number ในโค้ด → ปรับ balance ยาก
- ไม่มี README อธิบายวิธีรัน local/deploy
- ไม่มี `package-lock.json` (ไม่จำเป็นเพราะไม่มี dependency) และไม่มี `"engines"` ระบุเวอร์ชัน Node

### 2.3 Asset ที่ไม่ถูกอ้างอิงในโค้ด (ตรวจด้วย grep รวม template string)
- `assets/frames/cutscene_door_1..5.jpg`, `cutscene_end_0..5.jpg`, `cutscene_sam_0..5.jpg` — cutscene ถูก **วาดใหม่ด้วย canvas ทุกเฟรม** แทน (`renderCutsceneFrameDataURL`, game.js:814) ไฟล์ pre-rendered จึงไม่ถูกใช้ (ยกเว้น `cutscene_door_0.jpg` เป็น src เริ่มต้นใน index.html:142)
- `bg_scene3_cutscene.jpg`, `ghost_dancer_0/1.png`, `ghost_samphawesi_0/2.png`, `student_*_1..3.png` (ใช้เป็น input ของสคริปต์ Python เท่านั้น)
- ควรตัดสินใจ: ใช้ไฟล์ pre-rendered (เร็วกว่า, ดูดีกว่า) **หรือ** ลบทิ้ง — ไม่ลบในขั้น audit

### 2.4 โครงสร้างที่แนะนำ
```
/
├── server/
│   ├── room-core.js        ← ตรรกะห้องชุดเดียว (create/join/sync/input/ttl/validate)
│   ├── store-memory.js     ← สำหรับ local
│   ├── store-redis.js      ← สำหรับ Vercel (ถ้ายังใช้ Vercel)
│   └── qr.js
├── api/index.js            ← adapter บางๆ เรียก room-core
├── local-server.js         ← adapter + SSE + static
├── public/
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── config.js       ← ค่าคงที่ทั้งหมด (speed, ranges, timings)
│       ├── audio.js  assets.js  state.js
│       ├── scenes.js       ← hotspot เป็น data + handler อ้างด้วย id
│       ├── dialogue.js  cutscene.js  render.js
│       ├── net.js          ← sync/poll/SSE + seq + in-flight guard
│       └── roles/host.js  p1.js  p2.js
├── tools/                  ← สคริปต์ Python (path สัมพัทธ์)
├── tests/                  ← unit (room-core, qr round-trip) + e2e (Playwright)
└── docs/
```
ใช้ ES modules (`<script type="module">`) ได้โดยไม่ต้องมี bundler

## 3. Multiplayer Architecture Audit

| หัวข้อ | สถานะ | อ้างอิง |
|---|---|---|
| Authority | Host-authoritative (ดี) แต่ server ไม่บังคับว่าใครเป็น host | H-04 |
| Join | ผ่าน QR (เสีย, C-01) หรือกรอกรหัส; รหัสผิดไม่แจ้ง | M-06 |
| Leave / Disconnect | ไม่มีการตรวจจับ, flag `players.p1/p2` ค้าง true ตลอด | M-08 |
| Rejoin มือถือ | ทำได้ (stateless polling) ✅ แต่เปิด radar loop ซ้ำ | L-05 |
| Host reload | **เสียความคืบหน้าทั้งหมด** และได้รหัสห้องใหม่ มือถือต้องสแกนใหม่ | §5 |
| Sync model | Full-state snapshot ทุก 120ms, ไม่มี seq/version | M-04 |
| Input delivery | สั่ง "กด/ปล่อย" แยกกัน 2 request, ไม่รับประกันลำดับ → เดินค้าง | IMPROVEMENT ST-02 (ดู TEST MP-05) |
| Shared world state (Vercel) | ต่อ instance — ไม่ shared จริง | C-02 |
| Code collision | เขียนทับห้องเดิม | H-05 |
| Rate limiting | ไม่มี | H-06 |

**ข้อเสนอการออกแบบ input ที่ทนต่อเครือข่าย:** ให้มือถือส่ง "สถานะปุ่มปัจจุบัน + seq" เป็นระยะ (เช่น `{move:-1, seq:42}` ทุก 150ms ขณะกดค้าง) และ host ถือว่า `move=0` ถ้าไม่ได้รับภายใน 400ms แทนการส่ง event กด/ปล่อยครั้งเดียว — แก้ทั้งปัญหาลำดับสลับและ request หาย

**ข้อเสนอสำหรับงาน Open House โดยเฉพาะ:** โหมดที่น่าเชื่อถือที่สุดคือ `local-server.js` บนโน้ตบุ๊กบูธ + Wi-Fi/hotspot ของบูธเอง (SSE push จริง, หน่วยความจำเดียว, latency ต่ำ) โดยแก้ H-01/H-04 ก่อน และใช้ Vercel เฉพาะ Solo

## 4. Security Model (สรุป — รายละเอียดใน BUG_REPORT)

| ภัยคุกคาม | สถานะ |
|---|---|
| มือถือส่ง inventory/flags ปลอมเข้าตรรกะเกม | ✅ ป้องกันโดยปริยาย — host ไม่อ่าน state จาก server |
| บุคคลที่สามเขียนทับ state ที่มือถือเห็น (`sync-state`) | ❌ ไม่มี host token (H-04) |
| บุคคลที่สามส่ง input เข้าเกม host | ❌ แค่รู้รหัส 4 หลัก (H-04) |
| เดารหัสห้อง | ❌ 9,000 ค่า ไม่มี rate limit; local เปิดเผยรายการรหัส (H-04) |
| XSS | ✅ ไม่พบ — ข้อความจาก server เข้าทาง `textContent`/`fillText`; `innerHTML` ใช้เฉพาะ label คงที่ (game.js:1273) |
| Prototype pollution | ⚠️ ต่ำ — `Object.assign(room.player, p.player)` กับ JSON ที่มีคีย์ `__proto__` จะเปลี่ยน prototype ของ object นั้นตัวเดียว ไม่กระทบ global แต่ควร whitelist คีย์ |
| Path traversal (local static) | ✅ น่าจะปลอดภัยเพราะ WHATWG URL normalize `..` แล้ว แต่ไม่มี containment check ซ้อน (L-08) |
| Resource exhaustion | ❌ ห้อง/คิวโตไม่จำกัด, body ไม่จำกัด (local) (H-06, L-08) |
| เปิดเครื่องสู่อินเทอร์เน็ตโดยไม่ตั้งใจ | ❌ tunnel อัตโนมัติ (H-04) |

## 5. Data Persistence Audit

- **ไม่มีระบบ Save/Load, ไม่มี DataStore, ไม่มี localStorage** — ทุกอย่างหายเมื่อ reload/ปิดแท็บ
- สำหรับเกมเล่นจบใน ~5–10 นาทีที่บูธ นี่เป็น **การตัดสินใจที่ยอมรับได้** ไม่ถือเป็นบัค
- ความเสี่ยงที่ควรแก้: host reload ระหว่าง co-op = ต้องเริ่มใหม่ทั้งหมดและสแกน QR ใหม่ → เสนอ checkpoint ระดับฉากใน `sessionStorage` (scene, inventory, flags) + เก็บ room code เดิม (IMPROVEMENT ST-06)
- Server-side "persistence" (`/tmp` บน Vercel) ไม่ใช่ persistence จริง: หายเมื่อ instance ถูกเก็บ, ไม่ shared, ไม่มี versioning/migration/locking — ไม่ควรพึ่งพา
- หัวข้อ Session Locking / Data Migration / Retry / Versioning: **ไม่เกี่ยวข้อง** เพราะไม่มีข้อมูลผู้เล่นถาวร

## 6. Performance & Scalability

### 6.1 Client
- Render: วาด canvas 1280×720 + offscreen light canvas ทุกเฟรม, particles 85+55 จุด — เบาพอสำหรับโน้ตบุ๊กทั่วไป
- จุดที่หนัก: `renderCutsceneFrameDataURL` (game.js:814-937) สร้าง canvas ใหม่ + `toDataURL('image/jpeg')` ทุกเฟรม cutscene (~10-50ms บนมือถือรุ่นเก่า) → กระตุกเล็กน้อย; ใช้ `<canvas>` แสดงตรงๆ หรือใช้ JPG ที่มีอยู่แล้วแทน
- `getSceneHotspots` สร้าง object + closure ~10 ตัว × 3 ครั้ง/เฟรม → GC churn เล็กน้อย
- P2 radar วาด 60fps ทั้งที่ข้อมูลเปลี่ยนทุก 320ms — สิ้นแบตมือถือ; ลดเป็น 15–20fps ได้
- Asset 1.7 MB โหลดแบบไม่มี loading screen → ฉากแรกอาจเห็นภาพว่าง/ป๊อปอิน และเสี่ยง M-05

### 6.2 Server — ประมาณการ request (จากค่าคงที่ในโค้ด)

ต่อ 1 ห้อง co-op (host + P1 + P2):
- Host: sync 1/0.12s + poll 1/0.32s ≈ **11.5 req/s** (+ ทุก action)
- P1/P2: poll 1/0.32s ≈ 3.1 req/s × 2 + EventSource reconnect บน Vercel ≈ 0.33 × 2
- **รวม ≈ 18 req/s ต่อห้อง** (≈ 65,000 invocation ต่อชั่วโมงต่อห้อง)

| ห้องพร้อมกัน | req/s | สิ่งที่คาดว่าจะเกิด (Vercel ตามโค้ดปัจจุบัน) |
|---|---|---|
| 10 | ~180 | ทำงานได้ถ้าอยู่ instance เดียว; แต่ละ request read+write ไฟล์ ~10 ห้อง |
| 30 | ~540 | มีโอกาส scale ออกหลาย instance → C-02 ปรากฏ (มือถือไม่ตอบสนอง); I/O ไฟล์ sync เริ่มเป็นคอขวด |
| 50 | ~900 | co-op ไม่น่าเชื่อถือ; ไฟล์ /tmp ใหญ่ขึ้นตามห้องสะสม (ไม่ลบ) |
| 100 | ~1,800 | คาดว่าใช้งานไม่ได้สำหรับ co-op; โควตา invocation ของแพลน Hobby อาจหมดภายในวัน |

> **ข้อจำกัด:** ตัวเลขเหล่านี้คำนวณจาก interval ในโค้ด ไม่ได้วัดจริง โควตาและพฤติกรรมการ scale ของ Vercel ต้องตรวจกับแพลนที่ใช้จริง Solo mode ไม่มี server load (นอกจาก static file ผ่าน CDN)

Local server (Node เดี่ยว): 100 ห้อง ≈ 1,800 req/s + SSE broadcast state ~1KB × 11/s × 3 client/ห้อง → Node รับไหวบนโน้ตบุ๊ก แต่ **Wi-Fi ของบูธ** จะเป็นคอขวดก่อน ในทางปฏิบัติบูธจะมี 1–3 ห้องพร้อมกันเท่านั้น

**การลด traffic ที่ทำได้ทันที:** host sync เฉพาะเมื่อ state เปลี่ยน + จำกัด 5–8 Hz, ตัด poll ของ host เมื่อเกมเริ่ม, ปิด EventSource บน Vercel → ลดได้ ~60%

## 7. ข้อเสนอการออกแบบเพื่อขยายในอนาคต

1. **Scene เป็น data:** ย้าย hotspot/dialogue/ตำแหน่งไป `scenes.js` (หรือ JSON) อ้าง handler ด้วยชื่อ → เพิ่มฉาก/ภาษาอังกฤษได้โดยไม่แตะ engine
2. **State machine ชัดเจน:** `mode ∈ {title, playing, dialogue, cutscene, modal, gameover, victory}` แทน flag กระจาย + อ่าน DOM → แก้ H-02, M-01 ได้ในตัว
3. **Net layer แยก:** transport (SSE/poll/WebSocket) อยู่หลัง interface เดียว มี seq, in-flight guard, heartbeat
4. **Room core + store abstraction:** ทดสอบได้ด้วย unit test, สลับ memory/Redis ได้
5. **i18n:** ข้อความไทยทั้งหมดอยู่ในโค้ด แยกเป็นตารางข้อความเพื่อรองรับผู้เยี่ยมชมต่างชาติ
6. **Telemetry เบาๆ (ไม่เก็บข้อมูลส่วนบุคคล):** นับจำนวนครั้งที่ตายต่อฉาก / จบเกม → ใช้ปรับ difficulty (สำคัญมากกับ H-03)
