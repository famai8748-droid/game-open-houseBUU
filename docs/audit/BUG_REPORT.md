# BUG_REPORT — เรือนซ่อนวิญญาณ (The Veiled Thai House)

> **อัปเดต:** บัคส่วนใหญ่ในรายงานนี้ถูกแก้แล้ว — ดูสถานะรายข้อที่ [FIX_STATUS.md](FIX_STATUS.md) (เลขบรรทัดในรายงานนี้อ้างอิงโค้ดที่ commit `d7f294c` ก่อนแก้ไข)

> ตรวจสอบที่ commit `d7f294c` (2026-11-14) · ตรวจทุกไฟล์ที่ track ใน git
> ระดับความเชื่อมั่น: **[ยืนยันแล้ว]** = รันโค้ดทดสอบจริง · **[จากโค้ด]** = อ่านโค้ดแล้วเห็นชัด · **[ความเสี่ยง]** = ขึ้นกับ runtime/สภาพแวดล้อม ต้องทดสอบจริงก่อนสรุป

## สรุป

| ระดับ | จำนวน |
|---|---|
| Critical | 2 |
| High | 6 |
| Medium | 10 |
| Low | 12 |

---

## Critical

### C-01 · QR Code ที่ระบบสร้างอ่านไม่ได้ (Format bits วางผิดแกน) — [ยืนยันแล้ว]
- **ไฟล์:** [qr.js:165-175](../../server/qr.js:165)
- **ปัญหา:** Format information 15 บิต (ECC L + mask 0 = `0x77c4`) ถูกวางแบบ row/col สลับกัน (transposed) เทียบกับมาตรฐาน ISO 18004 ทั้ง 2 ชุด ขณะที่ finder, timing, dark module และ data ถูกวางตามมาตรฐาน
- **หลักฐาน:** สร้าง QR จาก `https://game-open-house-buu.vercel.app/?room=1234&role=p1` และ `http://192.168.1.10:3000/?room=1234&role=p2` ด้วย `qr.js` เดิม → OpenCV `QRCodeDetector` decode ได้ค่าว่าง `''` ทั้งคู่ เมื่อแก้เฉพาะบรรทัด 171-175 ให้สลับ row/col → decode ได้ URL ถูกต้องทั้งคู่
- **ผลกระทบ:** ฟีเจอร์หลัก "สแกน QR เข้าเล่น 2 คน" ใช้งานไม่ได้ ผู้เล่นต้องพิมพ์รหัสห้องเอง (ซึ่งต้องเปิดหน้าเว็บเองก่อน) — ในงาน Open House ที่คนเดินผ่านบูธ นี่คือจุดตายของ co-op
- **ข้อจำกัด:** ยังไม่ได้ทดสอบกับกล้อง iOS/Android จริง (ตัวอ่านบางตัวอาจทนทานกว่า OpenCV) แต่ format bits ผิดคือผิดมาตรฐาน
- **แนวทางแก้:**
  ```js
  fmtCoords1.forEach(([r, c], i) => { grid[c][r] = (fmt >> i) & 1; });
  for (let i = 0; i < 8; i++)  grid[8][size - 1 - i] = (fmt >> i) & 1;
  for (let i = 8; i < 15; i++) grid[size - 15 + i][8] = (fmt >> i) & 1;
  ```
  หรือเปลี่ยนไปใช้ไลบรารีที่ผ่านการทดสอบแล้ว (เช่น `qrcode` บน npm) แล้วเพิ่ม test ที่ decode กลับ

### C-02 · Co-op บน Vercel เก็บสถานะห้องในหน่วยความจำของแต่ละ instance — [ความเสี่ยง]
- **ไฟล์:** [api/index.js:7-32](../../api/index.js:7), [api/index.js:104](../../api/index.js:104)
- **ปัญหา:** ห้องเก็บใน `global.__ROOMS__` และไฟล์ `os.tmpdir()` ซึ่งทั้งคู่เป็นของ **serverless instance นั้นๆ เท่านั้น** ไม่ใช้ร่วมกันข้าม instance ไฟล์ `/tmp` จึงไม่ได้ช่วยอะไร (instance เดิมมี `global` อยู่แล้ว instance ใหม่ไม่เห็นไฟล์)
- **ผลกระทบ:** ถ้า Vercel ส่ง request ของ host ไป instance A และของมือถือ P1 ไป instance B: input ของ P1 ค้างใน `pendingInputs` ของ B ตลอดไป host ไม่ได้รับ, P1/P2 ได้สถานะเริ่มต้น (auto-create, ดู M-06) โดยไม่มี error ใดๆ ยิ่งมีผู้เล่นพร้อมกันมาก ยิ่งมีโอกาส scale ออกหลาย instance
- **ข้อจำกัด:** การ route ของ Vercel (Fluid compute) มักใช้ instance เดิมซ้ำเมื่อโหลดต่ำ จึงอาจ "ดูเหมือนทำงาน" ตอนทดสอบคนเดียว ต้องทดสอบโหลดจริง (ดู TEST_PLAN MP-07)
- **แนวทางแก้:** ใช้ store ภายนอก (Upstash Redis / Vercel KV / Supabase Realtime) หรือ — ทางที่ง่ายและเสถียรที่สุดสำหรับงาน Open House — รัน `local-server.js` บนโน้ตบุ๊กที่บูธ (มี SSE จริง, หน่วยความจำเดียว)

---

## High

### H-01 · `local-server.js` crash ทั้งเซิร์ฟเวอร์ถ้าเครื่องไม่มี `ssh` — [ยืนยันแล้ว]
- **ไฟล์:** [local-server.js:13-36](../../local-server.js:13)
- **ปัญหา:** `spawn('ssh', ...)` ไม่มี `ssh.on('error', ...)` เมื่อไม่พบโปรแกรม Node ปล่อย event `error` แบบ async ซึ่ง `try/catch` จับไม่ได้ → `Unhandled 'error' event` → process ตาย
- **หลักฐาน:** ทดสอบ `spawn('definitely_no_such_bin_xyz')` ใน Node → process ตายด้วย `Error: spawn ... ENOENT`
- **ผลกระทบ:** บนเครื่องที่ปิด OpenSSH client (Windows บางเครื่อง/ห้องแล็บ) เซิร์ฟเวอร์ตายทันทีหลัง listen
- **แนวทางแก้:** เพิ่ม `ssh.on('error', () => {/* log + ไม่ retry */})` และทำให้ tunnel เป็น opt-in (`PUBLIC_TUNNEL=1`) — ดู H-04 ด้วย

### H-02 · หน้าต่างต่อรูป (Photo modal) ไม่หยุดเกม ผียังไล่ระหว่างวางรูป — [จากโค้ด]
- **ไฟล์:** [public/game.js:480-484](../../public/game.js:480), [public/game.js:1076-1093](../../public/game.js:1076), [public/game.js:1245-1328](../../public/game.js:1245), ปุ่ม HUD [public/index.html:112](../../public/index.html:112)
- **ปัญหา:** `updateGame` หยุดเฉพาะเมื่อ `cutscenePlaying / gameOver / victory` หรือ dialogue เปิด แต่ไม่เช็ค `#photo-modal` ในฉาก 4 หลังถวายของ dialogue จบ → modal เปิด → ผีนางรำ (ยัง active เพราะ `photosRestored=false`) เดินเข้ามาที่ 115 px/s ขณะผู้เล่นกำลังกดชิ้นรูป และคีย์บอร์ดยังเดินตัวละครได้ขณะ modal เปิด
- **ผลกระทบ:** ผู้เล่นถูกจับตอนกำลังทำปริศนา → รู้สึกไม่ยุติธรรม; `gameover-modal` ซ้อนบน `photo-modal`
- **แนวทางแก้:** เพิ่ม `state.flags.modalOpen` (หรือเช็ค `!photoModal.classList.contains('hidden')`) ใน `updateGame` และ `setMove`

### H-03 · การผ่านผีในฉาก 3/4 ทำได้จริงเฉพาะเมื่อมี P2 สตัน — โหมด Solo ต้องพึ่ง "จังหวะการลอยของผี" — [จากโค้ด, ต้อง playtest]
- **ไฟล์:** [public/game.js:1262-1264](../../public/game.js:1262), [public/game.js:1280-1306](../../public/game.js:1280), [public/game.js:1009](../../public/game.js:1009)
- **การวิเคราะห์:** โลกเป็นแกน X เส้นเดียว ผีจับเมื่อ `absDist < 58` และไม่ตรวจการจับระหว่าง stun เท่านั้น ในฉาก 3 สัมภเวสีถูก trigger ที่ x>630 แล้วเกิดที่ 780 — **เศษรูปชิ้นที่ 2 (980) และประตูไปฉาก 4 (1180) อยู่หลังผี** ในฉาก 4 ผีนางรำเกิดที่ 980 — **ประตูทางออก (1150) อยู่หลังผี** และผีไม่ถูกปิดแม้ทำพิธีครบแล้ว (ปิดตอนเข้าฉากใหม่เท่านั้น บรรทัด 1009)
  - ระหว่างซ่อน ผี "ลาดตระเวน" ±65 px/s ตาม `sin(performance.now()/900)` (แกว่งได้ ~184 px) รอบตำแหน่งที่มันอยู่ตอนผู้เล่นซ่อน ผู้เล่นผ่านได้ก็ต่อเมื่อผีแกว่งไปอยู่ **ซ้าย** ผู้เล่นเกิน 58px แล้วออกจากที่ซ่อนวิ่งขวา (ความเร็ว 230 > 115) — ขึ้นกับ phase ของ `performance.now()` ซึ่งผู้เล่นมองไม่เห็นและไม่ได้ถูกสอน
  - Workaround ที่ทำได้: ทำพิธีครบ → ย้อนกลับฉาก 3 → เข้าฉาก 4 ใหม่ (ผีจะไม่ active) — ผู้เล่นทั่วไปไม่รู้
- **ผลกระทบ:** ผู้เล่น Solo (ซึ่งน่าจะเป็นส่วนใหญ่ในงาน) อาจตายซ้ำๆ จนเลิกเล่นก่อนเห็นฉากจบที่มีข้อความโปรโมต Open House — ซึ่งเป็นเป้าหมายของเกม
- **แนวทางแก้ (ไม่เปลี่ยนแนวคิดเกม):** ดู IMPROVEMENT_PLAN QW-03 — เช่น ให้ผีหันกลับ/ถอยเมื่อผู้เล่นซ่อนแล้วส่องไฟใส่, หรือให้ผู้เล่น Solo มีกระดิ่งสตันพร้อม cooldown, และปิดผีทันทีเมื่อ `offeringsPlaced && photosRestored`

### H-04 · ไม่มีการยืนยันตัวตนของห้อง ใครรู้รหัส 4 หลักก็ควบคุม/เขียนทับได้ + Local server เปิด public tunnel อัตโนมัติและประกาศรหัสห้องทั้งหมด — [จากโค้ด]
- **ไฟล์:** [api/index.js:148-205](../../api/index.js:148), [local-server.js:13-36](../../local-server.js:13), [local-server.js:151-159](../../local-server.js:151), [local-server.js:205-235](../../local-server.js:205)
- **ปัญหา:**
  1. `sync-state` ไม่ตรวจว่าเป็น host → ใครก็ POST เขียนทับ scene/inventory/flags/ghost ของห้องได้ (กระทบจอมือถือ P1/P2 จนกว่า host จะ sync ครั้งถัดไป)
  2. `player-input` ไม่ตรวจ role/action → ใครก็ส่ง `move`/`stun_ghost`/`interact` เข้าเกมของ host ได้
  3. รหัสห้องมีแค่ 9,000 ค่า เดาได้ด้วยสคริปต์ในไม่กี่วินาที
  4. `local-server.js` เปิด tunnel `localhost.run` สาธารณะทุกครั้งที่รัน (`StrictHostKeyChecking=no`) และ `/api/server-info` คืน `activeRooms` (รายการรหัสห้องทั้งหมด) ให้ใครก็ได้
- **ผลกระทบ:** griefing (คนแกล้งกดสตัน/เดินแทน, ทำให้ผู้เล่นตาย), เครื่องโน้ตบุ๊กที่บูธถูกเปิดสู่อินเทอร์เน็ตโดยเจ้าของอาจไม่รู้ตัว
- **แนวทางแก้:** สร้าง `hostToken` (random 128-bit) ตอน create-room ส่งกลับเฉพาะ host และบังคับใน `sync-state`; ออก `joinToken` ต่อ role ใส่ใน URL ของ QR; ลบ `activeRooms` จาก server-info; ให้ tunnel เป็น opt-in; whitelist ค่า `action`

### H-05 · รหัสห้องชนกันแล้วเขียนทับห้องที่กำลังเล่นอยู่ — [จากโค้ด]
- **ไฟล์:** [api/index.js:136-146](../../api/index.js:136), [local-server.js:177-187](../../local-server.js:177)
- **ปัญหา:** สุ่ม 1000-9999 แล้ว `rooms.set(code, room)` โดยไม่เช็คว่ามีอยู่แล้ว และห้องไม่เคยถูกลบ (H-06) จำนวนห้องสะสมทั้งวันจึงเพิ่มโอกาสชน: มี 100 ห้องค้าง → ห้องใหม่ชน ~1.1%; ตลอดงาน (สมมติ 300 ห้อง) โอกาสที่จะมี "อย่างน้อยหนึ่งครั้ง" ที่ห้องใหม่ทับห้องเก่า ≈ 99% (birthday problem)
- **ผลกระทบ:** หากห้องเก่ายังเล่นอยู่ มือถือของกลุ่มเก่าจะไปผูกกับเกมของ host ใหม่
- **แนวทางแก้:** วน retry จนได้รหัสที่ไม่ซ้ำ + ลบห้องที่ไม่มี activity เกิน 15 นาที (TTL)

### H-06 · ห้องและคิว input โตไม่มีขอบเขต + อ่าน/เขียนไฟล์ทั้งก้อนทุก request — [จากโค้ด]
- **ไฟล์:** [api/index.js:104](../../api/index.js:104), [api/index.js:149-154](../../api/index.js:149), [api/index.js:164-169](../../api/index.js:164), [api/index.js:187-205](../../api/index.js:187)
- **ปัญหา:**
  - ทุก route (`join-room`, `sync-state`, `player-input`) **สร้างห้องอัตโนมัติ** สำหรับรหัสใดๆ ที่ส่งมา และไม่มีการลบห้อง
  - `pendingInputs` ถูก drain เฉพาะเมื่อ host เรียก `sync-state` — ถ้า host ปิดแท็บไปแล้วแต่มือถือยังกด หรือมีคนสแปม คิวโตไม่จำกัด
  - ทุก request เรียก `readFileSync + JSON.parse` และ `JSON.stringify + writeFileSync` ของ **ทุกห้อง** (synchronous, block event loop) — ต้นทุน O(จำนวนห้องทั้งหมด) ต่อ request ที่ ~18 req/s ต่อห้อง
- **ผลกระทบ:** หน่วยความจำ/latency เพิ่มขึ้นตลอดเวลา, เปิดช่อง DoS ด้วยการยิง `player-input` รหัสสุ่ม
- **แนวทางแก้:** ไม่ auto-create นอกจาก `create-room`; คืน 404 สำหรับห้องที่ไม่มี; จำกัด `pendingInputs` (เช่น 64 รายการล่าสุด); TTL cleanup; เลิกใช้ไฟล์ `/tmp`

---

## Medium

### M-01 · `queueDialogue` เขียนทับบทสนทนาและ callback ที่กำลังแสดงอยู่ — [จากโค้ด]
- **ไฟล์:** [public/game.js:785-790](../../public/game.js:785), ผู้เรียก: [game.js:657-663](../../public/game.js:657) (P2 สตัน), [game.js:1158-1160](../../public/game.js:1158) (ซ่อนผิดที่)
- **ปัญหา:** แทนที่ `dialogueQueue` และ `dialogueOnComplete` ทั้งก้อน ถ้า P2 กดกระดิ่งระหว่างบทพูดของลุง (ฉาก 5) หรือระหว่างบทพูดหน้าประตูฉาก 1 → callback ที่เปิด cutscene หาย
- **ผลกระทบ:** เนื้อเรื่องถูกตัด ผู้เล่นต้องกดคุยซ้ำ (ไม่ softlock ถาวรเพราะ hotspot ยังกดซ้ำได้ — ตรวจแล้วทุกจุด) และกระดิ่งระหว่าง cutscene จะโชว์ dialogue ทับ cutscene
- **แนวทางแก้:** แยก "toast/แจ้งเตือน" ออกจาก dialogue หลัก หรือ append เข้าคิวแทนการแทนที่

### M-02 · กระดิ่งสตันของ P2 ไม่มี cooldown — [จากโค้ด]
- **ไฟล์:** [public/game.js:657-663](../../public/game.js:657), [public/index.html:295-297](../../public/index.html:295)
- **ผลกระทบ:** P2 กดรัวได้ → ผีถูกตรึงตลอด และระหว่างสตันการจับถูกข้าม (บรรทัด 1281-1283) → เดินทะลุผีได้ ความท้าทายใน co-op หายไป ประกอบกับทุกครั้งเปิด dialogue ที่ทำให้เกมหยุด (M-01)
- **แนวทางแก้:** cooldown ฝั่ง host (เช่น 12 วินาที) + แสดงเวลาที่เหลือบนจอ P2

### M-03 · บน Vercel `EventSource` ต่อใหม่วนไม่รู้จบ — [จากโค้ด]
- **ไฟล์:** [api/index.js:214-218](../../api/index.js:214), [public/game.js:702-716](../../public/game.js:702)
- **ปัญหา:** `/api/events` ส่ง event เดียวแล้ว `res.end()` → เบราว์เซอร์ reconnect อัตโนมัติทุก ~3 วินาทีต่ออุปกรณ์ (เป็น invocation เปล่าที่เรียก `loadRoomsFromTmp` ด้วย)
- **แนวทางแก้:** ตรวจ `info.isVercel` แล้วไม่เปิด EventSource หรือส่ง `retry: 600000`

### M-04 · `broadcastState` ไม่มี in-flight guard / sequence number — patch มาถึงไม่เรียงลำดับ — [จากโค้ด]
- **ไฟล์:** [public/game.js:745-771](../../public/game.js:745), [game.js:720-733](../../public/game.js:720), [game.js:1323-1327](../../public/game.js:1323) และอีก 9 จุดที่เรียก broadcast ทันที
- **ปัญหา:** host ส่ง sync ~11 ครั้ง/วินาที (loop 120ms + poll 320ms + ทุก action) โดยไม่รอ response บนเครือข่ายมือถือ/Wi-Fi งานที่ latency > 120ms request จะซ้อนกันและ server ใช้ "อันที่มาถึงล่าสุด" ซึ่งอาจเก่ากว่า → ตำแหน่งบนเรดาร์ P2 กระตุกถอยหลัง
- **แนวทางแก้:** ส่งทีละ request (skip ถ้ายังมี in-flight), แนบ `seq` และ server ปฏิเสธ seq ที่ต่ำกว่า, ตัดการเรียกจาก poll timer เมื่อเกมเริ่มแล้ว

### M-05 · `drawImage` กับรูปที่โหลดล้มเหลวอาจโยน exception และหยุด game loop — [จากโค้ด]
- **ไฟล์:** [public/game.js:1395-1397](../../public/game.js:1395), [game.js:909-911](../../public/game.js:909), loop [game.js:1233-1242](../../public/game.js:1233)
- **ปัญหา:** เช็คแค่ `img.complete` (เป็น true แม้รูป broken) ไม่เช็ค `naturalWidth` Chrome โยน `InvalidStateError` สำหรับรูป broken และ `gameLoop` ไม่มี try/catch → `requestAnimationFrame` ถัดไปไม่ถูกเรียก เกมค้าง
- **ผลกระทบ:** Wi-Fi งานที่ไม่เสถียรทำให้รูปพื้นหลังโหลดไม่ขึ้น → จอค้างทั้งเกม (ส่วนอื่นใช้ `drawSpriteProportional` ที่เช็ค `naturalHeight` แล้ว — ปลอดภัย)
- **แนวทางแก้:** ใช้ helper เดียว `isReady(img) = img && img.complete && img.naturalWidth > 0`; ห่อ `updateGame/renderGame` ด้วย try/catch แล้วเรียก rAF ต่อเสมอ; preload screen ที่รอ asset ครบ

### M-06 · Vercel คืนสถานะห้องปลอมเมื่อรหัสไม่ถูกต้อง — [จากโค้ด]
- **ไฟล์:** [api/index.js:207-212](../../api/index.js:207), [api/index.js:149](../../api/index.js:149), [public/game.js:604-633](../../public/game.js:604)
- **ปัญหา:** `room-state` คืน `createInitialRoomState(code)` สำหรับรหัสที่ไม่มีอยู่ และ `join-room` ไม่ส่ง error; ฝั่ง client ไม่ตรวจรูปแบบรหัส → ผู้เล่นกรอกผิดก็เข้า "ห้องผี" ได้ จอนิ่ง ไม่รู้ว่าผิด
- **แนวทางแก้:** คืน `404 {ok:false}` และแสดงข้อความ "ไม่พบห้อง"; validate `/^\d{4}$/`

### M-07 · `openCoopLobby` ไม่มี error handling และกดซ้ำได้ — [จากโค้ด]
- **ไฟล์:** [public/game.js:557-590](../../public/game.js:557)
- **ปัญหา:** `await fetch(...)` ไม่มี try/catch → ถ้าเน็ตล่ม ปุ่มเงียบ (unhandled rejection) และกดซ้ำได้หลายครั้ง สร้างหลายห้อง (เพิ่ม H-05/H-06)
- **แนวทางแก้:** disable ปุ่มระหว่างโหลด, try/catch + ข้อความแจ้งผู้ใช้

### M-08 · ไม่มี Player lifecycle: มือถือไม่รู้ว่า Game Over/ชนะ/host หลุด และสถานะ "เชื่อมต่อแล้ว" ไม่เคยกลับเป็นเท็จ — [จากโค้ด]
- **ไฟล์:** [public/game.js:688-700](../../public/game.js:688), [api/index.js:155-156](../../api/index.js:155), [local-server.js:254-258](../../local-server.js:254)
- **ปัญหา:** `applyRoomStateToClient` อัปเดตแค่ตัวนับ inventory ไม่แสดง `gameOver/victory`; ไม่มี heartbeat/lastSeen → ถ้ามือถือปิดจอ lobby ยังขึ้น 🟢; ถ้า host ปิดแท็บ มือถือ poll ต่อไปเรื่อยๆ ไม่มีแจ้งเตือน
- **แนวทางแก้:** `lastSeen` ต่อ role (หมดอายุ 5 วินาที), แสดงสถานะเกม/host offline บนจอมือถือ

### M-09 · การซ่อนตัว = อมตะเต็มรูปแบบ และออกจากที่ซ่อนข้างผี = ตายทันที — [จากโค้ด]
- **ไฟล์:** [public/game.js:1291-1306](../../public/game.js:1291), [game.js:1128-1130](../../public/game.js:1128), [game.js:1165-1169](../../public/game.js:1165)
- **ปัญหา:** เงื่อนไข "ซ่อน + ปิดไฟ" ใช้แค่เลือกพฤติกรรมเดินของผี แต่การจับเช็คแค่ `!hidden` → เปิดไฟฉายระหว่างซ่อนก็ไม่โดนจับ (ขัดกับคำแนะนำในเกมบรรทัด index.html:198); ผีลอยทับตำแหน่งผู้เล่นได้ แล้วการกดเดินใดๆ = ออกจากที่ซ่อน = ระยะ < 58 = Game Over ทันทีโดยไม่มีเวลาตอบสนอง
- **แนวทางแก้:** ให้ "ซ่อนแต่เปิดไฟ" มีผลจริง (ผีหาเจอ), ให้ grace period 0.5 วินาทีหลังออกจากที่ซ่อน, ผีควรเดินออกห่างเมื่อหาไม่เจอ

### M-10 · QR ใช้สีกลับด้าน (โมดูลสว่างบนพื้นมืด) และ URL ยาว > 106 bytes ได้ QR เสีย — [จากโค้ด]
- **ไฟล์:** [qr.js:188](../../server/qr.js:188), [qr.js:62-63](../../server/qr.js:62)
- **ปัญหา:** `fill="#121116"` พื้น + `#e6dcc8` โมดูล = inverted QR ซึ่งตัวอ่านบางรุ่นไม่รองรับ; version ถูกจำกัดที่ 5 แต่ไม่ตัด/แจ้ง error เมื่อข้อมูลเกินความจุ (data codewords เกิน → วางไม่ครบ)
- **แนวทางแก้:** ใช้โมดูลสีเข้มบนพื้นสว่าง (ใส่กรอบสีตามธีมรอบนอกแทน) และ throw/fallback เมื่อเกินความจุ

---

## Low

| ID | ไฟล์:บรรทัด | ปัญหา | แนวทางแก้ |
|---|---|---|---|
| L-01 | [game.js:454](../../public/game.js:454) | `state.Flags?.offeringsPlaced` พิมพ์ผิด (`Flags`) → `isHiddenClue` เป็น true เสมอ จุดบอกใบ้หิ้งบูชาเป็นสีเขียวตลอด | เปลี่ยนเป็น `state.flags` |
| L-02 | [game.js:1203-1219](../../public/game.js:1203) | ไม่เช็ค `e.repeat` → กด Space ค้าง สลับโหมดสัมผัสพิเศษรัวๆ / กด E ค้างข้าม dialogue ทั้งหมด | `if (e.repeat) return;` สำหรับปุ่ม action |
| L-03 | [game.js:314-343](../../public/game.js:314) | Hotspot ฉาก 2 ทับกัน: โต๊ะ (946-1114) กับประตู (1101-1259) ช่วง 1101-1114 จะได้โต๊ะเสมอ | เลือก hotspot ที่ใกล้ที่สุดแทน `find` ตัวแรก |
| L-04 | [game.js:357](../../public/game.js:357), [game.js:427](../../public/game.js:427) | ย้อนกลับมาฉาก 2/3 เกิดที่ x=1100 ห่างประตูขวา 80px แต่ระยะ trigger = 79px → ขาด 1px | เกิดที่ 1090 หรือจัดระยะใหม่ |
| L-05 | [game.js:631](../../public/game.js:631) | `joinAsMobileRole` ซ้ำ → เปิด `renderP2RadarLoop` หลาย loop | flag กันซ้ำ |
| L-06 | [game.js:664-671](../../public/game.js:664), [game.js:1289](../../public/game.js:1289) | Pulse ของ P2 ใช้ `setTimeout` ซ้อนกัน (ตัวแรกปิดก่อนเวลา) และทำให้ผีเร็วขึ้น 35% — "ช่วย" แต่จริงๆ ทำร้าย P1 | เก็บ timer id/เวลาหมดอายุ; ทบทวน design |
| L-07 | [game.js:1406](../../public/game.js:1406), [1409](../../public/game.js:1409), [1422](../../public/game.js:1422) | fallback `IMAGES.sam0 / dancer0 / male0` ไม่มีอยู่จริง (ไม่ crash เพราะ guard) | ลบหรือชี้ไปคีย์ที่มีจริง |
| L-08 | [local-server.js:123-135](../../local-server.js:123), [254-258](../../local-server.js:254), [263-264](../../local-server.js:263), [218](../../local-server.js:218) | body ไม่จำกัดขนาด; Set ของ SSE ว่างไม่ถูกลบ; static ไม่มี containment check/`decodeURIComponent`; host ได้รับ state ของตัวเองผ่าน SSE ~11 ครั้ง/วินาที | จำกัด 16KB; ลบ Set ว่าง; `startsWith(PUBLIC_DIR)`; broadcast เฉพาะ role ≠ host |
| L-09 | [api/index.js:34-81](../../api/index.js:34) vs [local-server.js:65-110](../../local-server.js:65) | ตรรกะห้องซ้ำ 2 ที่และเริ่มต่างกันแล้ว (local ไม่มี `updatedAt/pendingInputs`, local `player-input` ไม่ mark ผู้เล่นออนไลน์, local `sync-state` ไม่คืน `players`) | แยก `room-core.js` ใช้ร่วมกัน |
| L-10 | root | ไฟล์ค้างจากเครื่องมือ AI/เครื่องอื่น: `check_all.py`, `chunks_manifest.json`, `part_0..3.txt` (base64 ไม่ทราบที่มา), `process_assets.py`/`generate_all_frames.py` ฮาร์ดโค้ด `C:\Users\informatics\...`; asset ไม่ถูกใช้ ~19 ไฟล์ (ดู ARCHITECTURE_REVIEW §2.3) | ย้ายสคริปต์ไป `tools/` ใช้ path สัมพัทธ์; ลบไฟล์ค้าง (ต้องได้รับอนุญาตก่อน) |
| L-11 | [game.js:1101](../../public/game.js:1101), [index.html:5](../../public/index.html:5), [index.html:186](../../public/index.html:186) | `alert()` บล็อก main thread; `user-scalable=no` ขัด accessibility; วันที่ "20–21 นี้" ไม่ระบุเดือน | toast ในเกม; เอา `maximum-scale` ออก; ระบุเดือน/ปี |
| L-12 | [game.js:561-563](../../public/game.js:561) + [api/index.js:123-125](../../api/index.js:123) | รัน `vercel dev` บน localhost ได้ URL `http://localhost:3000:` (port ว่าง) | ใช้ `window.location.origin` เมื่อ `info.isVercel` |
