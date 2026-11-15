/* ==================== Opening Story Cutscene (6 Scenes / 30 Beats) ==================== */
(() => {
  'use strict';

  const W = 960;
  const H = 540;

  const fallbackImgCache = new Map();
  let introAudioCtx = null;

  function safeAudioCtx() {
    try {
      if (typeof initAudio === 'function') initAudio();
      if (!introAudioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) introAudioCtx = new Ctx();
      }
      if (introAudioCtx && introAudioCtx.state === 'suspended') {
        introAudioCtx.resume().catch(() => {});
      }
      return introAudioCtx;
    } catch {
      return null;
    }
  }

  function safePlaySound(type) {
    try {
      if (typeof playSound === 'function') playSound(type);
    } catch {
      /* Ignore audio unlock failures before user interaction */
    }
  }

  function playAnkleBellChime() {
    safePlaySound('whisper');
    const ctx = safeAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [0, 0.24].forEach((offset) => {
      [2180, 3290, 4120].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = i === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq + offset * 90, now + offset);
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.linearRampToValueAtTime(0.032 / (i + 1), now + offset + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.42);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.45);
      });
    });
  }

  function getImg(key) {
    if (!key) return null;
    if (typeof IMAGES !== 'undefined' && IMAGES && IMAGES[key]) {
      const img = IMAGES[key];
      if (img.complete && img.naturalWidth > 0) return img;
    }
    if (fallbackImgCache.has(key)) {
      const cached = fallbackImgCache.get(key);
      return cached.complete && cached.naturalWidth > 0 ? cached : null;
    }
    if (key.startsWith('intro_') && typeof Image !== 'undefined') {
      const img = new Image();
      img.src = `assets/frames/${key}.png`;
      fallbackImgCache.set(key, img);
      return img.complete && img.naturalWidth > 0 ? img : null;
    }
    return null;
  }

  function getProtagonist() {
    const isFemale = typeof state !== 'undefined' && state && state.character === 'female';
    return isFemale
      ? { name: 'ริน', role: 'female', blip: 'blip_female' }
      : { name: 'นนท์', role: 'male', blip: 'blip_male' };
  }

  function resolveSpeaker(speakerTag) {
    const p = getProtagonist();
    if (speakerTag === 'PROTAGONIST') {
      return { name: p.name, role: p.role, blip: p.blip, css: p.role === 'female' ? 'is-rin' : 'is-non' };
    }
    if (speakerTag === 'แม่') {
      return { name: 'แม่', role: 'mom', blip: 'blip_mom', css: 'is-mom' };
    }
    if (speakerTag === 'พ่อ') {
      return { name: 'พ่อ', role: 'dad', blip: 'blip_dad', css: 'is-dad' };
    }
    if (speakerTag === 'เพื่อนสนิท') {
      return { name: 'เพื่อนสนิท (เสียงในความมืด)', role: 'friend', blip: 'blip_friend', css: 'is-friend' };
    }
    if (speakerTag === 'เสียงกระพรวน') {
      return { name: 'เสียงกระพรวน', role: 'bell', blip: 'blip_friend', css: 'is-bell' };
    }
    return { name: 'บรรยาย', role: 'narrator', blip: 'blip_narrator', css: 'is-narrator' };
  }

  function getLines() {
    const p = getProtagonist();
    const isF = p.role === 'female';
    const selfElder = isF ? 'หนู' : 'ผม';
    const selfMind = isF ? 'ฉัน' : 'ผม';
    const politeAsk = isF ? 'คะ' : 'ครับ';
    const politeTell = isF ? 'ค่ะ' : 'ครับ';
    const callMe = isF ? 'เธอ' : 'นาย';
    const friendCall = isF ? 'ริน' : 'นนท์';

    return [
      // --- Scene 0: Altar & Keepsake ("สัญญาณแรก" หน้าโลง) (Beats 0..4, 5 beats) ---
      {
        scene: 0,
        tag: 'บทนำ ๑/๖ · งานศพเพื่อนสนิท',
        speaker: 'บรรยาย',
        text: 'คืนฝนพรำหลังพิธีสวดอภิธรรม ควันธูปลอยเอื่อยขึ้นจากกระถางหน้าโลงไม้สัก... ท่ามกลางความเงียบที่เหมือนมีอะไรบางอย่างผิดปกติ',
        frame: 'intro_s1_f0',
        slowType: true,
        uneasyLevel: 0.9,
      },
      {
        scene: 0,
        tag: 'บทนำ ๑/๖ · งานศพเพื่อนสนิท',
        speaker: 'PROTAGONIST',
        text: `"...สัญญากันไว้แท้ๆ ว่าจะกลับไปเรียนด้วยกันหลังปิดเทอม... เอ๊ะ เมื่อกี้เหมือนเงาข้างโลงมันสั่นไหวไปเอง..."`,
        frame: 'intro_s1_f1',
        slowType: true,
        uneasyLevel: 1.5,
        sfx: 'whisper',
      },
      {
        scene: 0,
        tag: 'บทนำ ๑/๖ · งานศพเพื่อนสนิท',
        speaker: 'แม่',
        text: `"${friendCall}เอ๊ย... ทำไมทำหน้าตกใจแบบนั้นลูก ทางวัดเขามอบไฟฉายกระบอกนี้ไว้ให้ แม่เห็นอยู่บนหิ้งเลยเอามาให้ลูกเก็บไว้นะ"`,
        frame: 'intro_s1_f2',
        slowType: true,
        uneasyLevel: 1.8,
      },
      {
        scene: 0,
        tag: 'บทนำ ๑/๖ · งานศพเพื่อนสนิท',
        speaker: 'บรรยาย',
        text: `ไฟฉายพกพาสีทึมกับด้ายสายสิญจน์ขมวดปมติดข้อมือ... ขณะควันธูปสายสุดท้ายค่อยๆ จางหายไปในอากาศเย็นชื้นของคืนฝนพรำ`,
        frame: 'intro_s1_f4',
        showKeepsake: true,
        slowType: true,
        uneasyLevel: 2.0,
        fadeSmoke: 0.45,
      },
      {
        scene: 0,
        tag: 'บทนำ ๑/๖ · งานศพเพื่อนสนิท',
        speaker: 'PROTAGONIST',
        text: `"ขอบคุณ${politeTell}... ต่อให้มืดแค่ไหน ${selfElder}จะเก็บไฟฉายกับสายสิญจน์เส้นนี้ติดตัวไว้ตลอดไป${politeTell} — แต่ทำไมทั้งที่ควันธูปจางหายไปแล้ว ยังรู้สึกหนาวเหมือนมีสายตาจ้องมาจากข้างหลัง..."`,
        frame: 'intro_s1_f5',
        showKeepsake: true,
        slowType: true,
        uneasyLevel: 2.4,
        fadeSmoke: 1.0,
      },

      // --- Scene 1: Backseat Perspective & Escalating Dread (Beats 5..12, 8 beats) ---
      {
        scene: 1,
        tag: 'บทนำ ๒/๖ · เบาะหลังกลางดึก',
        speaker: 'บรรยาย',
        text: 'ขากลับบ้านกลางดึก เสียงล้อบดถนนเปียกดังดิบๆ ใต้ท้องรถ ในกระจกมองหลังมีเพียงเงาในห้องโดยสารที่สั่นตามแรงถนนมืด',
        frame: 'intro_s2_f0',
        wipers: true,
        roadRumble: true,
        mirrorMode: 'cabin',
      },
      {
        scene: 1,
        tag: 'บทนำ ๒/๖ · เบาะหลังกลางดึก',
        speaker: 'พ่อ',
        text: `"ฝนตกทางมืดหน่อยนะลูก คาดเข็มขัดดีๆ..." เสียงโทรศัพท์พ่อสั่นครืดตรงคอนโซล แสงจอวูบสะท้อนกระจกมองหลังก่อนดับวูบ`,
        frame: 'intro_s2_f1',
        wipers: true,
        sfx: 'phone_vibe',
        roadRumble: true,
        mirrorMode: 'phone',
      },
      {
        scene: 1,
        tag: 'บทนำ ๒/๖ · เบาะหลังกลางดึก',
        speaker: 'แม่',
        text: `"คืนนี้ง่วงก็พักสายตาเถอะลูก... เอ๊ะ ในกระจกนั่นแสงไฟท้ายสีแดงของใครวะ แวบอยู่หลังโค้งแล้วก็หายไป..."`,
        frame: 'intro_s2_f2',
        wipers: true,
        roadRumble: true,
        mirrorMode: 'red_flicker',
      },
      {
        scene: 1,
        tag: 'บทนำ ๒/๖ · เบาะหลังกลางดึก',
        speaker: 'PROTAGONIST',
        text: `"แม่${politeAsk}... ดูในกระจกนั่นสิ ข้างหลังไกลๆ เหมือนมีประกายไฟต่ำๆ กระพริบตามมา... แต่มองไม่ออกเลยว่าเป็นอะไร"`,
        frame: 'intro_s2_f3',
        wipers: true,
        roadRumble: true,
        mirrorMode: 'low_sparks',
      },
      {
        scene: 1,
        tag: 'บทนำ ๒/๖ · เบาะหลังกลางดึก',
        speaker: 'แม่',
        text: `"พ่อ! เงาในกระจกกับโค้งข้างหน้ามันขยายใหญ่ขึ้นเรื่อยๆ แล้ว!! นั่นไฟอะไรพุ่งทะลุความมืดเข้ามาฝั่งเรา?!"`,
        frame: 'intro_s2_f4',
        wipers: true,
        mirrorMode: 'expanding_glare',
      },
      {
        scene: 1,
        tag: 'บทนำ ๒/๖ · เบาะหลังกลางดึก',
        speaker: 'พ่อ',
        text: `"เฮ้ย! รถบรรทุกเปิดไฟสูงเสียหลักแหกโค้งเข้ามาแล้ว!! จับเบาะไว้แน่นๆ!!"`,
        frame: 'intro_s2_f5',
        sfx: 'horn',
        shake: 9,
        mirrorMode: 'blinding',
      },
      {
        scene: 1,
        tag: 'บทนำ ๒/๖ · เบาะหลังกลางดึก',
        speaker: 'PROTAGONIST',
        text: `"พ่อ${politeAsk}!! แสงไฟสูงมันสว่างจ้ากลืนกระจกหมดแล้ว—ระวัง——!!"`,
        frame: 'intro_s2_f6',
        shake: 17,
        mirrorMode: 'blinding',
      },
      {
        scene: 1,
        tag: 'บทนำ ๒/๖ · เบาะหลังกลางดึก',
        speaker: 'บรรยาย',
        text: 'โครม!! ลำแสงไฟสูงระเบิดสว่างวาบกลืนทุกอย่าง พร้อมเสียงเหล็กบิดเบี้ยวและกระจกหน้าที่แตกกระจายในเสี้ยววินาที...',
        frame: 'intro_s2_f7',
        sfx: 'crash_hit',
        shake: 24,
        flashWhite: true,
      },

      // --- Scene 2: Pre-Blackout Bridge (Beats 13..16, 4 beats) ---
      {
        scene: 2,
        tag: 'บทนำ ๓/๖ · ก่อนลมหายใจขาดห้วง',
        speaker: 'บรรยาย',
        text: 'กลิ่นน้ำมันปนกลิ่นฝนคลุ้งบนพื้นถนนเปียกแฉะ เปลวไฟลุกโชนข้างซากรถที่พลิกตะแคงอยู่ด้านหลัง',
        frame: 'intro_s3_f0',
      },
      {
        scene: 2,
        tag: 'บทนำ ๓/๖ · ก่อนลมหายใจขาดห้วง',
        speaker: 'PROTAGONIST',
        text: `"อึก... พ่อ... แม่... ร่างกายมันหนักจนขยับไม่ไหว... แต่ตรงนั้น... นั่นมัน..."`,
        frame: 'intro_s3_f1',
        showDroppedKeepsake: true,
      },
      {
        scene: 2,
        tag: 'บทนำ ๓/๖ · ก่อนลมหายใจขาดห้วง',
        speaker: 'บรรยาย',
        text: 'นิ้วที่ชาด้านเอื้อมไปกำไฟฉายของเพื่อนที่กระเด็นตกอยู่ข้างมือ ด้ายสายสิญจน์บนข้อมือส่องประกายทองจางๆ ท่ามกลางเงาไฟ',
        frame: 'intro_s3_f2',
        showDroppedKeepsake: true,
      },
      {
        scene: 2,
        tag: 'บทนำ ๓/๖ · ก่อนลมหายใจขาดห้วง',
        speaker: 'PROTAGONIST',
        text: `"อย่าเพิ่ง... หลับตาสิ... ช่วยด้วย..." เปลือกตาหนักอึ้งค่อยๆ ปิดลงพร้อมเสียงไฟไหม้ที่จางหายไปในความมืดสนิท`,
        frame: 'intro_s3_f4',
        closingEyes: true,
      },

      // --- Scene 3: NEW Unconscious Limbo Bridge (Beats 17..21, 5 beats) ---
      {
        scene: 3,
        tag: 'บทนำ ๔/๖ · ห้วงจิตระหว่างความเป็นตาย',
        speaker: 'บรรยาย',
        text: 'ไม่มีเสียงถนน ไม่มีเปลวไฟ และไม่มีความเจ็บปวด... รอบกายมีเพียงความมืดว่างเปล่ากับละอองเส้นด้ายสีทองที่ลอยนิ่ง',
        sfx: 'whisper',
      },
      {
        scene: 3,
        tag: 'บทนำ ๔/๖ · ห้วงจิตระหว่างความเป็นตาย',
        speaker: 'เพื่อนสนิท',
        text: `"${friendCall}... ได้ยินเสียงเราไหม? ...ดีนะที่ด้ายสายสิญจน์กับไฟฉายเส้นนี้ช่วยรั้งดวงจิตของ${callMe}เอาไว้ทัน"`,
      },
      {
        scene: 3,
        tag: 'บทนำ ๔/๖ · ห้วงจิตระหว่างความเป็นตาย',
        speaker: 'PROTAGONIST',
        text: `"เสียงนายเหรอ?! เกิดอะไรขึ้น... เมื่อกี้รถเพิ่งคว่ำ ทำไม${selfMind}ถึงมาอยู่ที่มืดๆ แบบนี้ล่ะ?"`,
      },
      {
        scene: 3,
        tag: 'บทนำ ๔/๖ · ห้วงจิตระหว่างความเป็นตาย',
        speaker: 'เพื่อนสนิท',
        text: `"แรงปะทะเมื่อกี้ทำให้จิตของ${callMe}หลุดออกมาติดอยู่ที่เขตแดนกึ่งกลาง... ที่นี่มันดูดวิญญาณคนหลงทางเข้าไปในเรือนเก่าริมป่า"`,
      },
      {
        scene: 3,
        tag: 'บทนำ ๔/๖ · ห้วงจิตระหว่างความเป็นตาย',
        speaker: 'เพื่อนสนิท',
        text: `"สายสิญจน์เส้นนี้คือสายใยเดียวที่ยึด${callMe}ไว้กับโลกจริง จงกำไฟฉายในมือให้แน่น... แล้วลืมตาตื่นขึ้นมาเดี๋ยวนี้!"`,
        flashGoldWake: true,
      },

      // --- Scene 4: Post-Wakeup Bridge (Beats 22..25, 4 beats) ---
      {
        scene: 4,
        tag: 'บทนำ ๕/๖ · ฟื้นกลางดงต้นกล้วย',
        speaker: 'PROTAGONIST',
        text: `"เฮือก!! แค่ก... แค่ก...! ที่นี่... ที่ไหนกัน?!" ลมหายใจหอบถี่เมื่อสะดุ้งตื่นขึ้นมากลางป่าดงดิบชื้น`,
        frame: 'intro_s4_f0',
        openingEyes: true,
      },
      {
        scene: 4,
        tag: 'บทนำ ๕/๖ · ฟื้นกลางดงต้นกล้วย',
        speaker: 'บรรยาย',
        text: 'ไม่มีซากรถยนต์ ไม่มีเสียงไซเรนกู้ภัย หรือร่องรอยบาดแผลใดๆ เหลืออยู่ มีเพียงแสงจันทร์เหนือดงต้นกล้วยและแอ่งโคลนเปียกแฉะ',
        frame: 'intro_s4_f1',
        heldFlashlight: true,
      },
      {
        scene: 4,
        tag: 'บทนำ ๕/๖ · ฟื้นกลางดงต้นกล้วย',
        speaker: 'PROTAGONIST',
        text: `"ไฟฉายของเพื่อน... ยังอยู่ในมือ${selfMind}จริงๆ ด้วย! แล้วสายสิญจน์ที่ข้อมือนี่ก็ยังอยู่..."`,
        frame: 'intro_s4_f2',
        heldFlashlight: true,
      },
      {
        scene: 4,
        tag: 'บทนำ ๕/๖ · ฟื้นกลางดงต้นกล้วย',
        speaker: 'เพื่อนสนิท',
        text: `"อย่าเพิ่งตื่นตระหนกไปเลยนะ... เดินตามแสงไฟฉายไปข้างหน้า เราต้องหาทางกลับเข้าร่างให้ได้ก่อนฟ้าสาง!"`,
        frame: 'intro_s4_f3',
        heldFlashlight: true,
      },

      // --- Scene 5: Haunted Mansion Arrival (Beats 26..29, 4 beats) ---
      {
        scene: 5,
        tag: 'บทนำ ๖/๖ · เรือนซ่อนวิญญาณ',
        speaker: 'บรรยาย',
        text: 'ปลายลำแสงไฟฉายส่องทะลุม่านหมอกและใบกล้วยออกไป เผยให้เห็นโครงสร้างเรือนไม้ทรงไทยเก่าแก่ตั้งตระหง่านอย่างโดดเดี่ยว',
        frame: 'intro_s4_f4',
        heldFlashlight: true,
      },
      {
        scene: 5,
        tag: 'บทนำ ๖/๖ · เรือนซ่อนวิญญาณ',
        speaker: 'PROTAGONIST',
        text: `"เรือนไม้หลังนั้น... ทำไมบรรยากาศมันเย็นยะเยือกแบบนี้ เหมือนมีใครกำลังจ้องมองลงมาจากข้างบน..."`,
        frame: 'intro_panel_4',
      },
      {
        scene: 5,
        tag: 'บทนำ ๖/๖ · เรือนซ่อนวิญญาณ',
        speaker: 'เสียงกระพรวน',
        text: `"กรุ๊ง... กริ๊ง... กรุ๊ง... กริ๊ง..." เสียงโลหะกระทบกันเป็นจังหวะเชื่องช้าดังแว่วออกมาจากโถงมืดใต้เรือนไม้`,
        sfx: 'bell_whisper',
      },
      {
        scene: 5,
        tag: 'บทนำ ๖/๖ · เรือนซ่อนวิญญาณ',
        speaker: 'เพื่อนสนิท',
        text: `"ระวังตัวด้วยนะ... ประตูทางออกอยู่ที่เรือนหลังนั้น เดี๋ยวเราจะคอยกระซิบบอกทางให้ เดินก้าวเข้าไปเถอะ!"`,
      },
    ];
  }

  /* -------------------- Shared Pixel Art Drawing Helpers -------------------- */
  function drawCoverFrame(ctx, img, t, { zoom = 1, panX = 0, panY = 0, shakeX = 0, shakeY = 0, alpha = 1 } = {}) {
    if (!img) return false;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const scale = Math.max(W / iw, H / ih) * zoom;
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (W - dw) * 0.5 + panX + shakeX;
    const dy = (H - dh) * 0.5 + panY + shakeY;
    ctx.drawImage(img, Math.round(dx), Math.round(dy), Math.round(dw), Math.round(dh));
    ctx.restore();
    return true;
  }

  function drawSaiSinGlow(ctx, x, y, t, scale = 1, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const pulse = 0.72 + Math.sin(t * 4.2) * 0.25;
    const g = ctx.createRadialGradient(x, y, 2, x, y, 28 * scale);
    g.addColorStop(0, `rgba(255, 232, 150, ${0.42 * pulse})`);
    g.addColorStop(1, 'rgba(255, 200, 90, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 28 * scale, 0, Math.PI * 2);
    ctx.fill();

    // Knotted white-gold sai-sin loop
    ctx.strokeStyle = '#fff5d4';
    ctx.lineWidth = Math.max(2, 3 * scale);
    ctx.beginPath();
    ctx.ellipse(x, y, 12 * scale, 7 * scale, -0.25, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#ffd56b';
    ctx.lineWidth = Math.max(1.5, 2 * scale);
    ctx.beginPath();
    ctx.moveTo(x - 6 * scale, y + 6 * scale);
    ctx.lineTo(x - 15 * scale, y + 14 * scale);
    ctx.moveTo(x + 4 * scale, y + 7 * scale);
    ctx.lineTo(x + 12 * scale, y + 15 * scale);
    ctx.stroke();
    ctx.restore();
  }

  function drawPocketFlashlight(ctx, x, y, scale = 1, lit = false, t = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.32);
    ctx.scale(scale, scale);
    // Dark outline
    ctx.fillStyle = '#0c0d10';
    ctx.fillRect(-16, -6, 32, 12);
    // Metal barrel
    ctx.fillStyle = '#3c4552';
    ctx.fillRect(-14, -4, 20, 8);
    ctx.fillStyle = '#606d80';
    ctx.fillRect(-14, -4, 20, 3);
    // Brass bezel & lens
    ctx.fillStyle = '#7e6a42';
    ctx.fillRect(6, -5, 8, 10);
    ctx.fillStyle = lit ? '#fff5c4' : '#9eb0bf';
    ctx.fillRect(13, -4, 2, 8);
    // Switch
    ctx.fillStyle = '#b9443c';
    ctx.fillRect(-4, -5, 4, 2);
    ctx.restore();

    if (lit) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const flicker = 0.88 + Math.sin(t * 7.5) * 0.08;
      const beam = ctx.createRadialGradient(x + 18 * scale, y - 6 * scale, 4, x + 180 * scale, y - 60 * scale, 220 * scale);
      beam.addColorStop(0, `rgba(255, 238, 180, ${0.38 * flicker})`);
      beam.addColorStop(0.5, `rgba(255, 222, 145, ${0.14 * flicker})`);
      beam.addColorStop(1, 'rgba(255, 210, 120, 0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(x + 10 * scale, y - 6 * scale);
      ctx.lineTo(x + 320 * scale, y - 160 * scale);
      ctx.lineTo(x + 340 * scale, y + 60 * scale);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawVignette(ctx, alpha = 0.55) {
    const v = ctx.createRadialGradient(W * 0.5, H * 0.48, H * 0.25, W * 0.5, H * 0.5, W * 0.68);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, `rgba(0,0,0,${alpha})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  /* -------------------- 6 Scene Canvas Drawers -------------------- */
  function drawAltar(ctx, line, t, beatProgress, meta) {
    ctx.fillStyle = '#090707';
    ctx.fillRect(0, 0, W, H);

    const uneasy = line.uneasyLevel || 1;
    // Irregular nervous micro-tremor & occasional startled periphery jolt
    const flinch = Math.sin(t * 2.15 + 1.1) > 0.91 ? Math.sin(t * 47) * 3.2 : 0;
    const shiverX = Math.sin(t * 17.3) * Math.cos(t * 6.9) * (0.9 * uneasy) + flinch;
    const shiverY = Math.sin(t * 13.1) * (0.55 * uneasy);

    const img = getImg(line.frame || 'intro_s1_f0') || getImg('intro_panel_1');
    const zoom = 1.03 + beatProgress * 0.04;
    drawCoverFrame(ctx, img, t, { zoom, panX: shiverX * 0.45, panY: Math.sin(t * 0.7) * 2 + shiverY * 0.4 });

    // Restless moving player silhouette/shadow (casts across left floor & subtly glances left-right)
    ctx.save();
    const glance = Math.sin(t * 0.95) * 7 + (Math.sin(t * 2.8) > 0.9 ? Math.sin(t * 36) * 2.5 : 0);
    const sx = W * 0.16 + shiverX * 1.3;
    const sy = H * 0.72 + shiverY;
    // Long creeping shadow behind player along temple wall/floor
    ctx.fillStyle = `rgba(3, 2, 4, ${0.46 + uneasy * 0.1})`;
    ctx.beginPath();
    ctx.ellipse(sx - 24 + glance * 1.4, sy + 95, 58 + uneasy * 6, 22, -0.18, 0, Math.PI * 2);
    ctx.fill();
    // Moving player shoulder/head shadow silhouette trembling unevenly
    ctx.fillStyle = 'rgba(10, 8, 12, 0.72)';
    ctx.fillRect(Math.round((sx - 34) / 2) * 2, Math.round((sy - 20) / 2) * 2, 68, 110);
    // Turning head silhouette glancing side-to-side nervously
    ctx.fillRect(Math.round((sx - 18 + glance) / 2) * 2, Math.round((sy - 62) / 2) * 2, 34, 38);
    // Eerie periphery shadow flicker near background doorway ("สัญญาณแรก" something off behind)
    if (uneasy >= 1.4 && (Math.sin(t * 3.7) > 0.65)) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(W * 0.05, H * 0.16, 46, 175);
    }
    ctx.restore();

    // Flickering incense & candle glow (dims subtly as incense smoke fades out)
    const elapsed = meta ? meta.lineElapsed : t;
    const smokeOpacity = line.fadeSmoke
      ? Math.max(0, 1 - (line.fadeSmoke * 0.45 + (elapsed / 2.9) * line.fadeSmoke))
      : 1;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const candle = 0.62 + Math.sin(t * 6.5) * 0.2 + Math.cos(t * 11) * 0.1;
    const cg = ctx.createRadialGradient(W * 0.6, H * 0.48, 8, W * 0.6, H * 0.48, 220);
    cg.addColorStop(0, `rgba(255, 190, 92, ${0.22 * candle * (0.4 + 0.6 * smokeOpacity)})`);
    cg.addColorStop(1, 'rgba(255, 140, 40, 0)');
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, W, H);

    // Slow billowing incense smoke plumes rising gently while typing, then vanishing into damp air
    if (smokeOpacity > 0.02) {
      for (let i = 0; i < 20; i++) {
        const riseSpeed = 16 + (i % 3) * 4;
        const cycle = (t * riseSpeed + i * 19) % 240;
        const cy = H * 0.65 - cycle;
        const cx = W * 0.56 + Math.sin(t * 1.15 + i * 0.65 + cycle * 0.02) * (5 + cycle * 0.075);
        const edgeFade = Math.max(0, 1 - cycle / 240);
        const a = edgeFade * 0.22 * smokeOpacity;
        ctx.fillStyle = `rgba(220, 224, 232, ${a})`;
        const sz = cycle > 120 ? 8 : 6;
        ctx.fillRect(Math.round(cx / 2) * 2, Math.round(cy / 2) * 2, sz, sz);
      }
    }
    ctx.restore();

    if (line.showKeepsake) {
      // Keepsake spotlight inset box in lower-right showing flashlight + sai-sin
      const bx = W - 220;
      const by = H - 118;
      ctx.save();
      ctx.fillStyle = 'rgba(12, 9, 8, 0.86)';
      ctx.strokeStyle = 'rgba(240, 196, 90, 0.7)';
      ctx.lineWidth = 2;
      ctx.fillRect(bx, by, 196, 96);
      ctx.strokeRect(bx, by, 196, 96);
      drawPocketFlashlight(ctx, bx + 76, by + 48, 2.2, false, t);
      drawSaiSinGlow(ctx, bx + 144, by + 50, t, 1.35, 1);
      ctx.fillStyle = '#f2deb3';
      ctx.font = 'bold 12px "Chakra Petch", sans-serif';
      ctx.fillText('ของดูต่างหน้า · ไฟฉาย + สายสิญจน์', bx + 12, by + 20);
      ctx.restore();
    }

    drawVignette(ctx, 0.54 + uneasy * 0.04);
  }

  function drawRearviewMirror(ctx, line, t, meta) {
    const mode = line.mirrorMode;
    if (!mode) return;

    const elapsed = meta ? meta.lineElapsed : 0;
    // Mirror gradually enlarges as the distant sparks turn into oncoming high-beams
    const expand = mode === 'expanding_glare'
      ? Math.min(1.42, 1.0 + elapsed * 0.14)
      : (mode === 'blinding' ? 1.44 : 1.0);
    const mw = Math.round(236 * expand);
    const mh = Math.round(64 * expand);
    const mx = Math.round(W * 0.5 - mw * 0.5 + Math.sin(t * 21) * 1.1);
    const my = Math.round(22 + Math.cos(t * 15) * 1.2);

    ctx.save();
    // Mirror stalk & dark casing
    ctx.fillStyle = '#090b10';
    ctx.fillRect(Math.round(W * 0.5 - 8), 0, 16, my + 4);
    ctx.fillStyle = '#151924';
    ctx.strokeStyle = 'rgba(195, 206, 224, 0.42)';
    ctx.lineWidth = 2;
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeRect(mx, my, mw, mh);

    // Clip to mirror glass pane
    ctx.beginPath();
    ctx.rect(mx + 4, my + 4, mw - 8, mh - 8);
    ctx.clip();

    // Dark rear road reflection inside mirror
    ctx.fillStyle = '#050811';
    ctx.fillRect(mx + 4, my + 4, mw - 8, mh - 8);
    ctx.fillStyle = '#0b101c';
    ctx.fillRect(mx + 4, my + mh * 0.48, mw - 8, mh * 0.52);

    if (mode === 'cabin' || mode === 'phone') {
      // Dim cabin silhouettes (Mom left, Dad right) vibrating slightly
      ctx.fillStyle = '#121622';
      ctx.fillRect(mx + 22, my + 24, 28, 36);
      ctx.fillRect(mx + mw - 52, my + 22, 30, 38);
      if (mode === 'phone') {
        // Dad's vibrating phone screen flashing amber-cyan notification in reflection
        const pulse = 0.4 + Math.abs(Math.sin(t * 14)) * 0.6;
        ctx.fillStyle = `rgba(125, 215, 255, ${0.55 * pulse})`;
        ctx.fillRect(mx + mw * 0.52, my + mh - 18, 16, 10);
        ctx.fillStyle = `rgba(255, 210, 130, ${0.25 * pulse})`;
        ctx.fillRect(mx + 6, my + 6, mw - 12, mh - 12);
      }
    } else if (mode === 'red_flicker') {
      // Faint ambiguous red reflection flickering dimly at rear bend
      const redPulse = Math.max(0, Math.sin(t * 4.8) * Math.cos(t * 2.1));
      if (redPulse > 0.15) {
        const rg = ctx.createRadialGradient(mx + mw * 0.48, my + mh * 0.52, 2, mx + mw * 0.48, my + mh * 0.52, 42);
        rg.addColorStop(0, `rgba(255, 72, 72, ${0.65 * redPulse})`);
        rg.addColorStop(1, 'rgba(180, 20, 20, 0)');
        ctx.fillStyle = rg;
        ctx.fillRect(mx, my, mw, mh);
      }
    } else if (mode === 'low_sparks') {
      // Indeterminate tiny low sparks / red-orange pinpricks trembling in the mirror (not yet a truck)
      const jitter = Math.sin(t * 19) * 2;
      const flicker = 0.55 + Math.sin(t * 11.5) * 0.4;
      const cy = my + mh * 0.62;
      ctx.fillStyle = `rgba(255, 110, 64, ${0.75 * flicker})`;
      ctx.fillRect(Math.round(mx + mw * 0.44 + jitter), Math.round(cy), 4, 4);
      ctx.fillRect(Math.round(mx + mw * 0.53 + jitter), Math.round(cy + 2), 4, 4);
      ctx.fillStyle = `rgba(255, 232, 160, ${0.55 * flicker})`;
      ctx.fillRect(Math.round(mx + mw * 0.48 + jitter), Math.round(cy - 1), 3, 3);
    } else if (mode === 'expanding_glare' || mode === 'blinding') {
      // Sparks swell into twin blinding high-beam headlamps towering across the mirror
      const grow = mode === 'blinding' ? 1.0 : Math.min(1.0, 0.25 + elapsed * 0.28);
      const r = 10 + grow * 54;
      [0.37, 0.63].forEach((xr) => {
        const g = ctx.createRadialGradient(mx + mw * xr, my + mh * 0.54, 2, mx + mw * xr, my + mh * 0.54, r);
        g.addColorStop(0, `rgba(255, 255, 240, ${0.95})`);
        g.addColorStop(0.35, `rgba(255, 224, 130, ${0.72 * grow})`);
        g.addColorStop(1, 'rgba(255, 180, 70, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(mx, my, mw, mh);
      });
    }

    ctx.restore();
  }

  function drawCar(ctx, line, t, beatProgress, meta) {
    ctx.fillStyle = '#04060b';
    ctx.fillRect(0, 0, W, H);

    const img = getImg(line.frame || 'intro_s2_f0') || getImg('intro_panel_2_notruck');
    const roadBump = Math.sin(t * 14) * 1.6 + Math.cos(t * 8.2) * 1.2;
    const shakeMag = line.shake || 0;
    const sx = shakeMag ? (Math.sin(t * 48) * shakeMag * (1 - beatProgress * 0.45)) : 0;
    const sy = shakeMag ? (Math.cos(t * 53) * shakeMag * 0.7) : roadBump;

    // Raw wet tyre road rumble SFX periodically during drive buildup
    if (line.roadRumble && meta) {
      const rumbleTick = Math.floor(t / 1.75);
      if (meta.lastRumbleTick !== rumbleTick) {
        meta.lastRumbleTick = rumbleTick;
        safePlaySound('road_rumble');
      }
    }

    drawCoverFrame(ctx, img, t, { zoom: 1.03, shakeX: sx, shakeY: sy });

    // Driving rain streaks across windshield
    ctx.save();
    ctx.fillStyle = 'rgba(180, 210, 245, 0.24)';
    for (let i = 0; i < 36; i++) {
      const rx = ((i * 73 + t * 140) % W);
      const ry = ((i * 119 + t * 520) % H);
      ctx.fillRect(Math.round(rx / 2) * 2, Math.round(ry / 2) * 2, 2, 16);
    }
    ctx.restore();

    // Animated windshield wipers + wiper SFX on beats with wipers: true
    if (line.wipers) {
      const sweepPhase = (t * 1.35) % (Math.PI * 2);
      const sweepAngle = Math.sin(sweepPhase) * 0.62 - 0.15;
      const halfCycle = Math.floor((t * 1.35) / Math.PI);
      if (meta && meta.lastWiperCycle !== halfCycle) {
        meta.lastWiperCycle = halfCycle;
        safePlaySound('wiper');
      }

      ctx.save();
      ctx.strokeStyle = 'rgba(18, 22, 30, 0.88)';
      ctx.lineWidth = 7;
      ctx.lineCap = 'square';
      [[W * 0.34, H * 0.56], [W * 0.65, H * 0.56]].forEach(([px, py]) => {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.sin(sweepAngle) * 155, py - Math.cos(sweepAngle) * 125);
        ctx.stroke();
      });
      ctx.restore();
    }

    // Subtle low sparks / headlights growth on Beat 8-9 ahead on dark curve before truck appears
    if (line.mirrorMode === 'low_sparks') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const flk = 0.5 + Math.sin(t * 12) * 0.35;
      ctx.fillStyle = `rgba(255, 118, 60, ${0.55 * flk})`;
      ctx.fillRect(Math.round(W * 0.49), Math.round(H * 0.36), 4, 4);
      ctx.fillRect(Math.round(W * 0.51), Math.round(H * 0.36), 4, 4);
      ctx.restore();
    }

    // Blinding high-beam flare on Beat 10-11
    if (line.frame === 'intro_s2_f5' || line.frame === 'intro_s2_f6') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.72 + Math.sin(t * 18) * 0.22;
      const beamRadius = line.frame === 'intro_s2_f6' ? 430 : 340;
      const g = ctx.createRadialGradient(W * 0.5, H * 0.38, 12, W * 0.5, H * 0.38, beamRadius);
      g.addColorStop(0, `rgba(255, 250, 224, ${0.62 * pulse})`);
      g.addColorStop(0.45, `rgba(255, 225, 130, ${0.28 * pulse})`);
      g.addColorStop(1, 'rgba(255, 190, 90, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // Draw rearview mirror sequence on top center
    drawRearviewMirror(ctx, line, t, meta);

    // Impact white flash fading into dark crack overlay on Beat 12
    if (line.flashWhite) {
      const flashAlpha = Math.max(0, 0.85 - meta.lineElapsed * 1.5);
      if (flashAlpha > 0.01) {
        ctx.fillStyle = `rgba(255, 248, 232, ${flashAlpha})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    drawVignette(ctx, 0.45);
  }

  function drawCrash(ctx, line, t, beatProgress, meta) {
    ctx.fillStyle = '#070404';
    ctx.fillRect(0, 0, W, H);

    const img = getImg(line.frame || 'intro_s3_f0') || getImg('intro_panel_3');
    drawCoverFrame(ctx, img, t, { zoom: 1.03 + beatProgress * 0.03, panX: Math.sin(t * 0.5) * 4 });

    // Crackling bonfire embers
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 24; i++) {
      const ex = W * 0.65 + ((i * 39 + Math.sin(t * 3 + i) * 35) % 240) - 80;
      const ey = H * 0.78 - ((t * (75 + (i % 4) * 18) + i * 31) % 320);
      const size = (i % 3 === 0) ? 4 : 3;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 195, 70, 0.72)' : 'rgba(255, 110, 40, 0.65)';
      ctx.fillRect(Math.round(ex / 2) * 2, Math.round(ey / 2) * 2, size, size);
    }
    ctx.restore();

    if (line.showDroppedKeepsake) {
      const pulse = 0.75 + Math.sin(t * 5) * 0.25;
      drawPocketFlashlight(ctx, W * 0.36, H * 0.76, 1.9, false, t);
      drawSaiSinGlow(ctx, W * 0.30, H * 0.82, t, 1.25, pulse);
    }

    // Pre-blackout eyelids closing smoothly on Beat 16
    if (line.closingEyes) {
      const closeAmt = Math.min(0.96, 0.22 + meta.lineElapsed * 0.36);
      const barH = (H * 0.5) * closeAmt;
      ctx.fillStyle = '#020203';
      ctx.fillRect(0, 0, W, barH);
      ctx.fillRect(0, H - barH, W, barH);
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.75, closeAmt * 0.8)})`;
      ctx.fillRect(0, 0, W, H);
    }

    drawVignette(ctx, 0.58);
  }

  function drawLimbo(ctx, line, t, beatProgress, meta) {
    // Deep unconscious spirit threshold pitch-void with golden sai-sin filaments
    ctx.fillStyle = '#040307';
    ctx.fillRect(0, 0, W, H);

    // Subtle spectral mist halo in center
    ctx.save();
    const bgGlow = ctx.createRadialGradient(W * 0.5, H * 0.45, 24, W * 0.5, H * 0.45, 360);
    bgGlow.addColorStop(0, 'rgba(62, 52, 24, 0.42)');
    bgGlow.addColorStop(0.55, 'rgba(24, 28, 42, 0.25)');
    bgGlow.addColorStop(1, 'rgba(4, 3, 7, 0)');
    ctx.fillStyle = bgGlow;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // Flowing woven golden sai-sin thread connecting protagonist silhouette (left) and friend spirit (right)
    ctx.save();
    for (let strand = 0; strand < 3; strand++) {
      ctx.beginPath();
      ctx.strokeStyle = strand === 1 ? 'rgba(255, 232, 152, 0.82)' : 'rgba(225, 178, 72, 0.38)';
      ctx.lineWidth = strand === 1 ? 3 : 1.5;
      for (let x = W * 0.26; x <= W * 0.72; x += 8) {
        const u = (x - W * 0.26) / (W * 0.46);
        const y = H * 0.56 + Math.sin(u * Math.PI * 3 + t * 2.2 + strand) * (10 + strand * 5) - Math.sin(u * Math.PI) * 34;
        if (x === W * 0.26) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();

    // Protagonist faint seated spirit silhouette (left)
    ctx.save();
    const lx = W * 0.24;
    const ly = H * 0.58 + Math.sin(t * 1.4) * 5;
    ctx.fillStyle = '#151924';
    ctx.strokeStyle = 'rgba(130, 165, 220, 0.42)';
    ctx.lineWidth = 2;
    // Head + shoulders in crisp pixel blocks
    ctx.fillRect(Math.round(lx - 18), Math.round(ly - 58), 36, 36);
    ctx.strokeRect(Math.round(lx - 18), Math.round(ly - 58), 36, 36);
    ctx.fillRect(Math.round(lx - 32), Math.round(ly - 18), 64, 62);
    ctx.strokeRect(Math.round(lx - 32), Math.round(ly - 18), 64, 62);
    // Suspended keepsake flashlight + sai-sin beside protagonist
    drawPocketFlashlight(ctx, lx + 42, ly + 10, 2.0, true, t);
    drawSaiSinGlow(ctx, lx + 24, ly + 22, t, 1.35, 1);
    ctx.restore();

    // Best Friend's translucent golden-cyan spirit silhouette (right)
    ctx.save();
    const rx = W * 0.73;
    const ry = H * 0.44 + Math.cos(t * 1.6) * 6;
    const spGlow = ctx.createRadialGradient(rx, ry, 10, rx, ry, 115);
    spGlow.addColorStop(0, 'rgba(255, 224, 130, 0.34)');
    spGlow.addColorStop(0.55, 'rgba(130, 210, 235, 0.14)');
    spGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = spGlow;
    ctx.beginPath();
    ctx.arc(rx, ry, 115, 0, Math.PI * 2);
    ctx.fill();

    // Friend pixel bust
    const fp = (ox, oy, pw, ph, col) => {
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(rx + ox * 4), Math.round(ry + oy * 4), pw * 4, ph * 4);
    };
    fp(-7, -14, 14, 12, 'rgba(34, 30, 26, 0.9)'); // Hair
    fp(-6, -10, 12, 10, 'rgba(220, 206, 184, 0.78)'); // Face
    fp(-4, -6, 2, 2, '#1d1915');
    fp(2, -6, 2, 2, '#1d1915');
    fp(-9, 1, 18, 16, 'rgba(232, 224, 206, 0.72)'); // Student shirt
    fp(-10, 1, 20, 16, 'rgba(255, 220, 128, 0.14)');
    ctx.restore();

    // Rising golden dust motes
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 32; i++) {
      const px = ((i * 59 + Math.sin(t + i) * 32) % (W - 40)) + 20;
      const py = H - ((t * (18 + (i % 5) * 6) + i * 37) % H);
      ctx.fillStyle = i % 3 === 0 ? 'rgba(255, 230, 140, 0.5)' : 'rgba(160, 215, 235, 0.32)';
      ctx.fillRect(Math.round(px / 4) * 4, Math.round(py / 4) * 4, 4, 4);
    }
    ctx.restore();

    // Final Beat 21 wake-up white-gold burst transition
    if (line.flashGoldWake) {
      const surge = Math.min(0.65, 0.08 + Math.max(0, meta.lineElapsed - 0.8) * 0.24);
      const wg = ctx.createRadialGradient(W * 0.5, H * 0.5, 16, W * 0.5, H * 0.5, 420);
      wg.addColorStop(0, `rgba(255, 245, 205, ${surge})`);
      wg.addColorStop(1, 'rgba(255, 220, 130, 0)');
      ctx.fillStyle = wg;
      ctx.fillRect(0, 0, W, H);
    }

    drawVignette(ctx, 0.48);
  }

  function drawGrove(ctx, line, t, beatProgress, meta) {
    ctx.fillStyle = '#040708';
    ctx.fillRect(0, 0, W, H);

    const img = getImg(line.frame || 'intro_s4_f0') || getImg('intro_panel_4');
    drawCoverFrame(ctx, img, t, { zoom: 1.03, panX: Math.sin(t * 0.8) * 5, panY: Math.cos(t * 0.6) * 2 });

    // Floating moonlit mist & fireflies across Thai banana grove
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 16; i++) {
      const fx = ((i * 79 + Math.sin(t * 1.1 + i) * 42) % (W - 60)) + 30;
      const fy = ((i * 53 + Math.cos(t * 0.9 + i * 2) * 28) % (H - 80)) + 40;
      const a = 0.25 + Math.abs(Math.sin(t * 2.4 + i)) * 0.55;
      ctx.fillStyle = `rgba(215, 245, 150, ${a})`;
      ctx.fillRect(Math.round(fx / 4) * 4, Math.round(fy / 4) * 4, 4, 4);
    }
    ctx.restore();

    // Protagonist holding lit keepsake flashlight + glowing wrist sai-sin in bottom-left corner
    if (line.heldFlashlight) {
      const swayX = Math.sin(t * 1.8) * 6;
      const swayY = Math.cos(t * 2.1) * 4;
      drawPocketFlashlight(ctx, 136 + swayX, H - 78 + swayY, 2.5, true, t);
      drawSaiSinGlow(ctx, 94 + swayX, H - 58 + swayY, t, 1.45, 0.95);
    }

    // Wake-up eyelid opening transition on Beat 22
    if (line.openingEyes && meta.lineElapsed < 1.1) {
      const closeAmt = Math.max(0, 1 - meta.lineElapsed / 1.1);
      const barH = (H * 0.5) * closeAmt;
      ctx.fillStyle = '#050507';
      ctx.fillRect(0, 0, W, barH);
      ctx.fillRect(0, H - barH, W, barH);
    }

    drawVignette(ctx, 0.45);
  }

  function drawArrival(ctx, line, t, beatProgress) {
    ctx.fillStyle = '#050406';
    ctx.fillRect(0, 0, W, H);

    const frameImg = getImg(line.frame || 'intro_s4_f4') || getImg('bg1');
    if (frameImg) {
      drawCoverFrame(ctx, frameImg, t, { zoom: 1.04 + beatProgress * 0.04, panY: -4 });
    }

    // Darken slightly + render looming traditional Thai teak mansion silhouette in the moonlit clearing
    ctx.save();
    ctx.fillStyle = 'rgba(4, 6, 10, 0.42)';
    ctx.fillRect(0, 0, W, H);

    const mx = W * 0.5;
    const my = H * 0.62;
    ctx.fillStyle = '#0e0b0d';
    // Thai gable roof (ทรงไทยจั่วแหลม)
    ctx.beginPath();
    ctx.moveTo(mx - 170, my - 46);
    ctx.lineTo(mx, my - 165);
    ctx.lineTo(mx + 170, my - 46);
    ctx.closePath();
    ctx.fill();
    // Main upper wooden house & stilts
    ctx.fillRect(mx - 138, my - 48, 276, 118);
    ctx.fillRect(mx - 122, my + 70, 20, 76);
    ctx.fillRect(mx - 42, my + 70, 20, 76);
    ctx.fillRect(mx + 22, my + 70, 20, 76);
    ctx.fillRect(mx + 102, my + 70, 20, 76);

    // Dim eerie warm window slits
    const winFlicker = 0.45 + Math.sin(t * 4.5) * 0.25;
    ctx.fillStyle = `rgba(255, 170, 68, ${winFlicker})`;
    ctx.fillRect(mx - 86, my - 18, 26, 40);
    ctx.fillRect(mx + 60, my - 18, 26, 40);
    // Open dark doorway
    ctx.fillStyle = '#040203';
    ctx.fillRect(mx - 22, my - 24, 44, 94);
    ctx.restore();

    if (line.heldFlashlight) {
      drawPocketFlashlight(ctx, 136, H - 78, 2.5, true, t);
      drawSaiSinGlow(ctx, 94, H - 58, t, 1.45, 0.95);
    }

    // Crimson ankle-bell acoustic ripple pulses when "เสียงกระพรวน" speaks
    if (line.speaker === 'เสียงกระพรวน') {
      ctx.save();
      for (let r = 0; r < 3; r++) {
        const radius = ((t * 140 + r * 70) % 240) + 18;
        const alpha = Math.max(0, 0.65 - radius / 260);
        ctx.strokeStyle = `rgba(255, 92, 92, ${alpha})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(W * 0.5, H * 0.63, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawVignette(ctx, 0.56);
  }

  const DRAW = [drawAltar, drawCar, drawCrash, drawLimbo, drawGrove, drawArrival];

  /* -------------------- 64x64 Pixel Character Portrait Renderer -------------------- */
  function drawPortrait(pCtx, speakerInfo, t, isTalking) {
    if (!pCtx) return;
    pCtx.imageSmoothingEnabled = false;
    const role = speakerInfo ? speakerInfo.role : 'narrator';
    const talkOpen = isTalking && (Math.floor(t * 10) % 2 === 0);
    const blink = Math.floor(t * 0.5) % 9 === 0 && (t % 1.9) > 1.72;

    // 32x32 logical pixel grid scaled 2x -> 64x64 crisp retro portrait
    const px = (x, y, w, h, col) => {
      pCtx.fillStyle = col;
      pCtx.fillRect(Math.round(x) * 2, Math.round(y) * 2, Math.round(w) * 2, Math.round(h) * 2);
    };

    const bgMap = {
      male: '#111624',
      female: '#1a1224',
      dad: '#0d151e',
      mom: '#1e1516',
      friend: '#080705',
      narrator: '#13100d',
      bell: '#1a0608',
    };
    px(0, 0, 32, 32, bgMap[role] || '#100d0b');

    if (role === 'narrator') {
      // Keepsake Flashlight + Coiled Golden Sai-Sin Scroll Badge
      px(3, 3, 26, 26, '#1a1511');
      px(4, 4, 24, 24, '#110e0b');
      // Flashlight angled
      px(6, 17, 11, 5, '#465261');
      px(6, 17, 11, 2, '#6d7b8e');
      px(17, 16, 4, 7, '#a58746');
      px(21, 17, 2, 5, '#fff4bd');
      // Soft light cone
      px(23, 15, 3, 9, 'rgba(255, 240, 175, 0.35)');
      px(26, 13, 3, 13, 'rgba(255, 225, 140, 0.2)');
      // Glowing coiled sai-sin above flashlight
      px(10, 7, 10, 6, '#f6ecc8');
      px(12, 9, 6, 2, '#110e0b');
      px(14, 12, 2, 3, '#ffd56b');
      return;
    }

    if (role === 'bell') {
      const sway = Math.round(Math.sin(t * 5) * 1.5);
      // Crimson ripple pixels
      px(5, 5, 22, 1, 'rgba(255, 86, 86, 0.35)');
      px(5, 26, 22, 1, 'rgba(255, 86, 86, 0.35)');
      // Cord
      px(10 + sway, 6, 12, 2, '#8b2424');
      // Twin brass ankle bells (กระพรวน)
      px(8 + sway, 10, 7, 9, '#a67b24');
      px(9 + sway, 11, 5, 7, '#e2b64e');
      px(10 + sway, 12, 2, 2, '#fff1ad');
      px(11 + sway, 17, 1, 2, '#2a0909');

      px(17 + sway, 11, 7, 9, '#a67b24');
      px(18 + sway, 12, 5, 7, '#e2b64e');
      px(19 + sway, 13, 2, 2, '#fff1ad');
      px(20 + sway, 18, 1, 2, '#2a0909');
      return;
    }

    if (role === 'friend') {
      // Glowing gold sai-sin dust in spirit threshold
      px(4, 6 + (Math.floor(t * 3) % 3), 1, 1, '#ffe082');
      px(27, 11 + (Math.floor(t * 4) % 3), 1, 1, '#ffe082');
      px(6, 22, 1, 1, '#9be2f5');
      // Translucent spiritual bust
      px(9, 21, 14, 11, '#b8b2a6');
      px(13, 21, 6, 5, '#dfd6c7');
      px(10, 6, 12, 14, '#1b1918'); // Hair
      px(11, 10, 10, 10, '#d7cebf'); // Face
      px(10, 7, 12, 4, '#242120'); // Fringe
      if (!blink) {
        px(13, 14, 2, 2, '#1d1b1a');
        px(18, 14, 2, 2, '#1d1b1a');
      } else {
        px(13, 15, 2, 1, '#1d1b1a');
        px(18, 15, 2, 1, '#1d1b1a');
      }
      px(14, 18, 4, talkOpen ? 2 : 1, '#5a4f45');
      // Subtle translucent cyan-gold border aura
      px(8, 5, 16, 1, 'rgba(255, 224, 130, 0.5)');
      return;
    }

    if (role === 'dad') {
      px(7, 22, 18, 10, '#2c4159'); // Shirt
      px(12, 22, 8, 5, '#415f80'); // Collar
      px(13, 19, 6, 4, '#cfa37e'); // Neck
      px(10, 7, 12, 13, '#dba982'); // Face
      px(9, 5, 14, 5, '#1b191c'); // Hair
      px(9, 8, 2, 6, '#5c6472'); // Grey temple streak
      px(21, 8, 2, 6, '#5c6472');
      if (!blink) {
        px(12, 13, 2, 2, '#1a1514');
        px(18, 13, 2, 2, '#1a1514');
      } else {
        px(12, 14, 2, 1, '#1a1514');
        px(18, 14, 2, 1, '#1a1514');
      }
      px(12, 11, 3, 1, '#262022'); // Brows
      px(17, 11, 3, 1, '#262022');
      px(13, 16, 6, 1, '#2b2220'); // Mustache
      px(14, 17, 4, talkOpen ? 2 : 1, '#7a453b');
      return;
    }

    if (role === 'mom') {
      px(7, 22, 18, 10, '#b5927c'); // Blouse
      px(13, 19, 6, 4, '#e5b996'); // Neck
      px(8, 6, 16, 19, '#191417'); // Shoulder-length hair
      px(10, 9, 12, 11, '#ebbf9c'); // Face
      px(10, 6, 12, 4, '#241c20');
      px(20, 8, 2, 2, '#e3be66'); // Silver-gold hairpin
      if (!blink) {
        px(12, 13, 2, 2, '#1e1718');
        px(18, 13, 2, 2, '#1e1718');
      } else {
        px(12, 14, 2, 1, '#1e1718');
        px(18, 14, 2, 1, '#1e1718');
      }
      px(14, 17, 4, talkOpen ? 2 : 1, '#9c524b');
      return;
    }

    if (role === 'female') {
      // Rin (ริน) - female high school student + subtle sai-sin gold accent
      px(7, 22, 18, 10, '#e8e8ee'); // White blouse
      px(12, 22, 8, 4, '#222d4d'); // Navy student collar
      px(15, 25, 2, 4, '#2f3d68');
      px(13, 19, 6, 4, '#f0c8a4');
      px(8, 6, 16, 16, '#15141c'); // Bob hair
      px(10, 9, 12, 11, '#f4cca8'); // Face
      px(10, 7, 12, 3, '#1d1b26'); // Bangs
      if (!blink) {
        px(12, 13, 2, 2, '#191620');
        px(18, 13, 2, 2, '#191620');
      } else {
        px(12, 14, 2, 1, '#191620');
        px(18, 14, 2, 1, '#191620');
      }
      px(14, 17, 4, talkOpen ? 2 : 1, '#a95d54');
      px(26, 26, 3, 2, '#ffe082'); // Tiny sai-sin charm pixel
      return;
    }

    // Default: Non (นนท์) - male student + sai-sin charm accent
    px(7, 22, 18, 10, '#e6e8ec'); // White school shirt
    px(13, 19, 6, 4, '#dfb08a');
    px(19, 26, 4, 4, '#cfd6e0'); // Shirt pocket
    px(9, 5, 14, 10, '#14151c'); // Hair
    px(10, 9, 12, 11, '#e6b892'); // Face
    px(10, 7, 12, 3, '#1c1d26'); // Parted bangs
    if (!blink) {
      px(12, 13, 2, 2, '#16161c');
      px(18, 13, 2, 2, '#16161c');
    } else {
      px(12, 14, 2, 1, '#16161c');
      px(18, 14, 2, 1, '#16161c');
    }
    px(14, 17, 4, talkOpen ? 2 : 1, '#8c4e44');
    px(26, 26, 3, 2, '#ffe082'); // Tiny sai-sin charm pixel
  }

  /* -------------------- Cutscene State & Runtime Controller -------------------- */
  const story = {
    active: false,
    autoPlay: false,
    idx: 0,
    charShown: 0,
    typeDone: false,
    holdTimer: 0,
    lineElapsed: 0,
    startTime: 0,
    lastTs: 0,
    lastBlipTime: 0,
    lastBlipCharStep: -1,
    lastWiperCycle: -1,
    playedSfxIdx: -1,
    rafId: null,
    done: null,
    lines: [],
  };

  function el(id) {
    return document.getElementById(id);
  }

  function updateControlsUI() {
    const pauseBtn = el('story-pause-btn');
    if (pauseBtn) {
      pauseBtn.innerHTML = story.autoPlay
        ? '<svg class="i" aria-hidden="true"><use href="#i-pause"/></svg><span>อัตโนมัติ: เปิด</span>'
        : '<svg class="i" aria-hidden="true"><use href="#i-play"/></svg><span>อัตโนมัติ: ปิด</span>';
      pauseBtn.classList.toggle('active', story.autoPlay);
    }
    const prompt = el('story-press-prompt');
    if (prompt) {
      prompt.classList.toggle('ready', story.typeDone);
      if (story.autoPlay) {
        prompt.textContent = 'โหมดเล่นอัตโนมัติ (กด P เพื่อหยุด · ESC ข้ามฉาก)';
      } else if (story.typeDone) {
        prompt.textContent = 'กด E / Space / Enter หรือคลิกเพื่อไปต่อ ';
      } else {
        prompt.textContent = 'คลิกกรอบ / กด E เพื่อข้ามตัวหนังสือ · ESC ข้ามฉาก';
      }
    }
  }

  // Music under the prologue: the funeral and the drive carry the theme, it drops out just
  // before the crash (silence, then the hit), drifts back in limbo, and leaves for the rain.
  const MUSIC_BY_SCENE = { 0: 0.55, 1: 0.4, 2: 0, 3: 0.35, 4: 0, 5: 0 };
  function setStoryMusic(scene, restart) {
    if (typeof window.setMusicLevel !== 'function') return;
    const level = MUSIC_BY_SCENE[scene] || 0;
    window.setMusicLevel(level, scene === 2 ? 0.25 : 1.0, { restart });
  }

  function enterLine(index) {
    story.idx = Math.max(0, Math.min(story.lines.length - 1, index));
    story.charShown = 0;
    story.typeDone = false;
    story.holdTimer = 0;
    story.lineElapsed = 0;
    story.lastBlipCharStep = -1;
    story.lastWiperCycle = -1;
    story.lastRumbleTick = -1;

    const line = story.lines[story.idx];
    const speaker = resolveSpeaker(line.speaker);
    setStoryMusic(line.scene, story.idx === 0);

    const tagEl = el('story-scene-tag');
    if (tagEl) tagEl.textContent = line.tag || '';

    const stepEl = el('story-step');
    if (stepEl) {
      const n = String(story.idx + 1).padStart(2, '0');
      const total = String(story.lines.length).padStart(2, '0');
      stepEl.textContent = `${n} / ${total}`;
    }

    const fillEl = el('story-progress-fill');
    if (fillEl) {
      const pct = ((story.idx + 1) / Math.max(1, story.lines.length)) * 100;
      fillEl.style.width = `${pct.toFixed(1)}%`;
    }

    const spEl = el('story-speaker');
    if (spEl) {
      spEl.className = `story-speaker ${speaker.css}`;
      spEl.textContent = speaker.name;
    }

    const lineEl = el('story-line');
    if (lineEl) lineEl.textContent = '';

    // Trigger one-shot beat SFX
    if (story.playedSfxIdx !== story.idx && line.sfx) {
      story.playedSfxIdx = story.idx;
      if (line.sfx === 'bell_whisper') playAnkleBellChime();
      else safePlaySound(line.sfx);
    } else {
      story.playedSfxIdx = story.idx;
    }

    updateControlsUI();
  }

  function frameLoop(ts) {
    if (!story.active) return;
    if (!story.lastTs) story.lastTs = ts;
    const dt = Math.min(0.08, Math.max(0.001, (ts - story.lastTs) / 1000));
    story.lastTs = ts;
    const t = (ts - story.startTime) / 1000;
    story.lineElapsed += dt;

    const line = story.lines[story.idx];
    if (!line) {
      finishStory();
      return;
    }

    const speaker = resolveSpeaker(line.speaker);

    // Typewriter progression & per-speaker retro voice blips
    if (!story.typeDone) {
      const speed = line.slowType ? 22 : 34; // slower deliberate pacing in funeral scene
      story.charShown = Math.min(line.text.length, story.charShown + speed * dt);
      const count = Math.floor(story.charShown);
      const lineEl = el('story-line');
      if (lineEl) lineEl.textContent = line.text.slice(0, count);

      // Voice blip every 3 visible characters (throttled >= 55ms)
      const ch = line.text.charAt(Math.max(0, count - 1));
      const charBucket = Math.floor(count / 3);
      if (count > 0 && ch && !/\s/.test(ch) && charBucket !== story.lastBlipCharStep && (ts - story.lastBlipTime) > 55) {
        story.lastBlipCharStep = charBucket;
        story.lastBlipTime = ts;
        safePlaySound(speaker.blip);
      }

      if (count >= line.text.length) {
        story.typeDone = true;
        story.holdTimer = 0;
        if (lineEl) lineEl.textContent = line.text;
        updateControlsUI();
      }
    } else if (story.autoPlay) {
      story.holdTimer += dt;
      const holdDur = Math.max(2.1, Math.min(3.6, line.text.length * 0.032 + 0.9));
      if (story.holdTimer >= holdDur) {
        if (story.idx < story.lines.length - 1) {
          enterLine(story.idx + 1);
        } else {
          finishStory();
          return;
        }
      }
    }

    // Draw main scene viewport (960x540)
    const canvas = el('story-canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    if (ctx) {
      const beatProgress = Math.min(1, story.lineElapsed / 3.5);
      const drawer = DRAW[line.scene] || DRAW[0];
      drawer(ctx, line, t, beatProgress, story);
    }

    // Draw 64x64 pixel character portrait
    const portrait = el('story-portrait');
    const pCtx = portrait ? portrait.getContext('2d') : null;
    if (pCtx) {
      drawPortrait(pCtx, speaker, t, !story.typeDone);
    }

    story.rafId = requestAnimationFrame(frameLoop);
  }

  function advanceStory() {
    if (!story.active) return;
    safeAudioCtx();
    const line = story.lines[story.idx];
    if (!line) {
      finishStory();
      return;
    }
    if (!story.typeDone) {
      story.charShown = line.text.length;
      story.typeDone = true;
      const lineEl = el('story-line');
      if (lineEl) lineEl.textContent = line.text;
      updateControlsUI();
      return;
    }
    if (story.idx < story.lines.length - 1) {
      enterLine(story.idx + 1);
    } else {
      finishStory();
    }
  }

  function prevStoryLine() {
    if (!story.active) return;
    safeAudioCtx();
    if (story.idx > 0) {
      enterLine(story.idx - 1);
    } else {
      enterLine(0);
    }
  }

  function togglePauseStory() {
    if (!story.active) return;
    safeAudioCtx();
    story.autoPlay = !story.autoPlay;
    story.holdTimer = 0;
    updateControlsUI();
  }

  function finishStory() {
    if (!story.active) return;
    story.active = false;
    if (story.rafId) {
      cancelAnimationFrame(story.rafId);
      story.rafId = null;
    }
    window.removeEventListener('keydown', onStoryKeyDown, true);
    if (typeof window.setMusicLevel === 'function') window.setMusicLevel(0, 0.8);
    const root = el('story-intro');
    if (root) root.classList.add('hidden');
    const cb = story.done;
    story.done = null;
    if (typeof cb === 'function') cb();
  }

  function onStoryKeyDown(e) {
    if (!story.active) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finishStory();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      prevStoryLine();
    } else if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      e.stopPropagation();
      togglePauseStory();
    } else if (e.key === ' ' || e.key === 'Enter' || e.key === 'e' || e.key === 'E' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      advanceStory();
    }
  }

  function playStoryIntro(onDone) {
    safeAudioCtx();
    story.lines = getLines();
    story.done = onDone;
    story.active = true;
    story.autoPlay = true; // Booth default: runs by itself; any key / click still skips ahead
    story.playedSfxIdx = -1;
    story.startTime = performance.now();
    story.lastTs = 0;

    const root = el('story-intro');
    if (root) root.classList.remove('hidden');

    enterLine(0);
    window.addEventListener('keydown', onStoryKeyDown, true);
    if (story.rafId) cancelAnimationFrame(story.rafId);
    story.rafId = requestAnimationFrame(frameLoop);
  }

  window.storyIntroActive = () => story.active;
  window.playStoryIntro = playStoryIntro;
  window.advanceStory = advanceStory;
  window.prevStoryLine = prevStoryLine;
  window.togglePauseStory = togglePauseStory;
  window.skipStoryIntro = finishStory;

  window.storyIntro = {
    play: playStoryIntro,
    advance: advanceStory,
    prev: prevStoryLine,
    togglePause: togglePauseStory,
    skip: finishStory,
    scenes: DRAW,
    lines: getLines,
    size: { width: W, height: H },
  };
})();
