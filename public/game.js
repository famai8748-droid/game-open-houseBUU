/* ============================================================================
 * เรือนซ่อนวิญญาณ (The Veiled Thai House) - Main Game & Multiplayer Engine
 * ============================================================================ */

const urlParams = new URLSearchParams(window.location.search);
const initialRoomParam = urlParams.get('room');
const initialRoleParam = urlParams.get('role'); // 'p1' | 'p2'
let eventSource = null;

// ----------------------- Tunables (one place to balance the game) -----------------------
const CONFIG = {
  PLAYER_SPEED: 230,
  GHOST_SPEED: { samphawesi: 95, dancer: 115 },
  SIXTH_SENSE_GHOST_MULT: 1.35, // using your own sixth sense draws the ghost faster
  CATCH_DIST: 58,
  UNHIDE_GRACE: 0.6,            // seconds of safety after stepping out of a hiding spot
  GHOST_SEARCH_LINGER: 1.6,     // the ghost lingers where it lost you...
  GHOST_VANISH_TIME: 1.2,       // ...then fades away...
  GHOST_FADE_IN_TIME: 1.0,      // ...and slowly re-forms off-screen, away from you
  GHOST_REENTER_MARGIN: 70,
  BELL_STUN: 4.0,
  BELL_COOLDOWN: 12,
  PULSE_DURATION: 3.5,
  SYNC_INTERVAL_MS: 125,
  SYNC_KEEPALIVE_MS: 1000,
  POLL_REMOTE_MS: 320,          // phones without SSE (Vercel)
  POLL_LOCAL_MS: 1000,          // phones with SSE (local server): presence + fallback only
  REMOTE_MOVE_REPEAT_MS: 150,
  REMOTE_MOVE_TIMEOUT_MS: 650
};

// An <img> that finished loading successfully (drawing a broken image throws).
function isReady(img) {
  return !!(img && img.complete && img.naturalWidth > 0);
}

// ----------------------- Web Audio Horror Synthesizer -----------------------
// Everything is synthesized (no audio files). Signal chain:
//   one-shot SFX  -> sfx bus     \
//   scene ambience -> ambient bus -> master (volume / mute) -> compressor -> speakers
const AUDIO_PREF_KEY = 'buu-horror-audio-v1';
let audioCtx = null;
let audioMuted = false;
let audioVolume = 0.8;
const audioBus = {};
let noiseBuffer = null;
const ambient = { scene: null, out: null, sources: [], timers: [] };
let heartbeatTimer = 0;

(function loadAudioPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(AUDIO_PREF_KEY) || 'null');
    if (p && typeof p.volume === 'number') audioVolume = Math.min(1, Math.max(0, p.volume));
    if (p) audioMuted = !!p.muted;
  } catch (_) {}
})();

function saveAudioPrefs() {
  try { localStorage.setItem(AUDIO_PREF_KEY, JSON.stringify({ volume: audioVolume, muted: audioMuted })); } catch (_) {}
}

function initAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioCtx = new AudioContext();
    const comp = audioCtx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    audioBus.master = audioCtx.createGain();
    audioBus.sfx = audioCtx.createGain();
    audioBus.ambient = audioCtx.createGain();
    audioBus.sfx.connect(audioBus.master);
    audioBus.ambient.connect(audioBus.master);
    audioBus.master.connect(comp);
    comp.connect(audioCtx.destination);
    audioBus.master.gain.value = audioMuted ? 0 : audioVolume;
    noiseBuffer = createNoiseBuffer(2);
    loadSamples();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function createNoiseBuffer(seconds) {
  const len = Math.floor(audioCtx.sampleRate * seconds);
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function applyVolume() {
  if (!audioCtx) return;
  audioBus.master.gain.setTargetAtTime(audioMuted ? 0 : audioVolume, audioCtx.currentTime, 0.04);
}

function toggleAudioMute() {
  audioMuted = !audioMuted;
  initAudio();
  applyVolume();
  saveAudioPrefs();
  updateAudioUi();
}

function setVolume(value) {
  audioVolume = Math.min(1, Math.max(0, Number(value) / 100));
  if (audioMuted && audioVolume > 0) audioMuted = false;
  initAudio();
  applyVolume();
  saveAudioPrefs();
  updateAudioUi();
}

function updateAudioUi() {
  const off = audioMuted || audioVolume === 0;
  const btn = document.getElementById('btn-mute');
  if (btn) {
    btn.innerHTML = `<span class="ic">${off ? '🔇' : '🔊'}</span><span class="lbl"> ${off ? 'ปิดเสียง' : 'เสียง'}</span>`;
    btn.setAttribute('aria-pressed', String(off));
  }
  const slider = document.getElementById('volume-slider');
  if (slider) slider.value = String(Math.round((audioMuted ? 0 : audioVolume) * 100));
}
window.addEventListener('DOMContentLoaded', updateAudioUi);

// Pause all sound while the tab is in the background.
document.addEventListener('visibilitychange', () => {
  if (!audioCtx) return;
  if (document.hidden) audioCtx.suspend();
  else if (state.started || state.role !== 'host') audioCtx.resume();
});

// --- building blocks ---
function outputNode(gain, pan, dest) {
  const g = audioCtx.createGain();
  g.gain.value = gain;
  let head = g;
  if (pan && audioCtx.createStereoPanner) {
    const p = audioCtx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p);
    p.connect(dest);
  } else {
    g.connect(dest);
  }
  return head;
}

function tone(t, { type = 'sine', freq, to = null, toTime = 0, dur, peak, attack = 0.004, out }) {
  const osc = audioCtx.createOscillator();
  const env = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + (toTime || dur));
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(peak, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env);
  env.connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
  return osc;
}

function noiseHit(t, { dur, peak, filter = 'lowpass', freq = 800, q = 0.7, attack = 0.004, out }) {
  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = audioCtx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const env = audioCtx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(peak, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(env);
  env.connect(out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.02);
}

/**
 * One-shot sound effect.
 * @param {string} type
 * @param {{gain?: number, pan?: number}} [opts] gain multiplier and stereo position (-1 left .. 1 right)
 */
function playSound(type, opts = {}) {
  if (audioMuted) return;
  initAudio();
  if (!audioCtx || audioCtx.state === 'closed') return;
  const now = audioCtx.currentTime;
  const out = outputNode(opts.gain == null ? 1 : opts.gain, opts.pan || 0, audioBus.sfx);

  if (type === 'step') {
    if (state.scene === 1 && state.role === 'host') {
      // soft step on wet grass / dirt
      noiseHit(now, { dur: 0.09, peak: 0.12, filter: 'lowpass', freq: 520, out });
    } else {
      // low wooden floorboard thud
      tone(now, { type: 'triangle', freq: 95 + Math.random() * 25, to: 38, dur: 0.09, peak: 0.14, out });
      noiseHit(now, { dur: 0.04, peak: 0.03, filter: 'bandpass', freq: 1800, q: 1.2, out });
    }
  } else if (type === 'creak') {
    // long eerie wooden door creak
    const osc = audioCtx.createOscillator();
    const env = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.linearRampToValueAtTime(210, now + 0.45);
    osc.frequency.linearRampToValueAtTime(115, now + 1.25);
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 2.5;
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(0.16, now + 0.15);
    env.gain.linearRampToValueAtTime(0.2, now + 0.5);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 1.35);
    osc.connect(bp);
    bp.connect(env);
    env.connect(out);
    osc.start(now);
    osc.stop(now + 1.4);
  } else if (type === 'rustle') {
    // the unexplained "กุกกัก... กุกกัก..." knocking
    for (let i = 0; i < 2; i++) {
      const t = now + i * 0.22;
      tone(t, { type: 'square', freq: 180 + i * 40, to: 65, dur: 0.13, peak: 0.08, out });
      noiseHit(t, { dur: 0.06, peak: 0.05, filter: 'bandpass', freq: 600, q: 1.5, out });
    }
  } else if (type === 'chime') {
    // Thai dancer ankle bells (กระพรวนข้อเท้า): two slightly detuned bell strikes = a jingle
    if (samples.bell) {
      playSample('bell', out, { gain: 0.16, rate: 0.96 + Math.random() * 0.06, t: now });
      playSample('bell', out, { gain: 0.11, rate: 1.1 + Math.random() * 0.06, t: now + 0.09 + Math.random() * 0.04 });
    } else {
      [1320, 1760].forEach((freq, idx) => {
        const t = now + idx * 0.12;
        tone(t, { freq, dur: 0.6, peak: 0.1, out });
        tone(t, { freq: freq * 2.76, dur: 0.25, peak: 0.025, out });
      });
    }
  } else if (type === 'pickup') {
    tone(now, { freq: 520, to: 880, toTime: 0.18, dur: 0.22, peak: 0.13, out });
    tone(now + 0.08, { freq: 1046, dur: 0.3, peak: 0.05, out });
  } else if (type === 'scare') {
    if (samples.scare) {
      playSample('scare', out, { gain: 0.55, t: now });
    } else {
      // jumpscare stinger: dissonant saw cluster + noise burst (kept under the compressor)
      [110, 146, 233, 311].forEach((freq) => {
        tone(now, { type: 'sawtooth', freq, to: freq * 0.94, dur: 0.9, peak: 0.09, attack: 0.002, out });
      });
      noiseHit(now, { dur: 0.6, peak: 0.22, filter: 'highpass', freq: 700, attack: 0.002, out });
    }
  } else if (type === 'tension') {
    // rising dread when a ghost appears or finds you again (sample only)
    playSample('tension', out, { gain: 0.2, t: now });
  } else if (type === 'heartbeat') {
    tone(now, { freq: 62, to: 42, dur: 0.14, peak: 0.45, attack: 0.008, out });
    tone(now + 0.17, { freq: 56, to: 40, dur: 0.12, peak: 0.3, attack: 0.008, out });
  } else if (type === 'drip') {
    tone(now, { freq: 1500 + Math.random() * 500, to: 700, dur: 0.08, peak: 0.035, out });
  } else if (type === 'bird') {
    const base = 2200 + Math.random() * 900;
    for (let i = 0; i < 3; i++) {
      tone(now + i * 0.11, { freq: base, to: base * 1.35, dur: 0.08, peak: 0.025, out });
    }
  } else if (type === 'whisper') {
    if (samples.whisper) {
      playSample('whisper', out, { gain: 0.16, rate: 0.9 + Math.random() * 0.2, t: now });
    } else {
      noiseHit(now, { dur: 1.2, peak: 0.05, filter: 'bandpass', freq: 2400, q: 4, attack: 0.4, out });
    }
  }
}

// --- recorded/rendered samples (public/assets/audio). Missing or failed files fall back to synthesis. ---
// Rendered with earshot's sound bank (https://github.com/Leonxlnx/earshot, MIT): bell = fit/bell/small_bell,
// whisper = reverse_swell/breath, scare = cut_hit/rumble, tension = riser/tension.
const SAMPLE_FILES = {
  bell: 'assets/audio/bell.mp3',
  whisper: 'assets/audio/whisper.mp3',
  scare: 'assets/audio/scare.mp3',
  tension: 'assets/audio/tension.mp3'
};
const samples = {};
let samplesRequested = false;

function loadSamples() {
  if (samplesRequested || !audioCtx) return;
  samplesRequested = true;
  Object.entries(SAMPLE_FILES).forEach(([name, url]) => {
    fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => new Promise((resolve, reject) => audioCtx.decodeAudioData(data, resolve, reject)))
      .then((buf) => { samples[name] = buf; })
      .catch((err) => console.warn(`[audio] ${name} unavailable, using synthesized sound`, err && err.message));
  });
}

function playSample(name, out, { gain = 1, rate = 1, t = audioCtx.currentTime } = {}) {
  const buf = samples[name];
  if (!buf) return false;
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = audioCtx.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(out);
  src.start(t);
  return true;
}

// --- scene ambience (host only) ---
function loopNoise(filterType, freq, gain, q = 0.7) {
  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const f = audioCtx.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = audioCtx.createGain();
  g.gain.value = gain;
  src.connect(f);
  f.connect(g);
  g.connect(ambient.out);
  src.start(audioCtx.currentTime, Math.random() * 1.5);
  ambient.sources.push(src);
  return g;
}

function loopTone(type, freq, gain, lowpass = 0) {
  const osc = audioCtx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const g = audioCtx.createGain();
  g.gain.value = gain;
  if (lowpass) {
    const f = audioCtx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    osc.connect(f);
    f.connect(g);
  } else {
    osc.connect(g);
  }
  g.connect(ambient.out);
  osc.start();
  ambient.sources.push(osc);
  return g;
}

// Slow random wobble on a gain (wind gusts, breathing drones).
function wobble(param, rate, depth) {
  const lfo = audioCtx.createOscillator();
  lfo.frequency.value = rate;
  const amt = audioCtx.createGain();
  amt.gain.value = depth;
  lfo.connect(amt);
  amt.connect(param);
  lfo.start();
  ambient.sources.push(lfo);
}

// Random one-shots every minMs..maxMs while the scene's ambience is playing.
function sprinkle(minMs, maxMs, fn) {
  const schedule = () => {
    const id = setTimeout(() => {
      if (!document.hidden && !state.flags.cutscenePlaying) fn();
      schedule();
    }, minMs + Math.random() * (maxMs - minMs));
    ambient.timers.push(id);
  };
  schedule();
}

function stopAmbient() {
  ambient.timers.forEach(clearTimeout);
  ambient.timers = [];
  if (ambient.out && audioCtx) {
    const old = ambient.out;
    const sources = ambient.sources;
    old.gain.setTargetAtTime(0, audioCtx.currentTime, 0.4);
    setTimeout(() => {
      sources.forEach((s) => { try { s.stop(); } catch (_) {} });
      try { old.disconnect(); } catch (_) {}
    }, 2500);
  }
  ambient.out = null;
  ambient.sources = [];
  ambient.scene = null;
}

function setAmbientScene(scene) {
  if (state.role !== 'host') return;
  initAudio();
  if (!audioCtx || ambient.scene === scene) return;
  stopAmbient();
  ambient.scene = scene;
  ambient.out = audioCtx.createGain();
  ambient.out.gain.value = 0;
  ambient.out.connect(audioBus.ambient);
  ambient.out.gain.setTargetAtTime(1, audioCtx.currentTime, 1.0);

  if (scene === 1) {
    // night rain + gusting wind in the forest
    loopNoise('highpass', 1100, 0.05);
    const wind = loopNoise('lowpass', 380, 0.07);
    wobble(wind.gain, 0.11, 0.05);
    sprinkle(9000, 18000, () => playSound('rustle', { gain: 0.35, pan: Math.random() * 1.6 - 0.8 }));
  } else if (scene >= 2 && scene <= 4) {
    // old wooden house: low uneasy drone, room rumble, creaks and drips
    const d1 = loopTone('triangle', 55, 0.05, 260);
    loopTone('triangle', 55.7, 0.05, 260);
    wobble(d1.gain, 0.07, 0.025);
    loopNoise('lowpass', 200, 0.035);
    if (scene === 4) loopTone('sine', 82.4, 0.018); // a fifth above: more tension near the dancer
    sprinkle(7000, 16000, () => playSound('creak', { gain: 0.25, pan: Math.random() * 1.6 - 0.8 }));
    sprinkle(4000, 9000, () => playSound('drip', { gain: 0.8, pan: Math.random() * 1.4 - 0.7 }));
    if (scene >= 3) sprinkle(14000, 26000, () => playSound('whisper', { gain: 0.8, pan: Math.random() < 0.5 ? -0.7 : 0.7 }));
  } else if (scene === 5) {
    // dawn: soft warm pad and birds
    [220, 277.2, 329.6].forEach((f) => loopTone('sine', f, 0.012));
    loopNoise('lowpass', 500, 0.015);
    sprinkle(2500, 6000, () => playSound('bird', { pan: Math.random() * 1.6 - 0.8 }));
  }
}

// Lower the ambience (e.g. behind the game-over screen) and bring it back.
function duckAmbient(on) {
  if (!audioCtx) return;
  audioBus.ambient.gain.setTargetAtTime(on ? 0.25 : 1, audioCtx.currentTime, 0.3);
}

// Rising dread sting; rate-limited so it never stacks.
let lastTensionAt = -Infinity;
function playTension() {
  const now = performance.now();
  if (now - lastTensionAt < 6000) return;
  lastTensionAt = now;
  playSound('tension');
}

// Ghost sounds follow the ghost: louder when close, panned to its side of the screen.
function ghostSoundOptions(ghostX, playerX) {
  const dx = ghostX - playerX;
  const prox = Math.max(0, 1 - Math.abs(dx) / 900);
  return { gain: 0.2 + prox * 1.0, pan: Math.max(-0.9, Math.min(0.9, dx / 700)), prox };
}

// ----------------------- Asset Loader -----------------------
const IMAGES = {};
const ASSET_LIST = {
  bg1: 'assets/bg_scene1_forest.jpg',
  bg2: 'assets/bg_scene2_hallway.jpg',
  bg3: 'assets/bg_scene3_room.jpg',
  bg4: 'assets/bg_scene4_room.jpg',
  bg5: 'assets/bg_scene5_dawn.jpg',
  uncle0: 'assets/uncle_0.png',
  uncle1: 'assets/uncle_1.png',
  krathong: 'assets/offering_krathong.png',
  garland: 'assets/offering_garland.png',
  incense: 'assets/offering_incense.png',
  dessert: 'assets/offering_dessert.png',
  photo1: 'assets/photo_piece_1.png',
  photo2: 'assets/photo_piece_2.png',
  photo3: 'assets/photo_piece_3.png',
  frameBroken: 'assets/photo_frame_broken.png',
  cabinet: 'assets/prop_cabinet.png',
  jar: 'assets/prop_jar.png',
  door: 'assets/prop_door.png',
  table: 'assets/prop_table.png',
  altar: 'assets/prop_altar.png',
  talisman: 'assets/prop_talisman.png'
};

function preloadAssets() {
  Object.entries(ASSET_LIST).forEach(([key, src]) => {
    const img = new Image();
    img.src = src;
    IMAGES[key] = img;
  });
  // Preload 8-frame articulated walk cycles & ghost animations
  for (let i = 0; i < 8; i++) {
    const m = new Image(); m.src = `assets/frames/student_male_walk_${i}.png`; IMAGES[`maleWalk${i}`] = m;
    const f = new Image(); f.src = `assets/frames/student_female_walk_${i}.png`; IMAGES[`femaleWalk${i}`] = f;
    const d = new Image(); d.src = `assets/frames/dancer_anim_${i}.png`; IMAGES[`dancerAnim${i}`] = d;
    const s = new Image(); s.src = `assets/frames/sam_anim_${i}.png`; IMAGES[`samAnim${i}`] = s;
  }
}
preloadAssets();

// ----------------------- Game State -----------------------
const state = {
  role: 'host', // 'host' | 'p1' | 'p2'
  roomCode: null,
  character: 'male', // 'male' | 'female'
  started: false,
  scene: 1, // 1..5
  moveInput: 0,
  stepTimer: 0,
  ambientTimer: 0,
  player: {
    x: 150,
    y: 590,
    dir: 1,
    frame: 0,
    flashlight: true,
    hidden: false,
    sixthSense: false
  },
  inventory: {
    offerings: [], // 'garland', 'incense', 'dessert'
    photos: [],    // 1, 2, 3
    placedPhotos: []
  },
  flags: {
    door1Opened: false,
    inspectedDust: false,
    inspectedPortraits: false,
    samphawesiTriggered: false,
    offeringsPlaced: false,
    photosRestored: false,
    cutscenePlaying: false,
    gameOver: false,
    victory: false
  },
  ghost: {
    active: false,
    type: 'samphawesi', // 'samphawesi' | 'dancer'
    x: 920,
    dir: -1,
    frame: 0,
    animTimer: 0,
    stunTimer: 0,
    alertLevel: 5,
    alpha: 1,          // fades while the ghost "loses" a hidden player
    phase: 'chase',    // 'chase' | 'search' | 'vanish' | 'lurk'
    searchX: 0,
    timer: 0
  },
  bellCooldown: 0,       // seconds until P2's bell can be used again (host)
  remoteBellCooldown: 0, // same value as seen by the P2 phone
  revealTimer: 0,        // P2's sixth-sense pulse (reveals hotspots, no ghost penalty)
  unhideGrace: 0,
  dialogueQueue: []
};

// ----------------------- Scene Definitions & Hotspots -----------------------
const SCENE_TITLES = {
  1: 'ฉากที่ 1: ป่ามืดหลังอุบัติเหตุ',
  2: 'ฉากที่ 2: โถงเรือนไม้ & ผนังรูปถ่าย',
  3: 'ฉากที่ 3: ห้องเครื่องเซ่นไหว้',
  4: 'ฉากที่ 4: โถงในเรือน & พิธีปลดผนึก',
  5: 'ฉากที่ 5: รุ่งอรุณหน้าประตูเรือน'
};

function getSceneHotspots(sceneNum) {
  if (sceneNum === 1) {
    return [
      {
        id: 'forest_sign',
        x: 340,
        width: 130,
        label: 'สำรวจเสาไฟและป่ารอบตัว',
        onInteract: () => {
          queueDialogue([
            { speaker: getPlayerName(), text: 'กลับจากงานศพเพื่อนแท้ๆ... จู่ๆ รถก็เสียหลักคว่ำกลางทาง' },
            { speaker: getPlayerName(), text: 'พ่อครับ! แม่ครับ! ได้ยินผมไหม... ทำไมป่านี้มันเงียบจนได้ยินแต่เสียงลมหายใจตัวเองเลย' }
          ]);
        }
      },
      {
        id: 'mansion_front_door',
        x: 990,
        width: 170,
        label: 'ตะโกนขอความช่วยเหลือที่หน้าเรือนไทย',
        onInteract: () => {
          if (!state.flags.door1Opened) {
            state.flags.door1Opened = true;
            queueDialogue([
              { speaker: getPlayerName(), text: 'ขอโทษนะครับ! มีใครอยู่ไหมครับ รถผมเกิดอุบัติเหตุ ขอความช่วยเหลือหน่อยครับ!' },
              { speaker: 'เสียงจากเรือนไม้', text: 'แอ๊ดดดดด... (บานประตูไม้ค่อยๆ แง้มเปิดออกเอง โดยไม่มีคนยืนอยู่)' },
              { speaker: getPlayerName(), text: 'เอ๊ะ... ประตูเปิดเองเหรอ? เมื่อกี้ยังเห็นเงาคนผ่านหน้าต่างอยู่เลย... ลองเข้าไปดูหน่อยละกัน' }
            ], () => {
              playDoorCutscene(2, 160, 'ก้าวเข้าสู่เรือนไทย...');
            });
          } else {
            playDoorCutscene(2, 160, 'ก้าวเข้าสู่เรือนไทย...');
          }
        }
      }
    ];
  }

  if (sceneNum === 2) {
    const spots = [
      {
        id: 'dust_floor',
        x: 240,
        width: 120,
        label: 'สำรวจพื้นไม้และกองฝุ่น',
        onInteract: () => {
          state.flags.inspectedDust = true;
          queueDialogue([
            { speaker: getPlayerName(), text: 'เงียบกริบเลย... ไม่มีคนอยู่จริงๆ เหรอเนี่ย ทั้งที่เมื่อกี้เห็นเปิดไฟไว้นี่นา' },
            { speaker: getPlayerName(), text: 'ฝุ่นเกาะหนาขนาดนี้ เหมือนไม่มีคนอาศัยอยู่มาหลายสิบปีแล้ว...' }
          ]);
        }
      },
      {
        id: 'portrait_wall',
        x: 450,
        width: 160,
        label: 'สำรวจผนังรูปถ่าย & กรอบรูปที่ขาดหาย',
        onInteract: () => {
          state.flags.inspectedPortraits = true;
          if (state.flags.photosRestored) {
            queueDialogue([
              { speaker: getPlayerName(), text: 'รูปถ่ายที่ต่อครบแล้ว... เผยให้เห็นความจริงว่าจิตของเราหลุดเข้ามาในเรือนนี้ระหว่างความเป็นความตาย' }
            ]);
          } else {
            queueDialogue([
              { speaker: getPlayerName(), text: 'รูปคนสมัยก่อนเต็มผนังเลย... ทำไมรู้สึกเหมือนสายตาในรูปกำลังจ้องตามหลังเราอยู่' },
              { speaker: getPlayerName(), text: 'กรอบรูปตรงกลางมีรอยฉีกขาดหายไป 3 ชิ้น... ถ้าหาเศษรูปมาต่อคืนได้ น่าจะรู้อะไรเพิ่มขึ้น' }
            ], () => {
              showPhotoPuzzleModal();
            });
          }
        }
      },
      {
        id: 'hiding_cabinet_2',
        x: 790,
        width: 140,
        label: 'ตู้ไม้สักโบราณ (สำรวจ / ซ่อนตัว [Q])',
        isHidingSpot: true,
        onInteract: () => {
          if (!state.inventory.photos.includes(1)) {
            state.inventory.photos.push(1);
            playSound('pickup');
            updateHud();
            queueDialogue([
              { speaker: getPlayerName(), text: 'ในซอกตู้ไม้สักมี "เศษรูปถ่ายปริศนา (ชิ้นที่ 1)" ซ่อนอยู่!' },
              { speaker: getPlayerName(), text: '(ตู้ใบนี้กว้างพอจะมุดซ่อนตัวได้ด้วย ถ้ามีอะไรผิดปกติให้รีบกดปุ่ม [ซ่อนตัว])' }
            ]);
          } else {
            toggleHide();
          }
        }
      },
      {
        id: 'table_offering_1',
        x: 1030,
        width: 120,
        label: 'สำรวจโต๊ะไม้ริมหน้าต่าง',
        isHiddenClue: !state.inventory.offerings.includes('garland'),
        onInteract: () => {
          if (!state.inventory.offerings.includes('garland')) {
            state.inventory.offerings.push('garland');
            playSound('pickup');
            updateHud();
            queueDialogue([
              { speaker: getPlayerName(), text: 'เจอ "พวงมาลัยดอกไม้" วางอยู่ข้างตะเกียง... เก็บไว้เป็นของเซ่นไหว้ดีกว่า (1/3)' },
              { speaker: 'เสียงปริศนา', text: 'กุกกัก... กุกกัก... (เสียงดังมาจากหลังบานประตูฝั่งขวา)' },
              { speaker: getPlayerName(), text: 'เสียงอะไรน่ะ?! มีคนอยู่ในห้องถัดไปจริงๆ ด้วย... ลองเดินตามเสียงไปดู!' }
            ]);
            playSound('rustle');
          } else {
            queueDialogue([
              { speaker: getPlayerName(), text: 'เสียงกุกกักยังดังมาจากประตูห้องด้านขวา...' }
            ]);
          }
        }
      },
      {
        id: 'door_to_scene3',
        x: 1180,
        width: 110,
        label: 'เปิดประตูตามเสียงกุกกักไปห้องถัดไป',
        onInteract: () => {
          playDoorCutscene(3, 150, 'เดินตามเสียงกุกกักเข้าไปในความมืด...');
        }
      }
    ];
    return spots;
  }

  if (sceneNum === 3) {
    return [
      {
        id: 'door_back_scene2',
        x: 100,
        width: 110,
        label: 'กลับไปโถงรูปถ่าย (ฉากที่ 2)',
        onInteract: () => {
          playDoorCutscene(2, 1110, 'ย้อนกลับไปโถงรูปถ่าย...');
        }
      },
      {
        id: 'hiding_jar_3',
        x: 340,
        width: 130,
        label: 'ตุ่มน้ำโบราณ (สำรวจ / ซ่อนตัว [Q])',
        isHidingSpot: true,
        onInteract: () => {
          if (!state.inventory.offerings.includes('incense')) {
            state.inventory.offerings.push('incense');
            playSound('pickup');
            updateHud();
            queueDialogue([
              { speaker: getPlayerName(), text: 'ข้างตุ่มน้ำมี "ธูปเทียนบูชา" ซ่อนอยู่! เก็บไว้เป็นของเซ่นไหว้ (2/3)' }
            ]);
          } else {
            toggleHide();
          }
        }
      },
      {
        id: 'samphawesi_offering_spot',
        x: 740,
        width: 170,
        label: 'สำรวจร่างที่นั่งกินของเซ่นไหว้',
        onInteract: () => {
          triggerSamphawesiEncounter();
        }
      },
      {
        id: 'photo_piece_2_spot',
        x: 980,
        width: 130,
        label: 'สำรวจโต๊ะไม้เก่ามุมห้อง',
        isHiddenClue: !state.inventory.photos.includes(2),
        onInteract: () => {
          if (!state.inventory.photos.includes(2)) {
            state.inventory.photos.push(2);
            playSound('pickup');
            updateHud();
            queueDialogue([
              { speaker: getPlayerName(), text: 'ได้ "เศษรูปถ่ายปริศนา (ชิ้นที่ 2)" มาแล้ว!' }
            ]);
          } else {
            queueDialogue([{ speaker: getPlayerName(), text: 'ไม่มีอะไรเหลือบนโต๊ะแล้ว รีบไปห้องถัดไปเถอะ!' }]);
          }
        }
      },
      {
        id: 'door_to_scene4',
        x: 1180,
        width: 110,
        label: 'เปิดประตูไปโถงด้านในเรือน (ฉากที่ 4)',
        onInteract: () => {
          playDoorCutscene(4, 150, 'เสียงกระพรวนข้อเท้าดังแว่วมาจากโถงด้านใน...', true);
        }
      }
    ];
  }

  if (sceneNum === 4) {
    return [
      {
        id: 'door_back_scene3',
        x: 100,
        width: 110,
        label: 'ย้อนกลับห้องเครื่องเซ่น (ฉากที่ 3)',
        onInteract: () => {
          playDoorCutscene(3, 1110, 'กลับไปห้องเครื่องเซ่น...');
        }
      },
      {
        id: 'hiding_cabinet_4',
        x: 330,
        width: 140,
        label: 'ตู้ไม้สัก (ซ่อนตัวหนีผีนางรำ [Q])',
        isHidingSpot: true,
        onInteract: () => {
          if (!state.inventory.offerings.includes('dessert')) {
            state.inventory.offerings.push('dessert');
            playSound('pickup');
            updateHud();
            queueDialogue([
              { speaker: getPlayerName(), text: 'พบ "พานขนมมงคล" ซ่อนอยู่ในชั้นไม้! เก็บของเซ่นไหว้ครบแล้ว (3/3)!' }
            ]);
          } else {
            toggleHide();
          }
        }
      },
      {
        id: 'shrine_altar_spot',
        x: 640,
        width: 160,
        label: 'หิ้งบูชา & กระทงเครื่องเซ่น (วางของเซ่นไหว้ / เศษรูป)',
        isHiddenClue: !state.flags.offeringsPlaced,
        onInteract: () => {
          if (!state.inventory.photos.includes(3)) {
            state.inventory.photos.push(3);
            playSound('pickup');
            updateHud();
            queueDialogue([
              { speaker: getPlayerName(), text: 'ใต้ฐานหิ้งบูชามี "เศษรูปถ่ายปริศนา (ชิ้นที่ 3)" ซ่อนอยู่! ตอนนี้เราเก็บเศษรูปครบ 3 ชิ้นแล้ว!' }
            ]);
            return;
          }

          if (state.inventory.offerings.length < 3) {
            queueDialogue([
              { speaker: getPlayerName(), text: `ต้องรวบรวมของเซ่นไหว้ให้ครบ 3 ชิ้นก่อน (ตอนนี้มี ${state.inventory.offerings.length}/3 ชิ้น)` }
            ]);
            return;
          }

          if (!state.flags.offeringsPlaced) {
            state.flags.offeringsPlaced = true;
            playSound('chime');
            updateHud();
            queueDialogue([
              { speaker: getPlayerName(), text: 'ผมวางพวงมาลัย ธูปเทียน และพานขนมลงในกระทงเครื่องเซ่นครบแล้ว... ขอให้ดวงวิญญาณในเรือนนี้สงบลงด้วยเถิด' },
              state.flags.photosRestored
                ? { speaker: getPlayerName(), text: 'ทั้งของเซ่นไหว้และรูปภาพครบสมบูรณ์แล้ว... ขอให้ดวงวิญญาณในเรือนนี้ไปสู่สุคติเถิด' }
                : { speaker: getPlayerName(), text: 'เหลือแค่ประกอบ "เศษรูปถ่ายทั้ง 3 ชิ้น" ให้ครบเพื่อปลดผนึกประตูหลังเรือน!' }
            ], () => {
              if (!state.flags.photosRestored) showPhotoPuzzleModal();
              else checkRitualComplete();
            });
          } else if (!state.flags.photosRestored) {
            showPhotoPuzzleModal();
          } else {
            queueDialogue([
              { speaker: getPlayerName(), text: 'ทั้งของเซ่นไหว้และรูปภาพครบสมบูรณ์แล้ว! รีบไปออกทางประตูหลังเรือนฝั่งขวามือได้เลย!' }
            ]);
          }
        }
      },
      {
        id: 'back_exit_door',
        x: 1150,
        width: 130,
        label: 'ประตูหลังเรือน (ทางออก)',
        onInteract: () => {
          if (!state.flags.offeringsPlaced || !state.flags.photosRestored) {
            queueDialogue([
              { speaker: getPlayerName(), text: 'ประตูหลังเรือนถูกผนึกไว้ด้วยอาถรรพ์! ต้อง "ถวายของเซ่นไหว้ให้ครบ 3 ชิ้น" และ "ต่อเศษรูปภาพปริศนาให้ครบ 3 ชิ้น" ก่อน!' }
            ], () => {
              if (state.inventory.photos.length > 0 && !state.flags.photosRestored) {
                showPhotoPuzzleModal();
              }
            });
          } else {
            state.ghost.active = false;
            playDoorCutscene(5, 220, 'บานประตูหลังเรือนเปิดออกสู่แสงสว่าง...');
          }
        }
      }
    ];
  }

  if (sceneNum === 5) {
    return [
      {
        id: 'uncle_raj_pattern',
        x: 820,
        width: 180,
        label: 'พูดคุยกับคุณลุงชุดราชปะแตน',
        onInteract: () => {
          triggerEndingDialogue();
        }
      }
    ];
  }

  return [];
}

function getPlayerName() {
  return state.character === 'female' ? 'ริน (นักเรียนหญิง)' : 'นนท์ (นักเรียนชาย)';
}

// ----------------------- UI & Character / Mode Selection -----------------------
function selectCharacter(charType) {
  state.character = charType;
  document.getElementById('select-male').classList.toggle('selected', charType === 'male');
  document.getElementById('select-female').classList.toggle('selected', charType === 'female');
}

function switchScreen(screenId) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) target.classList.add('active');
}

function startSoloGame() {
  initAudio();
  state.role = 'host';
  state.started = true;
  switchScreen('game-screen');
  startIntroSequence();
}

async function openCoopLobby() {
  initAudio();
  // Re-open the existing lobby instead of creating a second room.
  if (state.roomCode && net.hostToken) {
    document.getElementById('coop-modal').classList.remove('hidden');
    return;
  }
  const btn = document.getElementById('btn-open-lobby');
  if (btn) btn.disabled = true;
  try {
    const info = await getServerInfo();
    const res = await apiPost('create-room', { mode: 'coop', character: state.character });
    if (!res.ok) throw new Error(res.message || res.error || 'create-room failed');

    clearCheckpoint();
    state.role = 'host';
    state.roomCode = res.code;
    net.hostToken = res.hostToken;
    startHostChannel();

    document.getElementById('lobby-room-code').textContent = state.roomCode;
    document.getElementById('hud-room-badge').textContent = `ห้อง: ${state.roomCode}`;
    document.getElementById('hud-room-badge').classList.remove('hidden');

    const hostOrigin = getShareOrigin(info);
    const p1Url = `${hostOrigin}/?room=${state.roomCode}&role=p1`;
    const p2Url = `${hostOrigin}/?room=${state.roomCode}&role=p2`;
    const [qr1, qr2] = await Promise.all([
      apiGet(`qr?text=${encodeURIComponent(p1Url)}`),
      apiGet(`qr?text=${encodeURIComponent(p2Url)}`)
    ]);
    if (qr1.ok) document.getElementById('qr-p1-img').src = qr1.dataUrl;
    if (qr2.ok) document.getElementById('qr-p2-img').src = qr2.dataUrl;
    document.getElementById('lobby-url-hint').textContent = `สแกนด้วยกล้องมือถือ หรือเปิดลิงก์: ${hostOrigin} แล้วกรอกรหัส ${state.roomCode}`;
    if (info.isVercel && !info.sharedStore) {
      console.warn('Vercel without a shared store: co-op relies on a single warm instance. Set UPSTASH_REDIS_REST_URL/TOKEN.');
    }
    updateLobbyPlayerStatus({ p1: false, p2: false });
    document.getElementById('coop-modal').classList.remove('hidden');
  } catch (err) {
    console.error(err);
    showToast('เปิดห้องไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง', 'warn');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function getShareOrigin(info) {
  const host = window.location.hostname;
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  if (!isLoopback || info.isVercel) return window.location.origin;
  if (info.publicUrl) return info.publicUrl;
  if (info.lanIp && info.lanIp !== 'localhost') return `http://${info.lanIp}:${info.port || window.location.port}`;
  return window.location.origin;
}

function closeCoopLobby() {
  document.getElementById('coop-modal').classList.add('hidden');
}

function startFromLobby() {
  closeCoopLobby();
  state.started = true;
  switchScreen('game-screen');
  startIntroSequence();
  broadcastState();
}

function joinRoomByCode(role) {
  const code = document.getElementById('join-code-input').value.trim();
  if (!/^\d{4}$/.test(code)) {
    showToast('กรุณากรอกรหัสห้องเป็นตัวเลข 4 หลักครับ', 'warn');
    return;
  }
  joinAsMobileRole(code, role);
}

async function joinAsMobileRole(code, role) {
  initAudio();
  if (!/^\d{4}$/.test(String(code))) {
    showToast('รหัสห้องไม่ถูกต้อง', 'warn');
    return;
  }
  try {
    const info = await getServerInfo();
    const res = await apiPost('join-room', { code, role });
    if (!res.ok) {
      showToast(res.error === 'room_not_found'
        ? `ไม่พบห้อง ${code} (ห้องอาจหมดอายุหรือรหัสผิด) ลองสแกน QR ใหม่จากจอกลาง`
        : 'เข้าห้องไม่สำเร็จ ลองใหม่อีกครั้ง', 'warn', 6000);
      return;
    }
    state.role = role;
    state.roomCode = code;
    net.playerToken = res.playerToken;
    net.closed = false;
    applyRoomStateToClient(res.room);

    if (role === 'p1') {
      document.getElementById('p1-room-label').textContent = `ห้อง ${code}`;
      switchScreen('p1-screen');
    } else {
      document.getElementById('p2-room-label').textContent = `ห้อง ${code}`;
      switchScreen('p2-screen');
      if (!net.radarRunning) {
        net.radarRunning = true;
        requestAnimationFrame(renderP2RadarLoop);
      }
    }
    startMobileChannel(info);
  } catch (err) {
    console.error(err);
    showToast('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต', 'warn');
  }
}

// Check if opened directly via QR scan URL (?room=XXXX&role=p1/p2)
if (initialRoomParam && (initialRoleParam === 'p1' || initialRoleParam === 'p2')) {
  window.addEventListener('DOMContentLoaded', () => {
    joinAsMobileRole(initialRoomParam, initialRoleParam);
  });
}

// ----------------------- Networking: host sync, phone polling, SSE -----------------------
const net = {
  info: null,
  hostToken: null,
  playerToken: null,
  stateSeq: 0,
  inFlight: false,
  lastSentJson: '',
  lastSentAt: 0,
  lastInputId: 0,
  lastMoveSeq: -1,
  remoteMoving: false,
  remoteMoveAt: 0,
  inputSeq: 0,
  moveRepeat: null,
  syncTimer: null,
  pollTimer: null,
  failures: 0,
  closed: false,
  radarRunning: false
};

async function apiGet(path) {
  const r = await fetch(`/api/${path}`, { cache: 'no-store' });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, ...data, ok: r.ok && data.ok !== false };
}

async function apiPost(route, body) {
  const r = await fetch(`/api/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, ...data, ok: r.ok && data.ok !== false };
}

async function getServerInfo() {
  if (net.info) return net.info;
  try {
    const info = await apiGet('server-info');
    net.info = info.ok ? info : { isVercel: false, sse: false };
  } catch (_) {
    net.info = { isVercel: false, sse: false };
  }
  return net.info;
}

function openEventStream(params, handlers) {
  if (eventSource) eventSource.close();
  eventSource = null;
  if (!net.info || !net.info.sse || typeof EventSource === 'undefined') return;
  const qs = new URLSearchParams(params).toString();
  try {
    eventSource = new EventSource(`/api/events?${qs}`);
    Object.entries(handlers).forEach(([name, fn]) => {
      eventSource.addEventListener(name, (ev) => {
        try { fn(JSON.parse(ev.data)); } catch (_) {}
      });
    });
  } catch (_) {
    eventSource = null;
  }
}

// ---- Host side ----
function startHostChannel() {
  net.closed = false;
  net.failures = 0;
  openEventStream({ code: state.roomCode, role: 'host', token: net.hostToken }, {
    remote_input: (inp) => handleRemoteInputs([inp]),
    room_updated: (data) => updateLobbyPlayerStatus(data.players)
  });
  if (net.syncTimer) clearInterval(net.syncTimer);
  net.syncTimer = setInterval(hostSyncTick, CONFIG.SYNC_INTERVAL_MS);
  hostSyncTick();
}

function stopCoop(message) {
  net.closed = true;
  if (net.syncTimer) clearInterval(net.syncTimer);
  if (net.pollTimer) clearInterval(net.pollTimer);
  if (net.moveRepeat) clearInterval(net.moveRepeat);
  net.syncTimer = net.pollTimer = net.moveRepeat = null;
  if (eventSource) eventSource.close();
  eventSource = null;
  if (state.role === 'host') {
    state.roomCode = null;
    net.hostToken = null;
    document.getElementById('hud-room-badge').classList.add('hidden');
    saveCheckpoint();
  }
  if (message) showToast(message, 'warn', 6000);
}

function buildStatePatch() {
  return {
    scene: state.scene,
    character: state.character,
    started: state.started,
    player: state.player,
    inventory: state.inventory,
    flags: state.flags,
    ghost: {
      active: state.ghost.active,
      type: state.ghost.type,
      x: Math.round(state.ghost.x),
      dir: state.ghost.dir,
      frame: state.ghost.frame,
      stunTimer: Math.round(state.ghost.stunTimer * 10) / 10,
      alertLevel: state.ghost.alertLevel,
      alpha: Math.round(state.ghost.alpha * 10) / 10
    },
    support: { bellCooldown: Math.ceil(state.bellCooldown) }
  };
}

async function hostSyncTick() {
  if (state.role !== 'host' || !state.roomCode || !net.hostToken || net.closed || net.inFlight) return;
  const patch = buildStatePatch();
  patch.player = { ...patch.player, x: Math.round(patch.player.x) };
  const json = JSON.stringify(patch);
  const changed = json !== net.lastSentJson;
  const now = Date.now();
  // With SSE (local server) inputs are pushed, so idle syncs are only keep-alives.
  // Without SSE (Vercel) the host must keep polling to receive phone inputs.
  if (!changed && net.info && net.info.sse && now - net.lastSentAt < CONFIG.SYNC_KEEPALIVE_MS) return;

  net.inFlight = true;
  const body = { code: state.roomCode, hostToken: net.hostToken };
  if (changed) {
    body.seq = ++net.stateSeq;
    body.statePatch = patch;
  }
  try {
    const res = await apiPost('sync-state', body);
    if (res.ok) {
      net.failures = 0;
      net.lastSentAt = now;
      if (changed) net.lastSentJson = json;
      if (res.players) updateLobbyPlayerStatus(res.players);
      if (Array.isArray(res.inputs)) handleRemoteInputs(res.inputs);
    } else if (res.status === 403 || res.status === 404) {
      stopCoop('ห้อง co-op หมดอายุหรือถูกปิดแล้ว — เล่นต่อแบบคนเดียวได้เลย (เปิดห้องใหม่ได้จากหน้าแรก)');
    } else {
      net.failures++;
    }
  } catch (_) {
    net.failures++;
  } finally {
    net.inFlight = false;
    updateConnectionBadge();
  }
}

function broadcastState() {
  if (state.role === 'host' && net.hostToken) hostSyncTick();
}

function updateConnectionBadge() {
  const badge = document.getElementById('hud-room-badge');
  if (!badge || !state.roomCode) return;
  badge.textContent = net.failures >= 4 ? `ห้อง: ${state.roomCode} ⚠️ สัญญาณขาด` : `ห้อง: ${state.roomCode}`;
}

function handleRemoteInputs(list) {
  list
    .filter((inp) => inp && typeof inp.id === 'number')
    .sort((a, b) => a.id - b.id)
    .forEach((inp) => {
      if (inp.id <= net.lastInputId) return; // already handled (SSE + sync drain overlap)
      net.lastInputId = inp.id;
      handleIncomingRemoteInput(inp);
    });
}

function handleIncomingRemoteInput({ action, value, seq }) {
  if (state.role !== 'host') return;
  if (action === 'move') {
    const s = Number(seq) || 0;
    if (s < net.lastMoveSeq) return; // out-of-order packet
    net.lastMoveSeq = s;
    net.remoteMoving = value !== 0;
    net.remoteMoveAt = performance.now();
    if (value === 0) {
      if (state.moveInput !== 0) setMove(0);
    } else if (state.moveInput !== value) {
      setMove(value);
    }
    return;
  }
  if (action === 'interact') triggerInteract();
  if (action === 'hide') toggleHide();
  if (action === 'flashlight') toggleFlashlight();
  if (action === 'stun_ghost') useBell('P2');
  if (action === 'sixth_sense_pulse') {
    state.revealTimer = CONFIG.PULSE_DURATION;
    playSound('chime');
    showToast('👁️ P2 ส่งคลื่นญาณทิพย์ — จุดสำรวจทั้งหมดถูกเปิดเผยชั่วครู่');
  }
}

function useBell(source) {
  if (!state.ghost.active || state.bellCooldown > 0) return false;
  state.ghost.stunTimer = CONFIG.BELL_STUN;
  state.bellCooldown = CONFIG.BELL_COOLDOWN;
  playSound('chime');
  showToast(`🔔 ${source === 'P2' ? 'ญาณทิพย์ (P2)' : getPlayerName()} สั่นกระดิ่งอาคม! วิญญาณถูกตรึง ${CONFIG.BELL_STUN} วินาที`);
  broadcastState();
  return true;
}

// Remote moves can arrive late; if the phone stops refreshing a held move, stop walking.
function updateRemoteMoveTimeout() {
  if (net.remoteMoving && performance.now() - net.remoteMoveAt > CONFIG.REMOTE_MOVE_TIMEOUT_MS) {
    net.remoteMoving = false;
    if (state.moveInput !== 0) setMove(0);
  }
}

function updateLobbyPlayerStatus(players) {
  if (!players) return;
  const s1 = document.getElementById('status-p1');
  const s2 = document.getElementById('status-p2');
  if (s1) {
    s1.textContent = players.p1 ? '🟢 เชื่อมต่อมือถือ P1 แล้ว!' : '⚪ รอเชื่อมต่อ (หรือบังคับบนคอมได้)';
    s1.classList.toggle('connected', !!players.p1);
  }
  if (s2) {
    s2.textContent = players.p2 ? '🟢 เชื่อมต่อมือถือ P2 (ญาณทิพย์) แล้ว!' : '⚪ รอเชื่อมต่อ...';
    s2.classList.toggle('connected', !!players.p2);
  }
}

// ---- Phone side ----
function startMobileChannel(info) {
  openEventStream({ code: state.roomCode, role: state.role, token: net.playerToken }, {
    state_synced: (room) => applyRoomStateToClient(room)
  });
  if (net.pollTimer) clearInterval(net.pollTimer);
  const interval = info && info.sse ? CONFIG.POLL_LOCAL_MS : CONFIG.POLL_REMOTE_MS;
  net.pollTimer = setInterval(mobilePollTick, interval);
  mobilePollTick();
}

let mobilePollInFlight = false;
async function mobilePollTick() {
  if (!state.roomCode || net.closed || mobilePollInFlight) return;
  mobilePollInFlight = true;
  try {
    const qs = new URLSearchParams({ code: state.roomCode, role: state.role, token: net.playerToken || '' });
    const res = await apiGet(`room-state?${qs}`);
    if (res.ok && res.room) {
      net.failures = 0;
      applyRoomStateToClient(res.room);
    } else {
      handleMobileError(res);
    }
  } catch (_) {
    net.failures++;
    if (net.failures >= 4) setMobileStatus('📶 สัญญาณขาดหาย กำลังเชื่อมต่อใหม่...', 'warn');
  } finally {
    mobilePollInFlight = false;
  }
}

function handleMobileError(res) {
  if (res.status === 409) {
    stopCoop();
    setMobileStatus('🔁 มีมือถือเครื่องอื่นเข้ามาใช้ตำแหน่งนี้แทนแล้ว — สแกน QR ใหม่เพื่อกลับมาควบคุม', 'warn');
  } else if (res.status === 404) {
    stopCoop();
    setMobileStatus('🚪 ห้องนี้ถูกปิดหรือหมดอายุแล้ว — สแกน QR ใหม่จากจอกลาง', 'warn');
  } else {
    net.failures++;
  }
}

function setMobileStatus(text, kind = '') {
  ['p1-status', 'p2-status'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = `mobile-status ${kind}`.trim();
  });
}

function applyRoomStateToClient(room) {
  if (!room || state.role === 'host') return;
  if (typeof room.scene === 'number') state.scene = room.scene;
  if (room.player) Object.assign(state.player, room.player);
  if (room.inventory) Object.assign(state.inventory, room.inventory);
  if (room.flags) Object.assign(state.flags, room.flags);
  if (room.ghost) Object.assign(state.ghost, room.ghost);
  if (room.support) state.remoteBellCooldown = room.support.bellCooldown || 0;
  state.started = !!room.started;

  const p1Off = document.getElementById('p1-inv-offerings');
  const p1Pho = document.getElementById('p1-inv-photos');
  if (p1Off) p1Off.textContent = `${state.inventory.offerings.length}/3`;
  if (p1Pho) p1Pho.textContent = `${state.inventory.photos.length}/3`;

  if (net.closed) return;
  if (room.hostOnline === false) setMobileStatus('⚠️ จอกลางหลุดการเชื่อมต่อ... รอสักครู่', 'warn');
  else if (state.flags.victory) setMobileStatus('✨ รอดพ้นจากเรือนซ่อนวิญญาณแล้ว! แล้วพบกันที่ Open House BUU', 'good');
  else if (state.flags.gameOver) setMobileStatus('💀 P1 ถูกวิญญาณจับได้! รอจอกลางกด "ฟื้นสติ"', 'warn');
  else if (!state.started) setMobileStatus('⏳ เชื่อมต่อแล้ว — รอจอกลางกด "เริ่มเกม"', 'good');
  else setMobileStatus('');

  const bellBtn = document.getElementById('btn-stun-ghost');
  const bellLabel = document.getElementById('bell-cooldown-label');
  if (bellBtn && bellLabel) {
    const cd = state.remoteBellCooldown || 0;
    bellBtn.disabled = cd > 0 || !state.ghost.active;
    bellLabel.textContent = cd > 0 ? `(พร้อมในอีก ${cd} วิ)` : (state.ghost.active ? '' : '(ยังไม่มีวิญญาณ)');
  }
}

function sendRemoteInput(action, value) {
  if (!state.roomCode || !net.playerToken || net.closed) return;
  if (action !== 'move') playSound('step');
  apiPost('player-input', {
    code: state.roomCode,
    role: state.role,
    playerToken: net.playerToken,
    action,
    value,
    seq: ++net.inputSeq
  }).then((res) => {
    if (!res.ok) handleMobileError(res);
  }).catch(() => {});
}

// Held move buttons on the P1 phone: repeat the current direction so the host can
// stop the character on its own if the "release" packet is late or lost.
function startRemoteMove(dir) {
  if (net.moveRepeat) clearInterval(net.moveRepeat);
  sendRemoteInput('move', dir);
  net.moveRepeat = setInterval(() => sendRemoteInput('move', dir), CONFIG.REMOTE_MOVE_REPEAT_MS);
}

function stopRemoteMove() {
  if (!net.moveRepeat) return;
  clearInterval(net.moveRepeat);
  net.moveRepeat = null;
  sendRemoteInput('move', 0);
}

function bindHoldButton(el, onDown, onUp) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    onDown();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => el.addEventListener(type, onUp));
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

window.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-local-move]').forEach((el) => {
    const dir = Number(el.dataset.localMove);
    bindHoldButton(el, () => setMove(dir), () => { if (state.moveInput === dir) setMove(0); });
  });
  document.querySelectorAll('[data-remote-move]').forEach((el) => {
    const dir = Number(el.dataset.remoteMove);
    bindHoldButton(el, () => startRemoteMove(dir), stopRemoteMove);
  });
  const cp = loadCheckpoint();
  if (cp && !(initialRoomParam && initialRoleParam)) {
    const btn = document.getElementById('btn-resume');
    if (btn) {
      btn.textContent = `⏯ เล่นต่อ (${SCENE_TITLES[cp.scene] || 'จุดที่บันทึกไว้'})`;
      btn.classList.remove('hidden');
    }
  }
});
window.addEventListener('blur', () => {
  stopRemoteMove();
  if (state.role === 'host' && state.moveInput !== 0) setMove(0);
});

// ----------------------- Checkpoint (survives a reload of the host tab) -----------------------
const CHECKPOINT_KEY = 'buu-horror-checkpoint-v1';

function saveCheckpoint() {
  if (state.role !== 'host' || !state.started || state.flags.victory) return;
  const flags = { ...state.flags, cutscenePlaying: false, gameOver: false, victory: false };
  const data = {
    v: 1,
    character: state.character,
    scene: state.scene,
    x: Math.round(state.player.x),
    inventory: state.inventory,
    flags,
    roomCode: state.roomCode,
    hostToken: net.hostToken
  };
  try { sessionStorage.setItem(CHECKPOINT_KEY, JSON.stringify(data)); } catch (_) {}
}

function loadCheckpoint() {
  try {
    const data = JSON.parse(sessionStorage.getItem(CHECKPOINT_KEY) || 'null');
    return data && data.v === 1 && data.scene >= 1 && data.scene <= 5 ? data : null;
  } catch (_) {
    return null;
  }
}

function clearCheckpoint() {
  try { sessionStorage.removeItem(CHECKPOINT_KEY); } catch (_) {}
}

async function resumeFromCheckpoint() {
  const cp = loadCheckpoint();
  if (!cp) return startSoloGame();
  initAudio();
  selectCharacter(cp.character === 'female' ? 'female' : 'male');
  state.role = 'host';
  state.started = true;
  const inv = cp.inventory || {};
  state.inventory = {
    offerings: [...(inv.offerings || [])],
    photos: [...(inv.photos || [])],
    placedPhotos: [...(inv.placedPhotos || [])]
  };
  Object.assign(state.flags, cp.flags || {});
  switchScreen('game-screen');
  if (cp.roomCode && cp.hostToken) {
    await getServerInfo();
    state.roomCode = cp.roomCode;
    net.hostToken = cp.hostToken;
    document.getElementById('hud-room-badge').textContent = `ห้อง: ${state.roomCode}`;
    document.getElementById('hud-room-badge').classList.remove('hidden');
    startHostChannel();
  }
  enterScene(cp.scene, cp.x);
  showToast('⏯ กลับมาเล่นต่อจากจุดที่บันทึกไว้');
}

function restartGame() {
  clearCheckpoint();
  window.location.href = window.location.pathname;
}

// ----------------------- Fullscreen / orientation (phones) -----------------------
function canFullscreen() {
  return !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      const el = document.documentElement;
      await (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' });
    }
  } catch (_) {
    showToast('เบราว์เซอร์นี้ไม่รองรับโหมดเต็มจอ');
  }
}

async function enterLandscapeFullscreen() {
  try {
    if (canFullscreen() && !document.fullscreenElement) await toggleFullscreen();
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
  } catch (_) {
    // iPhone/iPad cannot lock orientation from a web page
    showToast('หมุนมือถือเป็นแนวนอนได้เลย (ถ้าหมุนไม่ได้ ให้ปิดล็อกการหมุนจอในศูนย์ควบคุม)', '', 5000);
  }
}

function dismissRotateHint() {
  const el = document.getElementById('rotate-hint');
  if (el) el.classList.add('dismissed');
}

window.addEventListener('DOMContentLoaded', () => {
  const fsBtn = document.getElementById('btn-fullscreen');
  if (fsBtn && !canFullscreen()) fsBtn.classList.add('hidden');
});

// ----------------------- Toast (non-blocking messages) -----------------------
let toastTimer = null;
function showToast(text, kind = '', ms = 3200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.className = `toast ${kind}`.trim();
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

// ----------------------- Story & Cutscene Logic -----------------------
function startIntroSequence() {
  state.scene = 1;
  setAmbientScene(1);
  state.player.x = 160;
  updateHud();
  queueDialogue([
    { speaker: 'เหตุการณ์ก่อนหน้า', text: 'หลังจากกลับจากงานศพของเพื่อนสนิทพร้อมครอบครัว... รถของคุณประสบอุบัติเหตุรุนแรงกลางทางมืด' },
    { speaker: getPlayerName(), text: 'อึก... ปวดหัวจัง... ที่นี่ที่ไหนเนี่ย? พ่อครับ! แม่ครับ!' },
    { speaker: getPlayerName(), text: 'รอบตัวมีแต่ป่ามืดและเงียบสงัด... ข้างหน้านั้นมีบ้านทรงไทยเก่าเปิดไฟอยู่ ลองเดินไปขอความช่วยเหลือดูดีกว่า' }
  ]);
}

function queueDialogue(lines, onComplete = null) {
  state.moveInput = 0;
  if (isDialogueOpen()) {
    // A conversation is already on screen: append instead of discarding it (and its callback).
    state.dialogueQueue.push(...lines.map((l) => ({ ...l })));
    if (onComplete) {
      const previous = state.dialogueOnComplete;
      state.dialogueOnComplete = previous ? () => { previous(); onComplete(); } : onComplete;
    }
    return;
  }
  state.dialogueQueue = lines.map((l) => ({ ...l }));
  state.dialogueOnComplete = onComplete;
  showNextDialogueLine();
}

function isDialogueOpen() {
  return !document.getElementById('dialogue-box').classList.contains('hidden');
}

function isPhotoModalOpen() {
  return !document.getElementById('photo-modal').classList.contains('hidden');
}

function isSensing() {
  return state.player.sixthSense || state.revealTimer > 0;
}

function showNextDialogueLine() {
  const box = document.getElementById('dialogue-box');
  if (!state.dialogueQueue || state.dialogueQueue.length === 0) {
    box.classList.add('hidden');
    if (state.dialogueOnComplete) {
      const cb = state.dialogueOnComplete;
      state.dialogueOnComplete = null;
      cb();
    }
    return;
  }
  const current = state.dialogueQueue.shift();
  document.getElementById('dialogue-speaker').textContent = current.speaker;
  document.getElementById('dialogue-text').textContent = current.text;
  box.classList.remove('hidden');
}

function advanceDialogue() {
  playSound('step');
  showNextDialogueLine();
}

function renderCutsceneFrame(cx, prefix, idx) {
  cx.imageSmoothingEnabled = false;
  cx.fillStyle = '#050409';
  cx.fillRect(0, 0, 800, 450);

  const studentImg = state.character === 'female' ? IMAGES.femaleWalk0 : IMAGES.maleWalk0;
  const studentWalkImg = state.character === 'female' ? IMAGES[`femaleWalk${idx % 8}`] : IMAGES[`maleWalk${idx % 8}`];

  if (prefix === 'cutscene_door') {
    const bg = IMAGES.bg1;
    if (isReady(bg)) cx.drawImage(bg, 0, 0, 800, 450);
    cx.fillStyle = 'rgba(4, 6, 12, 0.72)';
    cx.fillRect(0, 0, 800, 450);

    // Dark interior cavity behind the double doors
    const gap = [0, 8, 28, 64, 110, 148][idx] || 0;
    cx.fillStyle = '#030408';
    cx.fillRect(400 - gap, 70, gap * 2, 330);

    if (idx >= 3 && isReady(IMAGES.dancerAnim1)) {
      cx.save();
      cx.globalAlpha = idx === 3 ? 0.85 : 0.45;
      cx.drawImage(IMAGES.dancerAnim1, 345, 130, 110, 220);
      cx.restore();
    }

    const door = IMAGES.door;
    if (isReady(door)) {
      const dw = door.naturalWidth;
      const dh = door.naturalHeight;
      // Left leaf
      cx.drawImage(door, 0, 0, dw / 2, dh, 270 - gap, 65, 130, 335);
      // Right leaf
      cx.drawImage(door, dw / 2, 0, dw / 2, dh, 400 + gap, 65, 130, 335);
    }

    if (idx >= 4) {
      const grad = cx.createRadialGradient(260, 260, 10, 420, 235, 290);
      grad.addColorStop(0, 'rgba(255, 225, 130, 0.55)');
      grad.addColorStop(1, 'rgba(255, 225, 130, 0)');
      cx.fillStyle = grad;
      cx.beginPath();
      cx.moveTo(235, 255);
      cx.lineTo(580, 110);
      cx.lineTo(580, 385);
      cx.closePath();
      cx.fill();
    }

    if (isReady(studentWalkImg)) {
      cx.drawImage(studentWalkImg, 135 + idx * 24, 175, 115, 230);
    }
  } else if (prefix === 'cutscene_sam') {
    const bg = IMAGES.bg3;
    if (isReady(bg)) cx.drawImage(bg, 0, 0, 800, 450);
    cx.fillStyle = 'rgba(6, 5, 10, 0.65)';
    cx.fillRect(0, 0, 800, 450);

    if (isReady(IMAGES.krathong)) {
      cx.drawImage(IMAGES.krathong, 515, 325, 76, 62);
    }
    const samFrameMap = [0, 0, 1, 2, 4, 6];
    const samImg = IMAGES[`samAnim${samFrameMap[idx] || 0}`];
    if (isReady(samImg)) {
      const sx = idx === 5 ? 390 : 475;
      const sy = idx >= 4 ? 165 : 195;
      cx.drawImage(samImg, sx, sy, 145, 215);
    }
    if (idx >= 2) {
      const grad = cx.createRadialGradient(250, 255, 10, 500, 260, 320);
      grad.addColorStop(0, 'rgba(255, 220, 125, 0.52)');
      grad.addColorStop(1, 'rgba(255, 90, 60, 0)');
      cx.fillStyle = grad;
      cx.beginPath();
      cx.moveTo(235, 250);
      cx.lineTo(630, 130);
      cx.lineTo(630, 390);
      cx.closePath();
      cx.fill();
    }
    if (isReady(studentImg)) {
      cx.drawImage(studentImg, 130, 175, 115, 230);
    }
  } else {
    const bg = idx < 2 ? IMAGES.bg2 : IMAGES.bg5;
    if (isReady(bg)) cx.drawImage(bg, 0, 0, 800, 450);
    if (idx < 2) {
      cx.fillStyle = 'rgba(10, 8, 14, 0.55)';
      cx.fillRect(0, 0, 800, 450);
      if (isReady(IMAGES.frameBroken)) {
        cx.drawImage(IMAGES.frameBroken, 290, 75, 220, 270);
      }
      const spread = idx === 0 ? 55 : 0;
      if (isReady(IMAGES.photo1)) cx.drawImage(IMAGES.photo1, 320 - spread, 110 - spread / 2, 85, 105);
      if (isReady(IMAGES.photo2)) cx.drawImage(IMAGES.photo2, 395 + spread, 115 - spread / 3, 85, 105);
      if (isReady(IMAGES.photo3)) cx.drawImage(IMAGES.photo3, 355, 195 + spread, 95, 105);
    } else {
      const uncleImg = idx % 2 === 0 ? IMAGES.uncle0 : IMAGES.uncle1;
      if (isReady(uncleImg)) {
        cx.drawImage(uncleImg, 495, 165, 118, 235);
      }
      if (isReady(studentWalkImg)) {
        cx.drawImage(studentWalkImg, 210 + (idx - 2) * 28, 175, 115, 230);
      }
      if (idx === 5) {
        cx.fillStyle = 'rgba(12, 9, 18, 0.86)';
        cx.fillRect(110, 28, 580, 92);
        cx.strokeStyle = '#f0c45a';
        cx.lineWidth = 3;
        cx.strokeRect(110, 28, 580, 92);
        cx.fillStyle = '#ffd875';
        cx.font = 'bold 26px Tahoma, sans-serif';
        cx.textAlign = 'center';
        cx.fillText('คำสัญญา: พบกันที่งาน OPEN HOUSE BUU', 400, 68);
        cx.fillStyle = '#ffffff';
        cx.font = 'bold 20px Tahoma, sans-serif';
        cx.fillText('วันที่ 20 – 21 นี้ ณ มหาวิทยาลัยบูรพา', 400, 102);
      }
    }
  }
}

function playFrameByFrameCutscene(prefix, frameCaptions, frameDurationMs, onComplete) {
  state.flags.cutscenePlaying = true;
  state.moveInput = 0;
  const overlay = document.getElementById('door-cutscene');
  const frameCanvas = document.getElementById('cutscene-canvas');
  const frameCtx = frameCanvas.getContext('2d');
  closePhotoPuzzleModal();
  const counterEl = document.getElementById('cutscene-frame-counter');
  const captionEl = document.getElementById('door-caption');

  overlay.classList.remove('hidden');
  let idx = 0;
  const total = frameCaptions.length;

  function stepFrame() {
    if (idx >= total) {
      overlay.classList.add('hidden');
      state.flags.cutscenePlaying = false;
      if (onComplete) onComplete();
      return;
    }
    renderCutsceneFrame(frameCtx, prefix, idx);
    counterEl.textContent = `FRAME ${idx + 1} / ${total}`;
    captionEl.textContent = frameCaptions[idx];
    if (idx === 0) playSound('creak');
    if (idx === 3) playSound('chime');
    idx++;
    setTimeout(stepFrame, frameDurationMs);
  }
  stepFrame();
}

function playDoorCutscene(targetScene, targetX, captionText = 'แอ๊ดดดดด...', showGhostFlash = false) {
  const captions = [
    'เฟรม 1/6 : ยืนอยู่หน้าบานประตูไม้สักโบราณ...',
    'เฟรม 2/6 : สลักกลอนไม้ค่อยๆ ขยับเปิดออกเอง...',
    'เฟรม 3/6 : แอ๊ดดดดด... บานประตูแง้มออกช้าๆ',
    showGhostFlash ? 'เฟรม 4/6 : !! เงาร่างปริศนายืนจ้องอยู่ในความมืดหลังประตู !!' : 'เฟรม 4/6 : ความมืดและกลิ่นธูปเก่าลอยออกมาจากห้องถัดไป...',
    'เฟรม 5/6 : แสงไฟฉายสาดส่องฝ่าความมืดเข้าไป...',
    `เฟรม 6/6 : ${captionText}`
  ];
  playFrameByFrameCutscene('cutscene_door', captions, 520, () => {
    enterScene(targetScene, targetX);
  });
}

function enterScene(sceneNum, startX) {
  state.scene = sceneNum;
  setAmbientScene(sceneNum);
  state.player.x = startX;
  state.player.hidden = false;
  state.unhideGrace = 0;
  resetGhost(startX < 640 ? 980 : -CONFIG.GHOST_REENTER_MARGIN);
  updateHud();

  if (sceneNum === 2 && !state.flags.visited2) {
    state.flags.visited2 = true;
    queueDialogue([
      { speaker: getPlayerName(), text: 'เข้ามาข้างในแล้ว... ทำไมเงียบสงัดขนาดนี้ ไม่มีใครอยู่เลยทั้งที่เมื่อกี้เห็นคนเปิดไฟไว้' },
      { speaker: getPlayerName(), text: 'ลองเดินสำรวจรูปภาพบนผนัง โต๊ะ และตู้ไม้ในห้องนี้ดูก่อนดีกว่า' }
    ]);
  } else if (sceneNum === 3) {
    state.ghost.type = 'samphawesi';
    if (!state.flags.samphawesiTriggered) {
      state.ghost.active = false;
      state.ghost.x = 760;
      queueDialogue([
        { speaker: getPlayerName(), text: 'เสียงกุกกักดังมาจากตรงกลางห้องนั้น... นั่นใครนั่งหันหลังทำอะไรอยู่ข้างกระทงใบตองน่ะ?' }
      ]);
    } else {
      state.ghost.active = true;
    }
  } else if (sceneNum === 4) {
    state.ghost.type = 'dancer';
    state.ghost.active = !state.flags.offeringsPlaced || !state.flags.photosRestored;
    playSound('chime');
    if (state.ghost.active) playTension();
    if (!state.flags.visited4) {
      state.flags.visited4 = true;
      queueDialogue([
        { speaker: 'เสียงกระพรวนข้อเท้า', text: 'กริ๊ง... กริ๊ง... (เงาร่างผีนางรำในชุดสไบเปื้อนเลือดปรากฏตัวขึ้นในความมืด!)' },
        { speaker: getPlayerName(), text: 'ผีนางรำ!! ต้องรีบเก็บของเซ่นไหว้และเศษรูปชิ้นสุดท้าย แล้วมุดซ่อนในตู้ไม้เวลาเธอเข้ามาใกล้!' }
      ]);
    }
  } else if (sceneNum === 5) {
    state.ghost.active = false;
    state.player.flashlight = false;
    queueDialogue([
      { speaker: getPlayerName(), text: 'แฮ่ก... แฮ่ก... ออกมาจากเรือนไทยนั่นได้สักที! ข้างนอกหมอกลงจางๆ... เอ๊ะ นั่นคุณลุงยืนอยู่ตรงนั้นนี่นา!' }
    ]);
  }
  saveCheckpoint();
  broadcastState();
}

function resetGhost(x) {
  const g = state.ghost;
  g.x = x;
  g.phase = 'chase';
  g.alpha = 1;
  g.timer = 0;
  g.stunTimer = 0;
}

// Off-screen spot where a ghost that lost the player re-forms: behind the player
// (left side) whenever there is room, so hiding always opens a way forward.
function placeGhostAwayFromPlayer() {
  const m = CONFIG.GHOST_REENTER_MARGIN;
  state.ghost.x = state.player.x + m >= 300 ? -m : 1280 + m;
}

// Both rituals done in scene 4 -> the dancer is appeased and leaves for good.
function checkRitualComplete() {
  if (state.scene !== 4 || !state.flags.offeringsPlaced || !state.flags.photosRestored || !state.ghost.active) return;
  state.ghost.active = false;
  document.getElementById('danger-overlay').classList.add('hidden');
  playSound('chime');
  queueDialogue([
    { speaker: 'เสียงกระพรวนข้อเท้า', text: 'กริ๊ง... (เสียงกระพรวนค่อยๆ เงียบหายไป เงาผีนางรำสลายไปกับควันธูป)' },
    { speaker: getPlayerName(), text: 'วิญญาณสงบลงแล้ว... ประตูหลังเรือนทางขวาน่าจะเปิดออกได้แล้ว!' }
  ]);
  broadcastState();
}

function triggerSamphawesiEncounter() {
  if (state.flags.samphawesiTriggered) return;
  state.flags.samphawesiTriggered = true;
  playSound('scare');
  const samCaptions = [
    'เฟรม 1/6 : ท่ามกลางความมืด มีแสงเทียนสลัวอยู่ตรงกลางห้อง...',
    'เฟรม 2/6 : ร่างปริศนานั่งยองๆ หันหลังกินของเซ่นไหว้อยู่หน้ากระทงใบตอง',
    'เฟรม 3/6 : ลำแสงไฟฉายส่องไปกระทบแผ่นหลังที่เน่าเปื่อย... ร่างนั้นหยุดกึก!',
    'เฟรม 4/6 : กร๊อบ... คอที่บิดเบี้ยวค่อยๆ หันกลับมาจ้องด้วยดวงตาขาวโพลน!',
    'เฟรม 5/6 : สัมภเวสีลุกขึ้นยืนหลังค่อม แยกเขี้ยวเปื้อนเลือด!',
    'เฟรม 6/6 : มันกระโจนคลานสี่ขาไล่ล่าคุณแล้ว! รีบซ่อนตัวในตุ่มน้ำหรือหนีเร็ว!!'
  ];
  playFrameByFrameCutscene('cutscene_sam', samCaptions, 680, () => {
    state.ghost.type = 'samphawesi';
    state.ghost.active = true;
    resetGhost(780);
    state.ghost.stunTimer = 1.5; // it is still rising: give the player a moment to run
    playTension();
    broadcastState();
  });
}

function triggerEndingDialogue() {
  queueDialogue([
    { speaker: 'คุณลุงชุดราชปะแตน', text: 'รอดออกมาได้แล้วสินะ... ที่เรือนไทยหลังนั้นไม่ใช่ที่ของคนเป็นหรอก' },
    { speaker: getPlayerName(), text: 'คุณลุงเป็นใครครับ? แล้วพ่อกับแม่ของผมล่ะครับ?' },
    { speaker: 'คุณลุงชุดราชปะแตน', text: 'พ่อแม่เอ็งปลอดภัยดี อยู่ที่โรงพยาบาลแล้ว... ส่วนตัวเอ็งเป็นคนมีสัมผัสพิเศษ ตอนรถคว่ำดวงจิตเลยหลุดเข้ามาในเขตแดนนี้' },
    { speaker: 'คุณลุงชุดราชปะแตน', text: 'ข้าจะพาเอ็งกลับเข้าร่างเดี๋ยวนี้แหละ... แต่เอ็งต้อง "สัญญา" กับข้าก่อนว่าจะไปที่แห่งหนึ่ง ไม่งั้นเอ็งจะถูกดึงกลับมาที่นี่อีก!' },
    { speaker: getPlayerName(), text: 'ที่ไหนเหรอครับคุณลุง ผมสัญญาว่าจะไปแน่นอนครับ!' },
    { speaker: 'คุณลุงชุดราชปะแตน', text: 'งาน "Open House BUU วันที่ 20 – 21 นี้"... จำคำสัญญาไว้ให้ดีล่ะ!' }
  ], () => {
    const endCaptions = [
      'เฟรม 1/6 : เศษรูปถ่ายทั้ง 3 ชิ้นประสานกันในกรอบรูปโบราณ...',
      'เฟรม 2/6 : ความทรงจำกลับคืนมา... ดวงจิตของคุณหลุดมาขณะอยู่ระหว่างความเป็นความตาย',
      'เฟรม 3/6 : ก้าวพ้นประตูเรือนไทยออกมาสู่สายหมอกยามรุ่งอรุณ',
      'เฟรม 4/6 : พบคุณลุงชุดราชปะแตนผู้ช่วยชี้ทางกลับคืนสู่ร่าง',
      'เฟรม 5/6 : "จำคำสัญญาของเราไว้ให้ดีล่ะ... ไม่งั้นจะถูกดึงกลับมาอีก"',
      'เฟรม 6/6 : แล้วพบกันที่งาน OPEN HOUSE BUU วันที่ 20 – 21 นี้!'
    ];
    playFrameByFrameCutscene('cutscene_end', endCaptions, 750, () => {
      state.flags.victory = true;
      clearCheckpoint();
      playSound('chime');
      document.getElementById('ending-modal').classList.remove('hidden');
      broadcastState();
    });
  });
}

// ----------------------- Photo Puzzle Modal -----------------------
function showPhotoPuzzleModal() {
  const modal = document.getElementById('photo-modal');
  [1, 2, 3].forEach((num) => {
    const slot = document.getElementById(`slot-photo-${num}`);
    const hasPiece = state.inventory.photos.includes(num);
    const isPlaced = state.inventory.placedPhotos.includes(num);
    slot.classList.toggle('collected', hasPiece);
    slot.classList.toggle('placed', isPlaced);
  });

  const status = document.getElementById('photo-puzzle-status');
  if (state.flags.photosRestored) {
    status.textContent = '✨ ต่อรูปภาพครบสมบูรณ์แล้ว! ความทรงจำกลับคืนมาทั้งหมด';
  } else {
    status.textContent = `แตะที่ชิ้นส่วนรูปภาพที่เก็บมาได้เพื่อวางลงในกรอบ (${state.inventory.placedPhotos.length}/3)`;
  }
  state.moveInput = 0;
  modal.classList.remove('hidden');
}

function closePhotoPuzzleModal() {
  document.getElementById('photo-modal').classList.add('hidden');
}

function placePhotoPiece(num) {
  if (!state.inventory.photos.includes(num)) {
    showToast(`คุณยังไม่ได้เก็บเศษรูปภาพชิ้นที่ ${num} ในเรือนไทยครับ!`, 'warn');
    return;
  }
  if (!state.inventory.placedPhotos.includes(num)) {
    state.inventory.placedPhotos.push(num);
    playSound('pickup');
  }
  if (state.inventory.placedPhotos.length === 3 && !state.flags.photosRestored) {
    state.flags.photosRestored = true;
    playSound('chime');
    updateHud();
    closePhotoPuzzleModal();
    queueDialogue([
      { speaker: getPlayerName(), text: 'เศษรูปภาพทั้ง 3 ชิ้นต่อกันสมบูรณ์แล้ว... เดี๋ยวนะ คนในรูปที่ซ้อนอยู่ข้างหลังนั่นมัน... ตัวเราเอง?!' },
      { speaker: getPlayerName(), text: 'จริงด้วย... เรามีสัมผัสพิเศษ และกำลังนอนไม่ได้สติอยู่ระหว่างความเป็นความตายจากอุบัติเหตุรถคว่ำ!' },
      state.flags.offeringsPlaced
        ? { speaker: getPlayerName(), text: 'ตอนนี้รู้ความจริงแล้ว และของเซ่นไหว้ก็ถวายครบแล้ว... ประตูหลังเรือนต้องเปิดได้แน่!' }
        : { speaker: getPlayerName(), text: 'ตอนนี้รู้ความจริงแล้ว ถ้านำของเซ่นไหว้ไปวางครบ 3 ชิ้น ประตูหลังเรือนในฉากที่ 4 จะเปิดออกทันที!' }
    ], checkRitualComplete);
  } else {
    showPhotoPuzzleModal();
  }
  broadcastState();
}

// ----------------------- Controls & Actions -----------------------
function setMove(dir) {
  // Stopping is always allowed; starting to walk is not while something is on screen.
  if (dir !== 0 && (state.flags.cutscenePlaying || state.flags.gameOver || isDialogueOpen() || isPhotoModalOpen())) return;
  if (state.player.hidden && dir !== 0) leaveHiding(); // stepping out of hiding
  state.moveInput = dir;
  if (dir !== 0) state.player.dir = dir;
}

function leaveHiding() {
  state.player.hidden = false;
  state.unhideGrace = CONFIG.UNHIDE_GRACE;
}

function triggerInteract() {
  if (state.flags.cutscenePlaying || state.flags.gameOver || isPhotoModalOpen()) return;
  if (!document.getElementById('dialogue-box').classList.contains('hidden')) {
    advanceDialogue();
    return;
  }
  const spot = getActiveHotspot();
  if (spot && spot.onInteract) {
    spot.onInteract();
  }
}

function toggleHide() {
  if (state.flags.cutscenePlaying || state.flags.gameOver || isDialogueOpen() || isPhotoModalOpen()) return;
  const spot = getActiveHotspot();
  if (state.player.hidden) {
    leaveHiding();
    playSound('step');
  } else if (spot && spot.isHidingSpot) {
    state.player.hidden = true;
    state.player.flashlight = false;
    state.moveInput = 0;
    playSound('step');
    if (state.ghost.active && !state.flags.hideHintShown) {
      state.flags.hideHintShown = true;
      showToast('🤫 กลั้นหายใจ... ห้ามเปิดไฟฉาย แล้ววิญญาณจะหาคุณไม่เจอจนหายไปในความมืด', '', 5500);
    }
  } else {
    showToast('ต้องเดินไปยืนหน้า "ตู้ไม้สัก" หรือ "ตุ่มน้ำ" ก่อน ถึงจะมุดซ่อนตัวได้!');
  }
  broadcastState();
}

function toggleFlashlight() {
  state.player.flashlight = !state.player.flashlight;
  playSound('step');
  broadcastState();
}

function toggleSixthSense() {
  state.player.sixthSense = !state.player.sixthSense;
  document.getElementById('sixth-sense-overlay').classList.toggle('hidden', !state.player.sixthSense);
  playSound('chime');
  broadcastState();
}

function getActiveHotspot() {
  let best = null;
  let bestDist = Infinity;
  getSceneHotspots(state.scene).forEach((s) => {
    const d = Math.abs(state.player.x - s.x);
    if (d <= s.width / 2 + 24 && d < bestDist) {
      best = s;
      bestDist = d;
    }
  });
  return best;
}

function retryFromCheckpoint() {
  state.flags.gameOver = false;
  duckAmbient(false);
  document.getElementById('gameover-modal').classList.add('hidden');
  document.getElementById('danger-overlay').classList.add('hidden');
  state.player.x = 180;
  state.player.hidden = false;
  state.moveInput = 0;
  state.unhideGrace = CONFIG.UNHIDE_GRACE;
  net.remoteMoving = false;
  resetGhost(-CONFIG.GHOST_REENTER_MARGIN); // re-forms behind you
  state.ghost.stunTimer = 2.0;
  broadcastState();
}

function updateHud() {
  document.getElementById('hud-scene-title').textContent = SCENE_TITLES[state.scene] || '';
  document.getElementById('hud-offerings').textContent = `${state.inventory.offerings.length}/3`;
  document.getElementById('hud-photos').textContent = `${state.inventory.photos.length}/3`;
  document.getElementById('hud-offerings-placed').classList.toggle('hidden', !state.flags.offeringsPlaced);
  document.getElementById('hud-photos-placed').classList.toggle('hidden', !state.flags.photosRestored);
  saveCheckpoint();
}

// Keyboard listeners
window.addEventListener('keydown', (e) => {
  if (state.role !== 'host' || !state.started) return;
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === 'a' || e.key === 'ArrowLeft') setMove(-1);
  if (k === 'd' || e.key === 'ArrowRight') setMove(1);
  if (e.repeat) {
    if (e.code === 'Space') e.preventDefault();
    return; // held keys must not spam actions or skip whole conversations
  }
  if (e.key === 'Escape' && isPhotoModalOpen()) closePhotoPuzzleModal();
  if (k === 'e' || e.key === 'Enter') triggerInteract();
  if (k === 'q') toggleHide();
  if (k === 'f') toggleFlashlight();
  if (e.code === 'Space') {
    e.preventDefault();
    if (!document.getElementById('dialogue-box').classList.contains('hidden')) {
      advanceDialogue();
    } else {
      toggleSixthSense();
    }
  }
});

window.addEventListener('keyup', (e) => {
  if (state.role !== 'host') return;
  const k = e.key.toLowerCase();
  if ((k === 'a' || e.key === 'ArrowLeft') && state.moveInput === -1) setMove(0);
  if ((k === 'd' || e.key === 'ArrowRight') && state.moveInput === 1) setMove(0);
});

// ----------------------- Main Game Loop & Canvas Renderer -----------------------
const canvas = document.getElementById('game-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let lastTime = performance.now();

function gameLoop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  try {
    if (state.role === 'host' && state.started) {
      updateGame(dt);
      renderGame();
    }
  } catch (err) {
    console.error('[gameLoop]', err); // never let one bad frame freeze the game
  }
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

function updateGame(dt) {
  updateRemoteMoveTimeout();
  if (state.flags.cutscenePlaying || state.flags.gameOver || state.flags.victory) return;

  const dialogueOpen = isDialogueOpen();
  const paused = dialogueOpen || isPhotoModalOpen(); // conversations and the photo puzzle freeze the world

  if (!paused) {
    state.bellCooldown = Math.max(0, state.bellCooldown - dt);
    state.revealTimer = Math.max(0, state.revealTimer - dt);
    state.unhideGrace = Math.max(0, state.unhideGrace - dt);
  }
  document.getElementById('sixth-sense-overlay').classList.toggle('hidden', !isSensing());

  // Player movement (8-frame walk cycle)
  if (!paused && state.moveInput !== 0 && !state.player.hidden) {
    state.player.x = Math.max(80, Math.min(1200, state.player.x + state.moveInput * CONFIG.PLAYER_SPEED * dt));
    state.stepTimer += dt;
    if (state.stepTimer >= 0.11) {
      state.stepTimer = 0;
      state.player.frame = (state.player.frame + 1) % 8;
      if (state.player.frame % 4 === 0) playSound('step');
    }

    // Auto-trigger Samphawesi if walking right up to it in Scene 3
    if (state.scene === 3 && !state.flags.samphawesiTriggered && state.player.x > 630) {
      triggerSamphawesiEncounter();
    }
  } else {
    state.player.frame = 0;
  }

  // Hotspot prompt
  const spot = getActiveHotspot();
  const promptEl = document.getElementById('interact-prompt');
  if (spot && !paused) {
    promptEl.innerHTML = `กด <strong>[E]</strong> : ${spot.label}`;
    promptEl.classList.remove('hidden');
  } else {
    promptEl.classList.add('hidden');
  }

  // Ghost AI (Scenes 3 & 4)
  if (state.ghost.active) {
    if (!paused && !state.flags.cutscenePlaying) updateGhost(dt);
  } else {
    state.ghost.alertLevel = 5;
    document.getElementById('danger-overlay').classList.add('hidden');
  }
}

function updateGhost(dt) {
  const g = state.ghost;
  const p = state.player;
  const hiddenSafe = p.hidden && !p.flashlight;
  let speed = CONFIG.GHOST_SPEED[g.type] || 100;
  if (p.sixthSense) speed *= CONFIG.SIXTH_SENSE_GHOST_MULT;

  if (g.stunTimer > 0) {
    g.stunTimer = Math.max(0, g.stunTimer - dt);
  } else if (hiddenSafe) {
    // The ghost lost you: it searches where you vanished, lingers, fades away and
    // re-forms off-screen behind you, so waiting in a hiding spot opens a way forward.
    if (g.phase === 'chase') {
      g.phase = 'search';
      // Close by: it creeps to where you vanished. Far away: it just stops and listens.
      g.searchX = Math.abs(p.x - g.x) > 350 ? g.x : p.x;
      g.timer = CONFIG.GHOST_SEARCH_LINGER;
    }
    if (g.phase === 'search') {
      const dx = g.searchX - g.x;
      if (Math.abs(dx) > 6) {
        g.dir = Math.sign(dx);
        g.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * 0.8 * dt);
      } else {
        g.timer -= dt;
        if (g.timer <= 0) {
          g.phase = 'vanish';
          g.timer = CONFIG.GHOST_VANISH_TIME;
        }
      }
    } else if (g.phase === 'vanish') {
      g.timer -= dt;
      g.alpha = Math.max(0, g.timer / CONFIG.GHOST_VANISH_TIME);
      if (g.timer <= 0) {
        placeGhostAwayFromPlayer();
        g.alpha = 0;
        g.phase = 'lurk';
      }
    }
  } else {
    if (g.phase === 'lurk' || g.phase === 'vanish') playTension(); // it found you again
    g.phase = 'chase'; // spotted you (or you came out): resume the hunt
    const dist = p.x - g.x;
    g.dir = dist >= 0 ? 1 : -1;
    g.x += Math.sign(dist) * speed * dt;
  }
  if (g.phase === 'chase' || g.phase === 'lurk') g.alpha = Math.min(1, g.alpha + dt / CONFIG.GHOST_FADE_IN_TIME);

  const absDist = Math.abs(p.x - g.x);
  const solid = g.alpha > 0.5;
  g.alertLevel = solid ? Math.max(8, Math.min(100, Math.round(100 - absDist / 9))) : 8;
  document.getElementById('danger-overlay').classList.toggle('hidden', absDist > 260 || hiddenSafe || !solid);

  // Hidden with the flashlight on gives you away; stepping out gives a short grace period.
  const exposed = !p.hidden || p.flashlight;
  if (g.stunTimer <= 0 && exposed && solid && state.unhideGrace <= 0 && absDist < CONFIG.CATCH_DIST) {
    triggerGameOver();
    return;
  }

  // Heartbeat speeds up and gets louder as the ghost closes in (even while hiding).
  heartbeatTimer -= dt;
  if (solid && absDist < 480 && heartbeatTimer <= 0) {
    const k = absDist / 480;
    playSound('heartbeat', { gain: 0.45 + (1 - k) * 0.7 });
    heartbeatTimer = 0.45 + k * 0.65;
  }

  g.animTimer += dt;
  if (g.animTimer >= 0.16) {
    g.animTimer = 0;
    g.frame = (g.frame + 1) % 8;
    if (g.frame === 0 && solid && Math.random() < 0.45) {
      const sfx = ghostSoundOptions(g.x, p.x);
      if (sfx.prox > 0.03) playSound(g.type === 'dancer' ? 'chime' : 'rustle', sfx);
    }
  }
}

function triggerGameOver() {
  state.flags.gameOver = true;
  state.moveInput = 0;
  net.remoteMoving = false;
  closePhotoPuzzleModal();
  duckAmbient(true);
  playSound('scare');
  const scareImg = document.getElementById('jumpscare-img');
  scareImg.src = state.ghost.type === 'dancer' ? 'assets/ghost_dancer_2.png' : 'assets/ghost_samphawesi_1.png';
  document.getElementById('gameover-modal').classList.remove('hidden');
  broadcastState();
}

// Atmospheric particles (Rain for Scene 1, Dust motes for Mansion Scenes 2-4)
const RAIN_DROPS = Array.from({ length: 85 }, () => ({
  x: Math.random() * 1280,
  y: Math.random() * 720,
  len: 14 + Math.random() * 14,
  speed: 12 + Math.random() * 6
}));

const DUST_MOTES = Array.from({ length: 55 }, () => ({
  x: Math.random() * 1280,
  y: 160 + Math.random() * 460,
  r: 1.2 + Math.random() * 2.0,
  vx: (Math.random() - 0.5) * 0.35,
  vy: -0.15 - Math.random() * 0.25,
  phase: Math.random() * Math.PI * 2
}));

function drawGroundShadow(cx, cy, rx, ry = 12, alpha = 0.55) {
  ctx.save();
  const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, rx);
  grad.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSpriteProportional(img, bottomCenterX, bottomY, targetHeight, flipX = false, extraFilter = null, alpha = 1) {
  if (!isReady(img) || alpha <= 0) return { w: 100, h: targetHeight };
  const aspect = img.naturalWidth / img.naturalHeight;
  const targetWidth = targetHeight * aspect;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = alpha;
  ctx.translate(bottomCenterX, bottomY);
  if (flipX) ctx.scale(-1, 1);
  if (extraFilter) ctx.filter = extraFilter;
  ctx.drawImage(img, -targetWidth / 2, -targetHeight, targetWidth, targetHeight);
  ctx.restore();
  return { w: targetWidth, h: targetHeight };
}

function renderGame() {
  if (!ctx) return;
  ctx.clearRect(0, 0, 1280, 720);
  ctx.imageSmoothingEnabled = false;

  // 1. Draw Scene Background (Crisp 32-bit HD Pixel Art)
  let bgImg = IMAGES.bg1;
  if (state.scene === 2) bgImg = IMAGES.bg2;
  if (state.scene === 3) bgImg = IMAGES.bg3;
  if (state.scene === 4) bgImg = IMAGES.bg4;
  if (state.scene === 5) bgImg = IMAGES.bg5;

  if (isReady(bgImg)) {
    ctx.drawImage(bgImg, 0, 0, 1280, 720);
  } else {
    ctx.fillStyle = '#07060b';
    ctx.fillRect(0, 0, 1280, 720);
  }

  // 2. Draw Interactive Props per Scene (with proportional scaling & floor shadows)
  drawSceneProps();

  // 3. Draw Ghost or NPC (8-frame animation!)
  if (state.scene === 3 && !state.flags.samphawesiTriggered) {
    drawGroundShadow(765, 608, 70, 14, 0.65);
    const idleIdx = Math.floor(performance.now() / 320) % 3;
    drawSpriteProportional(IMAGES[`samAnim${idleIdx}`], 765, 610, 195, false);
  } else if (state.ghost.active && (state.scene === 3 || state.scene === 4)) {
    const gKey = state.ghost.type === 'dancer' ? `dancerAnim${state.ghost.frame}` : `samAnim${state.ghost.frame}`;
    const gImg = IMAGES[gKey] || IMAGES.dancerAnim0;
    const bob = state.ghost.type === 'dancer' ? Math.sin(performance.now() / 190) * 8 : 0;
    const filter = state.ghost.stunTimer > 0 ? 'brightness(1.7) hue-rotate(120deg)' : null;
    if (state.ghost.alpha > 0.05) drawGroundShadow(state.ghost.x, 610, 68, 14, 0.6 * state.ghost.alpha);
    drawSpriteProportional(gImg, state.ghost.x, 612 + bob, 245, state.ghost.dir === 1, filter, state.ghost.alpha);
  } else if (state.scene === 5) {
    drawGroundShadow(835, 612, 52, 12, 0.5);
    drawSpriteProportional(IMAGES.uncle0, 835, 614, 240, false);
  }

  // 4. Draw Player (8-frame articulated walk cycle!)
  if (!state.player.hidden) {
    const prefix = state.character === 'female' ? 'femaleWalk' : 'maleWalk';
    const sprite = IMAGES[`${prefix}${state.player.frame}`] || IMAGES[`${prefix}0`];
    drawGroundShadow(state.player.x, 614, 48, 12, 0.65);
    drawSpriteProportional(sprite, state.player.x, 616, 238, state.player.dir === -1);
  } else {
    ctx.fillStyle = '#8cf5d9';
    ctx.font = 'bold 16px Sarabun';
    ctx.textAlign = 'center';
    ctx.fillText(state.player.flashlight ? '⚠️ [ไฟฉายเปิดอยู่! วิญญาณมองเห็นแสง]' : '🏺 [กำลังซ่อนตัว... กด Q หรือเดินเพื่อออก]', state.player.x, 340);
  }

  // 5. Dynamic Darkness, Warm Volumetric Flashlight & Environmental Lights (Scenes 1..4)
  if (state.scene < 5) {
    renderDarknessAndFlashlight();
  }

  // 6. Atmospheric Weather / Dust Particles
  renderAtmosphereParticles();

  // 7. Hotspot markers
  renderHotspotIndicators();
}

function drawSceneProps() {
  if (state.scene === 2) {
    if (!state.inventory.offerings.includes('garland')) {
      drawSpriteProportional(IMAGES.garland, 1085, 502, 54);
    }
  } else if (state.scene === 3) {
    drawGroundShadow(340, 608, 65, 14, 0.6);
    drawSpriteProportional(IMAGES.jar, 340, 610, 165);

    drawGroundShadow(670, 610, 58, 12, 0.6);
    drawSpriteProportional(IMAGES.krathong, 670, 612, 86);

    drawGroundShadow(985, 606, 65, 13, 0.6);
    drawSpriteProportional(IMAGES.table, 985, 608, 135);
    if (!state.inventory.photos.includes(2)) {
      drawSpriteProportional(IMAGES.photo2, 985, 482, 46);
    }
  } else if (state.scene === 4) {
    drawGroundShadow(330, 608, 75, 15, 0.65);
    drawSpriteProportional(IMAGES.cabinet, 330, 610, 265);

    drawGroundShadow(640, 445, 60, 10, 0.45);
    drawSpriteProportional(IMAGES.altar, 640, 440, 145);
    drawSpriteProportional(IMAGES.talisman, 1085, 395, 85);

    if (state.flags.offeringsPlaced) {
      drawGroundShadow(640, 610, 58, 12, 0.6);
      drawSpriteProportional(IMAGES.krathong, 640, 612, 86);
    }
  }
}

let lightCanvas = null;
function renderDarknessAndFlashlight() {
  if (!lightCanvas) {
    lightCanvas = document.createElement('canvas');
    lightCanvas.width = 1280;
    lightCanvas.height = 720;
  }
  const dctx = lightCanvas.getContext('2d');
  dctx.clearRect(0, 0, 1280, 720);

  const baseAlpha = isSensing() ? 0.48 : (state.scene === 1 ? 0.58 : 0.76);
  dctx.fillStyle = `rgba(5, 6, 12, ${baseAlpha})`;
  dctx.fillRect(0, 0, 1280, 720);

  dctx.globalCompositeOperation = 'destination-out';

  const punchLight = (lx, ly, rInner, rOuter, strength = 0.92) => {
    const g = dctx.createRadialGradient(lx, ly, rInner, lx, ly, rOuter);
    g.addColorStop(0, `rgba(0,0,0,${strength})`);
    g.addColorStop(0.6, `rgba(0,0,0,${strength * 0.45})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = g;
    dctx.beginPath();
    dctx.arc(lx, ly, rOuter, 0, Math.PI * 2);
    dctx.fill();
  };

  // Ambient scene lights (porch lantern, utility pole, moonlight window, candles)
  const flicker = Math.sin(performance.now() / 90) * 6;
  if (state.scene === 1) {
    punchLight(468, 282, 10, 155 + flicker, 0.85); // Pole bulb
    punchLight(1086, 250, 15, 220 + flicker, 0.95); // Thai house porch lantern
  } else if (state.scene === 2) {
    punchLight(990, 380, 20, 220, 0.75); // Moonlight window
  } else if (state.scene === 3) {
    punchLight(290, 380, 20, 190, 0.65); // Window
    punchLight(670, 560, 12, 155 + flicker, 0.9); // Offering candle glow
  } else if (state.scene === 4) {
    punchLight(640, 370, 15, 175 + flicker, 0.88); // Altar candle glow
  }

  // Soft ambient halo around player
  const px = state.player.x;
  const py = 490;
  punchLight(px, py, 18, 125, 0.82);

  // Directional Flashlight Cone
  if (state.player.flashlight && !state.player.hidden) {
    const dir = state.player.dir;
    const startX = px + dir * 34;
    const startY = 486;
    const endX = startX + dir * 490;

    const grad = dctx.createLinearGradient(startX, startY, endX, startY);
    grad.addColorStop(0, 'rgba(0,0,0,0.98)');
    grad.addColorStop(0.65, 'rgba(0,0,0,0.72)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    dctx.fillStyle = grad;
    dctx.beginPath();
    dctx.moveTo(startX, startY - 8);
    dctx.lineTo(endX, startY - 148);
    dctx.lineTo(endX, startY + 148);
    dctx.lineTo(startX, startY + 8);
    dctx.closePath();
    dctx.fill();
  }

  ctx.drawImage(lightCanvas, 0, 0);

  // Additive Warm Golden Volumetric Beam overlay (gives authentic HD Pixel Art lighting!)
  if (state.player.flashlight && !state.player.hidden) {
    const dir = state.player.dir;
    const startX = px + dir * 34;
    const startY = 486;
    const endX = startX + dir * 480;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const warmGrad = ctx.createLinearGradient(startX, startY, endX, startY);
    warmGrad.addColorStop(0, 'rgba(255, 230, 165, 0.34)');
    warmGrad.addColorStop(0.5, 'rgba(255, 210, 130, 0.14)');
    warmGrad.addColorStop(1, 'rgba(255, 200, 110, 0)');
    ctx.fillStyle = warmGrad;
    ctx.beginPath();
    ctx.moveTo(startX, startY - 6);
    ctx.lineTo(endX, startY - 142);
    ctx.lineTo(endX, startY + 142);
    ctx.lineTo(startX, startY + 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function renderAtmosphereParticles() {
  ctx.save();
  if (state.scene === 1) {
    // Falling night rain streaks
    ctx.strokeStyle = 'rgba(175, 205, 235, 0.28)';
    ctx.lineWidth = 1.5;
    RAIN_DROPS.forEach((d) => {
      d.y += d.speed;
      d.x -= 1.5;
      if (d.y > 720) { d.y = -20; d.x = Math.random() * 1280; }
      if (d.x < 0) d.x = 1280;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - 3, d.y + d.len);
      ctx.stroke();
    });
  } else if (state.scene >= 2 && state.scene <= 4) {
    // Floating dust motes that sparkle inside the flashlight cone
    DUST_MOTES.forEach((m) => {
      m.x += m.vx;
      m.y += m.vy;
      if (m.y < 120) m.y = 610;
      if (m.x < 40) m.x = 1240;
      if (m.x > 1240) m.x = 40;
      const inBeam = state.player.flashlight && !state.player.hidden &&
        Math.sign(m.x - state.player.x) === state.player.dir &&
        Math.abs(m.x - state.player.x) < 460 &&
        Math.abs(m.y - 486) < 130;
      ctx.fillStyle = inBeam ? 'rgba(255, 235, 180, 0.72)' : 'rgba(200, 190, 170, 0.16)';
      ctx.beginPath();
      ctx.arc(m.x, m.y, inBeam ? m.r * 1.3 : m.r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.restore();
}

function renderHotspotIndicators() {
  const spots = getSceneHotspots(state.scene);
  spots.forEach((s) => {
    const dist = Math.abs(state.player.x - s.x);
    if (isSensing() || dist < 150) {
      ctx.save();
      ctx.fillStyle = s.isHiddenClue ? '#59dfb7' : 'rgba(235, 185, 99, 0.85)';
      ctx.beginPath();
      ctx.arc(s.x, 370 + Math.sin(performance.now() / 250) * 5, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });
}

// ----------------------- Mobile P2 Sixth-Sense Radar Renderer -----------------------
let lastRadarDraw = 0;
function renderP2RadarLoop(now = performance.now()) {
  if (state.role !== 'p2') {
    net.radarRunning = false;
    return;
  }
  // Data only changes a few times per second: ~20 fps is plenty and saves battery.
  if (now - lastRadarDraw < 50) {
    requestAnimationFrame(renderP2RadarLoop);
    return;
  }
  lastRadarDraw = now;
  const rCanvas = document.getElementById('p2-radar-canvas');
  if (rCanvas) {
    const rctx = rCanvas.getContext('2d');
    rctx.clearRect(0, 0, 600, 250);

    // Grid lines
    rctx.strokeStyle = 'rgba(80, 210, 175, 0.15)';
    for (let x = 0; x < 600; x += 40) {
      rctx.beginPath(); rctx.moveTo(x, 0); rctx.lineTo(x, 250); rctx.stroke();
    }
    for (let y = 0; y < 250; y += 40) {
      rctx.beginPath(); rctx.moveTo(0, y); rctx.lineTo(600, y); rctx.stroke();
    }

    // Scene title on blueprint
    rctx.fillStyle = '#84f2d4';
    rctx.font = 'bold 14px Sarabun';
    rctx.fillText(SCENE_TITLES[state.scene] || 'เรือนไทย', 14, 24);

    // Floor line
    rctx.strokeStyle = '#59dfb7';
    rctx.lineWidth = 2;
    rctx.beginPath();
    rctx.moveTo(20, 195);
    rctx.lineTo(580, 195);
    rctx.stroke();

    // Hidden Clues & Hiding Spots on P2 Radar
    const spots = getSceneHotspots(state.scene);
    spots.forEach((s) => {
      const rx = (s.x / 1280) * 560 + 20;
      rctx.fillStyle = s.isHidingSpot ? '#4da6ff' : '#ffd166';
      rctx.fillRect(rx - 8, 165, 16, 26);
      rctx.font = '11px Sarabun';
      rctx.fillText(s.isHidingSpot ? 'ที่ซ่อน' : 'จุดสำรวจ', rx - 18, 158);
    });

    // Player P1 position (Cyan circle)
    const p1x = (state.player.x / 1280) * 560 + 20;
    rctx.fillStyle = '#00f5d4';
    rctx.beginPath();
    rctx.arc(p1x, 175, 10, 0, Math.PI * 2);
    rctx.fill();
    rctx.fillText('P1', p1x - 7, 155);

    // Ghost position (Pulsing Red Skull/Dot)
    if (state.ghost.active) {
      const gx = Math.max(20, Math.min(580, (state.ghost.x / 1280) * 560 + 20));
      rctx.globalAlpha = Math.max(0.25, state.ghost.alpha == null ? 1 : state.ghost.alpha);
      rctx.fillStyle = '#ff3b3b';
      rctx.beginPath();
      rctx.arc(gx, 170, 13 + Math.sin(performance.now() / 120) * 3, 0, Math.PI * 2);
      rctx.fill();
      rctx.fillStyle = '#fff';
      rctx.fillText(state.ghost.type === 'dancer' ? 'ผีนางรำ!' : 'สัมภเวสี!', gx - 22, 145);
      rctx.globalAlpha = 1;
    }

    // Update EMF meter & Clue text
    const fillEl = document.getElementById('p2-emf-fill');
    const dangerEl = document.getElementById('p2-danger-text');
    const clueEl = document.getElementById('p2-clue-text');
    if (fillEl) fillEl.style.width = `${state.ghost.alertLevel || 8}%`;
    if (dangerEl) {
      const high = (state.ghost.alertLevel || 0) > 55;
      dangerEl.textContent = high ? '⚠️ อันตราย! วิญญาณอยู่ใกล้ P1 มาก!' : '🕯️ เปลวเทียนสงบ (ปลอดภัย)';
      dangerEl.className = high ? 'warn-text' : 'safe-text';
    }
    if (clueEl) {
      if (state.scene === 1) clueEl.textContent = 'นิมิตบอกทาง: ให้ P1 เดินไปขวาสุดเพื่อสำรวจประตูเรือนไทย';
      if (state.scene === 2) clueEl.textContent = 'นิมิตบอกทาง: เศษรูปชิ้นที่ 1 อยู่ในตู้ไม้สัก และพวงมาลัยอยู่บนโต๊ะริมหน้าต่างขวา';
      if (state.scene === 3) clueEl.textContent = 'นิมิตบอกทาง: ธูปเทียนอยู่ข้างตุ่มน้ำซ้าย เศษรูปชิ้นที่ 2 อยู่บนโต๊ะขวา (ระวังสัมภเวสี!)';
      if (state.scene === 4) clueEl.textContent = 'นิมิตบอกทาง: ขนมอยู่ในตู้ซ้าย เศษรูปชิ้นที่ 3 อยู่ใต้หิ้งบูชากลางห้อง ถวายให้ครบแล้วออกประตูขวา!';
      if (state.scene === 5) clueEl.textContent = 'รอดพ้นอาถรรพ์แล้ว! ให้ P1 เดินไปคุยกับคุณลุงชุดราชปะแตน';
    }
  }
  requestAnimationFrame(renderP2RadarLoop);
}
