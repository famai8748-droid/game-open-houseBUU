# AUDIT_REPORT — เรือนซ่อนวิญญาณ (The Veiled Thai House)

> **อัปเดต:** บัคส่วนใหญ่ในรายงานนี้ถูกแก้แล้ว — ดูสถานะรายข้อที่ [FIX_STATUS.md](FIX_STATUS.md) (เลขบรรทัดในรายงานนี้อ้างอิงโค้ดที่ commit `d7f294c` ก่อนแก้ไข)

> **วันที่:** 2026-11-14 · **commit:** `d7f294c` (branch `main`, working tree สะอาด)
> **ขอบเขต:** ทุกไฟล์ที่ track ใน git (103 ไฟล์: โค้ด 7 ไฟล์, สคริปต์/ไฟล์ค้าง 7 ไฟล์, asset 89 ไฟล์)
> **ไม่ได้แก้ไขโค้ดใดๆ** ในขั้นตอนนี้ — สร้างเฉพาะเอกสารในโฟลเดอร์ `docs/audit/`

**เอกสารชุดนี้**
- [BUG_REPORT.md](BUG_REPORT.md) — บัคทั้งหมด 30 รายการ จัดตามระดับความรุนแรง
- [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md) — โครงสร้าง, multiplayer, security, persistence, performance
- [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md) — Quick Wins → Long-term
- [TEST_PLAN.md](TEST_PLAN.md) — test case พร้อมเกณฑ์ผ่าน
- [FIX_STATUS.md](FIX_STATUS.md) — สถานะการแก้ไขรายข้อหลัง audit

---

## 1. ข้อจำกัดของการตรวจสอบ (อ่านก่อน)

1. **นี่ไม่ใช่โปรเจกต์ Roblox** คำสั่งเขียนสำหรับเกม Roblox/Luau แต่โปรเจกต์จริงเป็น **เกมเว็บ HTML5 Canvas + JavaScript** และ **เซิร์ฟเวอร์ Node.js** (Vercel serverless + local server) จึงตรวจตามโค้ดจริงและเทียบแนวคิด Roblox ไว้ใน [ARCHITECTURE_REVIEW §0](ARCHITECTURE_REVIEW.md)
2. **ระบบที่ขอให้ตรวจแต่ไม่มีอยู่จริง:** Farming, Resource Gathering, Equipment, Crafting, Trading, Market, Economy/สกุลเงิน, Progression ข้ามรอบ, Quest/Achievement, Daily reward, DataStore, Save/Load — รายงานว่า "ไม่มี" และ **ไม่เสนอให้เพิ่ม economy** เพราะจะเปลี่ยนแนวคิดหลักของเกม (สยองขวัญเนื้อเรื่องสั้น 5 ฉากเพื่อโปรโมต Open House)
3. **สิ่งที่ยืนยันด้วยการรันจริง:** (ก) QR อ่านไม่ได้ (C-01) — decode ด้วย OpenCV และทดสอบว่าแก้แล้วอ่านได้, (ข) local server crash เมื่อไม่มี `ssh` (H-01)
4. **สิ่งที่ยืนยันไม่ได้จาก source code:** พฤติกรรม scale/routing ของ Vercel (C-02), ความเข้ากันได้ของตัวอ่าน QR บน iOS/Android จริง, fps จริงบนมือถือ, ความรู้สึกยาก/ง่ายของผู้เล่น (H-03 ต้อง playtest), โควตาของแพลน Vercel ที่ใช้
5. ไม่ได้เปิดเกมเล่นจริงในเบราว์เซอร์ ข้อสรุปเรื่อง gameplay มาจากการไล่โค้ดและคำนวณจากค่าคงที่ (ความเร็ว, ระยะ, ตำแหน่ง)

## 2. Executive Summary

**ภาพรวม:** เกมมีเนื้อหาครบและตรงเป้าหมาย (5 ฉาก, 2 ผี, ปริศนา 2 ชุด, ฉากจบโปรโมต Open House) **โหมด Solo ใช้งานได้และไม่พึ่ง server** แต่ **โหมด Co-op ซึ่งเป็นจุดขายหลัก ยังไม่พร้อมใช้งานจริง** ด้วยเหตุผล 3 ชั้น:

1. **QR สแกนไม่ได้** (C-01) — format bits ผิดมาตรฐาน; แก้ได้ใน 3 บรรทัด
2. **บน Vercel สถานะห้องไม่ shared ระหว่าง serverless instance** (C-02) — ต้องเปลี่ยนสถาปัตยกรรม หรือใช้ local server ที่บูธแทน
3. **ไม่มีการป้องกันห้อง** (H-04, H-05, H-06) — ใครรู้รหัส 4 หลักก็ควบคุมเกมคนอื่นได้, ห้องชนกัน, ทรัพยากรโตไม่จำกัด

ด้าน gameplay ปัญหาสำคัญคือ **การผ่านผีในโหมด Solo ไม่มีกลไกที่ชัดเจน** (H-03) — วัตถุประสงค์ในฉาก 3 และ 4 อยู่หลังผีบนแกนเดียว และ **หน้าต่างต่อรูปไม่หยุดเกม** (H-02) ซึ่งทั้งคู่อาจทำให้ผู้เล่นทั่วไปไม่ถึงฉากจบที่มีข้อความโปรโมต

**ความพร้อมก่อนเปิดให้ผู้เล่นจริง:**

| โหมด | สถานะ | เงื่อนไขก่อนใช้ในงาน |
|---|---|---|
| Solo (Vercel/static) | 🟡 พร้อมโดยมีเงื่อนไข | QW-03, QW-05 + playtest H-03 |
| Co-op ที่บูธ (local-server + Wi-Fi บูธ) | 🔴 ยังไม่พร้อม | QW-01, QW-02, QW-03, QW-04, QW-10 + ST-02 |
| Co-op ระยะไกล (Vercel) | 🔴 ยังไม่พร้อม | ทั้งหมดข้างบน + ST-01(ข), ST-03, ST-04 |

## 3. ตารางสรุปปัญหาตามหมวด

| หมวด | Critical | High | Medium | Low | ปัญหาเด่น |
|---|---|---|---|---|---|
| Multiplayer / Network | 1 | 2 | 5 | 2 | C-02, H-05, M-03, M-04, M-08 |
| Security | — | 2 | — | 1 | H-04, H-06 |
| QR / Onboarding | 1 | — | 2 | 1 | C-01, M-06, M-10 |
| Gameplay / State | — | 2 | 3 | 5 | H-02, H-03, M-01, M-09 |
| Stability (crash/freeze) | — | 1 | 2 | — | H-01, M-05 |
| Code quality / Repo | — | — | — | 3 | L-09, L-10 |
| **รวม** | **2** | **6** | **10** | **12** | |

(บางรายการคาบเกี่ยวหลายหมวด นับตามหมวดหลัก)

---

## 4. ผลการตรวจตามหัวข้อที่กำหนด

### 4.1 Project Structure Audit
- Client/Server แยกชัดในระดับโฟลเดอร์ (`public/` vs `api/` + `local-server.js`) ✅
- **ไม่มีโค้ด shared:** ตรรกะห้องถูกคัดลอก 2 ชุดและเริ่มต่างกัน (L-09)
- `game.js` 1,701 บรรทัด รวมทุกหน้าที่ (audio/loader/state/scene/UI/network/render/P2 radar) ใช้ global + `onclick` ใน HTML — ดูแลยากเมื่อขยาย
- ไม่มีไฟล์ constants/config — magic number กระจาย
- ไฟล์ไม่เกี่ยวข้องใน root: `check_all.py`, `chunks_manifest.json`, `part_0..3.txt` และสคริปต์ asset ที่ฮาร์ดโค้ด path ของเครื่องอื่น (L-10); asset ที่ไม่ถูกใช้ ~19 ไฟล์ (ARCHITECTURE §2.3)
- ไม่มี README, test, lint
- รายละเอียดและโครงสร้างที่แนะนำ: [ARCHITECTURE_REVIEW §2](ARCHITECTURE_REVIEW.md)

### 4.2 Code Quality & Bug Audit
- **Syntax error:** ไม่พบ (`node --check` ผ่านทั้ง 4 ไฟล์ JS)
- **Runtime error:** H-01 (spawn crash), M-05 (drawImage รูป broken หยุด loop), M-07 (unhandled rejection)
- **Logic error:** L-01 (`state.Flags`), L-03/L-04 (ระยะ hotspot), M-09 (เงื่อนไขซ่อน/ไฟฉายไม่มีผล)
- **State management:** H-02 (modal ไม่ pause), M-01 (dialogue เขียนทับ callback), state UI อ่านจาก DOM
- **Race condition:** M-04 (sync ไม่เรียงลำดับ), ลำดับ input กด/ปล่อยสลับ (ARCH §3)
- **Event/timer leak:** L-05 (radar loop ซ้อน), L-06 (setTimeout ซ้อน), sseClients Set ว่างไม่ลบ (L-08), EventSource reconnect loop บน Vercel (M-03)
- **โค้ดซ้ำ:** room logic 2 ชุด, การเช็ค `img.complete && naturalWidth` ซ้ำหลายสิบจุด, ลำดับ captions cutscene

### 4.3 Multiplayer Architecture Audit
Host-authoritative (ดี) แต่ขาด presence, ordering, authentication และ shared store — ดูตาราง [ARCHITECTURE_REVIEW §3](ARCHITECTURE_REVIEW.md) จุดสำคัญ: C-02, H-04, H-05, M-04, M-08 และปัญหาเดินค้างจาก input กด/ปล่อย (ST-02)

### 4.4 Game System Audit
| ระบบ | สถานะ |
|---|---|
| World/Scene (5 ฉาก, ประตู, cutscene) | ✅ ทำงาน; L-03, L-04 |
| Inventory (ของเซ่น 3, เศษรูป 3) | ✅ กันเก็บซ้ำถูกต้อง (`includes`) |
| Photo puzzle | ⚠️ H-02 |
| Ghost AI (ไล่/ลาดตระเวน/สตัน) | ⚠️ H-03, M-09 |
| Stealth (ซ่อน/ไฟฉาย/สัมผัสพิเศษ) | ⚠️ M-09; สัมผัสพิเศษมีแต่โทษ (ผีเร็วขึ้น) ประโยชน์น้อย |
| Dialogue | ⚠️ M-01 |
| P2 support (กระดิ่ง, pulse, เรดาร์) | ⚠️ M-02, L-06; เรดาร์ซ้ำซ้อนกับจอกลาง (LT-04) |
| Game over / Retry | ✅ ทำงาน; ไม่เสีย inventory |
| Ending / Open House promo | ✅ ทำงาน; L-11 (ไม่ระบุเดือน) |
| Audio | ✅ Web Audio สังเคราะห์ ไม่มีปัญหา |
| Save/Load, Quest, Achievement, Daily, NPC อื่นนอกจากลุง | ❌ ไม่มี (ไม่ถือเป็นบัค) |

### 4.5 Economy & Balance Audit
- **Economy:** ไม่มี (ไม่มีเงิน/ตลาด/การซื้อขาย) — Money source/sink, inflation, dupe ทางเศรษฐกิจ **ไม่เกี่ยวข้อง**
- **Balance ของกลไกที่มีจริง** (คำนวณจากโค้ด):

| ค่า | ตัวเลข | ข้อสังเกต |
|---|---|---|
| ความเร็วผู้เล่น | 230 px/s | วิ่งหนีผีได้เสมอถ้าผีอยู่ด้านหลัง |
| สัมภเวสี / นางรำ | 95 / 115 px/s (×1.35 ระหว่างสัมผัสพิเศษ) | |
| ระยะจับ | < 58 px | ไม่มี grace period |
| สตัน P2 | 4.0 s, **ไม่มี cooldown** | co-op ง่ายเกิน (M-02) |
| ลาดตระเวนขณะซ่อน | ±65 px/s แกว่ง ~184 px | ตัวตัดสินว่า Solo ผ่านผีได้หรือไม่ (H-03) |
| Retry | ผู้เล่น x=180, ผี x=1020, สตัน 2 s | ผียังขวางทางเดิม |

- **จำลองสถานการณ์ผู้เล่น:**
  - *Solo มือใหม่:* ผ่านฉาก 1–2 ได้แน่นอน; ฉาก 3 หลัง trigger สัมภเวสี ต้องผ่านผีไปทางขวาโดยไม่มีเครื่องมือ → คาดว่าตายซ้ำหลายครั้ง (H-03)
  - *Solo ที่รู้ทริค:* ซ่อนในตุ่ม รอผีแกว่งไปทางซ้าย → ออกแล้ววิ่ง; ฉาก 4 ทำพิธีครบ → ย้อนกลับฉาก 3 → เข้าใหม่ ผีหาย
  - *Co-op:* P2 กดกระดิ่งรัว → ผีถูกตรึงตลอด → เดินทะลุผีได้ (ไม่มีความท้าทาย)
  - *ผู้ไม่หวังดีในงาน:* สแกนรหัสห้องบนจอบูธ (แสดงตัวใหญ่) → เข้าเป็น P2 ซ้ำ → กดกระดิ่ง/ส่ง move รบกวน (H-04)

### 4.6 Security & Exploit Audit
Server **ไม่ตรวจสอบอะไรเลย** (ไม่มี auth, validation, rate limit) แต่ความเสียหายถูกจำกัดโดยธรรมชาติเพราะไม่มีข้อมูลมีค่า/ถาวร และ host ไม่เชื่อ state จาก server ความเสี่ยงจริงคือ griefing, DoS และการเปิดเครื่องบูธสู่อินเทอร์เน็ต (H-04, H-06) ไม่พบ XSS — ตาราง threat ใน [ARCHITECTURE_REVIEW §4](ARCHITECTURE_REVIEW.md)

### 4.7 Performance Optimization
Client เบาพอบนโน้ตบุ๊ก; จุดหนัก: cutscene `toDataURL` ทุกเฟรม, hotspot closure ทุกเฟรม, เรดาร์ P2 60fps Server: ~18 req/s ต่อห้อง co-op, ทุก request อ่าน/เขียนไฟล์ทั้งก้อนแบบ sync ประมาณการ 10/30/50/100 ห้อง (≈ ผู้เล่น 30/90/150/300 อุปกรณ์) อยู่ใน [ARCHITECTURE_REVIEW §6](ARCHITECTURE_REVIEW.md) — ตัวเลขคำนวณจาก interval ในโค้ด **ยังไม่ได้วัดจริง**

### 4.8 Data Persistence Audit
ไม่มีระบบบันทึกใดๆ — ยอมรับได้สำหรับเกมรอบละ 5–10 นาที ความเสี่ยงที่ควรแก้คือ host reload = เสียทั้งห้อง (ST-06) ไฟล์ `/tmp` บน Vercel ไม่ใช่ persistence จริง หัวข้อ Session locking/Migration/Versioning ไม่เกี่ยวข้อง — [ARCHITECTURE_REVIEW §5](ARCHITECTURE_REVIEW.md)

### 4.9 Game Design & UX
**จุดแข็ง:** บรรยากาศไทยชัดเจน (เรือนไทย, สัมภเวสี, นางรำ, กระพรวน, ราชปะแตน), เนื้อเรื่องมีจุดหักมุม (ตัวเอกอยู่ระหว่างความเป็นความตาย), บทบาท 2 ผู้เล่นไม่สมมาตร (คนเดิน + คนเห็นนิมิต) เหมาะกับบูธ, การเชื่อมฉากจบกับ "คำสัญญาไปงาน Open House" ฉลาดและจำง่าย

**ปัญหา UX ที่พบ:**
- **Onboarding:** ไม่มี tutorial — ครั้งแรกที่ผู้เล่นได้ลองซ่อนคือตอนผีไล่อยู่แล้ว (ฉาก 2 มีตู้แต่ไม่มีภัย จึงไม่มีใครลอง)
- **ความยุติธรรม:** H-02 (โดนจับตอนทำปริศนา), M-09 (ออกจากที่ซ่อน = ตายทันที), H-03 (ไม่มีวิธีที่สื่อสารได้ในการผ่านผี)
- **คำแนะนำขัดกับกลไก:** หน้า Game Over บอกให้ "ปิดไฟฉาย" แต่ไฟฉายไม่มีผลต่อการถูกจับเมื่อซ่อน (M-09)
- **สัมผัสพิเศษ:** มีแต่ข้อเสีย (ผีเร็ว ×1.35) ประโยชน์คือเห็นจุด hotspot ทั้งหมด ซึ่งจุดเหล่านั้นก็แสดงเมื่อเดินใกล้อยู่แล้ว
- **จอมือถือ:** ไม่รู้ว่าเกมจบ/ตาย/host หลุด (M-08); ปุ่มกระดิ่งไม่มี feedback cooldown
- **Accessibility:** ล็อก zoom, jumpscare เสียงดังไม่มีคำเตือน (LT-02)
- ไอเดียเพิ่มความสนุกและ replay: [IMPROVEMENT_PLAN — ไอเดีย](IMPROVEMENT_PLAN.md)

### 4.10 Testing & QA
ไม่มี automated test เลย — แผนทดสอบ 76 case ใน [TEST_PLAN.md](TEST_PLAN.md) แนะนำเริ่มจาก unit test round-trip ของ QR (ป้องกัน C-01) และ E2E Solo จนจบ

---

## 5. ลำดับการแก้ไขที่แนะนำ

1. **วันนี้ (Quick Wins, ~1 วัน):** QW-01 (QR) → QW-02 (crash/tunnel) → QW-03 (modal pause + ปิดผีฉาก 4) → QW-05 (กัน loop ค้าง) → QW-04 (cooldown กระดิ่ง) → QW-06..QW-10
2. **ตัดสินใจเชิงสถาปัตยกรรม:** co-op วันงานใช้ local server ที่บูธ (แนะนำ) หรือ Vercel + Redis (ST-01)
3. **Playtest กับคนที่ไม่เคยเล่น 5 คน** (TEST_PLAN E-03) แล้วตัดสินใจ ST-09/ST-10 (🎨 ต้องให้เจ้าของเกมอนุมัติ)
4. ST-02..ST-08 ก่อนเปิด co-op สาธารณะ
5. Mid/Long-term หลังงาน

## 6. สิ่งที่ต้องการการตัดสินใจจากเจ้าของโปรเจกต์

- โหมด co-op ในวันงาน: local server ที่บูธ หรือ Vercel (กระทบงาน ST-01)
- การปรับ stealth/ผีให้ Solo ผ่านได้ (ST-09, ST-10) — เป็นการเปลี่ยน game design
- อนุญาตให้ลบไฟล์ค้างและ asset ที่ไม่ใช้หรือไม่ (MT-08, L-10)
- `part_0..3.txt` และ `chunks_manifest.json` คืออะไร — ตรวจแล้วเป็นข้อมูล base64 ที่ไม่ถูกอ้างอิงจากโค้ดใดๆ และ manifest ชี้ไป path บนเครื่องอื่น (`C:\Users\informatics\...`) ควรยืนยันว่าไม่มีข้อมูลส่วนตัวก่อน repo เป็นสาธารณะ
