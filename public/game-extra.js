/* ============================================================================
 * เรือนซ่อนวิญญาณ - extra content. Loaded right after game.js and shares its globals.
 *   1. mash   : "กดรัวๆ ให้หลุด" — a ghost's first grab in each room, and the hands on the bridge
 *   2. ranat  : แม่จันทร์'s unfinished song in scene 4 (listen to a phrase, then play it back)
 *   3. chase  : the run across the spirit bridge, between the back door and the dawn (scene 5)
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
  state.bellCooldown = CONFIG.BELL_COOLDOWN;
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
    chase.wall += (base + over * (CHASE.WALL_FAST - base)) * dt;
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
