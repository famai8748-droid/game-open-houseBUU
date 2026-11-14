# เรือนซ่อนวิญญาณ (The Veiled Thai House)

เกมสยองขวัญพิกเซลอาร์ตแนวไทย 2D สำหรับงาน Open House มหาวิทยาลัยบูรพา เล่นคนเดียว หรือเล่น 2 คนแบบ "จอกลาง + มือถือ" ผ่าน QR Code ก็ได้

- **Solo:** ทั้งเกมรันในเบราว์เซอร์ ไม่ต้องใช้เซิร์ฟเวอร์
- **Co-op:** จอกลาง (host) รันเกม · มือถือ P1 เป็นจอยเดิน · มือถือ P2 เป็น "ญาณทิพย์" (เรดาร์ + กระดิ่งตรึงผี)

## วิธีรัน

ต้องใช้ Node.js 18 ขึ้นไป (ชุดทดสอบใช้ 21 ขึ้นไป) โปรเจกต์ไม่มี dependency ไม่ต้อง `npm install`

```bash
npm run local
```

เปิด `http://localhost:3000` บนจอกลาง มือถือที่ต่อ Wi-Fi วงเดียวกันสแกน QR ได้เลย (QR ใช้ IP ในวง LAN ให้อัตโนมัติ)

ตัวเลือกเพิ่มเติม:

| ตัวแปร | ผล |
|---|---|
| `PORT=8080` | เปลี่ยนพอร์ต |
| `PUBLIC_TUNNEL=1` | เปิด URL https สาธารณะผ่าน localhost.run (ต้องมี `ssh`) — ปิดไว้เป็นค่าเริ่มต้นเพื่อไม่ให้เครื่องถูกเปิดสู่อินเทอร์เน็ตโดยไม่ตั้งใจ |

## แนะนำสำหรับวันงาน (บูธ)

1. ใช้ `npm run local` บนโน้ตบุ๊กที่บูธ และใช้ Wi-Fi/hotspot ของบูธเอง — หน่วงต่ำที่สุด และส่งข้อมูลแบบ push (SSE) จริง
2. ทดสอบสแกน QR ด้วยกล้อง iPhone และ Android ก่อนเปิดบูธ
3. ถ้าจอกลางเผลอรีเฟรช กด "เล่นต่อ" ที่หน้าแรกได้ (บันทึกจุดล่าสุดไว้ในแท็บนั้น) มือถือไม่ต้องสแกนใหม่ถ้าห้องยังไม่หมดอายุ

## Deploy บน Vercel

`vercel.json` ส่งทุก `/api/*` ไปที่ `api/index.js` และเสิร์ฟ `public/` เป็นไฟล์ static

Serverless function หลาย instance **ไม่ใช้หน่วยความจำร่วมกัน** ถ้าจะเล่น co-op บน Vercel ให้เชื่อม Redis:

| ตัวแปรสภาพแวดล้อม | หมายเหตุ |
|---|---|
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | จาก Upstash console |
| หรือ `KV_REST_API_URL` + `KV_REST_API_TOKEN` | ตั้งให้อัตโนมัติเมื่อเพิ่ม Vercel KV / Upstash integration |

ถ้าไม่ได้ตั้งค่าไว้ ระบบจะใช้หน่วยความจำของ instance เดียว (โหมด Solo ใช้ได้ปกติ ส่วน co-op อาจหลุดเมื่อมีผู้เล่นพร้อมกันหลายห้อง) ดูสถานะได้ที่ `/api/server-info` (`"store": "upstash"` หรือ `"memory"`)

## ทดสอบ

```bash
npm test
```

Unit test ครอบคลุม: วงจรชีวิตห้อง, การยืนยันตัวตน host/ผู้เล่น, ลำดับและเพดานคิว input, การหมดอายุห้อง, การกรองข้อมูล state, rate limit, ตำแหน่งบิตของ QR ตามมาตรฐาน ISO 18004 (รันทั้งกับ memory store และ fake Upstash)

## โครงสร้าง

```
api/index.js          Vercel function (adapter)
local-server.js       เซิร์ฟเวอร์สำหรับบูธ: static + API + SSE
server/
  room-core.js        ตรรกะห้อง co-op (ใช้ร่วมกันทั้ง 2 เซิร์ฟเวอร์)
  stores.js           ที่เก็บห้อง: memory / Upstash Redis
  http-api.js         HTTP routes, จำกัดขนาด body, rate limit
  qr.js               ตัวสร้าง QR (ไม่มี dependency)
public/
  index.html  style.css  game.js  assets/
tools/                สคริปต์ Python สร้าง asset (ต้องตั้ง ASSET_SOURCE_DIR)
tests/                unit tests (node:test)
docs/audit/           รายงานการตรวจสอบโปรเจกต์
```

### API (สรุป)

| Route | ใครเรียก | หมายเหตุ |
|---|---|---|
| `POST /api/create-room` | จอกลาง | คืน `code` 4 หลัก + `hostToken` (ลับ) |
| `POST /api/join-room` | มือถือ | `{code, role}` → `playerToken`; เข้าซ้ำตำแหน่งเดิมจะแทนที่เครื่องเก่า |
| `POST /api/sync-state` | จอกลาง | ต้องมี `hostToken`; ส่ง state + `seq`, รับ input ที่ค้างอยู่ |
| `POST /api/player-input` | มือถือ | ต้องมี `playerToken`; P1 = เดิน/สำรวจ/ซ่อน/ไฟฉาย, P2 = กระดิ่ง/ญาณทิพย์ |
| `GET /api/room-state` | มือถือ | state สาธารณะของห้อง (ไม่มี token) |
| `GET /api/events` | ทั้งคู่ | SSE เฉพาะ local server |
| `GET /api/qr?text=` | จอกลาง | QR เป็น SVG data URL (รับเฉพาะ URL http/https) |

## เสียง

เสียงส่วนใหญ่สังเคราะห์ด้วย Web Audio ใน `public/game.js` ไม่ต้องใช้ไฟล์ ยกเว้นไฟล์ใน `public/assets/audio/` ซึ่งเรนเดอร์จากคลังเสียงของ [earshot](https://github.com/Leonxlnx/earshot) (MIT):

| ไฟล์ | ใช้เป็น | เสียงต้นทางใน earshot |
|---|---|---|
| `bell.mp3` | กระพรวนผีนางรำ | `fit/bell/small_bell` |
| `whisper.mp3` | เสียงกระซิบในเรือน | `reverse_swell/breath` |
| `scare.mp3` | jumpscare | `cut_hit/rumble` |
| `tension.mp3` | ตอนผีปรากฏ/หาเจออีกครั้ง | `riser/tension` |

ถ้าไฟล์ไหนโหลดไม่ได้ เกมจะกลับไปใช้เสียงสังเคราะห์เดิมอัตโนมัติ เพิ่ม/เปลี่ยนไฟล์ได้ที่ `SAMPLE_FILES` ใน `public/game.js` (ใช้ `.mp3` โมโน เพื่อให้เล่นได้ทั้ง iPhone และ Android)

## ปรับสมดุลเกม

ค่าทั้งหมดอยู่ใน `CONFIG` ด้านบนของ [public/game.js](public/game.js) เช่น ความเร็วผู้เล่น/ผี, ระยะจับ, เวลาที่ผีค้นหาก่อนหายไป, cooldown ของกระดิ่ง และความถี่ในการ sync
