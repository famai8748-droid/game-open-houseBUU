# Prompt สร้างเพลงประกอบด้วย Suno

ใช้กับหน้า Create (Custom) ของ Suno — แต่ละเพลงมี 3 ช่อง:
**Style of Music** (ภาษาอังกฤษ Suno เข้าใจดีกว่า) · **Exclude Styles** · **Lyrics** (เพลงบรรเลงให้เปิดสวิตช์ Instrumental แล้วใส่โครงเพลงในช่องนี้)

เคล็ดลับ:
- แต่ละ prompt กดสร้าง 2–4 ครั้ง แล้วเลือกอันที่ดีที่สุด
- อย่าใส่ชื่อศิลปินจริงใน Style (Suno จะปฏิเสธ)
- เพลงยาวไปไม่เป็นไร ใช้ช่วง 60–90 วินาทีแรกก็พอ แล้วตัดเป็นลูปแบบไม่มีรอยต่อ
- ⚠️ ตามเงื่อนไขของ Suno เท่าที่ทราบ เพลงจากแผนฟรีใช้ได้เฉพาะแบบไม่หวังผลการค้า ถ้าใช้ในงานที่มีการโปรโมต (Open House) ควรใช้แผนเสียเงิน หรือตรวจข้อกำหนดล่าสุดของ Suno ก่อน

เมื่อได้ไฟล์มาแล้ว ขั้นตอนต่อไป: ฟังตรวจด้วย earshot ว่าอารมณ์ตรงฉาก → ตัดเป็นลูป ลดขนาดไฟล์ → ใส่เข้าเกม (ใต้เสียงบรรยากาศ และลดเพลงอัตโนมัติตอนมีบทพูด/jumpscare/ผีเข้าใกล้)

---

## 1. หน้าแรก (Title Theme)

**Style of Music**
```
dark Thai folk horror, cinematic, slow 70 bpm, ranat ek (Thai xylophone) playing a haunting minor melody, distant pi nai (Thai oboe), soft khong wong gong circle, ching finger cymbals ticking like a clock, low cello drone, reverb-heavy, mysterious, melancholic, music box feeling, instrumental
```
**Exclude Styles:** `vocals, EDM, drums kit, happy, pop`

**Lyrics** (Instrumental เปิด)
```
[Intro: solo ranat ek, sparse]
[Theme: pi nai melody over gong drone]
[Build: strings swell, ching cymbals]
[Theme reprise: quieter]
[Outro: single ranat notes fading into silence]
```

## 2. ฉากป่ามืด (ฉาก 1) — เพลงคลอเบาๆ ใต้เสียงฝน

**Style of Music**
```
dark ambient, Thai horror atmosphere, 60 bpm, very sparse, low drone pad, distant detuned saw duang (Thai fiddle) phrases, occasional soft gong hit far away, wind texture, uneasy, lonely night forest, loopable, no melody hook, instrumental
```
**Exclude Styles:** `vocals, beat, drums, upbeat, rain sounds`

**Lyrics**
```
[Ambient intro]
[Sparse fiddle phrase]
[Low drone]
[Distant gong]
[Ambient loop]
```

## 3. ในเรือนไทย (ฉาก 2–3 สำรวจ)

**Style of Music**
```
Thai horror exploration music, 65 bpm, creeping tension, muted ranat thum (low xylophone) repeating a 4-note minor pattern, prepared piano plucks, sul ponticello strings, breathy pi flute, old wooden house creaks feeling, suspenseful, minimal, loopable, instrumental
```
**Exclude Styles:** `vocals, full drums, epic choir, happy`

**Lyrics**
```
[Intro: ranat thum pattern]
[Tension layer: high strings]
[Pause: near silence]
[Pattern returns, slightly louder]
[Loop ending, same as intro]
```

## 4. ผีนางรำไล่ล่า (ฉาก 4)

**Style of Music**
```
intense Thai horror chase, 120 bpm, aggressive klong that (Thai drums) and taphon pounding, fast ranat ek tremolo, screeching pi nai, dissonant string stabs, ching cymbals accelerating, ankle bell jingles, heartbeat sub bass, panic, terrifying, cinematic trailer horror, instrumental
```
**Exclude Styles:** `vocals, rock guitar, EDM drop, happy, major key`

**Lyrics**
```
[Intro: ankle bells and single drum hit]
[Chase: drums and ranat tremolo]
[Rise: strings screech, tempo push]
[Peak: all instruments, dissonant]
[Loop back to chase]
```

## 5. รุ่งอรุณ / ฉากจบ (บรรเลง)

**Style of Music**
```
gentle hopeful Thai traditional ambient, 80 bpm, warm ranat ek melody in major key, soft khim (Thai hammered dulcimer), saw u warm fiddle, light gong, morning light feeling, relief after fear, nostalgic, cinematic ending, instrumental
```
**Exclude Styles:** `horror, dark, vocals, drums kit`

**Lyrics**
```
[Intro: khim arpeggio]
[Theme: ranat ek melody, the title theme now in major key]
[Strings join, warm]
[Outro: soft gong, fade]
```

## 6. (ตัวเลือก) เพลงจบมีเนื้อร้อง — คำสัญญา Open House

ปิด Instrumental · เนื้อร้องแต่งใหม่ทั้งหมด

**Style of Music**
```
Thai luk thung meets cinematic folk ballad, 85 bpm, female vocal soft and warm, ranat ek and khim, acoustic guitar, light percussion, bittersweet then uplifting chorus, Thai lyrics
```
**Exclude Styles:** `rap, EDM, heavy metal`

**Lyrics**
```
[Verse]
ฝนยังพรำ ในคืนที่มืดมิด
เรือนไม้เก่า เก็บความลับไว้มากมาย
เสียงกระพรวน ยังแว่วในหัวใจ
แต่แสงเช้า ได้พาเรากลับมา

[Pre-Chorus]
จับมือไว้ อย่าได้ลืม
คำสัญญา ที่ให้กันไว้

[Chorus]
แล้วพบกันนะ ที่บางแสน
ที่บูรพา วันที่เรานัดกัน
Open House อย่าลืมคำมั่น
ไม่งั้นเรือนนั้น… จะเรียกเธอคืน

[Bridge]
(กระซิบ) อย่าลืมนะ…

[Final Chorus]
แล้วพบกันนะ ที่บางแสน
ที่บูรพา วันที่เรานัดกัน
Open House อย่าลืมคำมั่น
แล้วเจอกัน… ที่บูรพา

[Outro: ranat ek fades]
```
