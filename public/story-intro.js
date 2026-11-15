/* ============================================================================
   Story intro —— 5-scene, 25-beat continuous pixel-art cutscene ("ซีนยาวๆเลยๆ").
   Scene 0: Friend's funeral at the temple
   Scene 1: Late-night drive (Phase A: Mom & Dad conversation with empty dark road -> Phase B: sudden oncoming truck & head-on crash)
   Scene 2: Thrown onto the road beside the overturned burning car -> blackout
   Scene 3: Waking up in the moonlit Thai banana grove with a single flashlight
   Scene 4: Walking out of the grove to discover the veiled Thai house
   Rendered continuously on a 960x540 canvas matching crisp 16-bit pixel art.
   ========================================================================== */
(function () {
  'use strict';

  const W = 960;
  const H = 540;

  function ready(img) {
    return !!img && img.complete && img.naturalWidth > 0;
  }

  function hash(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function smooth(x) {
    return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  }

  function characterSprite(index) {
    const female = typeof state !== 'undefined' && state.character === 'female';
    const img = female ? IMAGES[`femaleWalk${index % 8}`] : IMAGES[`maleWalk${index % 8}`];
    return ready(img) ? img : null;
  }

  function drawPixelPlate(cx, img, zoom, panX, panY) {
    if (!ready(img)) return false;
    cx.save();
    cx.imageSmoothingEnabled = false;
    const z = zoom || 1;
    cx.translate(W / 2 + (panX || 0), H / 2 + (panY || 0));
    cx.scale(z, z);
    cx.translate(-W / 2, -H / 2);
    cx.drawImage(img, 0, 0, W, H);
    cx.restore();
    return true;
  }

  // ---------------------------------------------------------------- scene 0
  // Friend's funeral: crisp 16-bit storyboard plate + continuous rising smoke, embers & candlelight
  function drawAltar(cx, t, phase) {
    const pIdx = Math.min(5, Math.max(0, phase || 0));
    const frameImg = IMAGES[`intro_s1_f${pIdx}`] || IMAGES.intro_panel_1;
    const push = 1 + Math.min(t, 18) * 0.0035;

    if (!drawPixelPlate(cx, frameImg, push, 0, 0)) {
      cx.fillStyle = '#0c0a10';
      cx.fillRect(0, 0, W, H);
    }

    const flicker = 0.85 + Math.sin(t * 6.5) * 0.08 + Math.sin(t * 11.1) * 0.04;
    const glow = cx.createRadialGradient(600, 270, 20, 600, 270, 380);
    glow.addColorStop(0, 'rgba(255, 184, 98, ' + (0.16 * flicker) + ')');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    cx.fillStyle = glow;
    cx.fillRect(0, 0, W, H);

    // Subtle rising pixel incense smoke wisps layered smoothly on top of the plate
    const iz = 1 + pIdx * 0.028;
    const incX = 588 + (push - 1) * 80;
    const incY = 365 - (iz - 1) * 140;
    for (let s = 0; s < 3; s++) {
      for (let k = 0; k < 16; k++) {
        const p = (k / 16 + t * 0.25 + s * 0.33) % 1;
        const y = incY - p * 135;
        const sway = Math.sin(p * 6 + t * 1.4 + s * 1.9) * (6 + p * 18);
        const x = incX + (s - 1) * 11 + sway;
        cx.fillStyle = 'rgba(222, 228, 240, ' + ((1 - p) * 0.22) + ')';
        cx.fillRect(Math.round(x / 3) * 3, Math.round(y / 3) * 3, 3, 6);
      }
    }

    // Glowing incense ember tips
    for (let i = 0; i < 3; i++) {
      const ex = incX + (i - 1) * 11;
      const pulse = 0.65 + Math.sin(t * 5.2 + i * 1.6) * 0.35;
      cx.fillStyle = 'rgba(255, 118, 42, ' + pulse + ')';
      cx.fillRect(Math.round(ex), Math.round(incY), 4, 4);
    }

    // Subtle dust motes in the temple hall
    for (let i = 0; i < 18; i++) {
      const dx = 280 + hash(i) * 520 + Math.sin(t * 0.6 + i) * 10;
      const dy = (hash(i + 40) * 360 + t * 8) % 380 + 70;
      cx.fillStyle = 'rgba(255, 215, 155, ' + (0.08 + hash(i + 7) * 0.12) + ')';
      cx.fillRect(Math.round(dx / 2) * 2, Math.round(dy / 2) * 2, 3, 3);
    }

    // Gentle fade-out as they walk out to the car on the final line of Scene 0
    if (pIdx >= 4) {
      const dim = Math.min(0.45, Math.max(0, (t % 3.5) * 0.08));
      cx.fillStyle = 'rgba(3, 4, 8, ' + dim + ')';
      cx.fillRect(0, 0, W, H);
    }
  }

  // ---------------------------------------------------------------- scene 1
  // Night drive: Phase A (phase < 5) = Mom & Dad talk on EMPTY dark road (NO truck!).
  // Phase B (phase >= 5) = Distant headlights appear -> truck swerves -> head-on crash!
  function drawCar(cx, t, phase, lineT, speaker) {
    phase = phase || 0;
    lineT = lineT || 0;
    const isCrashImpact = phase >= 7;
    const isSwerving = phase === 6;

    // Gentle engine/road vibration during normal drive, escalating shake as the truck closes in
    let shakeX = Math.sin(t * 2.1) * 1.4;
    let shakeY = Math.cos(t * 3.4) * 1.1;
    let plate = null;
    let zoom = 1;

    if (phase < 5) {
      // Phase A: Pure dark empty country road while Mom & Dad talk (zero truck!)
      const cycle = Math.floor(t * 5.5) % 4;
      plate = IMAGES[`intro_s2_f${cycle}`] || IMAGES.intro_panel_2_notruck;
      zoom = 1 + Math.min(phase, 4) * 0.008;
    } else if (phase === 5) {
      // Distant pinpoint headlights suddenly appear around the curve
      plate = IMAGES.intro_s2_f4 || IMAGES.intro_panel_2_notruck;
      zoom = 1.03 + smooth(lineT / 2.5) * 0.02;
      shakeX = Math.sin(t * 8) * 1.8;
    } else if (isSwerving) {
      // Out-of-control truck swerves across our lane: s2_f5 -> s2_f6
      if (lineT < 0.85) {
        plate = IMAGES.intro_s2_f5 || IMAGES.intro_panel_2;
        zoom = 1.04 + smooth(lineT / 0.85) * 0.04;
      } else {
        plate = IMAGES.intro_s2_f6 || IMAGES.intro_panel_2;
        zoom = 1.08 + smooth((lineT - 0.85) / 1.4) * 0.05;
      }
      shakeX = Math.sin(t * 26) * 5;
      shakeY = Math.cos(t * 22) * 3.5;
    } else {
      // Head-on impact & shattered windshield glass
      plate = IMAGES.intro_s2_f7 || IMAGES.intro_panel_2;
      zoom = 1.12;
      shakeX = Math.sin(t * 42) * 8;
      shakeY = Math.cos(t * 38) * 6;
    }

    if (!drawPixelPlate(cx, plate, zoom, shakeX, shakeY)) {
      cx.fillStyle = '#04060d';
      cx.fillRect(0, 0, W, H);
    }

    // Extra continuous pixel motion overlays inside the windshield opening
    if (phase < 5) {
      // Animated receding pixel center-line dashes along the empty dark road
      for (let i = 0; i < 4; i++) {
        const p = (i * 0.25 + t * 0.85) % 1;
        const y = 186 + p * p * 74;
        const w = p < 0.45 ? 3 : 6;
        cx.fillStyle = 'rgba(176, 194, 218, ' + (0.25 + p * 0.5) + ')';
        cx.fillRect(474 - w / 2, Math.round(y), w, Math.round(4 + p * 8));
      }

      // Subtle warm highlight near whichever parent is currently speaking
      if (speaker === 'แม่') {
        const mg = cx.createRadialGradient(290, 260, 10, 290, 260, 140);
        mg.addColorStop(0, 'rgba(240, 200, 140, 0.1)');
        mg.addColorStop(1, 'rgba(240, 200, 140, 0)');
        cx.fillStyle = mg;
        cx.fillRect(140, 120, 300, 280);
      } else if (speaker === 'พ่อ') {
        const fg = cx.createRadialGradient(705, 255, 10, 705, 255, 140);
        fg.addColorStop(0, 'rgba(240, 200, 140, 0.1)');
        fg.addColorStop(1, 'rgba(240, 200, 140, 0)');
        cx.fillStyle = fg;
        cx.fillRect(555, 115, 300, 280);
      }
    } else if (phase === 5) {
      // Pulsing twin distant high-beam flare on the dark curve
      const pulse = 0.55 + Math.sin(t * 14) * 0.25;
      const dg = cx.createRadialGradient(474, 174, 4, 474, 174, 120);
      dg.addColorStop(0, 'rgba(255, 244, 195, ' + (0.38 * pulse) + ')');
      dg.addColorStop(1, 'rgba(255, 210, 120, 0)');
      cx.fillStyle = dg;
      cx.fillRect(320, 80, 320, 190);
    } else if (isSwerving) {
      // Blinding oncoming truck glare flood
      const intensity = smooth(lineT / 1.5);
      const bg = cx.createRadialGradient(475, 200, 20, 475, 200, 340);
      bg.addColorStop(0, 'rgba(255, 248, 218, ' + (0.35 + intensity * 0.25) + ')');
      bg.addColorStop(0.5, 'rgba(255, 224, 150, ' + (0.14 + intensity * 0.12) + ')');
      bg.addColorStop(1, 'rgba(255, 210, 120, 0)');
      cx.fillStyle = bg;
      cx.fillRect(0, 0, W, H);
    }

    // Crisp rain streaks across the windshield glass
    cx.strokeStyle = 'rgba(190, 214, 236, 0.32)';
    cx.lineWidth = 1.5;
    for (let i = 0; i < 42; i++) {
      const rx = 310 + ((hash(i) * 340 + t * 90) % 340);
      const ry = 90 + ((hash(i + 30) * 165 + t * 280) % 165);
      cx.beginPath();
      cx.moveTo(rx, ry);
      cx.lineTo(rx - 4, ry + 12);
      cx.stroke();
    }

    if (isCrashImpact) {
      // Explosive white-amber crash flash that blooms at impact
      const flash = Math.min(0.88, Math.max(0.18, smooth(lineT / 0.85) * 0.82));
      cx.fillStyle = 'rgba(255, 245, 224, ' + flash + ')';
      cx.fillRect(0, 0, W, H);
    }
  }

  // ---------------------------------------------------------------- scene 2
  // Overturned burning car on the asphalt, reaching arm, rising embers, fading into unconsciousness
  function drawCrash(cx, t, phase) {
    const pIdx = Math.min(4, Math.max(0, phase || 0));
    const plate = IMAGES[`intro_s3_f${pIdx}`] || IMAGES.intro_panel_3;
    const zoom = 1.02 + pIdx * 0.015;
    const swayY = Math.sin(t * 2.2) * 2;

    if (!drawPixelPlate(cx, plate, zoom, 0, swayY)) {
      cx.fillStyle = '#060509';
      cx.fillRect(0, 0, W, H);
    }

    // Warm firelight pulse on the right wreck
    const flicker = 0.85 + Math.sin(t * 10.5) * 0.1 + Math.sin(t * 17.3) * 0.05;
    const fireGlow = cx.createRadialGradient(730, 320, 20, 730, 320, 360);
    fireGlow.addColorStop(0, 'rgba(255, 148, 52, ' + (0.28 * flicker) + ')');
    fireGlow.addColorStop(0.5, 'rgba(204, 68, 22, ' + (0.14 * flicker) + ')');
    fireGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    cx.fillStyle = fireGlow;
    cx.fillRect(280, 0, W - 280, H);

    // Continuous rising pixel embers
    for (let i = 0; i < 40; i++) {
      const life = (t * (0.26 + hash(i) * 0.3) + hash(i + 55)) % 1;
      const ex = 510 + hash(i + 14) * 390 + Math.sin(t * 1.6 + i) * 18;
      const ey = 420 - life * 380;
      const sz = i % 3 === 0 ? 4 : 3;
      cx.fillStyle = 'rgba(255, ' + (135 + Math.floor(hash(i + 3) * 95)) + ', 52, ' + ((1 - life) * 0.88) + ')';
      cx.fillRect(Math.round(ex / 2) * 2, Math.round(ey / 2) * 2, sz, sz);
    }

    // Blackout dimming on the final unconsciousness beat
    if (pIdx >= 4) {
      const fade = Math.min(0.75, 0.28 + Math.sin(t * 1.8) * 0.12);
      cx.fillStyle = 'rgba(2, 2, 6, ' + fade + ')';
      cx.fillRect(0, 0, W, H);
    }
  }

  // ---------------------------------------------------------------- scene 3
  // Waking up in the Thai banana grove under the full moon with one flashlight
  function drawGrove(cx, t, phase) {
    const pIdx = Math.min(4, Math.max(0, phase || 0));
    const plate = IMAGES[`intro_s4_f${pIdx}`] || IMAGES.intro_panel_4;
    const zoom = 1 + pIdx * 0.025 + Math.min(t, 12) * 0.002;
    const bobY = Math.sin(t * 2.5) * 1.5;

    if (!drawPixelPlate(cx, plate, zoom, 0, bobY)) {
      cx.fillStyle = '#05090b';
      cx.fillRect(0, 0, W, H);
    }

    // Moonlight mist shimmer
    const moon = cx.createRadialGradient(545, 165, 15, 545, 165, 230);
    moon.addColorStop(0, 'rgba(224, 240, 232, 0.16)');
    moon.addColorStop(1, 'rgba(224, 240, 232, 0)');
    cx.fillStyle = moon;
    cx.fillRect(280, 0, 520, 380);

    // Drifting fireflies in the banana trees
    for (let i = 0; i < 16; i++) {
      const fx = 120 + hash(i + 200) * 720 + Math.sin(t * 1.1 + i * 1.7) * 22;
      const fy = 120 + hash(i + 230) * 290 + Math.cos(t * 0.9 + i * 2.1) * 14;
      const blink = Math.max(0.15, Math.sin(t * 3.4 + i * 2.3) * 0.5 + 0.5);
      cx.fillStyle = 'rgba(218, 250, 128, ' + (blink * 0.78) + ')';
      cx.fillRect(Math.round(fx / 2) * 2, Math.round(fy / 2) * 2, 3, 3);
    }

    // Crisp night rain falling over the jungle path
    cx.strokeStyle = 'rgba(182, 214, 236, 0.34)';
    cx.lineWidth = 1.5;
    for (let i = 0; i < 65; i++) {
      const rx = (hash(i + 900) * W + t * 65) % W;
      const ry = (hash(i + 930) * H + t * 340) % H;
      cx.beginPath();
      cx.moveTo(rx, ry);
      cx.lineTo(rx - 4, ry + 14);
      cx.stroke();
    }
  }

  // ---------------------------------------------------------------- scene 4
  // Stepping out of the banana grove and seeing the veiled Thai house in the rain
  function drawArrival(cx, t, phase) {
    const push = 1 + Math.min(t, 12) * 0.008;
    cx.save();
    cx.imageSmoothingEnabled = false;
    cx.translate(W / 2, H / 2);
    cx.scale(push, push);
    cx.translate(-W / 2, -H / 2);

    if (ready(IMAGES.bg1)) {
      cx.drawImage(IMAGES.bg1, 0, 0, W, H);
    } else {
      cx.fillStyle = '#05080d';
      cx.fillRect(0, 0, W, H);
    }

    // Night storm tint
    cx.fillStyle = 'rgba(4, 7, 14, 0.56)';
    cx.fillRect(0, 0, W, H);

    // Rain streaks
    cx.strokeStyle = 'rgba(186, 214, 236, 0.36)';
    cx.lineWidth = 1.5;
    for (let i = 0; i < 95; i++) {
      const rx = (hash(i + 700) * W + t * 72) % W;
      const ry = (hash(i + 730) * H + t * 420) % H;
      cx.beginPath();
      cx.moveTo(rx, ry);
      cx.lineTo(rx - 4, ry + 16);
      cx.stroke();
    }

    // Protagonist walking toward the lit Thai house with a sweeping flashlight cone
    const walkX = Math.min(285, 118 + t * 18);
    const walkY = 306;
    const sweep = Math.sin(t * 0.9) * 0.08 + 0.34;
    const apexX = walkX + 44;
    const apexY = walkY + 86;

    cx.save();
    cx.translate(apexX, apexY);
    cx.rotate(sweep);
    const beam = cx.createLinearGradient(0, 0, 0, -520);
    beam.addColorStop(0, 'rgba(255, 244, 200, 0.26)');
    beam.addColorStop(1, 'rgba(255, 240, 185, 0)');
    cx.fillStyle = beam;
    cx.beginPath();
    cx.moveTo(-10, 0);
    cx.lineTo(-105, -520);
    cx.lineTo(105, -520);
    cx.lineTo(10, 0);
    cx.closePath();
    cx.fill();
    cx.restore();

    const sprite = characterSprite(Math.floor(t * 7));
    const bob = Math.abs(Math.sin(t * 4.2)) * 2.5;
    if (sprite) {
      cx.drawImage(sprite, walkX - 24, walkY - bob, 92, 142);
    }

    // Eerie ghost dancer silhouette flickering near the house starting on phase 1
    if (phase >= 1) {
      const flick = hash(Math.floor(t * 8)) > 0.72 ? 0.16 : 0.44;
      const gImg = IMAGES['dancerAnim' + (Math.floor(t * 4) % 8)];
      if (ready(gImg)) {
        cx.save();
        cx.globalAlpha = flick;
        cx.drawImage(gImg, 648, 224, 96, 146);
        cx.restore();
      }
    }

    cx.restore();
  }

  // ------------------------------------------------------------------ script (25 continuous beats)
  const LINES = [
    // Scene 0: Funeral (0..4)
    { scene: 0, speaker: '@player', text: 'งานศพคืนสุดท้ายของเพื่อนสนิท... ผมยืนมองรูปหน้าศพของเขานิ่ง ๆ จนธูปในกระถางเผาไหม้เกือบหมดดอก', sfx: 'chime' },
    { scene: 0, speaker: '@player', text: 'ควันธูปลอยคลุ้งในศาลาวัดที่เงียบสงัด แววตาของเพื่อนในรูปถ่ายดูเหมือนมีอะไรบางอย่างอยากจะบอกผมเป็นครั้งสุดท้าย' },
    { scene: 0, speaker: 'แม่', text: 'ดึกมากแล้วนะลูก... เข้าไปกราบลาเพื่อนเสียเถอะ เราต้องขับรถกลับบ้านต่างจังหวัดกันอีกไกล' },
    { scene: 0, speaker: 'พ่อ', text: 'ฝนตั้งเค้ามืดมาแล้วด้วย รีบออกเดินทางตอนนี้ดีกว่า เดี๋ยวทางช่วงผ่านป่าจะยิ่งมืดและขับยาก' },
    { scene: 0, speaker: '@player', text: 'ครับพ่อ ครับแม่... หลับให้สบายนะเพื่อน แล้วสักวันเราคงได้เจอกันอีก' },

    // Scene 1A: Mom & Dad conversation inside the car — EMPTY dark road, NO truck yet! (5..9)
    { scene: 1, speaker: 'บรรยาย', text: 'บนรถเก๋งของครอบครัวท่ามกลางสายฝนยามดึก พ่อขับรถอยู่ฝั่งขวา แม่นั่งข้างซ้าย มองผ่านกระจกหน้าเห็นเพียงถนนลาดยางที่มืดและว่างเปล่า', sfx: 'whisper' },
    { scene: 1, speaker: 'แม่', text: 'ทางเส้นนี้มืดจังเลยนะพ่อ ไฟถนนก็ไม่มีสักดวง... ฝนตกถนนลื่นแบบนี้ค่อย ๆ ขับนะจ๊ะ ไม่ต้องรีบ' },
    { scene: 1, speaker: 'พ่อ', text: 'ไม่ต้องห่วงหรอกแม่ พ่อชินทางเส้นนี้ดี ถนนโล่งไม่มีรถสวนมาเลยสักคัน... อีกไม่เกินชั่วโมงก็ถึงบ้านเราแล้ว' },
    { scene: 1, speaker: 'แม่', text: 'แล้วลูกเป็นยังไงบ้างจ๊ะ นั่งเงียบมาตลอดทางเลย... คงจะเหนื่อยและเสียใจเรื่องงานศพเพื่อนมากสินะลูก' },
    { scene: 1, speaker: '@player', text: 'ผมไม่เป็นไรครับแม่ แค่รู้สึกเพลีย ๆ นิดหน่อย... เดี๋ยวพ้นโค้งป่าข้างหน้านี้ผมว่าจะหลับพักสายตาสักพักครับ' },

    // Scene 1B: Conversation ends -> Truck suddenly appears -> Crash! (10..12)
    { scene: 1, speaker: 'พ่อ', text: 'งั้นลูกเอนหลังหลับได้เลย— เอ๊ะ... เดี๋ยวก่อนนะ นั่นแสงไฟสูงรถอะไรพุ่งอ้อมโค้งมาน่ะ!?', sfx: 'thunder' },
    { scene: 1, speaker: 'แม่', text: 'ว้ายยย!! พ่อระวัง!! รถบรรทุกคันนั้นมันเสียหลักข้ามเลนพุ่งเข้ามาหาเราแล้ว!!', sfx: 'tension' },
    { scene: 1, speaker: 'พ่อ', text: 'หักหลบไม่ทันแล้ว— จับแน่น ๆ นะลูก!! เอี๊ยดดดดดด!! โครมมมมมม!!', sfx: 'scare' },

    // Scene 2: Overturned burning car -> reaching hand -> unconsciousness (13..17)
    { scene: 2, speaker: 'บรรยาย', text: 'แรงกระแทกมหาศาลเหวี่ยงร่างของคุณกระเด็นตกลงมาบนพื้นถนนเย็นเฉียบ เสียงเหล็กบิดงอและกระจกแตกดังก้องอยู่ในหู', sfx: 'heartbeat' },
    { scene: 2, speaker: '@player', text: 'อึก... เจ็บไปทั้งตัวเลย... รถของเราพลิกตะแคงอยู่ตรงนั้น แล้วไฟก็กำลังลุกท่วมซากรถ!' },
    { scene: 2, speaker: '@player', text: 'พ่อครับ! แม่ครับ! ได้ยินผมไหม!? พ่อกับแม่ยังติดอยู่ในรถ... ผมต้องคลานไปช่วย—', sfx: 'heartbeat' },
    { scene: 2, speaker: 'บรรยาย', text: 'คุณพยายามยื่นแขนที่สั่นเทาออกไปข้างหน้า แต่ความร้อนจากเปลวเพลิงและควันไฟพัดโหมเข้าใส่จนแทบหายใจไม่ออก' },
    { scene: 2, speaker: '@player', text: 'ไม่ไหวแล้ว... เปลือกตาหนักเหลือเกิน... พ่อครับ แม่ครับ... (สติสัมปชัญญะทั้งหมดค่อย ๆ ดับวูบลงสู่ความมืดมิด)' },

    // Scene 3: Waking in the Thai banana grove under the moonlight (18..21)
    { scene: 3, speaker: '@player', text: 'เฮือก...! ผมค่อย ๆ ลืมตาตื่นขึ้นมาท่ามกลางกลิ่นดินเปียกชื้นและอากาศที่หนาวเหน็บจับขั้วหัวใจ', sfx: 'whisper' },
    { scene: 3, speaker: '@player', text: 'เดี๋ยวนะ... ซากรถที่ไฟไหม้กับถนนใหญ่หายไปไหนหมด!? ทำไมรอบตัวผมถึงมีแต่ดงต้นกล้วยกับป่ารกทึบใต้แสงจันทร์เต็มดวงแบบนี้' },
    { scene: 3, speaker: '@player', text: 'ในมือมีแค่ไฟฉายกระบอกเดียวที่ยังติดอยู่... พ่อครับ! แม่ครับ! มีใครอยู่แถวนี้ไหมครับ!?' },
    { scene: 3, speaker: 'บรรยาย', text: 'ไม่มีเสียงตอบรับใด ๆ นอกจากเสียงลมพัดใบตองเสียดสีกัน และทางดินแฉะที่มีแอ่งน้ำขังทอดยาวลึกเข้าไปในป่า' },

    // Scene 4: Discovering the haunted Thai house ahead (22..24)
    { scene: 4, speaker: '@player', text: 'พอก้าวเดินพ้นดงกล้วยออกมา... ข้างหน้านั้นมีเรือนไทยไม้สักหลังใหญ่ตั้งอยู่กลางป่า และมีแสงไฟสลัวลอดออกมาจากหน้าต่าง!' },
    { scene: 4, speaker: 'เสียงกระพรวน', text: 'กริ๊ง... กริ๊ง... (เสียงกระพรวนข้อเท้าดังแว่วมาจากเงามืดบนเรือนไทย ราวกับกำลังเชื้อเชิญให้ก้าวเข้าไป)', sfx: 'chime' },
    { scene: 4, speaker: '@player', text: 'ไม่ว่าจะเกิดอะไรขึ้น ผมต้องเข้าไปหาทางขอความช่วยเหลือในเรือนไทยหลังนั้นให้ได้!' }
  ];

  const SCENE_TAGS = [
    '1 / 5 · งานศพเพื่อนสนิท',
    '2 / 5 · บทสนทนาในรถและอุบัติเหตุ',
    '3 / 5 · ซากรถคว่ำและเปลวเพลิง',
    '4 / 5 · ฟื้นตื่นในดงกล้วยป่าไทย',
    '5 / 5 · เรือนไทยปริศนาในความมืด'
  ];

  const SPEAKER_COLORS = {
    'นนท์': '#f0c45a',
    'ริน': '#8fd6c0',
    'พ่อ': '#d8c39a',
    'แม่': '#e6c2ae',
    'บรรยาย': '#b6aa94',
    'เสียงกระพรวน': '#c88a8a'
  };

  const DRAW = [drawAltar, drawCar, drawCrash, drawGrove, drawArrival];
  const TYPE_MS = 22;

  let story = null;

  function els() {
    return {
      root: document.getElementById('story-intro'),
      canvas: document.getElementById('story-canvas'),
      speaker: document.getElementById('story-speaker'),
      line: document.getElementById('story-line'),
      hint: document.getElementById('story-step'),
      tag: document.getElementById('story-scene-tag'),
      progress: document.getElementById('story-progress-fill'),
      pauseBtn: document.getElementById('story-pause-btn')
    };
  }

  function updatePauseButton() {
    if (!story || !story.ui.pauseBtn) return;
    story.ui.pauseBtn.textContent = story.paused ? '▶ เล่นต่อ' : '⏸ หยุดชั่วคราว';
  }

  function playStoryIntro(onDone) {
    const ui = els();
    if (!ui.root || !ui.canvas) {
      if (onDone) onDone();
      return;
    }
    if (typeof state !== 'undefined' && (state.role === 'p1' || state.role === 'p2')) {
      if (onDone) onDone();
      return;
    }
    const cx = ui.canvas.getContext('2d');
    cx.imageSmoothingEnabled = false;

    story = {
      cx,
      ui,
      index: -1,
      scene: -1,
      sceneStart: performance.now(),
      lineStart: performance.now(),
      paused: false,
      pausedAt: 0,
      raf: null,
      onDone,
      finished: false,
      doneAt: 0,
      lineInScene: 0
    };

    ui.root.classList.remove('hidden');
    if (typeof state !== 'undefined') state.flags.cutscenePlaying = true;
    if (typeof initAudio === 'function') initAudio();
    updatePauseButton();

    story.raf = requestAnimationFrame(tick);
    nextStoryLine();
    window.addEventListener('keydown', onStoryKey, true);
  }

  function nextStoryLine() {
    if (!story) return;
    story.index++;
    if (story.index >= LINES.length) return finishStory();

    const line = LINES[story.index];
    if (line.scene !== story.scene) {
      story.scene = line.scene;
      story.sceneStart = performance.now();
      story.ui.tag.textContent = SCENE_TAGS[line.scene] || '';
    }
    if (line.sfx && typeof playSound === 'function') {
      try { playSound(line.sfx, { gain: 0.65 }); } catch (_) {}
    }

    story.lineInScene = LINES.slice(0, story.index).filter((l) => l.scene === line.scene).length;
    story.lineStart = performance.now();
    if (story.paused) story.pausedAt = story.lineStart;

    const speakerName = line.speaker === '@player'
      ? (typeof state !== 'undefined' && state.character === 'female' ? 'ริน' : 'นนท์')
      : line.speaker;
    story.ui.speaker.textContent = speakerName;
    story.ui.speaker.style.color = SPEAKER_COLORS[speakerName] || '#cbbfae';
    story.ui.line.textContent = story.paused ? line.text : '';
    story.ui.hint.textContent = `ซีน ${story.index + 1} / ${LINES.length} · คลิก / E เพื่อไปต่อ`;
    if (story.ui.progress) {
      story.ui.progress.style.width = (((story.index + 1) / LINES.length) * 100).toFixed(1) + '%';
    }
  }

  function prevStoryLine() {
    if (!story || story.finished) return;
    if (story.index <= 0) {
      story.lineStart = performance.now();
      story.sceneStart = story.lineStart;
      return;
    }
    story.index = story.index - 2;
    story.scene = -1;
    nextStoryLine();
  }

  function togglePauseStory() {
    if (!story || story.finished) return;
    const now = performance.now();
    if (!story.paused) {
      story.paused = true;
      story.pausedAt = now;
    } else {
      const pausedDur = now - story.pausedAt;
      story.lineStart += pausedDur;
      story.sceneStart += pausedDur;
      story.paused = false;
    }
    updatePauseButton();
  }

  function tick(now) {
    if (!story || story.finished) return;
    const cx = story.cx;
    const effectiveNow = story.paused ? story.pausedAt : now;
    const sceneTime = (effectiveNow - story.sceneStart) / 1000;
    const lineElapsed = (effectiveNow - story.lineStart) / 1000;
    const line = LINES[story.index];

    cx.fillStyle = '#000';
    cx.fillRect(0, 0, W, H);
    if (DRAW[story.scene]) {
      DRAW[story.scene](cx, sceneTime, story.lineInScene || 0, lineElapsed, line ? line.speaker : '');
    }

    // Soft vignette + cinematic letterbox bars
    const vig = cx.createRadialGradient(W / 2, H / 2, 230, W / 2, H / 2, 640);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.58)');
    cx.fillStyle = vig;
    cx.fillRect(0, 0, W, H);
    cx.fillStyle = 'rgba(0,0,0,0.92)';
    cx.fillRect(0, 0, W, 10);
    cx.fillRect(0, H - 10, W, 10);

    if (line && !story.paused) {
      const elapsed = now - story.lineStart;
      const shown = Math.min(line.text.length, Math.floor(elapsed / TYPE_MS));
      if (story.ui.line.textContent.length !== shown) {
        story.ui.line.textContent = line.text.slice(0, shown);
      }
      const full = 1900 + line.text.length * 52;
      if (elapsed > full) nextStoryLine();
    }
    story.raf = requestAnimationFrame(tick);
  }

  function advanceStory() {
    if (!story || story.finished) return;
    const line = LINES[story.index];
    if (!line) return finishStory();
    if (story.paused) {
      story.paused = false;
      updatePauseButton();
    }
    const shown = story.ui.line.textContent.length;
    if (shown < line.text.length) {
      story.ui.line.textContent = line.text;
      story.lineStart = performance.now() - line.text.length * TYPE_MS - 2200;
      return;
    }
    nextStoryLine();
  }

  function onStoryKey(e) {
    if (!story || story.finished) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finishStory();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      prevStoryLine();
      return;
    }
    if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      e.stopPropagation();
      togglePauseStory();
      return;
    }
    if (e.key === 'e' || e.key === 'E' || e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      advanceStory();
    }
  }

  function finishStory() {
    if (!story || story.finished) return;
    story.finished = true;
    story.doneAt = performance.now();
    cancelAnimationFrame(story.raf);
    window.removeEventListener('keydown', onStoryKey, true);
    story.ui.root.classList.add('hidden');
    if (typeof state !== 'undefined') state.flags.cutscenePlaying = false;
    const done = story.onDone;
    const ui = story.ui;
    story = null;
    if (done) done();
    return ui;
  }

  window.storyIntro = {
    play: playStoryIntro,
    advance: advanceStory,
    prev: prevStoryLine,
    togglePause: togglePauseStory,
    skip: finishStory,
    scenes: DRAW,
    size: { width: W, height: H }
  };
  window.playStoryIntro = playStoryIntro;
  window.advanceStory = advanceStory;
  window.prevStoryLine = prevStoryLine;
  window.togglePauseStory = togglePauseStory;
  window.skipStoryIntro = finishStory;
})();
