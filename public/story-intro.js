/* ============================================================================
   Story intro —— 4 animated scenes told before the first chapter begins.
   Scene 1: the altar at home (leaving offerings for ยาย)
   Scene 2: the drive back to the old house in the rain
   Scene 3: the crash on the old road
   Scene 4: walking into the grove with one flashlight
   Everything is drawn on a 960x540 canvas so it matches the game's pixel plates.
   ========================================================================== */
(function () {
  'use strict';

  const W = 960;
  const H = 540;

  const SKY = '#06070d';

  function ready(img) {
    return !!img && img.complete && img.naturalWidth > 0;
  }

  // Deterministic pseudo-random so particles do not jitter between frames.
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

  // ---------------------------------------------------------------- scene 1
  // Home altar: portrait of ยาย, three incense sticks, a boy standing with his back to us.
  function drawAltar(cx, t) {
    const push = 1 + Math.min(t, 14) * 0.006;
    cx.save();
    cx.translate(W / 2, H / 2);
    cx.scale(push, push);
    cx.translate(-W / 2, -H / 2);

    if (ready(IMAGES.bg4)) cx.drawImage(IMAGES.bg4, 0, -10, W, H + 20);
    else {
      cx.fillStyle = '#0d0b11';
      cx.fillRect(0, 0, W, H);
    }

    cx.fillStyle = 'rgba(7, 5, 10, 0.7)';
    cx.fillRect(0, 0, W, H);

    // candle light spilling out of the altar corner
    const flicker = 0.85 + Math.sin(t * 7.3) * 0.06 + Math.sin(t * 11.7) * 0.04;
    const glow = cx.createRadialGradient(470, 300, 20, 470, 300, 400);
    glow.addColorStop(0, `rgba(255, 176, 92, ${0.34 * flicker})`);
    glow.addColorStop(0.45, 'rgba(186, 92, 44, 0.14)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    cx.fillStyle = glow;
    cx.fillRect(0, 0, W, H);

    cx.imageSmoothingEnabled = false;

    // the altar cabinet
    if (ready(IMAGES.altar)) cx.drawImage(IMAGES.altar, 336, 258, 256, 284);
    else {
      cx.fillStyle = '#2a1a12';
      cx.fillRect(340, 270, 260, 250);
    }

    // framed portrait of ยาย, gold frame with a photo inside
    cx.fillStyle = '#3a2a14';
    cx.fillRect(432, 160, 132, 152);
    cx.strokeStyle = '#c9a45a';
    cx.lineWidth = 4;
    cx.strokeRect(432, 160, 132, 152);
    cx.strokeStyle = '#7d6330';
    cx.lineWidth = 1;
    cx.strokeRect(437, 165, 122, 142);
    if (ready(IMAGES.photo1)) cx.drawImage(IMAGES.photo1, 441, 169, 114, 134);
    else {
      cx.fillStyle = '#4a4038';
      cx.fillRect(441, 169, 114, 134);
    }
    cx.fillStyle = 'rgba(30, 20, 12, 0.35)';
    cx.fillRect(441, 169, 114, 134);

    // three incense sticks with glowing tips
    for (let i = 0; i < 3; i++) {
      const x = 470 + i * 14;
      cx.strokeStyle = '#8a5b34';
      cx.lineWidth = 2;
      cx.beginPath();
      cx.moveTo(x, 282);
      cx.lineTo(x + 2, 226);
      cx.stroke();
      const tipX = x + 2;
      const tipY = 226;
      const ember = 0.7 + Math.sin(t * 5 + i) * 0.3;
      const eg = cx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 12);
      eg.addColorStop(0, `rgba(255, 120, 40, ${0.9 * ember})`);
      eg.addColorStop(1, 'rgba(255, 80, 20, 0)');
      cx.fillStyle = eg;
      cx.beginPath();
      cx.arc(tipX, tipY, 12, 0, Math.PI * 2);
      cx.fill();
    }

    // smoke: three wisps drifting up and to the right
    cx.lineCap = 'round';
    for (let s = 0; s < 3; s++) {
      const baseX = 470 + s * 14;
      cx.beginPath();
      for (let k = 0; k <= 26; k++) {
        const p = k / 26;
        const y = 224 - p * 150;
        const sway = Math.sin(p * 5 + t * 1.1 + s * 1.7) * (6 + p * 22) + p * 22;
        const x = baseX + sway;
        if (k === 0) cx.moveTo(x, y);
        else cx.lineTo(x, y);
      }
      cx.strokeStyle = `rgba(214, 206, 198, ${0.1 + s * 0.03})`;
      cx.lineWidth = 3 - s * 0.5;
      cx.stroke();
    }

    // candle flames on the altar step
    for (let c = 0; c < 2; c++) {
      const x = 392 + c * 176;
      const y = 300;
      const h = 12 + Math.sin(t * 9 + c * 2) * 3;
      const fg = cx.createRadialGradient(x, y, 0, x, y, 26);
      fg.addColorStop(0, 'rgba(255, 214, 140, 0.6)');
      fg.addColorStop(1, 'rgba(255, 140, 40, 0)');
      cx.fillStyle = fg;
      cx.beginPath();
      cx.arc(x, y, 26, 0, Math.PI * 2);
      cx.fill();
      cx.fillStyle = '#ffd08a';
      cx.beginPath();
      cx.ellipse(x, y - h / 2, 3.2, h / 2, 0, 0, Math.PI * 2);
      cx.fill();
    }

    // นนท์ / ริน, shot from behind, close to the camera
    const sprite = characterSprite(0);
    if (sprite) {
      cx.save();
      cx.filter = 'brightness(0.30) contrast(1.15) saturate(0.75)';
      cx.translate(120, 470);
      cx.scale(-1, 1);
      cx.drawImage(sprite, -150, -330, 300, 452);
      cx.restore();
      // rim light along the shoulder
      cx.strokeStyle = 'rgba(210, 160, 110, 0.28)';
      cx.lineWidth = 3;
      cx.beginPath();
      cx.moveTo(96, 210);
      cx.quadraticCurveTo(150, 220, 196, 300);
      cx.stroke();
    }

    // dust in the candle light
    for (let i = 0; i < 24; i++) {
      const x = 300 + hash(i) * 340 + Math.sin(t * 0.7 + i) * 9;
      const y = (hash(i + 40) * 380 + t * 8) % 380 + 90;
      cx.fillStyle = `rgba(255, 214, 160, ${0.05 + hash(i + 7) * 0.12})`;
      cx.fillRect(x, y, 2, 2);
    }

    cx.restore();
  }

  // ---------------------------------------------------------------- scene 2
  // Night drive: windshield, rain, headlights, two heads in silhouette.
  function drawCar(cx, t, phase, lineT) {
    phase = phase || 0;
    lineT = lineT || 0;
    const shake = Math.sin(t * 1.7) * 1;
    cx.fillStyle = '#020308';
    cx.fillRect(0, 0, W, H);

    const win = { x: 96, y: 64, w: 768, h: 372, r: 24 };
    cx.save();
    cx.beginPath();
    if (cx.roundRect) cx.roundRect(win.x, win.y, win.w, win.h, win.r);
    else cx.rect(win.x, win.y, win.w, win.h);
    cx.clip();
    cx.translate(shake, Math.sin(t * 2.3) * 0.6);

    // night above the road
    const sky = cx.createLinearGradient(0, win.y, 0, 330);
    sky.addColorStop(0, '#04060c');
    sky.addColorStop(1, '#0a1119');
    cx.fillStyle = sky;
    cx.fillRect(win.x - 30, win.y - 30, win.w + 60, 380);

    // palm silhouettes framing the shot, sliding past
    function palm(x, scale, sway) {
      cx.save();
      cx.translate(x, 300);
      cx.rotate(sway);
      cx.fillStyle = '#010309';
      cx.fillRect(-4 * scale, -190 * scale, 8 * scale, 190 * scale);
      for (let f = 0; f < 6; f++) {
        const a = -Math.PI / 2 + (f - 2.5) * 0.42;
        cx.beginPath();
        cx.moveTo(0, -186 * scale);
        cx.quadraticCurveTo(
          Math.cos(a) * 74 * scale, -186 * scale + Math.sin(a) * 86 * scale,
          Math.cos(a) * 128 * scale, -186 * scale + Math.sin(a) * 128 * scale + 34 * scale
        );
        cx.quadraticCurveTo(
          Math.cos(a) * 62 * scale, -186 * scale + Math.sin(a) * 62 * scale + 12 * scale,
          0, -180 * scale
        );
        cx.closePath();
        cx.fill();
      }
      cx.restore();
    }
    palm(win.x + 30 - ((t * 26) % 900), 1.05, Math.sin(t * 0.8) * 0.02);
    palm(win.x + 330 - ((t * 26) % 900), 0.8, Math.sin(t * 0.9 + 1) * 0.02);
    palm(win.x + 120 + ((t * 18) % 760), 0.65, Math.sin(t * 1.1) * 0.02);

    // fog sitting on the road ahead
    const fog = cx.createLinearGradient(0, 250, 0, 400);
    fog.addColorStop(0, 'rgba(120, 140, 158, 0)');
    fog.addColorStop(0.45, 'rgba(122, 142, 160, 0.16)');
    fog.addColorStop(1, 'rgba(110, 128, 146, 0.03)');
    cx.fillStyle = fog;
    cx.fillRect(win.x - 20, 250, win.w + 40, 150);

    // road
    const road = cx.createLinearGradient(0, 316, 0, win.y + win.h);
    road.addColorStop(0, '#0a0f16');
    road.addColorStop(0.6, '#05080d');
    road.addColorStop(1, '#02040a');
    cx.fillStyle = road;
    cx.beginPath();
    cx.moveTo(414, 316);
    cx.lineTo(546, 316);
    cx.lineTo(792, win.y + win.h);
    cx.lineTo(168, win.y + win.h);
    cx.closePath();
    cx.fill();

    // headlight beams fanning out down the road
    [0, 1].forEach((i) => {
      const originX = 430 + i * 100;
      const g = cx.createLinearGradient(originX, 430, originX + (i ? 150 : -150), 300);
      g.addColorStop(0, 'rgba(255, 246, 214, ' + (0.2 + Math.sin(t * 12 + i) * 0.02) + ')');
      g.addColorStop(0.55, 'rgba(230, 216, 178, 0.07)');
      g.addColorStop(1, 'rgba(230, 216, 178, 0)');
      cx.fillStyle = g;
      cx.beginPath();
      cx.moveTo(originX - 26, 430);
      cx.lineTo(originX + 26, 430);
      cx.lineTo(originX + (i ? 210 : -180), 296);
      cx.lineTo(originX + (i ? 40 : -120), 296);
      cx.closePath();
      cx.fill();
    });

    // centre dashes racing toward us
    for (let i = 0; i < 6; i++) {
      const p = (i + (t * 1.7) % 1) / 6;
      const y = 322 + p * p * 250;
      const w = 4 + p * 24;
      cx.fillStyle = 'rgba(236, 230, 206, ' + (0.05 + p * 0.16) + ')';
      cx.fillRect(480 - w / 2, y, w, 6 + p * 30);
    }

    // rain on the glass
    cx.strokeStyle = 'rgba(200, 218, 236, 0.5)';
    cx.lineWidth = 1;
    for (let i = 0; i < 85; i++) {
      const x = win.x + ((hash(i) * win.w + t * (24 + hash(i + 3) * 42)) % win.w);
      const y = win.y + ((hash(i + 11) * win.h + t * 340 * (0.5 + hash(i + 9))) % win.h);
      cx.globalAlpha = 0.12 + hash(i + 21) * 0.3;
      cx.beginPath();
      cx.moveTo(x, y);
      cx.lineTo(x - 2.5, y + 10 + hash(i + 5) * 12);
      cx.stroke();
    }
    cx.globalAlpha = 1;

    // the oncoming car — it only shows up after the call with พ่อแม่,
    // headlights first, then the whole vehicle rushing at us.
    const carIn = smooth((phase - 3.2) / 1.6);
    if (carIn > 0) {
      const k = 0.18 + carIn * 1.15;
      const cxp = 552 + Math.sin(t * 0.6) * 10 * k;
      const cyp = 352 - carIn * 26;
      const alpha = 0.6 + 0.4 * carIn;

      // the glare the headlights throw over our own windshield
      const glare = cx.createRadialGradient(cxp, cyp, 10, cxp, cyp, 240 * k);
      glare.addColorStop(0, 'rgba(255, 250, 226, ' + 0.55 * carIn + ')');
      glare.addColorStop(0.4, 'rgba(255, 244, 206, ' + 0.3 * carIn + ')');
      glare.addColorStop(1, 'rgba(255, 244, 206, 0)');
      cx.fillStyle = glare;
      cx.fillRect(win.x - 20, win.y - 20, win.w + 40, win.h + 40);

      // the vehicle itself, still mostly a silhouette
      const bw = 150 * k;
      const bh = 96 * k;
      cx.globalAlpha = alpha;
      cx.fillStyle = '#02030a';
      cx.beginPath();
      if (cx.roundRect) cx.roundRect(cxp - bw / 2, cyp - bh * 0.28, bw, bh, 8 * k);
      else cx.rect(cxp - bw / 2, cyp - bh * 0.28, bw, bh);
      cx.fill();
      // windscreen catching the light
      cx.fillStyle = 'rgba(120, 150, 168, ' + 0.16 * carIn + ')';
      cx.fillRect(cxp - bw * 0.34, cyp - bh * 0.24, bw * 0.68, bh * 0.34);
      // grille
      cx.fillStyle = 'rgba(220, 214, 190, ' + 0.1 * carIn + ')';
      cx.fillRect(cxp - bw * 0.3, cyp + bh * 0.16, bw * 0.6, 3 * k);

      // headlights
      [-1, 1].forEach((side) => {
        const lx = cxp + side * bw * 0.32;
        const ly = cyp + bh * 0.04;
        const halo = cx.createRadialGradient(lx, ly, 0, lx, ly, 46 * k);
        halo.addColorStop(0, 'rgba(255, 255, 250, ' + carIn + ')');
        halo.addColorStop(0.35, 'rgba(255, 246, 206, ' + 0.72 * carIn + ')');
        halo.addColorStop(1, 'rgba(255, 236, 176, 0)');
        cx.fillStyle = halo;
        cx.beginPath();
        cx.arc(lx, ly, 46 * k, 0, Math.PI * 2);
        cx.fill();
        cx.fillStyle = 'rgba(255, 255, 250, ' + carIn + ')';
        cx.beginPath();
        cx.arc(lx, ly, 9 * k, 0, Math.PI * 2);
        cx.fill();
      });
      cx.globalAlpha = 1;
    }

    // wipers
    const wipe = (Math.sin(t * 2.1) + 1) / 2;
    cx.strokeStyle = 'rgba(3, 5, 9, 0.95)';
    cx.lineWidth = 7;
    cx.lineCap = 'round';
    [0, 1].forEach((i) => {
      const ox = 330 + i * 300;
      const ang = -1.5 + smooth(wipe) * 1.05;
      cx.beginPath();
      cx.moveTo(ox, 436);
      cx.lineTo(ox + Math.cos(ang) * 190, 436 + Math.sin(ang) * 190);
      cx.stroke();
    });

    // oncoming headlights that end the scene
    const flash = phase >= 4 ? smooth((lineT - 1.4) / 1.1) : 0;
    if (flash > 0) {
      cx.fillStyle = 'rgba(255, 252, 240, ' + flash * 0.95 + ')';
      cx.fillRect(win.x - 30, win.y - 30, win.w + 60, win.h + 60);
    }

    cx.restore();

    // ---- cabin ----
    cx.fillStyle = '#020308';
    // roof
    cx.beginPath();
    cx.moveTo(-20, 0);
    cx.lineTo(W + 20, 0);
    cx.lineTo(W + 20, 50);
    cx.quadraticCurveTo(W / 2, 96, -20, 50);
    cx.closePath();
    cx.fill();
    // sun visors
    cx.beginPath();
    cx.moveTo(118, 52);
    cx.lineTo(330, 74);
    cx.lineTo(320, 106);
    cx.lineTo(118, 82);
    cx.closePath();
    cx.fill();
    cx.beginPath();
    cx.moveTo(844, 52);
    cx.lineTo(636, 74);
    cx.lineTo(646, 106);
    cx.lineTo(844, 82);
    cx.closePath();
    cx.fill();
    // A-pillars
    cx.beginPath();
    cx.moveTo(-20, 34);
    cx.lineTo(126, 62);
    cx.lineTo(100, 468);
    cx.lineTo(-20, 512);
    cx.closePath();
    cx.fill();
    cx.beginPath();
    cx.moveTo(W + 20, 34);
    cx.lineTo(838, 62);
    cx.lineTo(868, 468);
    cx.lineTo(W + 20, 512);
    cx.closePath();
    cx.fill();
    // mirror
    cx.fillRect(434, 16, 92, 28);
    cx.strokeStyle = 'rgba(150, 164, 184, 0.1)';
    cx.lineWidth = 2;
    cx.strokeRect(434, 16, 92, 28);

    // dashboard
    cx.beginPath();
    cx.moveTo(-20, 452);
    cx.quadraticCurveTo(W / 2, 486, W + 20, 452);
    cx.lineTo(W + 20, H);
    cx.lineTo(-20, H);
    cx.closePath();
    cx.fill();
    cx.strokeStyle = 'rgba(150, 128, 96, 0.16)';
    cx.beginPath();
    cx.moveTo(-20, 452);
    cx.quadraticCurveTo(W / 2, 486, W + 20, 452);
    cx.stroke();
    cx.fillStyle = 'rgba(255, 176, 74, ' + (0.36 + Math.sin(t * 3) * 0.06) + ')';
    cx.fillRect(636, 512, 78, 4);
    cx.fillRect(736, 514, 40, 3);

    // steering wheel
    cx.strokeStyle = '#020308';
    cx.lineWidth = 18;
    cx.beginPath();
    cx.arc(760, 640, 128, Math.PI * 1.16, Math.PI * 1.84);
    cx.stroke();

    // two heads from behind, close to the camera
    const bob = Math.sin(t * 1.6) * 1.6;
    cx.fillStyle = '#020308';
    // passenger with long hair, left
    cx.beginPath();
    cx.moveTo(108, H);
    cx.quadraticCurveTo(128, 500 + bob, 244, 492 + bob);
    cx.quadraticCurveTo(360, 500 + bob, 384, H);
    cx.closePath();
    cx.fill();
    cx.beginPath();
    cx.ellipse(244, 470 + bob, 58, 70, -0.05, 0, Math.PI * 2);
    cx.fill();
    // driver, right
    cx.beginPath();
    cx.moveTo(556, H);
    cx.quadraticCurveTo(576, 496 + bob, 668, 488 + bob);
    cx.quadraticCurveTo(762, 496 + bob, 784, H);
    cx.closePath();
    cx.fill();
    cx.beginPath();
    cx.ellipse(668, 466 + bob, 48, 58, 0.04, 0, Math.PI * 2);
    cx.fill();

    // dashboard light catching the shoulders
    cx.strokeStyle = 'rgba(232, 176, 108, ' + (0.22 + Math.sin(t * 2.4) * 0.03) + ')';
    cx.lineWidth = 3;
    cx.beginPath();
    cx.moveTo(190, 408 + bob);
    cx.quadraticCurveTo(244, 380 + bob, 300, 408 + bob);
    cx.stroke();
    cx.beginPath();
    cx.moveTo(620, 404 + bob);
    cx.quadraticCurveTo(668, 378 + bob, 716, 404 + bob);
    cx.stroke();
  }

  // ---------------------------------------------------------------- scene 3
  // The crash: fire, smoke, an overturned car and a hand reaching out.
  function drawCrash(cx, t) {
    const flash = Math.max(0, 1 - t / 0.8);
    if (flash > 0) {
      cx.fillStyle = 'rgba(255, 250, 238, ' + flash + ')';
      cx.fillRect(0, 0, W, H);
      return;
    }

    const flicker = 0.85 + Math.sin(t * 9.4) * 0.1 + Math.sin(t * 17.1) * 0.06;
    const fireX = 706;
    const baseY = 436;

    cx.fillStyle = '#03040a';
    cx.fillRect(0, 0, W, H);

    // road and its firelit sheen
    const ground = cx.createLinearGradient(0, 330, 0, H);
    ground.addColorStop(0, '#06070c');
    ground.addColorStop(1, '#0d090b');
    cx.fillStyle = ground;
    cx.fillRect(0, 330, W, H - 330);

    const spill = cx.createRadialGradient(fireX, baseY, 20, fireX, baseY, 520);
    spill.addColorStop(0, 'rgba(255, 148, 58, ' + 0.34 * flicker + ')');
    spill.addColorStop(0.28, 'rgba(200, 74, 22, ' + 0.16 * flicker + ')');
    spill.addColorStop(1, 'rgba(60, 12, 6, 0)');
    cx.fillStyle = spill;
    cx.fillRect(0, 0, W, H);

    // ---- the wreck, on its side ----
    cx.save();
    cx.translate(256, 396);
    cx.rotate(-0.46);
    cx.fillStyle = '#020308';
    // hull
    cx.beginPath();
    cx.moveTo(-184, 10);
    cx.lineTo(-188, -46);
    cx.quadraticCurveTo(-176, -66, -110, -68);
    cx.lineTo(78, -68);
    cx.quadraticCurveTo(150, -64, 160, -22);
    cx.lineTo(152, 52);
    cx.quadraticCurveTo(70, 70, -40, 64);
    cx.quadraticCurveTo(-140, 58, -184, 10);
    cx.closePath();
    cx.fill();
    // cabin
    cx.beginPath();
    cx.moveTo(-104, -70);
    cx.quadraticCurveTo(-96, -132, -34, -136);
    cx.lineTo(40, -136);
    cx.quadraticCurveTo(96, -130, 106, -70);
    cx.closePath();
    cx.fill();
    // door seam and handle
    cx.strokeStyle = 'rgba(255, 158, 74, ' + 0.22 * flicker + ')';
    cx.lineWidth = 1.4;
    cx.beginPath();
    cx.moveTo(-30, -62);
    cx.lineTo(-34, 56);
    cx.moveTo(-74, -18);
    cx.lineTo(-30, -20);
    cx.stroke();
    // rim light along the roof and sill
    cx.strokeStyle = 'rgba(255, 176, 92, ' + 0.55 * flicker + ')';
    cx.lineWidth = 2.6;
    cx.beginPath();
    cx.moveTo(-108, -72);
    cx.quadraticCurveTo(-98, -136, -34, -140);
    cx.lineTo(40, -140);
    cx.quadraticCurveTo(100, -134, 110, -72);
    cx.stroke();
    // shattered side window
    cx.strokeStyle = 'rgba(255, 190, 120, ' + 0.34 * flicker + ')';
    cx.lineWidth = 1.2;
    cx.beginPath();
    cx.moveTo(-70, -124);
    cx.lineTo(-22, -92);
    cx.moveTo(-24, -130);
    cx.lineTo(18, -104);
    cx.moveTo(22, -126);
    cx.lineTo(52, -98);
    cx.stroke();
    // wheels in the air
    [[-120, 40], [104, 34]].forEach(([wx, wy]) => {
      cx.fillStyle = '#010206';
      cx.beginPath();
      cx.arc(wx, wy, 38, 0, Math.PI * 2);
      cx.fill();
      cx.strokeStyle = 'rgba(255, 152, 72, ' + 0.34 * flicker + ')';
      cx.lineWidth = 2;
      cx.beginPath();
      cx.arc(wx, wy, 22, 0, Math.PI * 2);
      cx.stroke();
    });
    cx.restore();

    // ---- fire ----
    cx.save();
    cx.globalCompositeOperation = 'lighter';
    // base glow
    const core = cx.createRadialGradient(fireX, baseY - 26, 8, fireX, baseY - 26, 150);
    core.addColorStop(0, 'rgba(255, 226, 150, ' + 0.5 * flicker + ')');
    core.addColorStop(0.45, 'rgba(255, 138, 44, ' + 0.22 * flicker + ')');
    core.addColorStop(1, 'rgba(180, 46, 10, 0)');
    cx.fillStyle = core;
    cx.beginPath();
    cx.ellipse(fireX, baseY - 26, 150, 120, 0, 0, Math.PI * 2);
    cx.fill();

    // flame tongues
    for (let i = 0; i < 9; i++) {
      const off = (hash(i * 3.1) - 0.5) * 118;
      const x = fireX + off;
      const h = (96 + hash(i * 7.7) * 120) * (0.8 + hash(i + Math.floor(t * 9)) * 0.4);
      const w = 20 + hash(i * 5.3) * 22;
      const tipX = x + Math.sin(t * 3 + i) * 16;
      const by = baseY + 46;
      const g = cx.createLinearGradient(x, by, tipX, by - h);
      g.addColorStop(0, 'rgba(255, 232, 168, ' + 0.42 * flicker + ')');
      g.addColorStop(0.35, 'rgba(255, 156, 56, ' + 0.3 * flicker + ')');
      g.addColorStop(0.75, 'rgba(214, 70, 18, ' + 0.16 * flicker + ')');
      g.addColorStop(1, 'rgba(150, 30, 6, 0)');
      cx.fillStyle = g;
      cx.beginPath();
      cx.moveTo(x - w / 2, by);
      cx.quadraticCurveTo(x - w * 0.7, baseY - h * 0.55, tipX, baseY - h);
      cx.quadraticCurveTo(x + w * 0.7, by - h * 0.5, x + w / 2, by);
      cx.closePath();
      cx.fill();
    }
    cx.restore();

    // embers
    for (let i = 0; i < 48; i++) {
      const life = (t * (0.22 + hash(i) * 0.3) + hash(i + 60)) % 1;
      const x = fireX - 70 + hash(i + 12) * 180 + Math.sin(t * 1.4 + i) * 14;
      const y = baseY - life * 330;
      cx.fillStyle = 'rgba(255, ' + (150 + Math.floor(hash(i + 3) * 80)) + ', 70, ' + (1 - life) * 0.85 + ')';
      cx.fillRect(x, y, 1.5 + hash(i + 5) * 2, 1.5 + hash(i + 8) * 3);
    }

    // smoke drifting up
    for (let i = 0; i < 20; i++) {
      const p = ((t * 0.09 + i / 20) % 1);
      const x = fireX - 20 + Math.sin(p * 5 + i) * (26 + p * 120) - p * 70;
      const y = baseY - 60 - p * 470;
      const r = 26 + p * 110;
      cx.fillStyle = 'rgba(32, 28, 32, ' + 0.2 * (1 - p) + ')';
      cx.beginPath();
      cx.arc(x, y, r, 0, Math.PI * 2);
      cx.fill();
    }

    // ---- a hand reaching out of the dark ----
    const reach = smooth((t - 0.4) / 1.1);
    if (reach > 0) {
      cx.save();
      cx.translate(-46 + reach * 50, -14 + Math.sin(t * 1.3) * 3);
      cx.rotate(0.14 + Math.sin(t * 0.9) * 0.02);
      // sleeve
      cx.fillStyle = '#08090f';
      cx.beginPath();
      cx.moveTo(10, 540);
      cx.lineTo(150, 512);
      cx.lineTo(170, 540);
      cx.lineTo(10, 540);
      cx.closePath();
      cx.fill();
      // palm
      cx.fillStyle = '#5a372b';
      cx.beginPath();
      cx.ellipse(148, 500, 42, 30, 0.22, 0, Math.PI * 2);
      cx.fill();
      // fingers
      for (let f = 0; f < 4; f++) {
        cx.beginPath();
        cx.ellipse(124 + f * 22, 452 + f * 4, 8, 32, -0.16 + f * 0.04, 0, Math.PI * 2);
        cx.fill();
      }
      // thumb
      cx.beginPath();
      cx.ellipse(184, 486, 10, 20, 1, 0, Math.PI * 2);
      cx.fill();
      // firelight along the top edge
      cx.strokeStyle = 'rgba(255, 176, 112, ' + 0.55 + ')';
      cx.lineWidth = 2;
      cx.beginPath();
      cx.ellipse(146, 494, 44, 34, 0.2, Math.PI * 1.15, Math.PI * 1.95);
      cx.stroke();
      cx.restore();
    }

    // fade to black
    const fade = smooth((t - 5.6) / 1.6);
    if (fade > 0) {
      cx.fillStyle = 'rgba(0, 0, 0, ' + fade + ')';
      cx.fillRect(0, 0, W, H);
    }
  }

  // ---------------------------------------------------------------- scene 4
  // The grove: one flashlight, wet leaves, something keeping pace behind.
  function drawGrove(cx, t) {
    if (ready(IMAGES.bg1)) cx.drawImage(IMAGES.bg1, 0, 0, W, H);
    else {
      cx.fillStyle = '#05090b';
      cx.fillRect(0, 0, W, H);
    }
    // cold night grade
    cx.fillStyle = 'rgba(4, 8, 12, 0.76)';
    cx.fillRect(0, 0, W, H);
    const grade = cx.createLinearGradient(0, 0, 0, H);
    grade.addColorStop(0, 'rgba(10, 24, 30, 0.25)');
    grade.addColorStop(1, 'rgba(2, 6, 8, 0.55)');
    cx.fillStyle = grade;
    cx.fillRect(0, 0, W, H);

    // moon behind the canopy
    const mg = cx.createRadialGradient(706, 104, 6, 706, 104, 150);
    mg.addColorStop(0, 'rgba(226, 238, 232, 0.5)');
    mg.addColorStop(0.22, 'rgba(180, 206, 200, 0.16)');
    mg.addColorStop(1, 'rgba(180, 206, 200, 0)');
    cx.fillStyle = mg;
    cx.fillRect(520, 0, 380, 320);
    cx.fillStyle = '#e2ebe4';
    cx.beginPath();
    cx.arc(706, 104, 24, 0, Math.PI * 2);
    cx.fill();

    // rain
    cx.strokeStyle = 'rgba(186, 206, 220, 0.55)';
    cx.lineWidth = 1;
    for (let i = 0; i < 120; i++) {
      const x = (hash(i + 900) * W + t * 80) % W;
      const y = ((hash(i + 930) * H + t * 500) % H);
      cx.globalAlpha = 0.1 + hash(i + 950) * 0.22;
      cx.beginPath();
      cx.moveTo(x, y);
      cx.lineTo(x - 4, y + 18);
      cx.stroke();
    }
    cx.globalAlpha = 1;

    // ---- flashlight ----
    const walkX = 236;
    const walkY = 300;
    const sweep = Math.sin(t * 0.5) * 0.14 + 0.4;
    const apexX = walkX + 30;
    const apexY = walkY + 96;

    cx.save();
    cx.translate(apexX, apexY);
    cx.rotate(sweep);
    // three nested wedges keep the edges soft
    for (let i = 0; i < 3; i++) {
      const spread = 1 + i * 0.34;
      const alpha = [0.075, 0.05, 0.032][i];
      const g = cx.createLinearGradient(0, 0, 0, -760);
      g.addColorStop(0, 'rgba(255, 246, 214, ' + alpha + ')');
      g.addColorStop(0.5, 'rgba(252, 240, 196, ' + alpha * 0.55 + ')');
      g.addColorStop(1, 'rgba(250, 238, 190, 0)');
      cx.fillStyle = g;
      cx.beginPath();
      cx.moveTo(-14, 0);
      cx.lineTo(-120 * spread, -760);
      cx.lineTo(120 * spread, -760);
      cx.lineTo(14, 0);
      cx.closePath();
      cx.fill();
    }
    // hot spot where the beam lands
    const spot = cx.createRadialGradient(0, -600, 12, 0, -600, 210);
    spot.addColorStop(0, 'rgba(255, 246, 210, 0.16)');
    spot.addColorStop(1, 'rgba(255, 246, 210, 0)');
    cx.fillStyle = spot;
    cx.beginPath();
    cx.arc(0, -600, 210, 0, Math.PI * 2);
    cx.fill();
    cx.restore();

    // ---- the one holding the light ----
    const sprite = characterSprite(Math.floor(t * 8));
    const bob = Math.abs(Math.sin(t * 4.2)) * 3;
    if (sprite) {
      cx.save();
      cx.filter = 'brightness(0.34) contrast(1.25) saturate(0.7)';
      cx.drawImage(sprite, walkX - 34, walkY - bob, 96, 146);
      cx.restore();
    }
    // the torch itself, and the light it throws on the grass
    cx.fillStyle = '#f6ecc2';
    cx.beginPath();
    cx.arc(apexX, apexY - bob * 0.4, 3.4, 0, Math.PI * 2);
    cx.fill();
    const pool = cx.createRadialGradient(apexX + 40, 470, 6, apexX + 40, 470, 200);
    pool.addColorStop(0, 'rgba(220, 214, 170, 0.1)');
    pool.addColorStop(1, 'rgba(220, 214, 170, 0)');
    cx.fillStyle = pool;
    cx.beginPath();
    cx.ellipse(apexX + 40, 468, 200, 58, 0, 0, Math.PI * 2);
    cx.fill();

    // ground fog
    const fog = cx.createLinearGradient(0, H - 170, 0, H);
    fog.addColorStop(0, 'rgba(150, 168, 168, 0)');
    fog.addColorStop(0.6, 'rgba(150, 168, 168, 0.07)');
    fog.addColorStop(1, 'rgba(10, 16, 16, 0.5)');
    cx.fillStyle = fog;
    cx.fillRect(0, H - 170, W, 170);

    // ---- someone between the palms ----
    const ghostIn = smooth((t - 5.6) / 2.4);
    if (ghostIn > 0) {
      const flick = hash(Math.floor(t * 7)) > 0.8 ? 0.25 : 1;
      const img = IMAGES["dancerAnim" + (Math.floor(t * 4) % 8)];
      if (ready(img)) {
        cx.globalAlpha = ghostIn * 0.42 * flick;
        cx.drawImage(img, 612, 176, 112, 168);
        cx.globalAlpha = 1;
      }
      const gg = cx.createRadialGradient(664, 290, 6, 664, 290, 150);
      gg.addColorStop(0, 'rgba(168, 24, 24, ' + 0.18 * ghostIn * flick + ')');
      gg.addColorStop(1, 'rgba(168, 24, 24, 0)');
      cx.fillStyle = gg;
      cx.fillRect(500, 150, 340, 280);
    }
  }

  // ------------------------------------------------------------------ script
  const LINES = [
    { scene: 0, speaker: 'นนท์', text: 'ยายจากไปตั้งแต่ปลายฝนปีที่แล้ว... แต่ทุกครั้งที่กลับมาบ้าน ผมยังเห็นท่านนั่งอยู่ตรงนั้น' },
    { scene: 0, speaker: 'ริน', text: 'จุดธูปให้ยายอีกดอกสิ เดี๋ยวต้องออกรถตั้งแต่ฟ้ายังไม่สาง' },
    { scene: 0, speaker: 'นนท์', text: 'ครับยาย... ผมจะเอาของไปส่งที่เรือนหลังสุดท้ายให้เรียบร้อย' },

    { scene: 1, speaker: 'ริน', text: 'เหลืออีกสี่สิบกิโลฯ ก็ถึงเรือนยาย ฝนตกหนักแบบนี้ ขับช้า ๆ นะนนท์' },
    { scene: 1, speaker: 'นนท์', text: 'อือ... ไฟหน้ารถมันสว่างแปลก ๆ ตั้งแต่ผ่านโค้งเมื่อกี้' },
    { scene: 1, speaker: 'แม่ (สายเข้า)', text: 'นนท์เหรอลูก ถึงไหนแล้ว ฝนตกหนักอย่างนี้ขับดี ๆ นะ อย่าฝืน' },
    { scene: 1, speaker: 'นนท์', text: 'ใกล้ถึงแล้วแม่ ผมกับรินจะรีบไปจุดธูปให้ยายก่อนเที่ยงคืนครับ' },
    { scene: 1, speaker: 'พ่อ (เสียงจากสาย)', text: 'ถ้ารถมีปัญหาให้รินขับแทนนะ อย่าเสี่ยว... พ่อเป็นห่วง' },
    { scene: 1, speaker: 'ริน', text: 'นนท์! ไฟส่องเข้ามา! มีรถพุ่งสวนมาทางเรา!' },

    { scene: 2, speaker: 'นนท์', text: 'ริน! จับให้แน่น!' },
    { scene: 2, speaker: 'นนท์', text: 'อึก... ปวดหัวเหมือนมีใครตอกตะปูอยู่ข้างใน... ริน! รินได้ยินผมไหม!' },

    { scene: 3, speaker: 'ริน', text: 'รถใช้ไม่ได้แล้ว... เรือนยายอยู่ไม่ไกล ต้องเดินเข้าไปให้ถึงก่อนฟ้าสาง' },
    { scene: 3, speaker: 'นนท์', text: 'ไฟฉายเหลือดวงเดียว เดินตามแสงผมนะ อย่าห่างกัน' },
    { scene: 3, speaker: 'เสียงกระพรวน', text: 'กริ๊ง... กริ๊ง... เสียงกระพรวนดังอยู่ข้างหลังเรือน แต่ตรงนั้นไม่มีใคร...' }
  ];

  const SCENE_TAGS = [
    '1 / 4 · ห้องพระที่บ้าน',
    '2 / 4 · ถนนสายเก่า',
    '3 / 4 · อุบัติเหตุ',
    '4 / 4 · ป่ารอบเรือน'
  ];

  const SCENE_SOUND = ['chime', 'thunder', 'scare', 'whisper'];

  const SPEAKER_COLORS = {
    "แม่ (สายเข้า)": "#a9c7e8",
    "พ่อ (เสียงจากสาย)": "#9db8d8",
    'นนท์': '#f0c45a',
    'ริน': '#8fd6c0',
    'เสียงกระพรวน': '#c88a8a'
  };

  const DRAW = [drawAltar, drawCar, drawCrash, drawGrove];
  const TYPE_MS = 24;

  let story = null;

  function els() {
    return {
      root: document.getElementById('story-intro'),
      canvas: document.getElementById('story-canvas'),
      speaker: document.getElementById('story-speaker'),
      line: document.getElementById('story-line'),
      hint: document.getElementById('story-step'),
      tag: document.getElementById('story-scene-tag')
    };
  }

  function playStoryIntro(onDone) {
    const ui = els();
    if (!ui.root || !ui.canvas) {
      if (onDone) onDone();
      return;
    }
    // Phones only drive a controller for the host; the story plays on the main screen.
    if (typeof state !== 'undefined' && (state.role === 'p1' || state.role === 'p2')) {
      if (onDone) onDone();
      return;
    }
    const cx = ui.canvas.getContext('2d');
    cx.imageSmoothingEnabled = true;

    story = {
      cx,
      ui,
      index: -1,
      scene: -1,
      sceneStart: 0,
      lineStart: 0,
      raf: null,
      onDone,
      finished: false,
      doneAt: 0,
      lineInScene: 0
    };

    ui.root.classList.remove('hidden');
    if (typeof state !== 'undefined') state.flags.cutscenePlaying = true;
    if (typeof initAudio === 'function') initAudio();

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
      if (typeof playSound === 'function') {
        try { playSound(SCENE_SOUND[line.scene] || 'creak', { gain: 0.6 }); } catch (err) { /* audio may be locked */ }
      }
    }
    story.lineInScene = LINES.slice(0, story.index).filter((l) => l.scene === line.scene).length;
    story.lineStart = performance.now();
    story.ui.speaker.textContent = line.speaker;
    story.ui.speaker.style.color = SPEAKER_COLORS[line.speaker] || '#cbbfae';
    story.ui.line.textContent = '';
    story.ui.hint.textContent = 'คลิก / E เพื่อไปต่อ · ESC ข้ามฉาก';
  }

  function tick(now) {
    if (!story || story.finished) return;
    const cx = story.cx;
    const sceneTime = (now - story.sceneStart) / 1000;

    cx.fillStyle = '#000';
    cx.fillRect(0, 0, W, H);
    const lineElapsed = (now - story.lineStart) / 1000;
    DRAW[story.scene](cx, sceneTime, story.lineInScene || 0, lineElapsed);

    // letterbox + vignette, so the plate reads like a film still
    const vig = cx.createRadialGradient(W / 2, H / 2, 220, W / 2, H / 2, 620);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.62)');
    cx.fillStyle = vig;
    cx.fillRect(0, 0, W, H);
    cx.fillStyle = 'rgba(0,0,0,0.92)';
    cx.fillRect(0, 0, W, 10);
    cx.fillRect(0, H - 10, W, 10);

    // typewriter
    const line = LINES[story.index];
    if (line) {
      const elapsed = now - story.lineStart;
      const shown = Math.min(line.text.length, Math.floor(elapsed / TYPE_MS));
      if (story.ui.line.textContent.length !== shown) {
        story.ui.line.textContent = line.text.slice(0, shown);
      }
      const full = 1400 + line.text.length * 48;
      if (elapsed > full) nextStoryLine();
    }
    story.raf = requestAnimationFrame(tick);
  }

  function advanceStory() {
    if (!story || story.finished) return;
    const line = LINES[story.index];
    if (!line) return finishStory();
    const shown = story.ui.line.textContent.length;
    if (shown < line.text.length) {
      // first press: complete the line instead of skipping it
      story.ui.line.textContent = line.text;
      story.lineStart = performance.now() - line.text.length * TYPE_MS - 1900;
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
    if (e.key === 'e' || e.key === 'E' || e.key === ' ' || e.key === 'Enter') {
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

  window.storyIntro = { play: playStoryIntro, advance: advanceStory, skip: finishStory, scenes: DRAW, size: { width: W, height: H } };
  window.playStoryIntro = playStoryIntro;
  window.advanceStory = advanceStory;
  window.skipStoryIntro = finishStory;
})();
