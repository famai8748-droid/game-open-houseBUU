# IMPROVEMENT_PLAN — เรือนซ่อนวิญญาณ

> **อัปเดต:** บัคส่วนใหญ่ในรายงานนี้ถูกแก้แล้ว — ดูสถานะรายข้อที่ [FIX_STATUS.md](FIX_STATUS.md) (เลขบรรทัดในรายงานนี้อ้างอิงโค้ดที่ commit `d7f294c` ก่อนแก้ไข)

> เรียงตามผลต่อ "เกมเล่นได้จริงในวันงาน Open House" เป็นอันดับแรก · รหัสอ้างอิงจาก [BUG_REPORT.md](BUG_REPORT.md)
> ทุกข้อ **ไม่เปลี่ยนแนวคิดหลักของเกม** (สยองขวัญไทย 5 ฉาก, เก็บของเซ่น 3 + เศษรูป 3, co-op จอกลาง + มือถือ 2 เครื่อง, ฉากจบโปรโมต Open House)
> ข้อที่เป็นการเปลี่ยน game design ทำเครื่องหมาย 🎨 = ต้องให้เจ้าของเกมตัดสินใจก่อน

## Quick Wins (≤ 1 วัน รวมทั้งหมด — ควรทำก่อนวันงาน)

| ID | งาน | แก้ | ความพยายาม |
|---|---|---|---|
| QW-01 | แก้ตำแหน่ง format bits ใน `qr.js` (โค้ดใน C-01) + เปลี่ยนเป็นโมดูลเข้มบนพื้นสว่าง | C-01, M-10 | 30 นาที + ทดสอบด้วยมือถือ iOS/Android จริง |
| QW-02 | `ssh.on('error')` + ทำ tunnel เป็น opt-in ด้วย env `PUBLIC_TUNNEL=1` + ลบ `activeRooms` จาก `/api/server-info` | H-01, H-04 (บางส่วน) | 20 นาที |
| QW-03 | หยุด ghost/การเดินเมื่อ photo modal เปิด และปิดผีฉาก 4 ทันทีเมื่อ `offeringsPlaced && photosRestored` | H-02, H-03 (บางส่วน) | 30 นาที |
| QW-04 | Cooldown กระดิ่ง P2 (เสนอ 12 วินาที, ตรวจฝั่ง host) + ไม่เปิด dialogue หลัก ใช้ toast แทน | M-02, M-01 | 1 ชม. |
| QW-05 | `isReady(img)` เช็ค `naturalWidth`, try/catch ใน `gameLoop` ให้เรียก rAF ต่อเสมอ | M-05 | 20 นาที |
| QW-06 | ตรวจห้องซ้ำตอนสร้าง + `room-state`/`join-room` คืน 404 เมื่อไม่มีห้อง + validate `^\d{4}$` ฝั่ง client | H-05, M-06 | 40 นาที |
| QW-07 | ไม่เปิด EventSource เมื่อ `isVercel`; host ไม่ broadcast จาก poll timer หลังเริ่มเกม | M-03, M-04 (บางส่วน) | 20 นาที |
| QW-08 | `state.Flags` → `state.flags`; `if (e.repeat) return`; spawn x 1100 → 1090; เลือก hotspot ที่ใกล้ที่สุด | L-01..L-04 | 20 นาที |
| QW-09 | try/catch + disable ปุ่มใน `openCoopLobby` | M-07 | 15 นาที |
| QW-10 | เพิ่ม `ontouchcancel` และ `onmouseleave` ให้ปุ่มเดินทุกปุ่ม (host + P1) | ส่วนหนึ่งของปัญหาเดินค้าง | 10 นาที |

## Short-term (1–2 สัปดาห์)

| ID | งาน | เหตุผล |
|---|---|---|
| ST-01 | **ตัดสินใจโหมด co-op สำหรับวันงาน:** (ก) local-server บนโน้ตบุ๊กบูธ (แนะนำ) หรือ (ข) Vercel + Upstash Redis/Vercel KV แทน `global`+`/tmp` | C-02 — ปัญหาเชิงสถาปัตยกรรมที่ใหญ่ที่สุด |
| ST-02 | เปลี่ยน input ของ P1 เป็น "สถานะปุ่มต่อเนื่อง + seq + timeout 400ms" แทน event กด/ปล่อย | แก้เดินค้างจากลำดับ request สลับ/หาย |
| ST-03 | Host token + join token ต่อ role, whitelist `action` และคีย์ใน `statePatch`, จำกัดขนาด body 16KB, จำกัด `pendingInputs` 64 รายการ | H-04, H-06, L-08 |
| ST-04 | TTL ลบห้องที่ไม่มี activity > 15 นาที; เลิกเขียนไฟล์ `/tmp` | H-06 |
| ST-05 | Heartbeat `lastSeen` ต่อ role; จอมือถือแสดง Game Over / ชนะ / "จอกลางหลุดการเชื่อมต่อ" | M-08 |
| ST-06 | Checkpoint ระดับฉากใน `sessionStorage` + คงรหัสห้องเดิมเมื่อ host reload | §5 Architecture |
| ST-07 | `broadcastState`: in-flight guard + `seq`, ส่งเฉพาะเมื่อ state เปลี่ยน, ≤ 8 Hz | M-04, ลด traffic ~60% |
| ST-08 | Loading screen รอ asset ครบ + แสดง % | M-05, ประสบการณ์ครั้งแรก |
| ST-09 | 🎨 ปรับ stealth ให้ยุติธรรม: (1) ซ่อนแต่เปิดไฟ = ผีหาเจอ, (2) grace 0.5s หลังออกจากที่ซ่อน, (3) เมื่อผู้เล่นซ่อนครบ X วินาที ผี "ถอยกลับ" ไปอีกฝั่งของห้อง แทนการลอยทับ — ทำให้ Solo ผ่านผีได้ด้วยกลไกที่สื่อสารได้ | H-03, M-09 |
| ST-10 | 🎨 Solo: ให้กระดิ่งอาคม 1 ครั้งต่อฉาก (หรือ cooldown ยาว) เพื่อชดเชยการไม่มี P2 | H-03 |
| ST-11 | เขียน unit test สำหรับ `qr.js` (encode → decode round-trip) และ room-core; เพิ่ม `npm test` | ป้องกัน C-01 กลับมา |
| ST-12 | README: วิธีรัน local, deploy, checklist วันงาน | ทีมงานบูธ |

## Mid-term (1–2 เดือน)

| ID | งาน |
|---|---|
| MT-01 | แยก `game.js` เป็น ES modules ตามโครงสร้างใน ARCHITECTURE_REVIEW §2.4; รวมตรรกะห้องเป็น `server/room-core.js` ใช้ร่วม 2 adapter |
| MT-02 | State machine ของเกม (`title/playing/dialogue/cutscene/modal/gameover/victory`) แทน flag + อ่าน DOM |
| MT-03 | Scene/hotspot/dialogue เป็น data (`scenes.js`) + ตารางข้อความ (เตรียม i18n ไทย/อังกฤษ) |
| MT-04 | `config.js` รวม magic number ทั้งหมด (speed, range, timing) เพื่อปรับ balance ได้จากที่เดียว |
| MT-05 | E2E test ด้วย Playwright: solo จนจบ, co-op 3 browser context (host/p1/p2) |
| MT-06 | ใช้ JPG cutscene ที่มีอยู่แล้วแทนการวาด+`toDataURL` ทุกเฟรม หรือแสดง canvas โดยตรง; ลด FPS เรดาร์ P2 เป็น 20 |
| MT-07 | Telemetry นิรนาม: ตายกี่ครั้งต่อฉาก, เวลาที่ใช้, % เล่นจบ — ใช้ปรับ difficulty |
| MT-08 | จัดระเบียบ repo: ย้ายสคริปต์ Python ไป `tools/` ใช้ path สัมพัทธ์; ลบ `check_all.py`, `chunks_manifest.json`, `part_*.txt` และ asset ที่ไม่ใช้ (**ต้องได้รับอนุญาตจากเจ้าของก่อน**) |

## Long-term (หลังงาน / ถ้าจะนำไปใช้ต่อ)

| ID | งาน |
|---|---|
| LT-01 | ย้าย realtime ไป WebSocket (เช่น Cloudflare Durable Objects / PartyKit / Supabase Realtime) — หนึ่ง room = หนึ่ง actor, ได้ทั้ง shared state, ordering และ presence |
| LT-02 | Accessibility: โหมดลดความน่ากลัว (ปิด jumpscare เสียงดัง), ขนาดตัวอักษร, คำบรรยายเสียง, ไม่ล็อก zoom |
| LT-03 | 🎨 เนื้อหาเพิ่ม: ฉากจบทางเลือก (ถ้าทำพิธีไม่ครบ), เก็บ "ความทรงจำ" ซ่อน (collectible) สำหรับเล่นซ้ำ, โหมด speedrun กระดานคะแนนที่บูธ |
| LT-04 | 🎨 บทบาท P2 ที่มีการตัดสินใจมากขึ้น: P2 เห็นตำแหน่งผีแต่ P1 ไม่เห็น (ตอนนี้ P1 เห็นผีบนจอกลางอยู่แล้ว ทำให้เรดาร์ P2 ซ้ำซ้อน) เช่น จอกลางซ่อนผีในความมืดจนกว่าจะอยู่ในลำแสง |
| LT-05 | PWA / offline cache สำหรับ Solo — เล่นได้แม้เน็ตงานล่ม |

## ไอเดียเพิ่มความสนุก / อยากกลับมาเล่น (Game Design)

> เป็นข้อเสนอ ไม่ใช่ปัญหา — เลือกตามความเหมาะสมกับเวลาและจุดประสงค์ของบูธ

1. **"รหัสคำสัญญา" ที่ฉากจบ** — แสดงรหัส/QR ให้นำมาแสดงที่บูธ Open House รับของที่ระลึก → เชื่อมเกมกับเป้าหมายทางการตลาดโดยตรง
2. **เวลาเคลียร์ + จำนวนครั้งที่ถูกจับ** แสดงที่ฉากจบ และกระดานคะแนนบนจอบูธ (แข่งกันระหว่างกลุ่มนักเรียน)
3. **Tutorial 20 วินาทีในฉาก 1** (ไม่มีผี) ให้ลองกดซ่อนในพุ่มไม้/รถที่คว่ำ ลองไฟฉาย ลองสัมผัสพิเศษ — ปัจจุบันผู้เล่นเจอกลไกซ่อนครั้งแรกตอนผีไล่อยู่แล้ว
4. **เสียงบอกระยะผี** (กระพรวนดังขึ้นเมื่อเข้าใกล้, stereo pan ซ้าย/ขวา) — ใช้ Web Audio ที่มีอยู่แล้ว เพิ่มความตึงเครียดโดยไม่ต้องมี asset ใหม่
5. **สัมผัสพิเศษเผยของจริง** — ตอนนี้แค่ทำให้จอสว่างขึ้นและผีเร็วขึ้น ถ้าทำให้มองเห็นรอยเท้าผี/เส้นทางปลอดภัย จะมีเหตุผลให้ใช้ (risk/reward)
