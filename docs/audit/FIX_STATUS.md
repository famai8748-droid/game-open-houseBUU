# FIX_STATUS — สถานะการแก้ไขหลัง Audit

> แก้ไขเมื่อ 2026-11-14 ต่อจาก commit `d7f294c` · รหัสอ้างอิงจาก [BUG_REPORT.md](BUG_REPORT.md) และ [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md)
> **วิธียืนยัน:** 🧪 = unit test (`npm test`, 22 tests ผ่าน) · 🌐 = ทดสอบเล่นจริงในเบราว์เซอร์ (local server, 3 แท็บ host/P1/P2) · 🔧 = รันคำสั่ง/สคริปต์ตรวจ · 📖 = แก้จากโค้ด ยังไม่ได้ทดสอบแยก

## สรุป

| ระดับ | ทั้งหมด | แก้แล้ว | แก้บางส่วน |
|---|---|---|---|
| Critical | 2 | 1 | 1 (C-02 ต้องตั้งค่า Redis บน Vercel) |
| High | 6 | 6 | — |
| Medium | 10 | 10 | — |
| Low | 12 | 10 | 2 (L-10, L-11) |

## Critical / High

| ID | สถานะ | สิ่งที่แก้ | ยืนยัน |
|---|---|---|---|
| C-01 QR อ่านไม่ได้ | ✅ | วาง format bits ตาม ISO 18004, โมดูลเข้มบนพื้นสว่าง, quiet zone 4 โมดูล ([server/qr.js](../../server/qr.js)) | 🔧 OpenCV decode ได้ทั้ง version 1/3/4/5 รวมถึง QR ที่ `/api/qr` เสิร์ฟจริง · 🧪 ตรวจตำแหน่งบิตทั้ง 2 ชุด |
| C-02 Vercel ไม่มี shared state | ⚠️ บางส่วน | เพิ่ม Upstash Redis / Vercel KV store ([server/stores.js](../../server/stores.js)) เปิดใช้อัตโนมัติเมื่อมี env; ถ้าไม่มีจะใช้ memory และแจ้งใน `/api/server-info` (`store`) | 🧪 กับ fake Upstash · **ยังไม่ได้ทดสอบกับ Upstash จริง** — ต้องตั้ง env บน Vercel แล้วทดสอบ MP-07 |
| H-01 local server crash ไม่มี ssh | ✅ | `ssh.on('error')`, tunnel เป็น opt-in (`PUBLIC_TUNNEL=1`), backoff, `StrictHostKeyChecking=accept-new` | 🔧 รันโดยไม่มี ssh ใน PATH → เซิร์ฟเวอร์ยังตอบ 200 |
| H-02 modal ต่อรูปไม่หยุดเกม | ✅ | dialogue/modal = หยุดโลกทั้งหมด, ห้ามเดิน/สำรวจขณะ modal เปิด, Esc ปิด modal | 🌐 ผีขยับ 0px ระหว่าง modal เปิด 1.5 วินาที |
| H-03 Solo ผ่านผีไม่ได้ | ✅ (🎨 ปรับ design) | ผีที่ "หาไม่เจอ" (ซ่อน + ปิดไฟ) จะค้นหา → ค่อยๆ จางหาย → ไปปรากฏนอกจอด้านหลังผู้เล่น; ผีนางรำสลายทันทีเมื่อทำพิธีครบ; สัมภเวสีหยุด 1.5 วิหลัง cutscene ("กำลังลุกขึ้น"); retry ให้ผีเกิดด้านหลัง; toast สอนวิธีซ่อนครั้งแรก | 🌐 เล่น Solo ตั้งแต่ฉาก 2 จนจบเกม (ending modal ขึ้น) โดยไม่ใช้กระดิ่ง · **ควร playtest กับคนจริง (TEST_PLAN E-03)** |
| H-04 ไม่มีการยืนยันตัวตนห้อง | ✅ | `hostToken` (เฉพาะ host sync ได้), `playerToken` ต่อ role (เข้าซ้ำ = แทนที่เครื่องเดิม), จำกัด action ตาม role (P1 เดิน/สำรวจ, P2 กระดิ่ง/ญาณทิพย์), whitelist state patch, `server-info` ไม่แสดงรหัสห้อง, rate limit join 40/นาที/IP, SSE ต้องมี token | 🧪 + 🌐 คนนอกส่ง input → 409, sync ปลอม → 403 |
| H-05 รหัสห้องชน | ✅ | สุ่มด้วย `crypto.randomInt` และตรวจว่าว่างก่อนใช้ | 🧪 สร้าง 2,000 ห้องไม่ซ้ำ |
| H-06 ทรัพยากรโตไม่จำกัด | ✅ | ไม่สร้างห้องอัตโนมัติ (404), ห้องหมดอายุเมื่อว่าง 30 นาที, คิว input สูงสุด 64, เลิกเขียนไฟล์ `/tmp`, body สูงสุด 16KB | 🧪 TTL/คิว · 🔧 body 200KB → 413 |

## Medium

| ID | สถานะ | สิ่งที่แก้ | ยืนยัน |
|---|---|---|---|
| M-01 dialogue ทับกัน | ✅ | `queueDialogue` ต่อท้ายคิวและเชื่อม callback; ข้อความระบบ (กระดิ่ง, ซ่อนผิดที่) เป็น toast | 📖 |
| M-02 กระดิ่งไม่มี cooldown | ✅ | cooldown 12 วิ ตรวจฝั่ง host, ปุ่มบน P2 ถูกปิดพร้อมนับถอยหลัง, ใช้ไม่ได้ถ้ายังไม่มีผี | 🌐 กด 3 ครั้ง → ทำงานครั้งเดียว, ปุ่มแสดง "(พร้อมในอีก N วิ)" |
| M-03 SSE วนต่อใหม่บน Vercel | ✅ | Vercel ตอบ 204 (หยุด reconnect) และ client เปิด SSE เฉพาะเมื่อ server บอก `sse: true` | 🔧 |
| M-04 sync ไม่เรียงลำดับ | ✅ | in-flight guard, `seq` (server ทิ้ง patch เก่า), ส่งเฉพาะเมื่อ state เปลี่ยน + keep-alive 1 วิ (local) | 🧪 stale seq |
| M-05 รูป broken ทำเกมค้าง | ✅ | `isReady()` ทุกจุดที่วาด, try/catch ใน game loop, พื้นหลังสำรองสีเข้ม | 📖 |
| M-06 รหัสผิดไม่แจ้ง | ✅ | 404 + ข้อความ "ไม่พบห้อง", ตรวจรูปแบบ 4 หลักฝั่ง client, ช่องกรอกเป็นแป้นตัวเลข | 🧪 + 🌐 |
| M-07 เปิดห้องไม่มี error handling | ✅ | try/catch, ปิดปุ่มระหว่างโหลด, เปิดซ้ำ = ใช้ห้องเดิม | 📖 |
| M-08 ไม่มี player lifecycle | ✅ | presence (online ถ้าเห็นภายใน 6 วิ) ทั้ง host/P1/P2, แถบสถานะบนมือถือ: รอเริ่ม / จอกลางหลุด / ถูกจับ / ชนะ / ถูกแทนที่ / ห้องหมดอายุ | 🧪 + 🌐 lobby 🟢 ทั้งคู่ |
| M-09 ซ่อนแล้วอมตะ / ออกมาตายทันที | ✅ | ซ่อนแต่เปิดไฟ = ผีเห็น, ระยะปลอดภัย 0.6 วิหลังออกจากที่ซ่อน, ข้อความเตือนบนจอ, ข้อความ Game Over ตรงกับกลไก | 🌐 |
| M-10 QR สีกลับ / ยาวเกิน | ✅ | ดู C-01 + throw เมื่อเกินความจุ + `/api/qr` รับเฉพาะ http(s) | 🧪 + 🔧 |

## Low

| ID | สถานะ | หมายเหตุ |
|---|---|---|
| L-01 `state.Flags` | ✅ | |
| L-02 key repeat | ✅ | ปุ่ม action ไม่ทำงานซ้ำเมื่อกดค้าง; ไม่รับคีย์ขณะพิมพ์ในช่อง input |
| L-03 hotspot ทับกัน | ✅ | เลือกจุดที่ใกล้ที่สุด |
| L-04 จุดเกิดห่างประตู 1px | ✅ | เกิดที่ x=1110 |
| L-05 radar loop ซ้อน | ✅ | กันซ้ำ + จำกัด ~20fps |
| L-06 pulse ของ P2 | ✅ | ใช้ตัวจับเวลาแยก (`revealTimer`), ไม่ทำให้ผีเร็วขึ้นอีกต่อไป |
| L-07 fallback asset ไม่มีจริง | ✅ | |
| L-08 local server hardening | ✅ | 🔧 `..%2F` และ `--path-as-is /../` → 404 |
| L-09 โค้ดห้องซ้ำ 2 ชุด | ✅ | รวมเป็น `server/room-core.js` + `server/http-api.js` |
| L-10 ไฟล์ค้าง | ⚠️ บางส่วน | ลบ `check_all.py`, `chunks_manifest.json`, `part_0..3.txt`; ย้ายสคริปต์ Python ไป `tools/` ใช้ path สัมพัทธ์ + `ASSET_SOURCE_DIR`; **asset ที่ไม่ถูกใช้ยังเก็บไว้** (ไม่มีผลต่อการโหลดเกม) |
| L-11 alert / zoom / วันที่ | ⚠️ บางส่วน | `alert()` → toast, เลิกล็อก zoom; **วันที่ "20–21 นี้" ยังไม่ระบุเดือน** — ต้องการข้อมูลจากเจ้าของงาน |
| L-12 URL ตอน `vercel dev` | ✅ | |

## งานจาก IMPROVEMENT_PLAN ที่ทำเพิ่ม

- **ST-02** input เดินแบบ "ส่งซ้ำขณะกดค้าง + หยุดเองเมื่อขาดสัญญาณ 650ms" และปุ่มใช้ Pointer Events (ครอบคลุม touchcancel/ลากนิ้วออก) — 🌐 ตัวละครหยุดเองเมื่อไม่ได้รับ "ปล่อยปุ่ม"
- **ST-06** checkpoint ใน `sessionStorage` + ปุ่ม "เล่นต่อ" หน้าแรก (co-op กลับเข้าห้องเดิมได้ถ้ายังไม่หมดอายุ)
- **ST-11 / ST-12** unit tests + README
- **MT-04** ค่าปรับสมดุลรวมอยู่ใน `CONFIG` ต้น `public/game.js`
- **MT-06** cutscene วาดลง `<canvas>` โดยตรง (เลิก `toDataURL` ทุกเฟรม)

## ยังไม่ได้ทำ

- ทดสอบ co-op บน Vercel กับ Upstash จริง (MP-07) และสแกน QR ด้วยมือถือ iOS/Android จริง (C-02t)
- Playtest กับผู้เล่นที่ไม่เคยเล่น (E-03) เพื่อปรับค่า `GHOST_SEARCH_LINGER` / `GHOST_VANISH_TIME`
- ST-08 หน้าโหลด asset, MT-01 แยก `game.js` เป็นโมดูล, MT-02 state machine, MT-05 E2E อัตโนมัติ, i18n
