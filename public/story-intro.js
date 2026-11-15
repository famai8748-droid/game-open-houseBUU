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
    // Panel 1: the player stands with their back to us at a friend's funeral.
    const push = 1 + Math.min(t, 14) * 0.005;
    cx.save();
    cx.translate(W / 2, H / 2);
    cx.scale(push, push);
    cx.translate(-W / 2, -H / 2);

    if (ready(IMAGES.bg4)) cx.drawImage(IMAGES.bg4, 0, -10, W, H + 20);
    else {
      cx.fillStyle = '#0c0a10';
      cx.fillRect(0, 0, W, H);
    }
    cx.fillStyle = 'rgba(6, 5, 9, 0.7)';
    cx.fillRect(0, 0, W, H);

    const flicker = 0.85 + Math.sin(t * 6.7) * 0.07 + Math.sin(t * 11.3) * 0.04;
    const glow = cx.createRadialGradient(520, 320, 20, 520, 320, 430);
    glow.addColorStop(0, 'rgba(255, 178, 96, ' + 0.3 * flicker + ')');
    glow.addColorStop(0.45, 'rgba(184, 92, 46, 0.12)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    cx.fillStyle = glow;
    cx.fillRect(0, 0, W, H);

    cx.imageSmoothingEnabled = false;

    // ---- coffin on a low stand ----
    const cxL = 404;
    const cxR = 764;
    // stand
    cx.fillStyle = '#0f0a0c';
    cx.fillRect(cxL - 24, 468, cxR - cxL + 48, 16);
    cx.fillRect(cxL + 6, 484, 18, 34);
    cx.fillRect(cxR - 24, 484, 18, 34);
    // body (front face)
    const body = cx.createLinearGradient(0, 300, 0, 470);
    body.addColorStop(0, '#3d1d16');
    body.addColorStop(1, '#26120e');
    cx.fillStyle = body;
    cx.beginPath();
    cx.moveTo(cxL + 10, 306);
    cx.lineTo(cxR - 10, 306);
    cx.lineTo(cxR, 470);
    cx.lineTo(cxL, 470);
    cx.closePath();
    cx.fill();
    // lid (slight perspective on top)
    cx.fillStyle = '#4a2418';
    cx.beginPath();
    cx.moveTo(cxL + 26, 288);
    cx.lineTo(cxR - 26, 288);
    cx.lineTo(cxR - 10, 306);
    cx.lineTo(cxL + 10, 306);
    cx.closePath();
    cx.fill();
    // gold trim
    cx.strokeStyle = 'rgba(214, 170, 96, ' + 0.8 * flicker + ')';
    cx.lineWidth = 3;
    cx.beginPath();
    cx.moveTo(cxL + 10, 306);
    cx.lineTo(cxR - 10, 306);
    cx.lineTo(cxR, 470);
    cx.lineTo(cxL, 470);
    cx.closePath();
    cx.stroke();
    cx.beginPath();
    cx.moveTo(cxL + 26, 288);
    cx.lineTo(cxR - 26, 288);
    cx.stroke();
    // ornament band + lid latch
    cx.fillStyle = 'rgba(202, 158, 88, ' + (0.3 + 0.06 * flicker) + ')';
    cx.fillRect(cxL + 46, 384, cxR - cxL - 92, 8);
    cx.fillRect(cxL + 40, 352, cxR - cxL - 80, 3);
    cx.fillStyle = 'rgba(226, 190, 120, ' + 0.55 * flicker + ')';
    cx.fillRect((cxL + cxR) / 2 - 16, 300, 32, 8);

    // ---- portrait of the friend above the coffin ----
    cx.fillStyle = '#2a2013';
    cx.fillRect(500, 150, 128, 110);
    cx.strokeStyle = '#c9a45a';
    cx.lineWidth = 4;
    cx.strokeRect(500, 150, 128, 110);
    if (ready(IMAGES.photo1)) cx.drawImage(IMAGES.photo1, 508, 158, 112, 94);
    else {
      cx.fillStyle = '#4a4038';
      cx.fillRect(508, 158, 112, 94);
    }
    cx.fillStyle = 'rgba(30, 20, 12, 0.32)';
    cx.fillRect(508, 158, 112, 94);
    // black ribbon corner
    cx.fillStyle = '#0a0a0c';
    cx.beginPath();
    cx.moveTo(500, 150);
    cx.lineTo(548, 150);
    cx.lineTo(500, 192);
    cx.closePath();
    cx.fill();

    // ---- incense tray in front, right of the coffin ----
    cx.fillStyle = '#241a11';
    cx.beginPath();
    cx.ellipse(700, 470, 46, 14, 0, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = '#3b2b1a';
    cx.beginPath();
    cx.ellipse(700, 462, 34, 12, 0, 0, Math.PI * 2);
    cx.fill();
    for (let i = 0; i < 3; i++) {
      const x = 686 + i * 14;
      cx.strokeStyle = '#8a5b34';
      cx.lineWidth = 2;
      cx.beginPath();
      cx.moveTo(x, 460);
      cx.lineTo(x + 2, 402);
      cx.stroke();
      const ember = 0.7 + Math.sin(t * 5 + i) * 0.3;
      const eg = cx.createRadialGradient(x + 2, 402, 0, x + 2, 402, 11);
      eg.addColorStop(0, 'rgba(255, 120, 40, ' + 0.9 * ember + ')');
      eg.addColorStop(1, 'rgba(255, 80, 20, 0)');
      cx.fillStyle = eg;
      cx.beginPath();
      cx.arc(x + 2, 402, 11, 0, Math.PI * 2);
      cx.fill();
    }
    cx.lineCap = 'round';
    for (let s = 0; s < 3; s++) {
      const baseX = 686 + s * 14;
      cx.beginPath();
      for (let k = 0; k <= 24; k++) {
        const p = k / 24;
        const y = 400 - p * 160;
        const sway = Math.sin(p * 5 + t * 1.1 + s * 1.7) * (6 + p * 20) + p * 16;
        const x = baseX + sway;
        if (k === 0) cx.moveTo(x, y);
        else cx.lineTo(x, y);
      }
      cx.strokeStyle = 'rgba(214, 206, 198, ' + (0.09 + s * 0.03) + ')';
      cx.lineWidth = 3 - s * 0.5;
      cx.stroke();
    }

    // candles flanking the coffin
    [386, 786].forEach((x, idx) => {
      const h = 12 + Math.sin(t * 9 + idx * 2) * 3;
      const fg = cx.createRadialGradient(x, 386, 0, x, 386, 30);
      fg.addColorStop(0, 'rgba(255, 214, 140, 0.5)');
      fg.addColorStop(1, 'rgba(255, 140, 40, 0)');
      cx.fillStyle = fg;
      cx.beginPath();
      cx.arc(x, 386, 30, 0, Math.PI * 2);
      cx.fill();
      cx.fillStyle = '#ffd08a';
      cx.beginPath();
      cx.ellipse(x, 386 - h / 2, 3.2, h / 2, 0, 0, Math.PI * 2);
      cx.fill();
    });

    // ---- the player, seen from behind ----
    const breathe = Math.sin(t * 1.2) * 2;
    cx.fillStyle = '#020306';
    cx.beginPath(); // head
    cx.arc(214, 250 + breathe, 34, 0, Math.PI * 2);
    cx.fill();
    cx.beginPath(); // shoulders + back
    cx.moveTo(150, 470);
    cx.quadraticCurveTo(156, 356 + breathe, 214, 300 + breathe);
    cx.quadraticCurveTo(272, 356 + breathe, 278, 470);
    cx.closePath();
    cx.fill();
    cx.fillRect(176, 462, 34, 78);
    cx.fillRect(220, 462, 34, 78);
    // white shirt catching the candlelight
    cx.fillStyle = 'rgba(206, 196, 178, 0.05)';
    cx.beginPath();
    cx.moveTo(170, 470);
    cx.quadraticCurveTo(176, 368 + breathe, 214, 316 + breathe);
    cx.quadraticCurveTo(200, 400, 196, 470);
    cx.closePath();
    cx.fill();
    cx.strokeStyle = 'rgba(230, 180, 122, ' + (0.22 + 0.04 * flicker) + ')';
    cx.lineWidth = 3;
    cx.beginPath();
    cx.moveTo(162, 352 + breathe);
    cx.quadraticCurveTo(190, 322 + breathe, 214, 300 + breathe);
    cx.stroke();
    cx.beginPath();
    cx.arc(214, 250 + breathe, 35, Math.PI * 1.15, Math.PI * 1.9);
    cx.stroke();

    // dust motes in the candlelight
    for (let i = 0; i < 20; i++) {
      const x = 300 + hash(i) * 420 + Math.sin(t * 0.7 + i) * 9;
      const y = (hash(i + 40) * 380 + t * 7) % 380 + 90;
      cx.fillStyle = 'rgba(255, 214, 160, ' + (0.04 + hash(i + 7) * 0.1) + ')';
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

    // ---- what we see past the front seats ----
    const win = { x: 96, y: 46, w: 768, h: 322, r: 26 };
    cx.save();
    cx.beginPath();
    if (cx.roundRect) cx.roundRect(win.x, win.y, win.w, win.h, win.r);
    else cx.rect(win.x, win.y, win.w, win.h);
    cx.clip();
    cx.translate(shake, Math.sin(t * 2.3) * 0.6);

    const sky = cx.createLinearGradient(0, win.y, 0, 300);
    sky.addColorStop(0, '#03050b');
    sky.addColorStop(1, '#0a1119');
    cx.fillStyle = sky;
    cx.fillRect(win.x - 30, win.y - 30, win.w + 60, 340);

    // palms sliding past
    function palm(x, scale, sway) {
      cx.save();
      cx.translate(x, 268);
      cx.rotate(sway);
      cx.fillStyle = '#010309';
      cx.fillRect(-3.4 * scale, -150 * scale, 7 * scale, 150 * scale);
      for (let f = 0; f < 6; f++) {
        const a = -Math.PI / 2 + (f - 2.5) * 0.42;
        cx.beginPath();
        cx.moveTo(0, -146 * scale);
        cx.quadraticCurveTo(
          Math.cos(a) * 62 * scale, -146 * scale + Math.sin(a) * 72 * scale,
          Math.cos(a) * 108 * scale, -146 * scale + Math.sin(a) * 106 * scale + 28 * scale
        );
        cx.quadraticCurveTo(
          Math.cos(a) * 52 * scale, -146 * scale + Math.sin(a) * 52 * scale + 10 * scale,
          0, -140 * scale
        );
        cx.closePath();
        cx.fill();
      }
      cx.restore();
    }
    palm(win.x + 30 - ((t * 24) % 900), 0.82, Math.sin(t * 0.8) * 0.02);
    palm(win.x + 300 - ((t * 24) % 900), 0.6, Math.sin(t * 0.9 + 1) * 0.02);

    // fog over the road
    const fog = cx.createLinearGradient(0, 220, 0, 340);
    fog.addColorStop(0, 'rgba(120, 140, 158, 0)');
    fog.addColorStop(0.45, 'rgba(122, 142, 160, 0.15)');
    fog.addColorStop(1, 'rgba(110, 128, 146, 0.03)');
    cx.fillStyle = fog;
    cx.fillRect(win.x - 20, 220, win.w + 40, 130);

    // road
    const road = cx.createLinearGradient(0, 276, 0, win.y + win.h);
    road.addColorStop(0, '#0a0f16');
    road.addColorStop(1, '#02040a');
    cx.fillStyle = road;
    cx.beginPath();
    cx.moveTo(432, 276);
    cx.lineTo(510, 276);
    cx.lineTo(712, win.y + win.h);
    cx.lineTo(244, win.y + win.h);
    cx.closePath();
    cx.fill();

    // our own headlights
    const beam = cx.createRadialGradient(470, 340, 18, 470, 340, 320);
    beam.addColorStop(0, 'rgba(255, 246, 214, ' + (0.18 + Math.sin(t * 12) * 0.02) + ')');
    beam.addColorStop(0.5, 'rgba(230, 216, 178, 0.06)');
    beam.addColorStop(1, 'rgba(230, 216, 178, 0)');
    cx.fillStyle = beam;
    cx.fillRect(230, 270, 500, 220);

    // dashes
    for (let i = 0; i < 5; i++) {
      const p = (i + (t * 1.7) % 1) / 5;
      const y = 282 + p * p * 200;
      const w = 3 + p * 18;
      cx.fillStyle = 'rgba(236, 230, 206, ' + (0.05 + p * 0.14) + ')';
      cx.fillRect(471 - w / 2, y, w, 5 + p * 22);
    }

    // rain on the glass
    cx.strokeStyle = 'rgba(200, 218, 236, 0.5)';
    cx.lineWidth = 1;
    for (let i = 0; i < 75; i++) {
      const x = win.x + ((hash(i) * win.w + t * (24 + hash(i + 3) * 42)) % win.w);
      const y = win.y + ((hash(i + 11) * win.h + t * 300 * (0.5 + hash(i + 9))) % win.h);
      cx.globalAlpha = 0.12 + hash(i + 21) * 0.28;
      cx.beginPath();
      cx.moveTo(x, y);
      cx.lineTo(x - 2.5, y + 10 + hash(i + 5) * 10);
      cx.stroke();
    }
    cx.globalAlpha = 1;

    // ---- the swerving truck, only after the parents' lines ----
    const carIn = smooth((phase - 1.8) / 1.4);
    if (carIn > 0) {
      const k = 0.22 + carIn * 1.35;
      const cxp = 566 + Math.sin(t * 0.55) * 16 * k;
      const cyp = 332 - carIn * 30;
      const alpha = 0.6 + 0.4 * carIn;

      const glare = cx.createRadialGradient(cxp, cyp, 10, cxp, cyp, 260 * k);
      glare.addColorStop(0, 'rgba(255, 250, 226, ' + 0.55 * carIn + ')');
      glare.addColorStop(0.4, 'rgba(255, 244, 206, ' + 0.28 * carIn + ')');
      glare.addColorStop(1, 'rgba(255, 244, 206, 0)');
      cx.fillStyle = glare;
      cx.fillRect(win.x - 20, win.y - 20, win.w + 40, win.h + 40);

      const bw = 170 * k;
      const bh = 130 * k;
      cx.globalAlpha = alpha;
      cx.fillStyle = '#02030a';
      cx.beginPath();
      if (cx.roundRect) cx.roundRect(cxp - bw / 2, cyp - bh * 0.42, bw, bh, 6 * k);
      else cx.rect(cxp - bw / 2, cyp - bh * 0.42, bw, bh);
      cx.fill();
      // cargo box catching a little light
      cx.fillStyle = 'rgba(90, 104, 112, ' + 0.14 * carIn + ')';
      cx.fillRect(cxp - bw * 0.44, cyp - bh * 0.36, bw * 0.88, bh * 0.4);
      // cab window
      cx.fillStyle = 'rgba(130, 160, 176, ' + 0.14 * carIn + ')';
      cx.fillRect(cxp - bw * 0.32, cyp - bh * 0.06, bw * 0.64, bh * 0.22);

      // high beams (two on the bumper, two on the roof)
      const lights = [
        [-0.3, 0.16], [0.3, 0.16], [-0.34, -0.3], [0.34, -0.3]
      ];
      lights.forEach(([dx, dy]) => {
        const lx = cxp + dx * bw;
        const ly = cyp + dy * bh;
        const halo = cx.createRadialGradient(lx, ly, 0, lx, ly, 52 * k);
        halo.addColorStop(0, 'rgba(255, 255, 250, ' + carIn + ')');
        halo.addColorStop(0.35, 'rgba(255, 246, 206, ' + 0.7 * carIn + ')');
        halo.addColorStop(1, 'rgba(255, 236, 176, 0)');
        cx.fillStyle = halo;
        cx.beginPath();
        cx.arc(lx, ly, 52 * k, 0, Math.PI * 2);
        cx.fill();
        cx.fillStyle = 'rgba(255, 255, 252, ' + carIn + ')';
        cx.beginPath();
        cx.arc(lx, ly, 8 * k, 0, Math.PI * 2);
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
      const ox = 330 + i * 260;
      const ang = -1.52 + smooth(wipe) * 1;
      cx.beginPath();
      cx.moveTo(ox, 330);
      cx.lineTo(ox + Math.cos(ang) * 160, 330 + Math.sin(ang) * 160);
      cx.stroke();
    });

    // impact
    const flash = phase >= 3 ? smooth((lineT - 1.4) / 1.1) : 0;
    if (flash > 0) {
      cx.fillStyle = 'rgba(255, 252, 240, ' + flash * 0.95 + ')';
      cx.fillRect(win.x - 30, win.y - 30, win.w + 60, win.h + 60);
    }

    cx.restore();

    // ---- cockpit seen from the back seat ----
    cx.fillStyle = '#020308';
    // roof
    cx.beginPath();
    cx.moveTo(-20, 0);
    cx.lineTo(W + 20, 0);
    cx.lineTo(W + 20, 40);
    cx.quadraticCurveTo(W / 2, 80, -20, 40);
    cx.closePath();
    cx.fill();

    // rear-view mirror
    cx.fillRect(438, 14, 84, 26);
    cx.strokeStyle = 'rgba(150, 164, 184, 0.1)';
    cx.lineWidth = 2;
    cx.strokeRect(438, 14, 84, 26);

    // A-pillars
    cx.beginPath();
    cx.moveTo(-20, 26);
    cx.lineTo(180, 56);
    cx.lineTo(150, 360);
    cx.lineTo(-20, 420);
    cx.closePath();
    cx.fill();
    cx.beginPath();
    cx.moveTo(W + 20, 26);
    cx.lineTo(790, 56);
    cx.lineTo(816, 360);
    cx.lineTo(W + 20, 420);
    cx.closePath();
    cx.fill();

    // dashboard sliver between the front seats
    cx.fillStyle = '#04050a';
    cx.fillRect(410, 320, 150, 130);
    cx.fillStyle = 'rgba(255, 176, 74, ' + (0.3 + Math.sin(t * 3) * 0.05) + ')';
    cx.fillRect(452, 366, 62, 4);
    cx.fillStyle = 'rgba(120, 200, 190, 0.16)';
    cx.fillRect(462, 378, 42, 3);

    // front seat backs, mother left and father right
    const bob = Math.sin(t * 1.5) * 1.4;
    cx.fillStyle = '#020308';
    // mother's seat
    cx.beginPath();
    cx.moveTo(96, H);
    cx.lineTo(110, 472 + bob);
    cx.quadraticCurveTo(268, 436 + bob, 404, 468 + bob);
    cx.lineTo(412, H);
    cx.closePath();
    cx.fill();
    // father's seat
    cx.beginPath();
    cx.moveTo(548, H);
    cx.lineTo(556, 466 + bob);
    cx.quadraticCurveTo(700, 430 + bob, 846, 462 + bob);
    cx.lineTo(866, H);
    cx.closePath();
    cx.fill();

    // their heads, just over the seat tops
    cx.fillStyle = '#0a0c15';
    cx.beginPath();
    cx.ellipse(250, 424 + bob, 50, 58, -0.03, 0, Math.PI * 2);
    cx.fill();
    cx.beginPath();
    cx.ellipse(712, 418 + bob, 48, 56, 0.03, 0, Math.PI * 2);
    cx.fill();

    // headrests behind the heads
    cx.fillStyle = '#03040a';
    cx.beginPath();
    cx.ellipse(250, 470 + bob, 64, 40, 0, 0, Math.PI * 2);
    cx.fill();
    cx.beginPath();
    cx.ellipse(712, 464 + bob, 62, 40, 0, 0, Math.PI * 2);
    cx.fill();

    // heads catch a thin warm edge from the dashboard
    cx.strokeStyle = 'rgba(236, 190, 132, ' + (0.3 + Math.sin(t * 2.2) * 0.04) + ')';
    cx.lineWidth = 2.4;
    cx.beginPath();
    cx.arc(250, 424 + bob, 51, Math.PI * 1.08, Math.PI * 1.95);
    cx.stroke();
    cx.beginPath();
    cx.arc(712, 418 + bob, 49, Math.PI * 1.05, Math.PI * 1.92);
    cx.stroke();

    // faint cabin ambience so the black has some shape
    const inside = cx.createRadialGradient(480, 430, 40, 480, 430, 460);
    inside.addColorStop(0, 'rgba(120, 96, 66, 0.1)');
    inside.addColorStop(0.6, 'rgba(70, 56, 40, 0.05)');
    inside.addColorStop(1, 'rgba(0, 0, 0, 0)');
    cx.fillStyle = inside;
    cx.fillRect(0, 330, W, H - 330);

    // dash light catching the seat edges
    cx.strokeStyle = 'rgba(232, 176, 108, ' + (0.18 + Math.sin(t * 2.4) * 0.03) + ')';
    cx.lineWidth = 3;
    cx.beginPath();
    cx.moveTo(120, 484 + bob);
    cx.quadraticCurveTo(262, 458 + bob, 396, 480 + bob);
    cx.stroke();
    cx.beginPath();
    cx.moveTo(566, 478 + bob);
    cx.quadraticCurveTo(700, 452 + bob, 838, 476 + bob);
    cx.stroke();

    // our own legs on the back seat, close to the lens
    cx.fillStyle = '#070810';
    cx.beginPath();
    cx.moveTo(318, H);
    cx.quadraticCurveTo(360, 466, 432, 480);
    cx.lineTo(470, H);
    cx.closePath();
    cx.fill();
    cx.beginPath();
    cx.moveTo(470, H);
    cx.quadraticCurveTo(500, 484, 566, 496);
    cx.lineTo(592, H);
    cx.closePath();
    cx.fill();
    cx.strokeStyle = 'rgba(150, 128, 100, 0.12)';
    cx.lineWidth = 2;
    cx.beginPath();
    cx.moveTo(330, H);
    cx.quadraticCurveTo(368, 470, 432, 482);
    cx.moveTo(478, H);
    cx.quadraticCurveTo(504, 486, 566, 498);
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
    { scene: 0, speaker: '@player', text: 'งานศพเพื่อนสนิท... ผมยืนมองรูปเขาอยู่จนธูปหมดดอก และยังไม่อยากเชื่อว่าเขาจากไปแล้วจริง ๆ' },
    { scene: 0, speaker: 'แม่', text: 'กลับกันเถอะลูก ดึกแล้ว ต้องขับกลับต่างจังหวัดอีกไกล พรุ่งนี้ยังมีธุระอีกตั้งหลายอย่าง' },
    { scene: 0, speaker: '@player', text: 'ครับแม่... ขอจุดธูปให้มันอีกดอกนะ' },

    { scene: 1, speaker: 'พ่อ', text: 'ฝนตกหนักขนาดนี้ ทางลื่นมาก ลูกนั่งให้ดี ๆ นะ' },
    { scene: 1, speaker: 'แม่', text: 'ถึงบ้านแล้วแม่จะต้มน้ำขิงให้ กินแล้วนอนพักให้เต็มที่นะลูก' },
    { scene: 1, speaker: '@player', text: 'ครับ... พ่อครับ ไฟสว่าง ๆ ข้างหน้านั่น รถอะไรน่ะ' },
    { scene: 1, speaker: 'พ่อ', text: 'รถบรรทุก... มันเสียหลัก! จับให้แน่น!' },

    { scene: 2, speaker: '@player', text: 'อึก... เลือดไหลเข้าตา... รถพลิกตะแคง ไฟลุกท่วมทั้งคัน' },
    { scene: 2, speaker: '@player', text: 'พ่อ! แม่! ได้ยินผมไหม... อย่าหลับนะ... อย่าหลับ!' },

    { scene: 3, speaker: '@player', text: 'ผมฟื้นขึ้นกลางป่ามืด ๆ ... รถอยู่ไหน พ่อกับแม่อยู่ไหน' },
    { scene: 3, speaker: '@player', text: 'เหลือแค่ไฟฉายในมือ... ต้องหาพวกเขาให้เจอ ก่อนที่อะไรในป่านี้จะเจอผมก่อน' },
    { scene: 3, speaker: 'เสียงกระพรวน', text: 'กริ๊ง... กริ๊ง... เสียงกระพรวนดังอยู่ข้างหลังเรือน แต่ตรงนั้นไม่มีใคร...' }
  ];

  const SCENE_TAGS = [
    '1 / 4 · งานศพเพื่อน',
    '2 / 4 · ขากลับบ้าน',
    '3 / 4 · อุบัติเหตุ',
    '4 / 4 · ฟื้นขึ้นกลางป่า'
  ];

  const SCENE_SOUND = ['chime', 'thunder', 'scare', 'whisper'];

  const SPEAKER_COLORS = {
    "แม่ (สายเข้า)": "#a9c7e8",
    "พ่อ (เสียงจากสาย)": "#9db8d8",
    'นนท์': '#f0c45a',
    'ริน': '#8fd6c0',
    'พ่อ': '#d8c39a',
    'แม่': '#e6c2ae',
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
    const speakerName = line.speaker === '@player'
      ? (typeof state !== 'undefined' && state.character === 'female' ? 'ริน' : 'นนท์')
      : line.speaker;
    story.ui.speaker.textContent = speakerName;
    story.ui.speaker.style.color = SPEAKER_COLORS[speakerName] || '#cbbfae';
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
