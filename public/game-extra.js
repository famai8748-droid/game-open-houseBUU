/* ============================================================================
 * เรือนซ่อนวิญญาณ - extra content. Loaded right after game.js and shares its globals.
 *   1. mash   : "กดรัวๆ ให้หลุด" — a ghost's first grab in each room, and the hands on the bridge
 *   2. ranat  : แม่จันทร์'s unfinished song in scene 4 (listen to a phrase, then play it back)
 *   3. chase  : the run across the spirit bridge, between the back door and the dawn (scene 5)
 *   4. choice : a two-answer question (keyboard, mouse/touch, or the P1 phone)
 *   5. promise: keep or refuse the uncle's promise; refusing ends in the hospital at night
 *   6. night2 : "คืนที่สอง", a harder replay unlocked on this machine after a finish
 *   7. under  : ใต้ถุนเรือน, the crawl space below room 3 (the samphawesi paces on the floor above)
 * game.js calls into this file from its update / render / input paths; nothing here runs
 * before a game has started.
 * ============================================================================ */

// One-shot synth sound through the same sfx bus (and mute switch) as playSound().
function xSound(build, opts = {}) {
  if (audioMuted) return;
  initAudio();
  if (!audioCtx || audioCtx.state === 'closed') return;
  build(audioCtx.currentTime, outputNode(opts.gain == null ? 1 : opts.gain, opts.pan || 0, audioBus.sfx));
}

// ----------------------- 1. Mash to break free -----------------------
// kind 'ghost': the world stops, a few seconds to hammer the button, or the ghost keeps you.
// kind 'hand' : on the bridge; no clock of its own, the darkness behind you is the clock.
const mash = { active: false, kind: '', need: 0, got: 0, left: 0, total: 0, pressAt: 0, quietUntil: 0 };
const STRUGGLE = { need: 8, seconds: 3.2 };

function startMash(kind, need, seconds = 0) {
  Object.assign(mash, { active: true, kind, need, got: 0, left: seconds, total: seconds, pressAt: 0 });
  state.moveInput = 0;
  net.remoteMoving = false;
  vibrate([70, 40, 70]);
  broadcastState();
}

function mashPress() {
  if (!mash.active || isPaused()) return false;
  mash.got++;
  mash.pressAt = performance.now();
  xSound((t, out) => {
    tone(t, { freq: 150 + mash.got * 9, to: 70, dur: 0.09, peak: 0.13, out });
    noiseHit(t, { dur: 0.05, peak: 0.05, freq: 500, out });
  });
  if (mash.got >= mash.need) endMash(true);
  return true;
}

function endMash(won) {
  if (!mash.active) return;
  const kind = mash.kind;
  mash.active = false;
  mash.quietUntil = performance.now() + 450; // the last few hammered presses must not open a door
  if (kind === 'ghost') {
    if (won) breakFreeFromGhost();
    else triggerGameOver();
  } else if (kind === 'hand') {
    chaseHandFreed();
  }
  broadcastState();
}

// Called from updateGame while a ghost holds the player (it returns early, so pausing stops the clock).
function tickStruggle(dt) {
  mash.left -= dt;
  if (mash.left <= 0) endMash(false);
}

// The catch test in updateGhost asks this first: one escape per room visit / per life.
function tryStruggle() {
  if (!(state.struggleLeft > 0)) return false;
  state.struggleLeft = 0;
  startMash('ghost', STRUGGLE.need, STRUGGLE.seconds);
  playSound('scare', { gain: 0.45 });
  return true;
}

function breakFreeFromGhost() {
  const g = state.ghost;
  const p = state.player;
  const away = Math.sign(g.x - p.x) || -p.dir;
  g.x = Math.max(-60, Math.min(1340, g.x + away * 150));
  g.stunTimer = 2.6;
  state.unhideGrace = 1.2;
  playSound('hide_out');
  playSound('chime', { gain: 0.5 });
  showToast('ดิ้นหลุดแล้ว! รีบหนี — ครั้งหน้ามันจะไม่ปล่อยอีก', 'warn', 4200);
}

function mashLabel() {
  if (!mash.active) return '';
  return mash.kind === 'ghost' ? 'ดิ้นให้หลุด! กดรัวๆ' : 'มือคว้าขาไว้! กดรัวๆ ให้หลุด';
}

function renderMashOverlay(now) {
  if (!mash.active) return;
  const k = Math.min(1, mash.got / mash.need);
  const pulse = REDUCED_MOTION ? 0.5 : 0.5 + 0.5 * Math.sin(now / 90);
  const cx = 640;
  const cy = 236;
  const r = 60;
  ctx.save();
  const v = ctx.createRadialGradient(640, 380, 220, 640, 380, 780);
  v.addColorStop(0, 'rgba(120, 0, 0, 0)');
  v.addColorStop(1, `rgba(150, 12, 12, ${0.3 + 0.22 * pulse})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, 1280, 720);

  ctx.fillStyle = 'rgba(8, 6, 10, 0.78)';
  ctx.beginPath();
  ctx.arc(cx, cy, r + 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#ffd36b';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
  ctx.stroke();

  const bump = now - mash.pressAt < 90 ? 0.86 : 1;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round((IS_TOUCH ? 30 : 56) * bump)}px "Chakra Petch", Sarabun, sans-serif`;
  ctx.fillText(IS_TOUCH ? 'สำรวจ' : 'E', cx, cy + 3);
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 32px Sarabun, sans-serif';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#ffe9c2';
  ctx.fillText(mashLabel(), cx, cy + r + 66);
  ctx.shadowBlur = 0;
  if (mash.total > 0) { // the ghost's grip: time left
    const w = 280;
    const left = Math.max(0, mash.left / mash.total);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(cx - w / 2, cy + r + 84, w, 7);
    ctx.fillStyle = left < 0.35 ? '#ff6a5a' : '#f1c27a';
    ctx.fillRect(cx - w / 2, cy + r + 84, w * left, 7);
  }
  ctx.restore();
}

// ----------------------- 2. The ranat: แม่จันทร์'s unfinished song -----------------------
// Three phrases of 3, 4 and 5 notes on five bars. The ranat plays a phrase, the player plays it
// back. A wrong note makes the dancer step closer; three wrong notes blow the candles out.
const RANAT = { freqs: [392, 440, 523.25, 587.33, 659.25], rounds: [3, 4, 5], maxMiss: 3, noteMs: 560, x: 775 };
const ranat = { seq: [], round: 0, pos: 0, phase: 'idle', miss: 0, timers: [] };

function isRanatOpen() {
  const el = document.getElementById('ranat-modal');
  return !!el && !el.classList.contains('hidden');
}

function ranatNote(i) {
  xSound((t, out) => {
    const f = RANAT.freqs[i];
    // a real wooden bar (marimba G5, CC0) tuned to each note, an octave up like a ranat ek; synth until it loads
    if (playSample('ranat', out, { gain: 0.4, rate: f / 392, t })) return;
    tone(t, { type: 'triangle', freq: f, dur: 0.55, peak: 0.13, attack: 0.003, out });
    tone(t, { freq: f * 2, dur: 0.3, peak: 0.03, attack: 0.003, out });
    tone(t, { freq: f * 3.9, dur: 0.08, peak: 0.03, attack: 0.002, out }); // wooden click
  });
}

function ranatAfter(ms, fn) {
  ranat.timers.push(setTimeout(fn, ms));
}

function ranatClearTimers() {
  ranat.timers.forEach(clearTimeout);
  ranat.timers = [];
}

function ranatLight(i) {
  const btn = document.querySelector(`#ranat-bars [data-bar="${i + 1}"]`);
  if (!btn) return;
  restartAnimation(btn, 'hit');
}

function ranatStatus(text, cls = '') {
  const el = document.getElementById('ranat-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'ranat-status ' + cls;
}

function refreshRanatUi() {
  document.querySelectorAll('#ranat-rounds span').forEach((el, i) => {
    el.classList.toggle('done', i < ranat.round);
    el.classList.toggle('now', i === ranat.round && ranat.phase !== 'done');
  });
  const bars = document.getElementById('ranat-bars');
  if (bars) bars.classList.toggle('listening', ranat.phase === 'demo');
}

// What the P1 phone shows in the keypad's display while the ranat is open.
function ranatDisplay() {
  const len = RANAT.rounds[ranat.round] || 0;
  if (ranat.phase === 'demo') return 'ฟังทำนอง...';
  if (ranat.phase === 'input') return `เคาะ ๑-๕ (${ranat.pos}/${len})`;
  return '';
}

// What P2's spirit vision sees so they can call out the current ranat phrase to P1.
function ranatCoopHint() {
  if (!isRanatOpen() || ranat.phase === 'done') return '';
  const len = RANAT.rounds[ranat.round] || 0;
  if (!len) return '';
  return ranat.seq.slice(0, len).map((n) => THAI_DIGITS[n + 1]).join(' · ');
}

function openRanat() {
  playSound('window_open');
  const seq = [];
  while (seq.length < 5) {
    const n = Math.floor(Math.random() * 5);
    if (n !== seq[seq.length - 1]) seq.push(n);
  }
  Object.assign(ranat, { seq, round: 0, pos: 0, phase: 'idle', miss: 0 });
  ranatClearTimers();
  state.moveInput = 0;
  document.getElementById('ranat-modal').classList.remove('hidden');
  ranatStatus('ไม้ตีวางพาดอยู่บนลูกระนาด เหมือนมีคนเพิ่งวางมือ...');
  refreshRanatUi();
  ranatAfter(900, ranatDemo);
  broadcastState();
}

function closeRanat() {
  ranatClearTimers();
  ranat.phase = 'idle';
  const el = document.getElementById('ranat-modal');
  if (el) el.classList.add('hidden');
  broadcastState();
}

function ranatDemo() {
  if (!isRanatOpen() || ranat.phase === 'done') return;
  ranatClearTimers();
  ranat.phase = 'demo';
  ranat.pos = 0;
  const len = RANAT.rounds[ranat.round];
  ranatStatus(`ท่อนที่ ${ranat.round + 1}/3 — ฟังให้ดี...`);
  refreshRanatUi();
  for (let i = 0; i < len; i++) {
    ranatAfter(350 + i * RANAT.noteMs, () => {
      ranatNote(ranat.seq[i]);
      ranatLight(ranat.seq[i]);
    });
  }
  ranatAfter(350 + len * RANAT.noteMs + 150, () => {
    ranat.phase = 'input';
    ranatStatus(`ตาคุณ — เคาะตามทำนองเมื่อครู่ (0/${len})`, 'go');
    refreshRanatUi();
    broadcastState();
  });
  broadcastState();
}

// "ฟังอีกครั้ง": E / the phone's big button / the button in the window.
function ranatReplay() {
  if (isPaused() || !isRanatOpen() || ranat.phase !== 'input') return;
  ranatDemo();
}

function ranatPress(n) {
  if (isPaused() || !isRanatOpen() || ranat.phase !== 'input' || !Number.isInteger(n) || n < 1 || n > 5) return;
  const i = n - 1;
  const len = RANAT.rounds[ranat.round];
  ranatLight(i);
  if (i !== ranat.seq[ranat.pos]) return ranatWrong();
  ranatNote(i);
  ranat.pos++;
  ranatStatus(`ตาคุณ — เคาะตามทำนองเมื่อครู่ (${ranat.pos}/${len})`, 'go');
  if (ranat.pos < len) return broadcastState();
  ranat.round++;
  ranat.phase = 'wait';
  refreshRanatUi();
  if (ranat.round >= RANAT.rounds.length) {
    ranatStatus('จบเพลง... เสียงกระพรวนข้อเท้ารับจังหวะตามมาเบาๆ', 'go');
    ranatAfter(1100, ranatSuccess);
  } else {
    playSound('chime', { gain: 0.5 });
    ranatStatus('ถูกทำนอง... ท่อนต่อไปยาวขึ้น', 'go');
    ranatAfter(1200, ranatDemo);
  }
  broadcastState();
}

function ranatWrong() {
  ranat.miss++;
  playSound('lock_wrong');
  vibrate([80, 40, 80]);
  restartAnimation(document.querySelector('#ranat-modal .modal-box'), 'shake');
  if (ranat.miss >= RANAT.maxMiss) return ranatFail();
  ranat.phase = 'wait';
  angerDancer(); // she steps closer with every wrong note
  ranatStatus(`ผิดทำนอง! เสียงกระพรวนขยับเข้ามาใกล้... (พลาดได้อีก ${RANAT.maxMiss - ranat.miss} ครั้ง)`, 'bad');
  ranatAfter(1300, ranatDemo);
  broadcastState();
}

// Three wrong notes: every flame dies and she is suddenly in front of you (like a botched offering).
function ranatFail() {
  closeRanat();
  playSound('scare', { gain: 0.45 });
  const now = performance.now();
  const p = state.player;
  fx.candlesOutUntil = now + 2600;
  fx.ghostHoldUntil = now + 1500;
  triggerBlackout(1400, { img: 'dancerAnim1', x: Math.max(80, Math.min(1200, p.x + p.dir * 150)), bottom: 616, h: 320, flip: p.dir === 1, at: 650, dur: 260 });
  angerDancer();
  showToast('เพลงล่มกลางคัน เปลวเทียนดับวูบ... ตั้งสติแล้วกลับไปเคาะระนาดใหม่', 'warn', 4500);
}

function ranatSuccess() {
  closeRanat();
  state.flags.songPlayed = true;
  playSound('chime');
  ranat.seq.forEach((n, i) => setTimeout(() => ranatNote(n), 120 + i * 170)); // the phrase once more, quick
  updateHud();
  const ready = state.flags.offeringsPlaced && state.flags.photosRestored;
  queueDialogue([
    { speaker: getPlayerName(), text: 'โน้ตตัวสุดท้ายค้างอยู่ในอากาศ... แล้วเสียงกระพรวนข้อเท้าก็รับจังหวะ เหมือนมีใครรำตามจนจบเพลง' },
    ready
      ? { speaker: getPlayerName(), text: `เพลงที่ค้างมาร้อยปี จบลงแล้ว... ${pWord('ผม', 'ฉัน')}ดูอยู่นะ แม่จันทร์` }
      : { speaker: getPlayerName(), text: 'เพลงจบแล้ว แต่เธอยังไม่ไป... ยังขาดของเซ่นที่หิ้งบูชากับรูปที่ถูกฉีก ต้องทำให้ครบ' }
  ], checkRitualComplete);
}

// The hotspot in scene 4 (buildSceneHotspots adds it).
function ranatHotspot() {
  return {
    id: 'ranat_ek',
    x: RANAT.x,
    width: 110,
    label: 'ระนาดเอกเก่า (บรรเลงเพลงที่ค้างอยู่)',
    isHiddenClue: !state.flags.songPlayed,
    onInteract: () => {
      if (state.flags.songPlayed) {
        queueDialogue([{ speaker: getPlayerName(), text: 'ระนาดเงียบแล้ว... แต่ไม้ตียังอุ่น เหมือนมีมืออีกคู่จับมันอยู่เมื่อครู่' }]);
      } else if (!state.flags.ranatSeen) {
        state.flags.ranatSeen = true;
        queueDialogue([
          { speaker: getPlayerName(), text: 'ระนาดเอก... ฝุ่นจับทุกลูก ยกเว้นห้าลูกตรงกลางที่มันวาวเหมือนเพิ่งถูกเคาะ' },
          { speaker: 'เสียงกระซิบที่คุ้นหู', text: 'เธอรำไม่จบเพราะเพลงไม่จบ... ฟังทำนองที่ค้างอยู่ แล้วเคาะตามให้ครบสามท่อน' }
        ], openRanat);
      } else {
        openRanat();
      }
    }
  };
}

function drawRanat() {
  const cx = RANAT.x;
  const by = 612;
  drawGroundShadow(cx, by - 2, 96, 13, 0.6);
  if (isReady(IMAGES.ranat)) { // painted prop (Gemini); the code drawing below is the fallback
    if (!state.flags.songPlayed) { // the unfinished song still hangs over the bars
      const pulse = 0.16 + 0.07 * Math.sin(performance.now() / 600);
      const halo = ctx.createRadialGradient(cx, by - 80, 6, cx, by - 80, 120);
      halo.addColorStop(0, `rgba(240, 196, 120, ${pulse})`);
      halo.addColorStop(1, 'rgba(240, 196, 120, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(cx - 120, by - 200, 240, 200);
    }
    drawProp(IMAGES.ranat, cx, by, 106);
    return;
  }
  ctx.save();
  ctx.translate(cx, by);
  ctx.fillStyle = '#2a1a0f'; // pedestal
  ctx.fillRect(-13, -30, 26, 24);
  ctx.fillRect(-34, -8, 68, 8);
  ctx.fillStyle = '#4b2d18'; // boat-shaped resonator
  ctx.beginPath();
  ctx.moveTo(-96, -92);
  ctx.lineTo(-82, -92);
  ctx.quadraticCurveTo(-60, -56, 0, -52);
  ctx.quadraticCurveTo(60, -56, 82, -92);
  ctx.lineTo(96, -92);
  ctx.quadraticCurveTo(84, -32, 0, -26);
  ctx.quadraticCurveTo(-84, -32, -96, -92);
  ctx.fill();
  ctx.strokeStyle = 'rgba(214, 170, 92, 0.75)'; // worn gilt edge
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-92, -86);
  ctx.quadraticCurveTo(-80, -36, 0, -31);
  ctx.quadraticCurveTo(80, -36, 92, -86);
  ctx.stroke();
  const live = !state.flags.songPlayed;
  for (let i = 0; i < 13; i++) { // the bars hang in a shallow curve
    const t = i / 12;
    const x = -72 + 144 * t;
    const y = -84 + 16 * Math.sin(Math.PI * t);
    const mid = i >= 4 && i <= 8;
    ctx.fillStyle = mid && live ? '#c79a55' : (i % 2 ? '#6d5131' : '#7b5d3a');
    ctx.fillRect(x - 4.5, y, 9, 15 - t * 4);
  }
  ctx.restore();
}

// ----------------------- 3. The spirit bridge -----------------------
// The back door does not open onto the yard: a plank bridge runs through the fog toward a far
// light, and the dark pours out of the house behind you. Run right. Hands under the planks grab
// your legs (mash to break free); now and then the blind one rises ahead and listens (let go of
// the walk key until it sinks). P2's bell holds the dark back and tears a hand loose.
const CHASE = {
  LENGTH: 5000,
  PX: 430,          // where the player stands on screen
  START_GAP: 470,
  MAX_GAP: 540,     // the dark never falls further behind than this
  WALL: 150,
  WALL_FAST: 520,
  WALL_LISTEN: 60,  // it holds its breath too
  CAUGHT_GAP: 46,
  WARN_MS: 1000,
  EVENTS: [
    { at: 700, kind: 'hand', need: 6 },
    { at: 1450, kind: 'listen', ms: 1500 },
    { at: 2200, kind: 'hand', need: 8 },
    { at: 2950, kind: 'listen', ms: 2000, voice: true },
    { at: 3650, kind: 'hand', need: 9 },
    { at: 4350, kind: 'hand', need: 10 }
  ]
};
const chase = { active: false, fails: 0, cause: '', dist: 0, wall: 0, next: 0, listen: null, sinking: null, endAt: 0, flashAt: 0, whiteUntil: 0, heart: 0, whisper: 0 };

function chaseGap() {
  return chase.dist - chase.wall;
}

function startChase() {
  Object.assign(chase, { active: true, fails: 0, cause: '', dist: 0, wall: -CHASE.START_GAP, next: 0, listen: null, sinking: null, endAt: 0, flashAt: 0, heart: 0, whisper: 3 });
  mash.active = false;
  const g = state.ghost;
  g.type = 'samphawesi';
  g.active = true; // so P2's bell is live and the radar shows the dark closing in
  g.alpha = 1;
  g.stunTimer = 0;
  g.phase = 'chase';
  const p = state.player;
  p.x = CHASE.PX;
  p.dir = 1;
  p.hidden = false;
  p.flashlight = true;
  state.moveInput = 0;
  playTension();
  updateHud();
  queueDialogue([
    { speaker: getPlayerName(), text: 'ประตูเปิดแล้ว... แต่ข้างนอกไม่ใช่ลานบ้าน — สะพานไม้ทอดยาวหายไปในหมอก มีสายสิญจน์ขึงนำทางไปหาแสงริบหรี่ที่ปลายทาง' },
    { speaker: 'เสียงจากเรือนข้างหลัง', text: 'ครืนนน... (ความมืดไหลทะลักออกมาจากบานประตู เหมือนเรือนทั้งหลังกำลังสูดลมหายใจเข้า)' },
    { speaker: 'เสียงกระซิบที่คุ้นหู', text: 'วิ่ง! เรือนนี้ไม่เคยปล่อยใครไปง่ายๆ... ถ้ามือพวกนั้นคว้าขาไว้ให้ดิ้นจนหลุด ถ้าเห็นมันโผล่มาขวางทางให้หยุดนิ่ง — แล้วอย่าหันกลับมาเด็ดขาด' }
  ]);
}

// Scene 5 proper: out of breath in the morning fog (also where a staff skip lands).
function beginDawn() {
  state.ghost.active = false;
  state.player.flashlight = false;
  document.getElementById('danger-overlay').classList.add('hidden');
  queueDialogue([
    { speaker: getPlayerName(), text: 'แฮ่ก... ออกมาได้แล้ว ข้างนอกหมอกลงขาว... แต่เงาร่างตรงนั้น ทำไมคุ้นเหมือนญาติผู้ใหญ่ในงานศพ' }
  ]);
}

function finishChase() {
  chase.active = false;
  chase.endAt = 0;
  chase.listen = null;
  mash.active = false;
  chase.whiteUntil = performance.now() + 1400;
  state.flags.escaped = true;
  state.player.x = 220;
  state.player.dir = 1;
  state.moveInput = 0;
  net.remoteMoving = false;
  setAmbientScene(5);
  setMusicLevel(0.5, 1.8, { restart: true }); // the theme returns with the light
  showChapterCard(5);
  beginDawn();
  updateHud();
  broadcastState();
}

// After being caught: back to just past the last obstacle you cleared. Each death at the same
// obstacle loosens the hands' grip a little, so a slow masher still gets across.
function resetChaseSegment() {
  chase.fails++;
  const start = chase.next > 0 ? CHASE.EVENTS[chase.next - 1].at + 90 : 0;
  Object.assign(chase, { dist: start, wall: start - CHASE.START_GAP, listen: null, sinking: null, endAt: 0 });
  mash.active = false;
  const p = state.player;
  p.x = CHASE.PX;
  p.dir = 1;
  p.flashlight = true;
  state.ghost.active = true;
  state.ghost.stunTimer = 1.5;
}

function chaseHandFreed() {
  chase.next++;
  chase.fails = 0;
  playSound('hide_out');
  vibrate(40);
}

// P2's bell (or the staff's "hold the ghost"): the dark stands still, and a hand lets go.
function chaseBell(source) {
  if (state.bellCooldown > 0) return false;
  state.ghost.stunTimer = CONFIG.BELL_STUN;
  state.bellCooldown = bellCooldownSecs();
  playSound('chime');
  showToast(`${source === 'P2' ? 'ญาณทิพย์ (P2)' : getPlayerName()} สั่นกระดิ่งอาคม! ความมืดชะงัก ${CONFIG.BELL_STUN} วินาที`);
  if (mash.active && mash.kind === 'hand') endMash(true);
  broadcastState();
  return true;
}

function chasePrompt() {
  if (mash.active) return mashLabel();
  if (chase.listen) return 'หยุดนิ่ง! อย่าเดิน';
  return 'วิ่งไปทางขวา!';
}

function updateChase(dt) {
  const now = performance.now();
  const g = state.ghost;
  const p = state.player;
  if (chase.endAt) {
    if (now >= chase.endAt) finishChase();
    return;
  }
  if (isDialogueOpen() || isOverlayOpen()) {
    p.frame = 0;
    return;
  }
  state.bellCooldown = Math.max(0, state.bellCooldown - dt);

  // run
  if (!mash.active && state.moveInput !== 0) {
    const limit = chase.listen ? chase.listen.ev.at + 150 : CHASE.LENGTH;
    chase.dist = Math.max(chase.wall + 60, Math.min(limit, chase.dist + state.moveInput * CONFIG.PLAYER_SPEED * dt));
    state.stepTimer += dt;
    if (state.stepTimer >= 0.11) {
      state.stepTimer = 0;
      p.frame = (p.frame + 1) % 8;
      if (p.frame % 4 === 0) playSound('footstep');
    }
  } else {
    p.frame = 0;
  }
  p.x = CHASE.PX;

  // what waits on the bridge
  const ev = CHASE.EVENTS[chase.next];
  if (ev && !chase.listen && !mash.active && chase.dist >= ev.at) {
    if (ev.kind === 'hand') {
      chase.dist = ev.at;
      startMash('hand', Math.max(4, Math.round(ev.need * (1 - 0.25 * chase.fails))));
      xSound((t, out) => {
        noiseHit(t, { dur: 0.35, peak: 0.22, freq: 320, out });
        tone(t, { type: 'sawtooth', freq: 95, to: 48, dur: 0.4, peak: 0.1, out });
      });
    } else {
      chase.listen = { ev, t: 0, voiced: false }; // walking on after the warning is the mistake
      playSound('sam_breath', { gain: 1.4, pan: 0.5 });
      playSound('whisper', { gain: 0.7 });
      vibrate([30, 60, 30]);
    }
  }
  if (chase.listen) {
    const L = chase.listen;
    L.t += dt * 1000;
    if (L.ev.voice && !L.voiced && L.t > CHASE.WARN_MS + 500) {
      L.voiced = true;
      const name = state.character === 'female' ? 'ริน' : 'นนท์';
      playSound('whisper', { gain: 1.2, pan: -0.8 });
      showToast(`เสียงแม่จากข้างหลัง: "${name}... หันมาหาแม่สิลูก" — อย่าขยับ`, 'warn', 3200);
    }
    if (L.t > CHASE.WARN_MS && state.moveInput !== 0) {
      chase.cause = 'listen';
      return triggerGameOver();
    }
    if (L.t > CHASE.WARN_MS + L.ev.ms) {
      chase.sinking = { x: L.ev.at + 260, at: now };
      chase.listen = null;
      chase.next++;
      chase.fails = 0;
      playSound('rustle');
    }
  }

  // the dark
  if (g.stunTimer > 0) {
    g.stunTimer = Math.max(0, g.stunTimer - dt);
  } else {
    const over = Math.max(0, Math.min(1, (chaseGap() - CHASE.MAX_GAP) / 60));
    const base = chase.listen ? CHASE.WALL_LISTEN : CHASE.WALL;
    chase.wall += (base + over * (CHASE.WALL_FAST - base)) * nightWall() * dt;
  }
  const gap = chaseGap();
  g.x = CHASE.PX - gap;
  g.dir = 1;
  g.alertLevel = Math.max(8, Math.min(100, Math.round(100 - gap / 5.4)));
  document.getElementById('danger-overlay').classList.toggle('hidden', gap > 230);
  if (gap <= CHASE.CAUGHT_GAP) {
    chase.cause = 'dark';
    return triggerGameOver();
  }

  chase.heart -= dt;
  if (chase.heart <= 0) {
    const k = Math.max(0, Math.min(1, gap / CHASE.MAX_GAP));
    playSound('heartbeat', { gain: 0.5 + (1 - k) * 0.8 });
    chase.heart = 0.34 + k * 0.5;
  }
  chase.whisper -= dt;
  if (chase.whisper <= 0) {
    playSound(Math.random() < 0.5 ? 'whisper' : 'rustle', { gain: 0.55, pan: -0.85 });
    chase.whisper = 3.5 + Math.random() * 3;
  }

  if (chase.dist >= CHASE.LENGTH) {
    chase.endAt = now + 1500;
    chase.flashAt = now;
    state.moveInput = 0;
    net.remoteMoving = false;
    document.getElementById('danger-overlay').classList.add('hidden');
    playSound('chime', { gain: 1.2 });
  }
}

// ---- drawing the bridge (everything is procedural: no art files) ----
const chaseRand = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
let chaseFog = null;

// Repeat `draw(i, screenX)` for every slot of a parallax layer that is on screen.
function chaseLayer(cam, parallax, spacing, draw) {
  const off = cam * parallax;
  const first = Math.floor(off / spacing) - 1;
  const last = Math.floor((off + 1280) / spacing) + 1;
  for (let i = first; i <= last; i++) draw(i, i * spacing - off);
}

function drawChaseTree(x, baseY, h, seed) {
  const lean = (chaseRand(seed) - 0.5) * 50;
  ctx.lineCap = 'round';
  const thick = h / 26 + chaseRand(seed + 1) * 5;
  ctx.lineWidth = thick;
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.quadraticCurveTo(x + lean * 0.3, baseY - h * 0.5, x + lean, baseY - h);
  ctx.stroke();
  const tx = x + lean;
  const ty = baseY - h;
  if (chaseRand(seed + 2) < 0.55) { // coconut palm: drooping fronds
    ctx.lineWidth = Math.max(3.5, thick * 0.5);
    for (let f = 0; f < 9; f++) {
      const a = Math.PI + (f / 8) * Math.PI;
      const len = h * (0.3 + chaseRand(seed + f + 3) * 0.14);
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(tx + Math.cos(a) * len * 0.6, ty + Math.sin(a) * len * 0.5 - 16, tx + Math.cos(a) * len, ty + Math.sin(a) * len * 0.3 + 26);
      ctx.stroke();
    }
  } else { // bare tree: a few crooked branches
    ctx.lineWidth = Math.max(3, thick * 0.42);
    for (let f = 0; f < 5; f++) {
      const by = baseY - h * (0.45 + f * 0.12);
      const bx = x + lean * (0.45 + f * 0.12);
      const dir = f % 2 ? 1 : -1;
      const len = h * (0.16 + chaseRand(seed + f + 9) * 0.16);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + dir * len * 0.5, by - len * 0.2, bx + dir * len, by - len * 0.7);
      ctx.stroke();
    }
  }
}

// A pale arm from base (x, y) reaching `len` px along `angle` (0 = straight up), fingers spread.
function drawChaseArm(x, y, len, angle, now, seed) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + (REDUCED_MOTION ? 0 : Math.sin(now / 260 + seed) * 0.09));
  ctx.strokeStyle = 'rgba(112, 122, 136, 0.96)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 7;
  const bend = Math.sin(seed * 3.3) * 14;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(bend, -len * 0.55, 0, -len);
  ctx.stroke();
  ctx.lineWidth = 2.6;
  for (let f = -2; f <= 2; f++) {
    const a = -Math.PI / 2 + f * 0.34 + (REDUCED_MOTION ? 0 : Math.sin(now / 170 + seed + f) * 0.14);
    ctx.beginPath();
    ctx.moveTo(0, -len);
    ctx.lineTo(Math.cos(a) * 18, -len + Math.sin(a) * 18);
    ctx.stroke();
  }
  ctx.restore();
}

function renderChase(now = performance.now()) {
  const W = 1280;
  const H = 720;
  const cam = chase.dist - CHASE.PX;
  const prog = Math.max(0, Math.min(1, chase.dist / CHASE.LENGTH));
  const p = state.player;
  ctx.save();
  ctx.imageSmoothingEnabled = true;

  const painted = isReady(IMAGES.bgBridge);
  if (painted) {
    // painted valley (Gemini): pans from the moonlit dead trees toward the far light as you cross
    const img = IMAGES.bgBridge;
    const iw = img.naturalWidth * (H / img.naturalHeight);
    ctx.drawImage(img, -prog * Math.max(0, iw - W), 0, iw, H);
  } else {
    renderChaseSky(W, H, cam, prog);
  }
  // the light at the far end growing as you get there
  const gx = 1520 - prog * 430;
  const glow = ctx.createRadialGradient(gx, 470, 10, gx, 470, 380 + prog * 640);
  glow.addColorStop(0, `rgba(255, 216, 152, ${(painted ? 0.06 : 0.16) + prog * 0.5})`);
  glow.addColorStop(0.4, `rgba(240, 150, 110, ${(painted ? 0.02 : 0.06) + prog * 0.2})`);
  glow.addColorStop(1, 'rgba(240, 150, 110, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // near trees: only over the code-drawn sky (the painting has its own, and stick trees clash with it)
  if (!painted) {
    ctx.strokeStyle = '#05060b';
    chaseLayer(cam, 0.42, 340, (i, x) => drawChaseTree(x + chaseRand(i + 7) * 200, 650, 300 + chaseRand(i + 70) * 190, i * 29 + 5));
  }
  renderChaseFront(now, W, H, cam, prog, p);
}

// The code-drawn sky, moon and far trees: only used until the painting has loaded.
function renderChaseSky(W, H, cam, prog) {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#04050b');
  sky.addColorStop(0.6, `rgb(${Math.round(10 + prog * 46)}, ${Math.round(12 + prog * 24)}, ${Math.round(24 + prog * 22)})`);
  sky.addColorStop(1, '#020306');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // a thin moon the fog keeps swallowing
  const mx = 300 - cam * 0.015;
  const halo = ctx.createRadialGradient(mx, 150, 20, mx, 150, 230);
  halo.addColorStop(0, `rgba(190, 200, 225, ${0.2 * (1 - prog * 0.7)})`);
  halo.addColorStop(1, 'rgba(190, 200, 225, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(mx - 230, 0, 460, 380);
  ctx.fillStyle = `rgba(214, 220, 236, ${0.8 * (1 - prog * 0.6)})`;
  ctx.beginPath();
  ctx.arc(mx, 150, 40, 0, Math.PI * 2);
  ctx.fill();

  // far trees
  ctx.strokeStyle = `rgb(${Math.round(9 + prog * 10)}, ${Math.round(11 + prog * 8)}, ${Math.round(19 + prog * 8)})`;
  chaseLayer(cam, 0.16, 210, (i, x) => drawChaseTree(x + chaseRand(i) * 120, 600, 170 + chaseRand(i + 40) * 170, i * 13));
  ctx.strokeStyle = '#05060b';
}

// Everything in front of the backdrop: fog, the void, the gate, the bridge, the hands, the player.
function renderChaseFront(now, W, H, cam, prog, p) {
  // fog between the trees and the bridge
  if (!chaseFog) chaseFog = makeFogSprite();
  ctx.globalAlpha = 0.13;
  for (let i = 0; i < 4; i++) {
    const x = ((((now / 1000) * (10 + i * 5) - cam * 0.6 + i * 520) % 2240) + 2240) % 2240 - 760;
    ctx.drawImage(chaseFog, x, 470 + i * 26, 760 + i * 90, 200);
  }
  ctx.globalAlpha = 1;

  // the void under the planks
  const under = ctx.createLinearGradient(0, 630, 0, H);
  under.addColorStop(0, 'rgba(3, 4, 8, 0.85)');
  under.addColorStop(1, '#010103');
  ctx.fillStyle = under;
  ctx.fillRect(0, 630, W, 90);

  // the gate at the end, full of light
  const gateX = CHASE.LENGTH + 150 - cam;
  if (gateX < W + 300) {
    const gl = ctx.createRadialGradient(gateX, 500, 20, gateX, 500, 420);
    gl.addColorStop(0, 'rgba(255, 240, 205, 0.95)');
    gl.addColorStop(0.35, 'rgba(255, 205, 140, 0.45)');
    gl.addColorStop(1, 'rgba(255, 190, 120, 0)');
    ctx.fillStyle = gl;
    ctx.fillRect(gateX - 420, 80, 840, 640);
    ctx.fillStyle = '#120b07';
    ctx.fillRect(gateX - 96, 330, 18, 290);
    ctx.fillRect(gateX + 78, 330, 18, 290);
    ctx.beginPath(); // Thai gable over the gate
    ctx.moveTo(gateX - 130, 340);
    ctx.lineTo(gateX, 262);
    ctx.lineTo(gateX + 130, 340);
    ctx.lineTo(gateX + 112, 352);
    ctx.lineTo(gateX, 290);
    ctx.lineTo(gateX - 112, 352);
    ctx.closePath();
    ctx.fill();
  }

  // rail posts and the sacred thread strung along them
  const POST = 230;
  chaseLayer(cam, 1, POST, (i, x) => {
    if (i * POST > CHASE.LENGTH + 100) return;
    ctx.fillStyle = '#150d08';
    ctx.fillRect(x - 5, 508, 10, 110);
    ctx.fillRect(x - 8, 502, 16, 8);
    ctx.strokeStyle = 'rgba(226, 222, 208, 0.62)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 514);
    ctx.quadraticCurveTo(x + POST / 2, 546, x + POST, 514);
    ctx.stroke();
    ctx.fillStyle = 'rgba(226, 222, 208, 0.5)';
    for (let s = 1; s <= 3; s++) { // little cloth strips tied to the thread
      const t = s / 4;
      const sx = x + POST * t;
      const sy = 514 + 64 * t * (1 - t);
      const sway = REDUCED_MOTION ? 0 : Math.sin(now / 420 + i + s) * 2.5;
      ctx.fillRect(sx - 1.5 + sway, sy, 3, 13);
    }
  });

  // the deck
  ctx.fillStyle = '#1b110a';
  ctx.fillRect(0, 610, W, 26);
  ctx.fillStyle = 'rgba(120, 90, 56, 0.28)';
  ctx.fillRect(0, 610, W, 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  chaseLayer(cam, 1, 46, (i, x) => ctx.fillRect(x, 610, 2, 26));
  ctx.fillStyle = '#0c0705';
  chaseLayer(cam, 1, POST, (i, x) => ctx.fillRect(x - 7, 636, 14, 84));

  // hands waiting under the planks
  CHASE.EVENTS.forEach((ev, idx) => {
    if (ev.kind !== 'hand' || idx < chase.next) return;
    const sx = ev.at + 26 - cam;
    if (sx < -80 || sx > W + 80) return;
    if (mash.active && mash.kind === 'hand' && idx === chase.next) return; // holding you: drawn over the legs below
    const rise = Math.max(0, Math.min(1, 1 - (ev.at - chase.dist - 50) / 440));
    if (rise <= 0) return;
    for (let a = 0; a < 5; a++) {
      drawChaseArm(sx - 34 + a * 19, 640, 30 + 44 * rise + chaseRand(idx * 10 + a) * 18, (a - 2) * 0.13, now, idx * 7 + a);
    }
  });

  // the blind one rising ahead to listen (and sinking away afterwards)
  const samAt = (worldX, alpha, dy) => {
    const idx = Math.floor(now / 300) % 3;
    drawGroundShadow(worldX - cam, 612, 80, 14, 0.5 * alpha);
    drawSpriteProportional(IMAGES[`samAnim${idx}`], worldX - cam, 618 + dy, 226, false, 'brightness(0.72) contrast(1.2)', alpha);
  };
  if (chase.listen) {
    const a = Math.min(1, chase.listen.t / CHASE.WARN_MS);
    samAt(chase.listen.ev.at + 260, a, (1 - a) * 46);
  } else if (chase.sinking) {
    const a = 1 - (now - chase.sinking.at) / 650;
    if (a <= 0) chase.sinking = null;
    else samAt(chase.sinking.x, a, (1 - a) * 60);
  }

  // the player
  const prefix = state.character === 'female' ? 'femaleWalk' : 'maleWalk';
  drawGroundShadow(CHASE.PX, 614, 48, 12, 0.65);
  drawSpriteProportional(IMAGES[`${prefix}${p.frame}`] || IMAGES[`${prefix}0`], CHASE.PX, 616, 238, p.dir === -1);
  if (mash.active && mash.kind === 'hand') { // the hands that have you by the legs
    for (let a = 0; a < 6; a++) {
      const ax = CHASE.PX - 50 + a * 20;
      drawChaseArm(ax, 646, 62 + chaseRand(a + 90) * 26, (CHASE.PX - ax) / 90, now, 80 + a);
    }
  }

  // night closing around the little light you carry
  const dark = ctx.createRadialGradient(CHASE.PX, 480, 90, CHASE.PX, 480, 620);
  dark.addColorStop(0, 'rgba(3, 4, 9, 0)');
  dark.addColorStop(1, `rgba(3, 4, 9, ${0.8 - prog * 0.5})`);
  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, W, H);
  if (p.flashlight) {
    const sx = CHASE.PX + p.dir * 34;
    const ex = sx + p.dir * 470;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const beam = ctx.createLinearGradient(sx, 486, ex, 486);
    beam.addColorStop(0, 'rgba(255, 230, 165, 0.3)');
    beam.addColorStop(0.5, 'rgba(255, 210, 130, 0.12)');
    beam.addColorStop(1, 'rgba(255, 200, 110, 0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(sx, 480);
    ctx.lineTo(ex, 344);
    ctx.lineTo(ex, 628);
    ctx.lineTo(sx, 492);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // the dark that pours out of the house
  const wx = CHASE.PX - chaseGap();
  if (wx > -220) {
    ctx.fillStyle = '#000';
    ctx.fillRect(-20, 0, Math.max(0, wx - 20), H);
    const edge = ctx.createLinearGradient(wx - 40, 0, wx + 170, 0);
    edge.addColorStop(0, 'rgba(0, 0, 0, 1)');
    edge.addColorStop(0.5, 'rgba(2, 2, 5, 0.8)');
    edge.addColorStop(1, 'rgba(2, 2, 5, 0)');
    ctx.fillStyle = edge;
    ctx.fillRect(wx - 40, 0, 210, H);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.93)';
    for (let i = 0; i < 11; i++) { // tongues of dark licking forward
      const y = 30 + i * 66 + Math.sin(now / 700 + i) * 14;
      const len = 80 + (REDUCED_MOTION ? 30 : 55 * Math.sin(now / 330 + i * 1.9)) + 40 * chaseRand(i);
      ctx.beginPath();
      ctx.moveTo(wx - 30, y - 36);
      ctx.quadraticCurveTo(wx + len * 0.6, y - 6, wx + len, y + Math.sin(now / 210 + i) * 10);
      ctx.quadraticCurveTo(wx + len * 0.5, y + 14, wx - 30, y + 36);
      ctx.fill();
    }
    for (let i = 0; i < 4; i++) drawChaseArm(wx + 4, 520 + i * 30, 78 + chaseRand(i + 50) * 40, Math.PI / 2 - 0.2 + i * 0.07, now, 60 + i);
    for (let i = 0; i < 6; i++) { // eyes in the dark
      const ex = wx - 50 - chaseRand(i + 20) * 280;
      const ey = 150 + chaseRand(i + 30) * 380;
      const open = Math.sin(now / 900 + i * 2.1) > -0.55 ? 1 : 0.05;
      ctx.fillStyle = `rgba(214, 220, 230, ${0.55 * open})`;
      ctx.beginPath();
      ctx.ellipse(ex, ey, 4.5, 2.6 * open + 0.4, 0, 0, Math.PI * 2);
      ctx.ellipse(ex + 17, ey, 4.5, 2.6 * open + 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // "stop!" while the blind one listens
  if (chase.listen) {
    const L = chase.listen;
    const warn = L.t < CHASE.WARN_MS;
    ctx.textAlign = 'center';
    ctx.font = 'bold 50px Sarabun, sans-serif';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = warn ? '#ffd36b' : '#ff8f7d';
    ctx.fillText(warn ? 'ชู่ว์... หยุดเดิน!' : 'อย่าขยับ...', 640, 250);
    ctx.shadowBlur = 0;
    if (!warn) {
      const left = Math.max(0, 1 - (L.t - CHASE.WARN_MS) / L.ev.ms);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.fillRect(500, 274, 280, 7);
      ctx.fillStyle = '#ff8f7d';
      ctx.fillRect(500, 274, 280 * left, 7);
    }
  }

  // how far to the light
  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.fillRect(440, 688, 400, 5);
  ctx.fillStyle = '#f1c27a';
  ctx.fillRect(440, 688, 400 * prog, 5);
  ctx.fillStyle = '#000';
  ctx.fillRect(440, 686, Math.max(0, Math.min(400, (400 * chase.wall) / CHASE.LENGTH)), 9);
  ctx.fillStyle = '#fff3d6';
  ctx.beginPath();
  ctx.arc(844, 690.5, 5, 0, Math.PI * 2);
  ctx.fill();

  // into the light
  if (chase.endAt) {
    const a = Math.max(0, Math.min(1, (now - chase.flashAt) / 1300));
    ctx.fillStyle = `rgba(255, 244, 220, ${a})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// The white of the gate fades into the dawn scene (drawn on top of everything by renderGame).
function renderChaseFlash(now) {
  if (now >= chase.whiteUntil) return;
  ctx.save();
  ctx.fillStyle = `rgba(255, 244, 220, ${Math.min(1, (chase.whiteUntil - now) / 1200)})`;
  ctx.fillRect(0, 0, 1280, 720);
  ctx.restore();
}

// Staff panel / tests: jump the bridge.
function skipChase() {
  if (!chase.active) return false;
  if (state.flags.gameOver) retryFromCheckpoint();
  finishChase();
  return true;
}

// ----------------------- 4. Choices (the promise at the gate) -----------------------
// A question with two answers. Keyboard: ← → / A D to pick, E / Enter / Space to confirm.
// Mouse/touch: tap an answer. P1 phone: the move buttons pick, the big button confirms.
// Nobody answering for a while (an idle booth) confirms the default.
const choice = { open: false, idx: 0, opts: [], onPick: null, timer: null, deadline: 0, phoneDir: 0 };

function isChoiceOpen() {
  return choice.open;
}

function choiceElement() {
  let el = document.getElementById('choice-box');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'choice-box';
  el.className = 'choice-box hidden';
  el.innerHTML = '<div class="dialogue-speaker" id="choice-speaker"></div>'
    + '<div class="choice-text" id="choice-text"></div>'
    + '<div class="choice-opts" id="choice-opts"></div>'
    + '<div class="choice-hint">← → เลือก · กด [E] ยืนยัน<span class="choice-clock" id="choice-clock"></span></div>';
  (document.getElementById('game-screen') || document.body).appendChild(el);
  return el;
}

function openChoice({ speaker = '', text = '', options, defaultIndex = 0, timeoutMs = 30000, onPick }) {
  const el = choiceElement();
  choice.open = true;
  choice.idx = defaultIndex;
  choice.opts = options;
  choice.onPick = onPick;
  choice.phoneDir = 0;
  choice.deadline = performance.now() + timeoutMs;
  state.moveInput = 0;
  document.getElementById('choice-speaker').textContent = speaker;
  document.getElementById('choice-text').textContent = text;
  const box = document.getElementById('choice-opts');
  box.textContent = '';
  options.forEach((o, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'choice-opt';
    b.innerHTML = '<b></b><span></span>';
    b.firstChild.textContent = o.label;
    b.lastChild.textContent = o.sub || '';
    b.addEventListener('click', (e) => { e.stopPropagation(); choicePick(i); });
    b.addEventListener('mouseenter', () => { if (choice.idx !== i) { choice.idx = i; renderChoice(); } });
    box.appendChild(b);
  });
  el.classList.remove('hidden');
  renderChoice();
  playSound('reveal');
  clearInterval(choice.timer);
  choice.timer = setInterval(() => {
    const left = Math.ceil((choice.deadline - performance.now()) / 1000);
    const clock = document.getElementById('choice-clock');
    if (clock) clock.textContent = left <= 10 ? ` · ${Math.max(0, left)}` : '';
    if (left <= 0) choicePick(defaultIndex);
  }, 250);
  broadcastState();
}

function renderChoice() {
  [...document.querySelectorAll('#choice-opts .choice-opt')].forEach((b, i) => b.classList.toggle('on', i === choice.idx));
}

function choiceMove(dir) {
  if (!choice.open || !dir) return;
  choice.idx = (choice.idx + dir + choice.opts.length) % choice.opts.length;
  choice.deadline = Math.max(choice.deadline, performance.now() + 10000); // someone is still deciding
  renderChoice();
  playSound('ui_move');
  broadcastState();
}

function choicePick(i = choice.idx) {
  if (!choice.open) return;
  choice.open = false;
  clearInterval(choice.timer);
  document.getElementById('choice-box').classList.add('hidden');
  playSound('ui_select');
  const cb = choice.onPick;
  choice.onPick = null;
  broadcastState();
  if (cb) cb(i);
}

// What the P1 phone's big button says while a choice is up.
function choiceLabel() {
  const o = choice.opts[choice.idx];
  return o ? `ยืนยัน: ${o.label}` : '';
}

function handleChoiceKey(e) {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === 'a' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || k === 'w') choiceMove(-1);
  else if (k === 'd' || e.key === 'ArrowRight' || e.key === 'ArrowDown' || k === 's') choiceMove(1);
  else if (/^[12]$/.test(e.key)) choicePick(Number(e.key) - 1);
  else if (k === 'e' || e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); choicePick(); }
}

// The P1 phone repeats a held move every 150 ms: only a new press moves the highlight.
function handleChoiceRemote(action, value) {
  if (action === 'move') {
    const dir = Math.sign(Number(value) || 0);
    if (dir && dir !== choice.phoneDir) choiceMove(dir);
    choice.phoneDir = dir;
  } else if (action === 'interact') {
    choicePick();
  }
}

// ----------------------- 5. The promise, and what happens when it is refused -----------------------
function askPromise(onAnswer) {
  openChoice({
    speaker: 'คุณลุงชุดราชปะแตน',
    text: 'จะให้สัญญากับข้าไหม?',
    options: [
      { label: 'สัญญา', sub: 'จะไปงาน Open House BUU ให้ได้' },
      { label: 'ไม่รับปาก', sub: 'แค่อยากกลับบ้าน ไม่เชื่อเรื่องพวกนี้' }
    ],
    onPick: (i) => {
      state.flags.promiseBroken = i === 1;
      onAnswer(i === 0);
    }
  });
}

// Refused: you still wake up... and that night something dances at the foot of the bed.
function playBrokenPromise(onDone) {
  const male = state.character !== 'female';
  setMusicLevel(0, 1);
  playCloseup({
    src: male ? ASSET_LIST.hospitalWake : ASSET_LIST.hospitalWakeRin,
    fit: 'cover',
    tone: 'night',
    captions: [
      'คืนนั้น... ไฟนีออนในห้องพักผู้ป่วยกะพริบถี่ขึ้นเรื่อยๆ',
      'เสียงระนาดแว่วมาจากทางเดิน ทั้งที่โรงพยาบาลเงียบสนิท',
      'ในเงาสะท้อนบนกระจกหน้าต่าง... มีใครบางคนกำลังรำอยู่ที่ปลายเตียง'
    ],
    captionMs: 3000,
    onDone: () => flashDancer(onDone)
  });
  setTimeout(() => playSound('dancer_motif'), 3400);
}

// The jumpscare face without the game-over screen (respects the jumpscare setting).
function flashDancer(onDone) {
  const js = document.getElementById('jumpscare');
  if (!js || settings.jumpscare === 'off') return onDone();
  const face = document.getElementById('jumpscare-face');
  face.src = ASSET_LIST.jumpscareDancer;
  face.classList.remove('wide');
  const soft = settings.jumpscare === 'soft';
  playSound('scare');
  js.classList.remove('hidden');
  js.classList.toggle('soft', soft);
  restartAnimation(js, 'play');
  state.flags.cutscenePlaying = true;
  setTimeout(() => {
    js.classList.add('hidden');
    js.classList.remove('play', 'soft');
    state.flags.cutscenePlaying = false;
    onDone();
  }, soft ? 700 : (REDUCED_MOTION ? 500 : 1150));
}

// ----------------------- 6. คืนที่สอง (second night) -----------------------
// Unlocked on this machine once anyone has finished. Same house, harder rules: the ghosts move
// faster, the rooms are darker, the bell recharges slower and the dark on the bridge runs harder.
// The prologue is skipped (you have been here before). Stored in state.flags so checkpoints,
// the phones and a "เล่นต่อ" keep it.
const NIGHT2_KEY = 'buu-horror-night2-v1';
const NIGHT2 = { ghostSpeed: 1.2, darkness: 0.035, bellCooldown: 16, wall: 1.18 };

const isNight2 = () => !!state.flags.night2;
const nightGhostSpeed = () => (isNight2() ? NIGHT2.ghostSpeed : 1);
const nightDarkness = () => (isNight2() ? NIGHT2.darkness : 0);
const bellCooldownSecs = () => (isNight2() ? NIGHT2.bellCooldown : CONFIG.BELL_COOLDOWN);
const nightWall = () => (isNight2() ? NIGHT2.wall : 1);

function night2Unlocked() {
  try { return !!localStorage.getItem(NIGHT2_KEY); } catch (_) { return false; }
}

function unlockNight2() {
  try { localStorage.setItem(NIGHT2_KEY, String(Date.now())); } catch (_) {}
  syncNight2Button();
}

function syncNight2Button() {
  const b = document.getElementById('btn-night2');
  if (b) b.classList.toggle('hidden', !night2Unlocked());
}

function startSecondNight() {
  state.flags.night2 = true;
  startSoloGame();
}

// Called by startIntroSequence instead of the prologue.
function beginSecondNight() {
  setMusicLevel(0, 0.8);
  showChapterCard(1);
  queueDialogue([
    { speaker: 'เสียงกระซิบที่คุ้นหู', text: 'ไม่นะ... ทำไมกลับมาที่นี่อีก' },
    { speaker: getPlayerName(), text: `ป่าเดิม เรือนเดิม... แต่คืนนี้มันมืดกว่าเดิม แล้ว${pWord('ผม', 'ฉัน')}ได้ยินเสียงฝีเท้ามันเร็วขึ้น` },
    { speaker: 'เสียงกระซิบที่คุ้นหู', text: 'คืนที่สอง พวกมันจำเธอได้แล้ว... อย่าให้มันจับได้อีก' }
  ], () => showControlsTip());
}

syncNight2Button();

// ----------------------- 7. ใต้ถุนเรือน (under the house, from room 3) -----------------------
// A trapdoor in room 3 leads down to the crawl space under the stilted house, where the incense
// lies on ตาเหมือน's little spirit shelf. The blind samphawesi keeps pacing on the floor above:
// light leaks through the gaps in the planks and his shadow crosses it. When he stops right above
// you, dust falls on your head: stand still until he walks on, or he hears you.
// Runs inside scene 3 like the bridge runs inside scene 5 (scene numbers stay 1..5). The world is
// the painting's width (1697 px at 720 high) and the camera follows the player.
// state.flags.inUnder keeps it across a checkpoint and tells the phones.
const UNDER = {
  W: 1697,
  FEET: 648,
  LADDER_X: 225,
  SHRINE_X: 1590,
  BED_X: 1400,
  HOOK: { x: 731, y: 312 },
  CRADLE_H: 270,
  TRAP_X: 460,          // the trapdoor in room 3 (lore page 3 hangs at 560)
  SLIT_Y: 182,          // the gaps between the floor planks above
  SAM_SPEED: 92,
  CROUCH: 0.62,         // the ceiling is low: you move crouched
  LISTEN_NEAR: 150,     // he stops above you when he gets this close
  LISTEN_MS: 2200,
  GRACE_MS: 450,        // the moment the dust starts falling you may still finish a step
  LEAVE_MS: 1300,
  LISTEN_GAP_MS: 1900   // he can stop to listen again this soon
};
const under = { active: false, cam: 0, sam: null, cradle: { amp: 0.04, at: 0 }, dust: [], stepT: 0, sawCradle: false };

function camUnder() {
  return Math.max(0, Math.min(UNDER.W - 1280, state.player.x - 640));
}

function resetUnderSam() {
  under.sam = { x: 1350, dir: -1, mode: 'walk', t: 0, lastListen: performance.now(), near: false, leaveDir: 1 };
  under.dust = [];
}

function startUnder(resume = false) {
  under.active = true;
  state.flags.inUnder = true;
  const p = state.player;
  p.x = UNDER.LADDER_X + 40;
  p.dir = 1;
  p.hidden = false;
  state.moveInput = 0;
  resetUnderSam();
  under.cradle = { amp: 0.04, at: performance.now() };
  const g = state.ghost;
  g.type = 'samphawesi';
  g.active = true; // so the bell (P2) is live
  g.alpha = 1;
  g.stunTimer = 0;
  fx.sceneZoomAt = performance.now();
  updateHud();
  if (!resume && !state.flags.underVisited) {
    state.flags.underVisited = true;
    queueDialogue([
      { speaker: getPlayerName(), text: 'ใต้ถุนเรือน... เพดานเตี้ยจนแทบต้องก้ม กลิ่นดินชื้น กับกลิ่นธูปอ่อนๆ ลอยมาจากสุดทางขวา' },
      { speaker: 'เสียงไม้ลั่นเหนือหัว', text: 'แอ๊ด... แอ๊ด... (มีใครเดินอยู่บนพื้นข้างบน ช้าๆ ลากเท้า)' },
      { speaker: 'เสียงกระซิบที่คุ้นหู', text: 'มันยังได้ยินเธอ... ถ้ามันหยุดเดินตรงเหนือหัวแล้วฝุ่นร่วงลงมา ให้ยืนนิ่งจนมันเดินผ่านไป' }
    ]);
  }
  saveCheckpoint();
  broadcastState();
}

function leaveUnderState() {
  under.active = false;
  state.flags.inUnder = false;
  under.dust = [];
}

function exitUnder() {
  leaveUnderState();
  enterScene(3, UNDER.TRAP_X);
}

function goDownTrapdoor() {
  if (!state.flags.samphawesiTriggered) {
    queueDialogue([{ speaker: getPlayerName(), text: `ฝาไม้บนพื้น... มีกลิ่นธูปลอยขึ้นมาจากข้างล่าง แต่กลางห้องมีใครนั่งอยู่ ${pWord('ผม', 'ฉัน')}ต้องไปดูก่อน` }]);
    return;
  }
  const seen = state.seenDoors.has('3->under');
  state.seenDoors.add('3->under');
  playDoorTransition(seen, 'เปิดฝาไม้ แล้วไต่บันไดลงไปในความมืดใต้เรือน...', () => startUnder());
}

function resetUnder() {
  const p = state.player;
  p.x = UNDER.LADDER_X + 40;
  p.dir = 1;
  resetUnderSam();
  state.ghost.active = true;
  state.ghost.stunTimer = 1.5;
}

function underHotspots() {
  const has = state.inventory.offerings.includes('incense');
  return [
    {
      id: 'under_ladder',
      x: UNDER.LADDER_X,
      width: 150,
      label: 'ปีนบันไดกลับขึ้นไปบนเรือน',
      onInteract: () => {
        const seen = state.seenDoors.has('under->3');
        state.seenDoors.add('under->3');
        playDoorTransition(seen, 'ปีนกลับขึ้นไปบนเรือน...', exitUnder);
      }
    },
    {
      id: 'under_bed',
      x: UNDER.BED_X,
      width: 120,
      label: 'สำรวจแคร่ไม้กับเสื่อเก่า',
      onInteract: () => queueDialogue([
        { speaker: getPlayerName(), text: 'แคร่ไม้ เสื่อขาดๆ ผ้าห่มพับไว้เรียบร้อย กับขันข้าวทองเหลืองที่ว่างเปล่า... มีคนนอนตรงนี้มาทั้งชีวิต' }
      ])
    },
    {
      id: 'under_shrine',
      x: UNDER.SHRINE_X,
      width: 150,
      label: has ? 'ศาลไม้เล็กๆ ของคนเฝ้าเรือน' : 'หยิบธูปเทียนบนศาลไม้เล็กๆ',
      onInteract: () => {
        if (has) {
          queueDialogue([{ speaker: getPlayerName(), text: 'ตอไม้ธูปไหม้ไปครึ่งเดียว... เหมือนมีคนตั้งใจจะจุดให้ แต่ไม่เคยจุดจนจบ' }]);
          return;
        }
        state.inventory.offerings.push('incense');
        pickupFx('incense');
        if (fx.pickup) fx.pickup.x -= under.cam;
        playSound('pickup');
        updateHud();
        queueDialogue([
          { speaker: getPlayerName(), text: 'บนศาลไม้เล็กๆ มีธูปเทียนมัดหนึ่ง ยังมีกลิ่นควันอ่อนๆ ทั้งที่ไม่มีใครจุด (2/3)' },
          { speaker: 'เสียงกระซิบที่คุ้นหู', text: 'ตาเหมือนนอนอยู่ตรงนี้มาทั้งชีวิต เฝ้าเรือนให้คนข้างบน... แต่ไม่เคยมีใครจุดธูปให้เขาสักดอก' }
        ]);
      }
    }
  ];
}

function underObjective() {
  if (!state.inventory.offerings.includes('incense')) {
    return { text: 'เดินไปศาลไม้สุดทางขวา · ฝุ่นร่วงจากพื้นข้างบนเมื่อไหร่ ให้หยุดนิ่งจนมันเดินผ่าน', target: 'under_shrine' };
  }
  return { text: 'ได้ธูปเทียนแล้ว — ปีนบันไดทางซ้ายกลับขึ้นไป', target: 'under_ladder' };
}

function underBell(source) {
  if (state.bellCooldown > 0) return false;
  state.ghost.stunTimer = CONFIG.BELL_STUN;
  state.bellCooldown = bellCooldownSecs();
  playSound('chime');
  showToast(`${source === 'P2' ? 'ญาณทิพย์ (P2)' : getPlayerName()} สั่นกระดิ่งอาคม! เสียงฝีเท้าข้างบนถอยห่างออกไป`);
  const s = under.sam;
  if (s) {
    s.mode = 'leave';
    s.t = 0;
    s.leaveDir = s.x < state.player.x ? -1 : 1;
  }
  broadcastState();
  return true;
}

// The soft hum of a lullaby from the cradle (a few falling notes, nothing recognisable).
function playLullaby() {
  xSound((t, out) => {
    const notes = [659, 587, 523, 587, 494, 523, 440];
    notes.forEach((f, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = f / 2;
      o.detune.value = (Math.random() - 0.5) * 30;
      const at = t + i * 0.52;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.06, at + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0008, at + 0.6);
      o.connect(g);
      g.connect(out);
      o.start(at);
      o.stop(at + 0.65);
    });
  }, { gain: 0.9, pan: -0.2 });
}

function updateUnder(dt) {
  const now = performance.now();
  const p = state.player;
  const g = state.ghost;
  const s = under.sam;
  if (isDialogueOpen() || isOverlayOpen()) {
    p.frame = 0;
    return;
  }
  state.bellCooldown = Math.max(0, state.bellCooldown - dt);
  state.revealTimer = Math.max(0, state.revealTimer - dt);
  document.getElementById('sixth-sense-overlay').classList.toggle('hidden', !isSensing());

  // walk
  if (state.moveInput !== 0) {
    p.dir = state.moveInput;
    p.x = Math.max(150, Math.min(UNDER.W - 60, p.x + state.moveInput * CONFIG.PLAYER_SPEED * UNDER.CROUCH * dt));
    state.stepTimer += dt;
    if (state.stepTimer >= 0.13) {
      state.stepTimer = 0;
      p.frame = (p.frame + 1) % 8;
      if (p.frame % 4 === 0) playSound('footstep', { gain: 0.7 });
    }
  } else {
    p.frame = 0;
  }
  under.cam = camUnder();

  // the cradle starts rocking the first time you walk under it
  if (!under.sawCradle && p.x > UNDER.HOOK.x - 190) {
    under.sawCradle = true;
    under.cradle = { amp: 0.32, at: now };
    playSound('creak', { gain: 0.8, pan: -0.3 });
    playLullaby();
    if (!state.flags.cradleSeen) {
      state.flags.cradleSeen = true;
      setTimeout(() => {
        if (under.active && !isWorldFrozen()) showToast('เปลไม้ไกวเองทั้งที่ไม่มีลม... และใครบางคนฮัมเพลงกล่อมเด็กอยู่ในความมืด', 'hint', 4200);
      }, 600);
    }
  }
  under.cradle.amp = Math.max(0.04, under.cradle.amp - dt * 0.03);

  // the one upstairs
  const dx = s.x - p.x;
  const speed = UNDER.SAM_SPEED * nightGhostSpeed();
  if (g.stunTimer > 0) {
    g.stunTimer = Math.max(0, g.stunTimer - dt);
    s.mode = 'leave';
  }
  if (s.mode === 'walk') {
    s.dir = Math.sign(-dx) || s.dir;
    s.x += s.dir * speed * dt;
    if (Math.abs(dx) < UNDER.LISTEN_NEAR * 0.75 && now - s.lastListen > UNDER.LISTEN_GAP_MS) {
      s.mode = 'listen';
      s.t = 0;
      s.near = true;
      s.lastListen = now;
      playSound('creak', { gain: 1, pan: 0 });
      for (let i = 0; i < 26; i++) under.dust.push({ x: s.x + (Math.random() - 0.5) * 90, y: UNDER.SLIT_Y + Math.random() * 10, vy: 60 + Math.random() * 90, a: 1 });
    }
  } else if (s.mode === 'listen') {
    s.t += dt * 1000;
    const close = Math.abs(dx) < UNDER.LISTEN_NEAR;
    if (close && s.t > UNDER.GRACE_MS && state.moveInput !== 0) return underCaught();
    if (s.t > UNDER.LISTEN_MS) {
      s.mode = 'leave';
      s.t = 0;
      s.leaveDir = Math.random() < 0.5 ? -1 : 1;
      if (s.x < 260) s.leaveDir = 1;
      if (s.x > UNDER.W - 200) s.leaveDir = -1;
    }
    if (Math.random() < dt * 4) under.dust.push({ x: s.x + (Math.random() - 0.5) * 60, y: UNDER.SLIT_Y, vy: 50 + Math.random() * 60, a: 1 });
  } else { // leave: walks off a little way before he comes back for you
    s.t += dt * 1000;
    s.x += s.leaveDir * speed * 1.2 * dt;
    if (s.t > UNDER.LEAVE_MS && g.stunTimer <= 0) {
      s.mode = 'walk';
      s.lastListen = now;
    }
  }
  s.x = Math.max(80, Math.min(UNDER.W - 40, s.x));

  // footsteps on the boards above
  if (s.mode !== 'listen') {
    under.stepT += dt;
    if (under.stepT > 0.62) {
      under.stepT = 0;
      const pan = Math.max(-1, Math.min(1, (s.x - p.x) / 650));
      playSound(Math.random() < 0.35 ? 'creak' : 'step', { gain: 0.45, pan });
    }
  }

  // dust
  under.dust.forEach((d) => { d.y += d.vy * dt; d.a -= dt * 0.55; });
  under.dust = under.dust.filter((d) => d.a > 0 && d.y < UNDER.FEET);

  // the phones and the danger overlay
  const near = Math.abs(dx);
  g.x = s.x;
  g.alertLevel = s.mode === 'listen' && near < UNDER.LISTEN_NEAR ? 95 : Math.max(8, Math.min(70, Math.round(80 - near / 8)));
  document.getElementById('danger-overlay').classList.toggle('hidden', !(s.mode === 'listen' && near < UNDER.LISTEN_NEAR));
}

function underCaught() {
  under.cause = 'heard';
  playSound('creak', { gain: 1.4 });
  triggerGameOver();
}

// What the P1 phone / prompt says right now.
function underPrompt() {
  const s = under.sam;
  if (s && s.mode === 'listen' && Math.abs(s.x - state.player.x) < UNDER.LISTEN_NEAR) return 'หยุดนิ่ง! มันฟังอยู่ข้างบน';
  const spot = getActiveHotspot();
  return spot ? spot.label : '';
}

let underLight = null;
function renderUnder(now = performance.now()) {
  const W = 1280;
  const H = 720;
  const p = state.player;
  const s = under.sam || { x: -999, mode: 'walk' };
  const cam = under.cam = camUnder();
  ctx.save();
  ctx.imageSmoothingEnabled = true;

  const bg = IMAGES.bgUnder;
  if (isReady(bg)) {
    ctx.drawImage(bg, -cam, 0, bg.naturalWidth * (H / bg.naturalHeight), H);
  } else {
    ctx.fillStyle = '#0a0806';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2a1d14';
    ctx.fillRect(0, 120, W, 70);
    ctx.fillStyle = '#1a130d';
    ctx.fillRect(0, UNDER.FEET, W, H - UNDER.FEET);
  }

  // the cradle, swinging from its hook
  const cr = IMAGES.cradle;
  if (isReady(cr)) {
    const h = UNDER.CRADLE_H;
    const w = cr.naturalWidth * (h / cr.naturalHeight);
    const ang = REDUCED_MOTION ? 0 : under.cradle.amp * Math.sin((now - under.cradle.at) / 520);
    ctx.save();
    ctx.translate(UNDER.HOOK.x - cam, UNDER.HOOK.y);
    ctx.rotate(ang);
    ctx.drawImage(cr, -w * 0.482, 0, w, h);
    ctx.restore();
  }

  // the player
  const prefix = state.character === 'female' ? 'femaleWalk' : 'maleWalk';
  drawGroundShadow(p.x - cam, UNDER.FEET - 2, 48, 12, 0.7);
  drawSpriteProportional(IMAGES[`${prefix}${p.frame}`] || IMAGES[`${prefix}0`], p.x - cam, UNDER.FEET, 232, p.dir === -1);

  // darkness with a few holes: the open sides, a little halo, the flashlight, the shrine ember
  if (!underLight) {
    underLight = document.createElement('canvas');
    underLight.width = W;
    underLight.height = H;
  }
  const d = underLight.getContext('2d');
  d.globalCompositeOperation = 'source-over';
  d.clearRect(0, 0, W, H);
  d.fillStyle = `rgba(4, 5, 10, ${isSensing() ? 0.55 : Math.min(0.97, 0.9 + nightDarkness())})`;
  d.fillRect(0, 0, W, H);
  d.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r0, r1, a) => {
    const gr = d.createRadialGradient(x, y, r0, x, y, r1);
    gr.addColorStop(0, `rgba(0,0,0,${a})`);
    gr.addColorStop(0.6, `rgba(0,0,0,${a * 0.45})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = gr;
    d.beginPath();
    d.arc(x, y, r1, 0, Math.PI * 2);
    d.fill();
  };
  hole(40 - cam, 480, 20, 300, 0.55);           // moonlight through the open side (left)
  hole(UNDER.W - 20 - cam, 470, 20, 280, 0.55);  // ...and the right
  hole(p.x - cam, 520, 30, 190, 0.55);
  if (!state.inventory.offerings.includes('incense')) hole(UNDER.SHRINE_X + 8 - cam, 330, 4, 90, 0.75 + Math.sin(now / 300) * 0.1);
  if (p.flashlight) {
    const sx = p.x - cam + p.dir * 30;
    const beam = d.createLinearGradient(sx, 0, sx + p.dir * 560, 0);
    beam.addColorStop(0, 'rgba(0,0,0,0.95)');
    beam.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = beam;
    d.beginPath();
    d.moveTo(sx, 500);
    d.lineTo(sx + p.dir * 560, 330);
    d.lineTo(sx + p.dir * 560, 690);
    d.closePath();
    d.fill();
  }
  ctx.drawImage(underLight, 0, 0);
  if (p.flashlight) { // the warm haze of the beam itself, like upstairs
    const sx = p.x - cam + p.dir * 30;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const haze = ctx.createLinearGradient(sx, 0, sx + p.dir * 520, 0);
    haze.addColorStop(0, 'rgba(255, 220, 160, 0.16)');
    haze.addColorStop(1, 'rgba(255, 220, 160, 0)');
    ctx.fillStyle = haze;
    ctx.beginPath();
    ctx.moveTo(sx, 500);
    ctx.lineTo(sx + p.dir * 520, 345);
    ctx.lineTo(sx + p.dir * 520, 675);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // light through the gaps in the planks above, cut by his shadow
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let x = 0; x < UNDER.W; x += 23) {
    const sx = x - cam;
    if (sx < -60 || sx > W + 60) continue;
    if (Math.abs(x - s.x) < 62) continue; // his shadow
    const len = 8 + ((x * 7919) % 17); // uneven gaps, not a dashed line
    const flick = 0.1 + 0.05 * Math.sin(now / 700 + x);
    ctx.fillStyle = `rgba(190, 180, 150, ${flick})`;
    ctx.fillRect(sx, UNDER.SLIT_Y, len, 2);
    ctx.fillStyle = `rgba(190, 180, 150, ${flick * 0.25})`;
    ctx.fillRect(sx + 2, UNDER.SLIT_Y + 2, Math.max(4, len - 6), 22);
  }
  ctx.restore();
  // his shadow across the planks (two feet), darker while he stands and listens
  const shx = s.x - cam;
  ctx.fillStyle = s.mode === 'listen' ? 'rgba(0, 0, 0, 0.85)' : 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(shx - 34, UNDER.SLIT_Y - 4, 26, 10);
  ctx.fillRect(shx + 8, UNDER.SLIT_Y - 4, 26, 10);

  // dust falling from where he stands
  ctx.fillStyle = 'rgba(210, 196, 170, 0.8)';
  under.dust.forEach((dd) => {
    ctx.globalAlpha = Math.max(0, dd.a);
    ctx.fillRect(dd.x - cam, dd.y, 2, 3);
  });
  ctx.globalAlpha = 1;

  // warning, prompt and the objective marker
  const listening = s.mode === 'listen' && Math.abs(s.x - p.x) < UNDER.LISTEN_NEAR;
  ctx.textAlign = 'center';
  if (listening) {
    const pulse = 0.75 + 0.25 * Math.sin(now / 110);
    ctx.font = 'bold 34px Sarabun';
    ctx.fillStyle = `rgba(255, 120, 100, ${pulse})`;
    ctx.fillText('หยุดนิ่ง! มันหยุดฟังอยู่เหนือหัว', W / 2, 110);
  }
  const spot = getActiveHotspot();
  if (spot && !listening) {
    ctx.font = 'bold 18px Sarabun';
    const text = `[E] ${spot.label}`;
    const tw = ctx.measureText(text).width + 24;
    const sx = Math.max(tw / 2 + 8, Math.min(W - tw / 2 - 8, spot.x - cam));
    ctx.fillStyle = 'rgba(12, 9, 8, 0.82)';
    ctx.fillRect(sx - tw / 2, 362, tw, 32);
    ctx.fillStyle = '#f0e4cc';
    ctx.fillText(text, sx, 384);
  }
  const target = underObjective().target;
  const tspot = underHotspots().find((h) => h.id === target);
  if (tspot && (!spot || spot.id !== target)) {
    const tx = Math.max(30, Math.min(W - 30, tspot.x - cam));
    const bob = Math.sin(now / 260) * 5;
    ctx.fillStyle = 'rgba(255, 211, 107, 0.9)';
    ctx.beginPath();
    ctx.moveTo(tx - 10, 404 + bob);
    ctx.lineTo(tx + 10, 404 + bob);
    ctx.lineTo(tx, 420 + bob);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// The trapdoor on room 3's floor (drawn in the room, under the darkness).
function drawTrapdoor() {
  const x = UNDER.TRAP_X;
  const y = 606;
  ctx.save();
  ctx.fillStyle = '#1b130d';
  ctx.fillRect(x - 52, y - 4, 104, 12);
  ctx.strokeStyle = '#5a412b';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 52, y - 4, 104, 12);
  ctx.fillStyle = '#3b2a1c';
  for (let i = -40; i <= 40; i += 26) ctx.fillRect(x + i - 1, y - 3, 2, 10);
  ctx.strokeStyle = '#8a7356';
  ctx.beginPath();
  ctx.arc(x + 30, y + 2, 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// P2's spirit vision under the house: P1 below, the one upstairs on the planks.
function renderP2UnderRadar(rctx, rg) {
  rctx.fillStyle = '#84f2d4';
  rctx.font = 'bold 20px Sarabun';
  rctx.fillText('ฉากที่ 3: ใต้ถุนเรือน', 14, 30);
  const left = 28;
  const span = 544;
  rctx.strokeStyle = '#59dfb7';
  rctx.lineWidth = 3;
  rctx.beginPath(); rctx.moveTo(left, 120); rctx.lineTo(left + span, 120); rctx.stroke(); // the floor above
  rctx.lineWidth = 2;
  rctx.beginPath(); rctx.moveTo(left, 195); rctx.lineTo(left + span, 195); rctx.stroke(); // the earth below
  const px = left + (Math.max(0, Math.min(100, Number(rg.underPct) || 0)) / 100) * span;
  const sx = left + (Math.max(0, Math.min(100, Number(rg.underSamPct) || 0)) / 100) * span;
  const listen = rg.underState === 'listen';
  rctx.fillStyle = listen ? '#ff3b3b' : '#ff8a6b';
  rctx.beginPath();
  rctx.arc(sx, 108, 11 + (listen ? Math.sin(performance.now() / 110) * 3 : 0), 0, Math.PI * 2);
  rctx.fill();
  rctx.fillStyle = '#00f5d4';
  rctx.beginPath();
  rctx.arc(px, 178, 10, 0, Math.PI * 2);
  rctx.fill();
  rctx.font = 'bold 18px Sarabun';
  rctx.textAlign = 'center';
  rctx.fillStyle = listen ? '#ffd36b' : '#f3e5c8';
  rctx.fillText(listen ? 'มันหยุดฟัง!' : 'สัมภเวสี (บนพื้น)', Math.max(70, Math.min(530, sx)), 88);
  rctx.fillStyle = '#00f5d4';
  rctx.fillText('P1', Math.max(30, Math.min(570, px)), 160);
  rctx.fillStyle = '#ffd166';
  rctx.fillText('ศาล/ธูป', left + span - 30, 222);
  rctx.textAlign = 'left';
}
