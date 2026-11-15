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
  DANCER_UNSEEN_MULT: 1.35,     // the dancer moves faster when nobody is looking at her
  SAMPHAWESI_HEAR_SPEED: 105,   // ...the blind samphawesi rushes toward footsteps
  SAMPHAWESI_WANDER_SPEED: 38,  // ...and drifts slowly when it hears nothing
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

// ----------------------- Settings (persisted on this machine) -----------------------
const SETTINGS_KEY = 'buu-horror-settings-v1';
const OS_REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const settings = { jumpscare: 'full', reduceMotion: OS_REDUCED_MOTION, autoFullscreen: false };

(function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return;
    if (raw.jumpscare === 'full' || raw.jumpscare === 'soft' || raw.jumpscare === 'off') settings.jumpscare = raw.jumpscare;
    if (typeof raw.reduceMotion === 'boolean') settings.reduceMotion = raw.reduceMotion;
    settings.autoFullscreen = !!raw.autoFullscreen;
  } catch (_) {}
})();

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {}
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
  const sSlider = document.getElementById('settings-volume');
  if (sSlider) sSlider.value = String(Math.round((audioMuted ? 0 : audioVolume) * 100));
  const sValue = document.getElementById('settings-volume-value');
  if (sValue) sValue.textContent = (audioMuted ? 0 : Math.round(audioVolume * 100)) + '%';
  const sMute = document.getElementById('settings-mute');
  if (sMute) {
    sMute.classList.toggle('on', audioMuted);
    sMute.setAttribute('aria-checked', String(audioMuted));
  }
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

  if (type === 'footstep') {
    // real footsteps on old floorboards (random take, slight pitch variation); grass stays synthesized
    const takes = ['step_wood_1', 'step_wood_2', 'step_wood_3'].filter((n) => samples[n]);
    if (state.scene !== 1 && takes.length) {
      playSample(takes[Math.floor(Math.random() * takes.length)], out, { gain: 0.55, rate: 0.94 + Math.random() * 0.12, t: now });
    } else {
      playSound('step', opts);
    }
  } else if (type === 'step') {
    if (state.scene === 1 && state.role === 'host') {
      // soft step on wet grass / dirt
      noiseHit(now, { dur: 0.09, peak: 0.12, filter: 'lowpass', freq: 520, out });
    } else {
      // low wooden floorboard thud
      tone(now, { type: 'triangle', freq: 95 + Math.random() * 25, to: 38, dur: 0.09, peak: 0.14, out });
      noiseHit(now, { dur: 0.04, peak: 0.03, filter: 'bandpass', freq: 1800, q: 1.2, out });
    }
  } else if (type === 'creak' && samples.creak) {
    playSample('creak', out, { gain: 0.45, rate: 0.9 + Math.random() * 0.2, t: now });
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
  } else if (type === 'rustle' && samples.scratch) {
    // something scratching and gnawing at the wood ("กุกกัก")
    playSample('scratch', out, { gain: 0.5, rate: 0.92 + Math.random() * 0.16, t: now });
  } else if (type === 'gecko') {
    playSample('gecko', out, { gain: 0.35, t: now });
  } else if (type === 'dog') {
    playSample('dog', out, { gain: 0.22, rate: 0.95 + Math.random() * 0.1, t: now });
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
  } else if (type === 'thunder') {
    if (!playSample('thunder', out, { gain: 0.5, rate: 0.9 + Math.random() * 0.2, t: now })) {
      noiseHit(now, { dur: 0.25, peak: 0.12, filter: 'highpass', freq: 1500, attack: 0.002, out });   // crack
      noiseHit(now + 0.05, { dur: 2.6, peak: 0.35, filter: 'lowpass', freq: 160, attack: 0.08, out }); // rumble
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
  // rendered with earshot (MIT)
  bell: 'assets/audio/bell.mp3',
  whisper: 'assets/audio/whisper.mp3',
  scare: 'assets/audio/scare.mp3',
  tension: 'assets/audio/tension.mp3',
  // real recordings, CC0 (Freesound; see README for each source)
  creak: 'assets/audio/door_creak.mp3',
  rain: 'assets/audio/rain_loop.mp3',
  birds: 'assets/audio/birds_loop.mp3',
  step_wood_1: 'assets/audio/step_wood_1.mp3',
  step_wood_2: 'assets/audio/step_wood_2.mp3',
  step_wood_3: 'assets/audio/step_wood_3.mp3',
  scratch: 'assets/audio/scratch.mp3',
  thunder: 'assets/audio/thunder.mp3',
  gecko: 'assets/audio/gecko.mp3',
  dog: 'assets/audio/dog_howl.mp3'
};
// Loops: when one finishes loading after its scene already started, rebuild that scene's ambience.
const AMBIENT_SAMPLES = new Set(['rain', 'birds']);
const samples = {};
let samplesRequested = false;

function loadSamples() {
  if (samplesRequested || !audioCtx) return;
  samplesRequested = true;
  Object.entries(SAMPLE_FILES).forEach(([name, url]) => {
    fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => new Promise((resolve, reject) => audioCtx.decodeAudioData(data, resolve, reject)))
      .then((buf) => {
        samples[name] = buf;
        if (AMBIENT_SAMPLES.has(name) && ambient.scene) {
          const scene = ambient.scene;
          ambient.scene = null;
          setAmbientScene(scene);
        }
      })
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

// A recorded loop (rain, birds) under the scene, optionally muffled through a lowpass.
function loopSample(name, gain, lowpass = 0) {
  const buf = samples[name];
  if (!buf) return false;
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  // skip the MP3 encoder padding at both ends so the loop has no tiny gap
  if (buf.duration > 1) {
    src.loopStart = 0.05;
    src.loopEnd = buf.duration - 0.05;
  }
  const g = audioCtx.createGain();
  g.gain.value = gain;
  if (lowpass) {
    const f = audioCtx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    src.connect(f);
    f.connect(g);
  } else {
    src.connect(g);
  }
  g.connect(ambient.out);
  src.start(audioCtx.currentTime, Math.random() * buf.duration);
  ambient.sources.push(src);
  return true;
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

  const randPan = () => Math.random() * 1.6 - 0.8;
  if (scene === 1) {
    // night rain in the forest (real recording when loaded) + gusting wind, a gecko, a far-off dog
    if (!loopSample('rain', 0.75)) loopNoise('highpass', 1100, 0.05);
    const wind = loopNoise('lowpass', 380, 0.05);
    wobble(wind.gain, 0.11, 0.04);
    sprinkle(9000, 18000, () => playSound('rustle', { gain: 0.35, pan: randPan() }));
    sprinkle(14000, 26000, () => playSound('gecko', { pan: randPan() }));
    sprinkle(22000, 40000, () => playSound('dog', { pan: Math.random() < 0.5 ? -0.85 : 0.85 }));
  } else if (scene >= 2 && scene <= 4) {
    // old wooden house: the rain outside heard through the walls, a low uneasy drone, creaks and drips
    loopSample('rain', 0.4, 650);
    const d1 = loopTone('triangle', 55, 0.035, 260);
    loopTone('triangle', 55.7, 0.035, 260);
    wobble(d1.gain, 0.07, 0.02);
    loopNoise('lowpass', 200, 0.025);
    if (scene === 2) sprinkle(18000, 32000, () => playSound('gecko', { gain: 0.7, pan: randPan() }));
    if (scene === 4) loopTone('sine', 82.4, 0.018); // a fifth above: more tension near the dancer
    sprinkle(7000, 16000, () => playSound('creak', { gain: 0.25, pan: Math.random() * 1.6 - 0.8 }));
    sprinkle(4000, 9000, () => playSound('drip', { gain: 0.8, pan: Math.random() * 1.4 - 0.7 }));
    if (scene >= 3) sprinkle(14000, 26000, () => playSound('whisper', { gain: 0.8, pan: Math.random() < 0.5 ? -0.7 : 0.7 }));
  } else if (scene === 5) {
    // dawn: real dawn chorus when loaded (synth chirps otherwise) over a soft warm pad
    [220, 277.2, 329.6].forEach((f) => loopTone('sine', f, 0.008));
    if (!loopSample('birds', 0.4)) {
      loopNoise('lowpass', 500, 0.015);
      sprinkle(2500, 6000, () => playSound('bird', { pan: randPan() }));
    }
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
  seenDoors: new Set(),  // doorway transitions already shown in full
  lockCode: makeLockCode(), // the scene-4 cabinet code (Thai numerals on the wall / P2's phone)
  lockInput: [],
  ritual: [],            // offerings placed so far, in order
  playTime: 0,           // seconds played (pause excluded) for the end-of-game rank
  deaths: 0,
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
            { speaker: getPlayerName(), text: 'กลับจากงานศพเพื่อนแท้ๆ... จู่ๆ รถก็เสียหลัก ท้องฟ้ากลับหัว และทุกอย่างก็เงียบลง' },
            { speaker: getPlayerName(), text: 'พ่อครับ! แม่ครับ!... ทำไมป่ากลางคืนถึงเงียบได้ขนาดนี้ เงียบจนได้ยินเสียงลมหายใจตัวเองชัดเกินไป' }
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
              { speaker: getPlayerName(), text: 'ขอโทษนะครับ! มีใครอยู่ไหม... รถผมคว่ำ ขอความช่วยเหลือหน่อยครับ!' },
              { speaker: 'เสียงจากเรือนไม้', text: 'แอ๊ดดดดด... (บานประตูแง้มออกเองช้าๆ ราวกับมีมือหนึ่งผลักจากด้านใน)' },
              { speaker: getPlayerName(), text: 'ประตูเปิดเอง... เมื่อกี้ยังเห็นเงาคนยืนอยู่ตรงหน้าต่าง ระหว่างที่ผมกะพริบตา มันหายไปไหน' }
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
            { speaker: getPlayerName(), text: 'เงียบกริบ... ทั้งที่ตะเกียงยังติดอยู่ ใครเป็นคนจุดไฟ แล้วทำไมไม่มีใครตอบ' },
            { speaker: getPlayerName(), text: 'ฝุ่นหนาจนจับเป็นแผ่น เหมือนเรือนนี้ไม่มีคนหายใจเข้ามาสิบปี... แต่กลิ่นธูปยังอุ่นอยู่เลย' }
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
              { speaker: getPlayerName(), text: 'รูปที่ต่อครบแล้ว... และคนที่ยืนซ้อนอยู่ข้างหลังในรูป ก็คือตัวผมเอง' }
            ]);
          } else {
            queueDialogue([
              { speaker: getPlayerName(), text: 'รูปคนทั้งตระกูลเรียงเต็มผนัง... ทุกดวงตาเอียงมาทางผมพร้อมกัน ทั้งที่รูปพวกนี้ไม่มีชีวิต' },
              { speaker: getPlayerName(), text: 'กรอบกลางผนังถูกฉีกหายไปสามชิ้น เหมือนมีใครจงใจฉีกหน้าใครบางคนออกจากความทรงจำ' }
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
              { speaker: getPlayerName(), text: 'ในซอกตู้ไม้สักมีเศษกระดาษแข็งเหลืองกรอบค้างอยู่... เศษรูปถ่ายชิ้นที่ 1' },
              { speaker: getPlayerName(), text: '(ตู้ใบนี้อาจซ่อนได้ทั้งตัว ถ้าได้ยินเสียงฝีเท้า ให้กด [ซ่อนตัว] ทันที)' }
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
              { speaker: getPlayerName(), text: 'พวงมาลัยดอกไม้แห้งกรอบวางอยู่ข้างตะเกียง... กลิ่นยังหอมเหมือนเพิ่งร้อยเมื่อวาน (1/3)' },
              { speaker: 'เสียงปริศนา', text: 'กุกกัก... กุกกัก... (เหมือนเล็บยาวๆ ขูดอยู่หลังบานประตูฝั่งขวา)' },
              { speaker: getPlayerName(), text: 'มีบางอย่างอยู่ข้างในจริงๆ... แต่ทำไมเสียงนั้นเหมือนดังจากในกำแพง มากกว่าจากห้องถัดไป' }
            ], () => {
              // scare: the lamp dies, a face presses against the moonlit window, then it's gone
              triggerBlackout(1700, { img: 'samAnim0', x: 990, bottom: 470, h: 170, at: 1000, dur: 380 });
            });
            playSound('rustle');
          } else {
            queueDialogue([
              { speaker: getPlayerName(), text: 'เสียงกุกกักยังไม่หยุด... หรือมันขยับตามผมทุกก้าว' }
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
              { speaker: getPlayerName(), text: 'ใต้ฐานตุ่มน้ำมีธูปเทียนมัดหนึ่ง ยังชื้นอยู่... ใครเพิ่งจุดมัน (2/3)' }
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
              { speaker: getPlayerName(), text: 'เศษรูปชิ้นที่ 2 ติดอยู่ใต้โต๊ะ... เหมือนมีคนซ่อนมันไว้ด้วยมือที่สั่น' }
            ]);
          } else {
            queueDialogue([{ speaker: getPlayerName(), text: 'ไม่มีอะไรเหลือบนโต๊ะแล้ว... แต่เสียงหายใจตรงมุมห้องยังไม่หยุด' }]);
          }
        }
      },
      {
        id: 'door_to_scene4',
        x: 1180,
        width: 110,
        label: 'เปิดประตูไปโถงด้านในเรือน (ฉากที่ 4)',
        onInteract: () => {
          playDoorCutscene(4, 150, 'เสียงกระพรวนข้อเท้าดังแว่วมาจากโถงด้านใน...');
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
          if (!state.inventory.offerings.includes('dessert') && !state.flags.cabinetUnlocked) {
            openLock(); // locked with the code written on the yantra
            return;
          }
          if (!state.inventory.offerings.includes('dessert')) {
            state.inventory.offerings.push('dessert');
            playSound('pickup');
            updateHud();
            queueDialogue([
              { speaker: getPlayerName(), text: 'พานขนมมงคลวางอยู่ในชั้นไม้ ขนมยังไม่บูด... ทั้งที่เรือนนี้ควรว่างเปล่ามานานแล้ว (3/3)' }
            ]);
          } else {
            toggleHide();
          }
        }
      },
      {
        id: 'yantra_code',
        x: 520,
        width: 90,
        label: 'ยันต์ลงอักขระบนผนัง (อ่านรหัส)',
        isHiddenClue: !state.flags.codeRead,
        onInteract: () => {
          state.flags.codeRead = true;
          queueDialogue([
            { speaker: getPlayerName(), text: `ยันต์ผืนนี้ลงเลขไทยไว้สี่ตัวด้วยหมึกแดง... ${thaiCode()} — น่าจะเป็นรหัสของตู้ไม้ที่ถูกล็อก` }
          ]);
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
              { speaker: getPlayerName(), text: 'เศษรูปชิ้นสุดท้ายซ่อนใต้ฐานหิ้งบูชา... ครบสามชิ้นแล้ว แต่มือผมสั่นกว่าที่คิด' }
            ], () => {
              // scare: the altar candle gutters out and the ankle bells ring right behind you
              triggerBlackout(1100);
              playSound('chime', { gain: 1.4, pan: -state.player.dir * 0.9 });
            });
            return;
          }

          if (state.inventory.offerings.length < 3) {
            queueDialogue([
              { speaker: getPlayerName(), text: `ยังขาดของเซ่นไหว้ (ตอนนี้มี ${state.inventory.offerings.length}/3 ชิ้น) ท่านคงไม่พอใจถ้าผมไปมือเปล่า` }
            ]);
            return;
          }

          if (!state.flags.offeringsPlaced) {
            openRitual(); // place the offerings one by one, in the right order
          } else if (!state.flags.photosRestored) {
            showPhotoPuzzleModal();
          } else {
            queueDialogue([
              { speaker: getPlayerName(), text: 'ครบแล้วทั้งของเซ่นและรูป... ประตูหลังเรือนด้านขวามีกลิ่นไอดินลอดออกมา' }
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
              { speaker: getPlayerName(), text: 'บานประตูเย็นเฉียบ... ยังผนึกอยู่ ต้องถวายของเซ่นให้ครบสามชิ้น และต่อเศษรูปให้ครบทั้งสามก่อน' }
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
  applyAutoFullscreen();
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
  applyAutoFullscreen();
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
    support: {
      bellCooldown: Math.ceil(state.bellCooldown),
      context: hostContext(),
      prompt: (state.started && !state.flags.cutscenePlaying && getActiveHotspot()) ? getActiveHotspot().label : '',
      goal: state.started ? currentObjective().text : '',
      code: state.scene === 4 && !state.flags.cabinetUnlocked ? thaiCode() : '',
      lockInput: isLockOpen() ? lockDisplay() : '',
      target: state.started ? (currentObjective().target || '') : ''
    }
  };
}

// What the main screen is showing; the P1 phone relabels its big button from this.
function hostContext() {
  if (!state.started) return 'title';
  if (isPaused()) return 'paused';
  if (state.flags.victory) return 'victory';
  if (state.flags.gameOver) return 'gameover';
  if (state.flags.cutscenePlaying) return 'cutscene';
  if (isRitualOpen()) return 'ritual';
  if (isLockOpen()) return 'lock';
  if (isPhotoModalOpen()) return 'puzzle';
  if (isDialogueOpen()) return 'dialogue';
  return 'play';
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
  if (isPaused()) return; // nothing moves while the main screen is paused
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
  if (action === 'offer') return offerItem(value);
  if (action === 'digit') return lockPress(value);
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
  else if (state.flags.gameOver) setMobileStatus(state.role === 'p1' ? '💀 ถูกวิญญาณจับได้! กดปุ่ม "ฟื้นสติ" เพื่อเล่นต่อ' : '💀 P1 ถูกวิญญาณจับได้! รอ P1 ฟื้นสติ', 'warn');
  else if (!state.started) setMobileStatus('⏳ เชื่อมต่อแล้ว — รอจอกลางกด "เริ่มเกม"', 'good');
  else setMobileStatus('');

  updatePhoneButtons(room);
  phoneHaptics();

  const bellBtn = document.getElementById('btn-stun-ghost');
  const bellLabel = document.getElementById('bell-cooldown-label');
  if (bellBtn && bellLabel) {
    const cd = state.remoteBellCooldown || 0;
    bellBtn.disabled = cd > 0 || !state.ghost.active;
    bellLabel.textContent = cd > 0 ? `(พร้อมในอีก ${cd} วิ)` : (state.ghost.active ? '' : '(ยังไม่มีวิญญาณ)');
  }
}

// The P1 phone's big button says what pressing it will do right now on the main screen.
function updatePhoneButtons(room) {
  const goalText = room.support && room.support.goal ? '🎯 ' + room.support.goal : '';
  state.remoteGoal = room.support || {};
  const goalEl = document.getElementById(state.role === 'p1' ? 'p1-goal' : 'p2-goal');
  if (goalEl) goalEl.textContent = goalText;
  if (state.role !== 'p1') return;
  const support = room.support || {};
  const prompt = String(support.prompt || '').replace(/\s*\[[^\]]*\]/g, '').trim();
  const labels = {
    title: '⏳ รอจอกลางเริ่มเกม',
    ritual: '🕯️ เลือกของที่จะวางด้านล่าง',
    lock: '🔒 ใส่รหัสด้านล่าง',
    paused: '⏸ จอกลางพักเกมอยู่',
    dialogue: '▶ ไปต่อ (อ่านบทพูดบนจอกลาง)',
    cutscene: '⏭ ข้ามฉาก',
    puzzle: '🖼️ วางเศษรูปลงกรอบ',
    gameover: '🕯️ ฟื้นสติ ลองใหม่',
    victory: '✨ รอดแล้ว!',
    play: prompt ? `🔍 ${prompt}` : '🔍 สำรวจ (ยังไม่มีอะไรใกล้ๆ)'
  };
  const ib = document.getElementById('p1-btn-interact');
  if (ib) ib.textContent = labels[support.context] || labels.play;
  // ritual / lock: swap the pad for the matching buttons
  const ritualPanel = document.getElementById('p1-ritual');
  const lockPanel = document.getElementById('p1-lock');
  const pad = document.querySelector('#p1-screen .p1-pad-layout');
  const mode = support.context === 'ritual' ? 'ritual' : support.context === 'lock' ? 'lock' : '';
  if (ritualPanel) ritualPanel.classList.toggle('hidden', mode !== 'ritual');
  if (lockPanel) lockPanel.classList.toggle('hidden', mode !== 'lock');
  if (pad) pad.classList.toggle('hidden', !!mode);
  const ld = document.getElementById('p1-lock-display');
  if (ld) ld.textContent = support.lockInput || '_ _ _ _';
  const hb = document.getElementById('p1-btn-hide');
  if (hb) hb.textContent = state.player.hidden ? '🚪 ออกจากที่ซ่อน' : '🏺 ซ่อนตัวในตู้/ตุ่ม';
}

// Phones buzz (Android; iPhone browsers ignore vibration): P2 feels the ghost close by,
// both feel being caught.
let lastBuzzAt = 0;
let wasGameOver = false;
function vibrate(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) {}
}
function phoneHaptics() {
  if (state.flags.gameOver && !wasGameOver) vibrate([220, 90, 220]);
  wasGameOver = !!state.flags.gameOver;
  const now = performance.now();
  if (state.role === 'p2' && state.started && state.ghost.active && !state.flags.gameOver &&
      (state.ghost.alertLevel || 0) > 70 && now - lastBuzzAt > 900) {
    lastBuzzAt = now;
    vibrate(40);
  }
}

function sendRemoteInput(action, value) {
  if (!state.roomCode || !net.playerToken || net.closed) return;
  if (action !== 'move') {
    playSound('step');
    vibrate(12);
  }
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
    hostToken: net.hostToken,
    lockCode: state.lockCode,
    playTime: Math.round(state.playTime || 0),
    deaths: state.deaths || 0
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
  applyAutoFullscreen();
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
  if (Array.isArray(cp.lockCode) && cp.lockCode.length === 4) state.lockCode = cp.lockCode;
  state.playTime = Number(cp.playTime) || 0;
  state.deaths = Number(cp.deaths) || 0;
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
  refreshSettingsUi();
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
    { speaker: 'เหตุการณ์ก่อนหน้า', text: 'ขากลับจากงานศพของเพื่อนสนิท... รถของครอบครัวเสียหลักหมุนคว้าง ก่อนทุกอย่างจะดับลงเป็นความมืด' },
    { speaker: getPlayerName(), text: 'อึก... ปวดหัวเหมือนมีใครตอกตะปูอยู่ข้างใน... พ่อครับ? แม่ครับ? มีใครได้ยินผมไหม' },
    { speaker: getPlayerName(), text: 'รอบตัวมีแต่ป่ากับความเงียบ ที่เงียบจนได้ยินเสียงเลือดไหลในหู... ตรงนั้นมีเรือนไทยหลังหนึ่งยังเปิดไฟอยู่ ทั้งที่ไม่มีใครควรอยู่' }
  ], () => {
    showChapterCard(1);
    showControlsTip();
  });
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
  box.classList.remove('hidden');
  typeDialogueText(current.text);
}

// Typewriter text. Thai vowels and tone marks are combining characters, so the text is
// split into grapheme clusters (a mark never shows up on its own mid-word).
const typing = { timer: null, full: '', nodes: null, caret: null, shown: 0, pause: 0, active: false };
const TYPE_TICK_MS = 26;
// A short beat is held after punctuation so each line lands instead of rattling out.
const TYPE_BEATS = { '…': 240, '.': 170, ',': 120, '!': 190, '?': 180, '—': 150 };
let REDUCED_MOTION = settings.reduceMotion;

function splitGraphemes(text) {
  if (window.Intl && Intl.Segmenter) {
    return Array.from(new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

// The whole line is rendered up-front as invisible clusters, then faded in one at a
// time: the box never reflows mid-sentence and each character rises out of the dark.
function typeDialogueText(text) {
  const el = document.getElementById('dialogue-text');
  finishTyping();
  typing.full = text;
  typing.active = true;
  el.textContent = '';
  el.classList.add('is-typing');
  if (REDUCED_MOTION) {
    el.textContent = text;
    el.classList.remove('is-typing');
    typing.active = false;
    return;
  }
  typing.shown = 0;
  typing.pause = 0;
  typing.caret = document.createElement('span');
  typing.caret.className = 'tw-caret';
  typing.caret.textContent = '▌';
  el.appendChild(typing.caret);
  typing.nodes = splitGraphemes(text).map((part) => {
    const span = document.createElement('span');
    span.className = 'tw';
    span.textContent = part;
    el.insertBefore(span, typing.caret);
    return span;
  });
  typing.timer = setInterval(stepTyping, TYPE_TICK_MS);
}

function stepTyping() {
  if (!typing.active) return;
  if (typing.pause > 0) {
    typing.pause -= TYPE_TICK_MS;
    return;
  }
  const node = typing.nodes && typing.nodes[typing.shown];
  if (!node) {
    finishTyping();
    return;
  }
  node.classList.add('on');
  typing.shown++;
  const beat = TYPE_BEATS[node.textContent] || 0;
  if (beat) typing.pause = beat;
  // keep the caret right behind the cluster that was just revealed
  if (typing.caret && typing.caret.parentNode === node.parentNode) {
    node.parentNode.insertBefore(typing.caret, typing.nodes[typing.shown] || null);
  }
  if (typing.shown >= typing.nodes.length) finishTyping();
}

function finishTyping() {
  if (!typing.active) return false;
  typing.active = false;
  clearInterval(typing.timer);
  typing.timer = null;
  typing.nodes = null;
  typing.caret = null;
  const el = document.getElementById('dialogue-text');
  el.classList.remove('is-typing');
  el.textContent = typing.full;
  return true;
}

// First press completes the line being typed; the next press moves on.
function advanceDialogue() {
  playSound('step');
  if (finishTyping()) return;
  showNextDialogueLine();
}

function renderCutsceneFrame(cx, prefix, idx) {
  cx.imageSmoothingEnabled = false;
  cx.fillStyle = '#050409';
  cx.fillRect(0, 0, 800, 450);

  const studentImg = state.character === 'female' ? IMAGES.femaleWalk0 : IMAGES.maleWalk0;
  const studentWalkImg = state.character === 'female' ? IMAGES[`femaleWalk${idx % 8}`] : IMAGES[`maleWalk${idx % 8}`];

  if (prefix === 'cutscene_sam') {
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

let activeCutscene = null;

/**
 * Plays still frames with captions. Tap / E / Space skips to the end.
 * @param {number[]} [frameOrder] which frame indexes to show (default: all, in order)
 */
function playFrameByFrameCutscene(prefix, frameCaptions, frameDurationMs, onComplete, frameOrder = null) {
  state.flags.cutscenePlaying = true;
  state.moveInput = 0;
  const overlay = document.getElementById('door-cutscene');
  const frameCanvas = document.getElementById('cutscene-canvas');
  const frameCtx = frameCanvas.getContext('2d');
  closePhotoPuzzleModal();
  const captionEl = document.getElementById('door-caption');
  const order = frameOrder || frameCaptions.map((_, i) => i);

  overlay.classList.remove('hidden');
  let step = 0;
  let timer = null;
  // Each still is rendered off-screen, then shown with a slow zoom/pan and a crossfade.
  const layers = { prev: null, cur: null };
  const fadeMs = Math.min(280, frameDurationMs * 0.5);

  function drawLayer(layer, now, alpha) {
    if (!layer || alpha <= 0) return;
    const age = now - layer.start;
    const z = REDUCED_MOTION ? 1 : 1 + 0.07 * Math.min(1, age / (frameDurationMs * 1.8));
    const panX = REDUCED_MOTION ? 0 : layer.pan * (z - 1) * 400;
    frameCtx.globalAlpha = alpha;
    frameCtx.drawImage(layer.canvas, -(800 * z - 800) / 2 + panX, -(450 * z - 450) / 2, 800 * z, 450 * z);
  }

  function present() {
    if (!activeCutscene) return;
    const now = performance.now();
    frameCtx.globalAlpha = 1;
    frameCtx.imageSmoothingEnabled = true;
    frameCtx.fillStyle = '#000';
    frameCtx.fillRect(0, 0, 800, 450);
    const curAlpha = layers.cur ? Math.min(1, (now - layers.cur.start) / fadeMs) : 0;
    drawLayer(layers.prev, now, 1);
    drawLayer(layers.cur, now, curAlpha);
    frameCtx.globalAlpha = 1;
    const vig = frameCtx.createRadialGradient(400, 225, 160, 400, 225, 470);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.65)');
    frameCtx.fillStyle = vig;
    frameCtx.fillRect(0, 0, 800, 450);
    frameCtx.fillStyle = '#000'; // letterbox bars
    frameCtx.fillRect(0, 0, 800, 38);
    frameCtx.fillRect(0, 412, 800, 38);
    requestAnimationFrame(present);
  }

  function finish() {
    if (!activeCutscene) return;
    clearTimeout(timer);
    activeCutscene = null;
    overlay.classList.add('hidden');
    state.flags.cutscenePlaying = false;
    if (onComplete) onComplete();
  }

  function stepFrame() {
    if (step >= order.length) return finish();
    const idx = order[step];
    const off = document.createElement('canvas');
    off.width = 800;
    off.height = 450;
    renderCutsceneFrame(off.getContext('2d'), prefix, idx);
    layers.prev = layers.cur;
    layers.cur = { canvas: off, start: performance.now(), pan: step % 2 ? -1 : 1 };
    captionEl.classList.remove('caption-in');
    void captionEl.offsetWidth;
    captionEl.classList.add('caption-in');
    captionEl.textContent = String(frameCaptions[idx] || '').replace(/^เฟรม\s*\d+\s*\/\s*\d+\s*:\s*/, '');
    if (step === 0) playSound('creak');
    if (idx === 3 && order.length > 2) playSound('chime');
    step++;
    timer = setTimeout(stepFrame, frameDurationMs);
  }
  activeCutscene = { finish, startedAt: performance.now() };
  stepFrame();
  requestAnimationFrame(present);
}

// Skip the current cutscene (ignored for the first 300 ms so a held key doesn't skip by accident).
function skipCutscene() {
  if (activeCutscene && performance.now() - activeCutscene.startedAt > 300) activeCutscene.finish();
}

// ----------------------- Animated door transition -----------------------
// One continuous shot for every doorway: the leaves swing open on their hinges, the
// character walks into the dark, the camera pushes in, then the frame fades to black
// and the next scene fades in underneath it. No ghosts, no hard cuts.
function playDoorTransition(seen, captionText, onComplete) {
  state.flags.cutscenePlaying = true;
  state.moveInput = 0;
  const overlay = document.getElementById('door-cutscene');
  const canvasEl = document.getElementById('cutscene-canvas');
  const cx = canvasEl.getContext('2d');
  const captionEl = document.getElementById('door-caption');
  closePhotoPuzzleModal();
  overlay.classList.remove('hidden', 'leaving');

  const duration = REDUCED_MOTION ? (seen ? 1100 : 1800) : (seen ? 1900 : 3800);
  const start = performance.now();
  let captionStep = -1;
  let raf = 0;
  let finished = false;
  let footstep = 0;
  let creakPlayed = false;
  let rustlePlayed = false;

  const beats = seen
    ? [
        [0, 'แอ๊ดดด... (ประตูบานเดิมเปิดออกอีกครั้ง)'],
        [0.5, captionText]
      ]
    : [
        [0, 'ยืนอยู่หน้าบานประตูไม้สัก... กลิ่นไม้เก่ากับธูปปนกันจนแน่นจมูก'],
        [0.2, 'กลอนไม้ขยับเองช้าๆ เหมือนมีมือหนึ่งผลักจากด้านใน'],
        [0.44, 'แอ๊ดดดดด... เสียงไม้ครางยาว ทั้งที่ไม่ควรมีลมพัด'],
        [0.66, 'ความมืดกับกลิ่นธูปเก่าล้นออกมา... ข้างในดำสนิทจนมองไม่เห็นพื้น'],
        [0.84, captionText]
      ];

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const easeOut = (v) => 1 - Math.pow(1 - clamp01(v), 3);
  const easeInOut = (v) => (v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2);

  function captionAt(t) {
    let next = 0;
    for (let i = 0; i < beats.length; i++) if (t >= beats[i][0]) next = i;
    if (next === captionStep) return;
    captionStep = next;
    captionEl.classList.remove('caption-in');
    void captionEl.offsetWidth;
    captionEl.classList.add('caption-in');
    captionEl.textContent = beats[next][1];
  }

  function draw(t) {
    const door = IMAGES.door;

    // timeline: walk up -> leaves open -> step through -> fade
    const walkT = clamp01(t / 0.34);
    const openT = clamp01((t - 0.18) / 0.44);
    const enterT = clamp01((t - 0.6) / 0.24);
    const black = clamp01((t - 0.86) / 0.08);

    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.imageSmoothingEnabled = false;
    cx.fillStyle = '#040307';
    cx.fillRect(0, 0, 800, 450);

    // camera pushes in on the doorway
    const zoom = REDUCED_MOTION ? 1 : 1 + 0.26 * easeInOut(clamp01((t - 0.05) / 0.85));
    cx.save();
    cx.translate(400, 250);
    cx.scale(zoom, zoom);
    cx.translate(-400, -250);

    const doorY = 56;
    const doorH = 340;
    const leafW = 118;
    const hingeL = 282;
    const hingeR = 518;

    // --- the porch the door sits in: wall, beam, floor, lantern ---------
    const wall = cx.createLinearGradient(0, 30, 0, 410);
    wall.addColorStop(0, '#1a1315');
    wall.addColorStop(0.6, '#120e10');
    wall.addColorStop(1, '#0a0809');
    cx.fillStyle = wall;
    cx.fillRect(86, 24, 628, 392);

    cx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    for (let px = 100; px < 714; px += 46) cx.fillRect(px, 24, 1, 392);

    cx.fillStyle = 'rgba(50, 35, 27, 0.8)';
    cx.fillRect(250, 32, 302, 15);
    cx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    cx.fillRect(250, 47, 302, 3);

    const lampX = 204;
    const lampY = 132;
    const lamp = cx.createRadialGradient(lampX, lampY, 6, lampX, lampY, 255);
    lamp.addColorStop(0, 'rgba(255, 198, 118, 0.4)');
    lamp.addColorStop(0.34, 'rgba(206, 128, 54, 0.12)');
    lamp.addColorStop(1, 'rgba(0, 0, 0, 0)');
    cx.fillStyle = lamp;
    cx.fillRect(0, 0, 800, 450);

    // hanging lantern: chain, cap, warm glass
    cx.fillStyle = 'rgba(46, 30, 18, 0.9)';
    cx.fillRect(lampX - 1, 47, 2, 68);
    cx.fillStyle = 'rgba(66, 44, 26, 0.95)';
    cx.fillRect(lampX - 7, 113, 14, 3);
    cx.fillStyle = 'rgba(255, 206, 138, 0.92)';
    cx.fillRect(lampX - 5, 116, 10, 16);
    cx.fillStyle = 'rgba(255, 240, 200, 0.85)';
    cx.fillRect(lampX - 2, 119, 4, 10);
    cx.fillStyle = 'rgba(52, 34, 20, 0.95)';
    cx.fillRect(lampX - 6, 132, 12, 2);

    cx.fillStyle = '#0b0908';
    cx.fillRect(86, 404, 628, 46);
    cx.fillStyle = '#1a1210';
    cx.fillRect(240, 396, 322, 9);
    cx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    cx.fillRect(240, 404, 322, 5);

    // --- the doorway itself: nothing but darkness ----------------------
    cx.fillStyle = '#020204';
    cx.fillRect(hingeL - 3, doorY, hingeR - hingeL + 6, doorH);

    // --- door leaves, hinged at the outer edges -------------------------
    const angle = easeOut(openT) * Math.PI * 0.44;
    const leafNow = leafW * Math.cos(angle);
    if (isReady(door)) {
      const dw = door.naturalWidth;
      const dh = door.naturalHeight;
      const shade = 'rgba(4, 3, 7, ' + (0.1 + 0.6 * (1 - Math.cos(angle))) + ')';
      cx.save();
      cx.translate(hingeL, 0);
      cx.drawImage(door, 0, 0, dw / 2, dh, 0, doorY, leafNow, doorH);
      cx.fillStyle = shade;
      cx.fillRect(0, doorY, leafNow, doorH);
      cx.restore();
      cx.save();
      cx.translate(hingeR, 0);
      cx.scale(-1, 1);
      cx.drawImage(door, dw / 2, 0, dw / 2, dh, 0, doorY, leafNow, doorH);
      cx.fillStyle = shade;
      cx.fillRect(0, doorY, leafNow, doorH);
      cx.restore();

      // warm edge light on the inner stiles while the doors are ajar
      if (openT > 0.05) {
        const edge = (0.16 + 0.26 * Math.sin(openT * Math.PI)) * (1 - enterT * 0.7);
        cx.fillStyle = 'rgba(238, 190, 120, ' + edge + ')';
        cx.fillRect(hingeL + leafNow - 2, doorY, 2, doorH);
        cx.fillRect(hingeR - leafNow, doorY, 2, doorH);
      }
    }

    // --- the character: walk to the door, then into the dark ------------
    const cycle = Math.floor(t * 28) % 8;
    const sprite = state.character === 'female' ? IMAGES[`femaleWalk${cycle}`] : IMAGES[`maleWalk${cycle}`];
    let x = 148 + (300 - 148) * easeInOut(walkT);
    let scale = 1;
    let alpha = 1;
    if (enterT > 0) {
      x = 300 + 140 * easeInOut(enterT);
      scale = 1 - 0.45 * enterT;
      alpha = 1 - 1.15 * enterT;
    }
    if (isReady(sprite) && alpha > 0.02) {
      const h = 236 * scale;
      const w = 118 * scale;
      const feetY = 402 - (1 - scale) * 110;
      cx.globalAlpha = alpha;
      cx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      cx.beginPath();
      cx.ellipse(x + w / 2, feetY, w * 0.36, 7 * scale, 0, 0, Math.PI * 2);
      cx.fill();
      cx.drawImage(sprite, x, feetY - h, w, h);
      cx.globalAlpha = 1;
    }

    // ground fog lifted from the boards (radial only, so no hard edges)
    const fog = cx.createRadialGradient(400, 408, 20, 400, 408, 300);
    fog.addColorStop(0, 'rgba(170, 180, 192, 0.13)');
    fog.addColorStop(1, 'rgba(170, 180, 192, 0)');
    cx.fillStyle = fog;
    cx.fillRect(0, 120, 800, 330);
    cx.restore();

    // vignette, letterbox and the fade that hands over to the next scene
    const vig = cx.createRadialGradient(400, 225, 150, 400, 225, 470);
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
    cx.fillStyle = vig;
    cx.fillRect(0, 0, 800, 450);
    cx.fillStyle = '#000';
    cx.fillRect(0, 0, 800, 38);
    cx.fillRect(0, 412, 800, 38);
    if (black > 0) {
      cx.fillStyle = 'rgba(0, 0, 0, ' + black + ')';
      cx.fillRect(0, 0, 800, 450);
    }
  }

  function frame(now) {
    if (finished) return;
    const t = Math.min(1, (now - start) / duration);
    captionAt(t);
    if (footstep < 3 && t > 0.06 + footstep * 0.1) {
      playSound('step', { gain: 0.4 });
      footstep++;
    }
    if (!creakPlayed && t > 0.2) {
      creakPlayed = true;
      playSound('creak');
    }
    if (!rustlePlayed && t > 0.64) {
      rustlePlayed = true;
      playSound('rustle', { gain: 0.5 });
    }
    draw(t);
    if (t >= 1) {
      finish();
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function finish() {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    activeCutscene = null;
    // bring the next scene in underneath, then lift the black frame away
    if (onComplete) onComplete();
    captionEl.textContent = '';
    overlay.classList.add('leaving');
    setTimeout(() => {
      overlay.classList.add('hidden');
      overlay.classList.remove('leaving');
      state.flags.cutscenePlaying = false;
    }, 460);
  }

  activeCutscene = { finish, startedAt: performance.now() };
  raf = requestAnimationFrame(frame);
}

function playDoorCutscene(targetScene, targetX, captionText = 'แอ๊ดดดดด...') {
  // The first time through a doorway plays the full shot; going back and forth is quick.
  const key = `${state.scene}->${targetScene}`;
  const seen = state.seenDoors.has(key);
  state.seenDoors.add(key);
  playDoorTransition(seen, captionText, () => enterScene(targetScene, targetX));
}

function enterScene(sceneNum, startX) {
  state.scene = sceneNum;
  setTimeout(() => showChapterCard(sceneNum), 0); // after the scene's own state is set
  setAmbientScene(sceneNum);
  state.player.x = startX;
  state.player.hidden = false;
  state.unhideGrace = 0;
  resetGhost(startX < 640 ? 980 : -CONFIG.GHOST_REENTER_MARGIN);
  updateHud();

  if (sceneNum === 2 && !state.flags.visited2) {
    state.flags.visited2 = true;
    queueDialogue([
      { speaker: getPlayerName(), text: 'เข้ามาแล้ว... แต่ในเรือนกลับหนาวกว่าข้างนอก ไฟที่เห็นจากนอกหน้าต่างก็ดับไปแล้ว' },
      { speaker: getPlayerName(), text: 'รูปบนผนัง โต๊ะ ตู้ไม้... ทุกอย่างถูกจัดวางเหมือนรอให้ผมเดินไปแตะ' },
      { speaker: 'เสียงกระซิบที่คุ้นหู', text: 'อยากออกไป... ก็คืนสิ่งที่เรือนนี้ขาดไปให้ครบ — ของเซ่นไหว้สามอย่าง กับใบหน้าสามชิ้นที่ถูกฉีกออกจากรูป' },
      { speaker: getPlayerName(), text: 'ของเซ่นไหว้ 3 ชิ้น กับเศษรูป 3 ชิ้น... หาให้ครบแล้วนำไปที่หิ้งบูชา ประตูหลังเรือนถึงจะเปิดให้ผมออกไป' }
    ]);
  } else if (sceneNum === 3) {
    state.ghost.type = 'samphawesi';
    if (!state.flags.samphawesiTriggered) {
      state.ghost.active = false;
      state.ghost.x = 760;
      queueDialogue([
        { speaker: getPlayerName(), text: 'ตรงกลางห้อง... มีใครบางคนนั่งยองๆ อยู่หลังกระทงใบตอง กำลังกินของเซ่นด้วยมือเปล่า' }
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
        { speaker: 'เสียงกระพรวนข้อเท้า', text: 'กริ๊ง... กริ๊ง... (ช้าๆ เหมือนมีคนเต้นรำอยู่ในความมืด ทั้งที่พื้นไม่สั่นเลย)' },
        { speaker: getPlayerName(), text: 'ผีนางรำ... เธอไม่วิ่ง แต่ทุกครั้งที่ผมกะพริบตา เธอใกล้ขึ้นอีกก้าว รีบหาของเซ่นให้ครบแล้วซ่อนในตู้ไม้!' },
        { speaker: 'เสียงกระซิบที่คุ้นหู', text: 'เธอจะขยับได้ก็ต่อเมื่อไม่มีใครมอง... หันไฟฉายใส่เธอไว้ แล้วค่อยๆ ทำสิ่งที่ต้องทำ' }
      ]);
    }
  } else if (sceneNum === 5) {
    state.ghost.active = false;
    state.player.flashlight = false;
    queueDialogue([
      { speaker: getPlayerName(), text: 'แฮ่ก... ออกมาได้แล้ว ข้างนอกหมอกลงขาว... แต่เงาร่างตรงนั้น ทำไมคุ้นเหมือนญาติผู้ใหญ่ในงานศพ' }
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
    { speaker: 'เสียงกระพรวนข้อเท้า', text: 'กริ๊ง... (แล้วเสียงกระพรวนก็ขาดหายไปกลางอากาศ เหลือแต่กลิ่นธูปที่ค่อยๆ จาง)' },
    { speaker: getPlayerName(), text: 'วิญญาณท่านสงบแล้ว... หรือแค่กำลังรออยู่หลังประตูบานนั้น' }
  ]);
  broadcastState();
}

function triggerSamphawesiEncounter() {
  if (state.flags.samphawesiTriggered) return;
  state.flags.samphawesiTriggered = true;
  playSound('scare');
  const samCaptions = [
    'เฟรม 1/6 : กลางห้องมีแสงเทียนดวงเดียว สั่นไหวเหมือนมีคนหายใจรด',
    'เฟรม 2/6 : ร่างหนึ่งนั่งยองๆ หันหลังให้คุณ กำลังกินของเซ่นไหว้ด้วยมือเปล่า',
    'เฟรม 3/6 : ลำไฟฉายส่องไปถูกแผ่นหลังที่เน่าเป็นรู... ร่างนั้นหยุดเคี้ยวทันที',
    'เฟรม 4/6 : กร๊อบ... คอที่บิดผิดรูปค่อยๆ หมุนกลับมา ดวงตาขาวโพลนไม่มีรูม่านตา',
    'เฟรม 5/6 : มันยันตัวลุกขึ้นช้าๆ เขี้ยวเปื้อนเลือด และส่งเสียงหัวเราะจากลำคอที่ขาด',
    'เฟรม 6/6 : มันกระโจนมาสี่ขา! ซ่อนในตุ่มน้ำ หรือหนีให้พ้นแสงเทียนเดี๋ยวนี้!'
  ];
  playFrameByFrameCutscene('cutscene_sam', samCaptions, 680, () => {
    state.ghost.type = 'samphawesi';
    state.ghost.active = true;
    resetGhost(780);
    state.ghost.stunTimer = 1.5; // it is still rising: give the player a moment to run
    playTension();
    queueDialogue([
      { speaker: 'เสียงกระซิบที่คุ้นหู', text: 'ชู่ว์... มันมองไม่เห็น มันฟังเสียงฝีเท้า — ถ้ามันเข้ามาใกล้ หยุดเดินแล้วยืนนิ่งไว้' }
    ]);
    broadcastState();
  });
}

function triggerEndingDialogue() {
  queueDialogue([
    { speaker: 'คุณลุงชุดราชปะแตน', text: 'ออกมาได้แล้วสินะ... เรือนหลังนั้นไม่ใช่ที่ของคนเป็น มันไม่เคยเป็น' },
    { speaker: getPlayerName(), text: 'คุณลุงเป็นใครครับ... แล้วพ่อกับแม่ผม—' },
    { speaker: 'คุณลุงชุดราชปะแตน', text: 'ปลอดภัยแล้ว อยู่ที่โรงพยาบาล... แต่เอ็งน่ะ ตอนรถคว่ำดวงจิตหลุดออกจากร่าง ก่อนที่หมอจะได้พูดคำว่า "ช่วยไม่ได้"' },
    { speaker: 'คุณลุงชุดราชปะแตน', text: 'ข้าจะพาเอ็งกลับเข้าร่าง... แต่ต้องแลกด้วยสัญญา เอ็งต้องไปที่หนึ่งให้ได้ ไม่อย่างนั้น มันจะดึงเอ็งกลับมาทุกคืน' },
    { speaker: getPlayerName(), text: 'ที่ไหนครับ... ผมสัญญา' },
    { speaker: 'คุณลุงชุดราชปะแตน', text: 'งาน "Open House BUU วันที่ 20 – 21 นี้"... ไปให้ถึง แล้วความฝันร้ายนี้จะจบ จำคำข้าไว้ อย่าผิดสัญญา' },
    { speaker: getPlayerName(), text: 'คุณลุงครับ... แล้วเสียงกระซิบที่คอยบอกทางผมตลอดคืน เสียงนั้นคุ้นหูเหลือเกิน' },
    { speaker: 'คุณลุงชุดราชปะแตน', text: 'ก็เพื่อนเอ็งไง... คนที่เอ็งเพิ่งไปงานศพมาเมื่อหัวค่ำ มันเดินตามเอ็งมาตลอดทาง ไม่ยอมให้เอ็งหลงอยู่ที่นี่' },
    { speaker: 'เสียงกระซิบที่คุ้นหู', text: 'ไปเถอะ... ไปให้ถึงวันนั้นแทนเราด้วยนะ' }
  ], () => {
    const endCaptions = [
      'เฟรม 1/6 : เศษรูปทั้งสามประสานกันในกรอบไม้... ภาพสุดท้ายคือใบหน้าของคุณเองที่ยังหลับตาบนเตียงโรงพยาบาล',
      'เฟรม 2/6 : ความทรงจำไหลคืนมา... คุณไม่ได้ตาย แต่ก็ยังไม่กลับเข้าไปในร่าง',
      'เฟรม 3/6 : ก้าวพ้นประตูเรือนไทย ออกสู่หมอกยามรุ่งอรุณที่เย็นจนเจ็บผิว',
      'เฟรม 4/6 : คุณลุงชุดราชปะแตนยืนรออยู่ตรงนั้น เงาของท่านยาวผิดปกติ',
      'เฟรม 5/6 : "จำสัญญาของเราไว้... ไม่อย่างนั้น มันจะดึงเจ้ากลับมา"',
      'เฟรม 6/6 : แล้วพบกันที่ OPEN HOUSE BUU วันที่ 20 – 21 นี้'
    ];
    playFrameByFrameCutscene('cutscene_end', endCaptions, 750, () => {
      state.flags.victory = true;
      clearCheckpoint();
      playSound('chime');
      showEndingStats();
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

// Place the next collected piece (used by the phone / keyboard instead of clicking a slot).
function placeNextPhotoPiece() {
  const next = [1, 2, 3].find((n) => state.inventory.photos.includes(n) && !state.inventory.placedPhotos.includes(n));
  if (next) {
    placePhotoPiece(next);
  } else {
    closePhotoPuzzleModal();
    showToast(state.flags.photosRestored ? 'รูปภาพต่อครบแล้ว' : 'ยังไม่มีเศษรูปที่เก็บมาเพิ่ม — ออกไปตามหาต่อในเรือน');
  }
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
      { speaker: getPlayerName(), text: 'ครบทั้งสามชิ้น... ภาพชัดขึ้นเรื่อยๆ และคนที่ยืนอยู่ข้างหลังในรูปก็คือผมเอง' },
      { speaker: getPlayerName(), text: 'ผมไม่ได้อยู่ในรูป... ผมไม่ได้อยู่ที่ไหนเลย ผมนอนหมดสติอยู่ระหว่างความเป็นกับความตาย' },
      state.flags.offeringsPlaced
        ? { speaker: getPlayerName(), text: 'รู้ความจริงแล้ว ของเซ่นก็ครบ... ประตูหลังเรือนต้องเปิดให้ผมออกไป' }
        : { speaker: getPlayerName(), text: 'รู้ความจริงแล้ว ถ้าถวายของเซ่นครบสามชิ้นที่หิ้งบูชา ประตูหลังเรือนจะยอมเปิด' }
    ], checkRitualComplete);
  } else {
    showPhotoPuzzleModal();
  }
  broadcastState();
}

// ----------------------- Controls & Actions -----------------------
function setMove(dir) {
  // Stopping is always allowed; starting to walk is not while something is on screen.
  if (dir !== 0 && (isPaused() || state.flags.cutscenePlaying || state.flags.gameOver || isDialogueOpen() || isOverlayOpen())) return;
  if (state.player.hidden && dir !== 0) leaveHiding(); // stepping out of hiding
  state.moveInput = dir;
  if (dir !== 0) state.player.dir = dir;
}

function leaveHiding() {
  state.player.hidden = false;
  state.unhideGrace = CONFIG.UNHIDE_GRACE;
}

function triggerInteract() {
  if (isPaused()) return;
  if (state.flags.cutscenePlaying) return skipCutscene();
  if (state.flags.victory) return;
  // P1 on a phone (or E on the keyboard) can continue without touching the main screen:
  if (state.flags.gameOver) {
    if (performance.now() - (state.gameOverAt || 0) > 1600) retryFromCheckpoint(); // after the jumpscare; ignore panic-mashing
    return;
  }
  if (isPhotoModalOpen()) return placeNextPhotoPiece();
  if (isRitualOpen() || isLockOpen()) return; // these take their own buttons (or the phone's)
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
  if (isPaused() || state.flags.cutscenePlaying || state.flags.gameOver || isDialogueOpen() || isOverlayOpen()) return;
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
  if (isPaused()) return;
  state.player.flashlight = !state.player.flashlight;
  playSound('step');
  broadcastState();
}

function toggleSixthSense() {
  if (isPaused()) return;
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
  if (e.key === 'Escape' && !document.getElementById('settings-modal').classList.contains('hidden')) {
    closeSettings();
    return;
  }
  if (isPaused()) {
    if (e.key === 'Escape') closePause(); // Esc again resumes; every other key is ignored while paused
    return;
  }
  if (isLockOpen()) {
    if (/^[0-9]$/.test(e.key)) lockPress(Number(e.key));
    else if (e.key === 'Backspace') lockPress(-1);
    else if (e.key === 'Escape') closeLock();
    return;
  }
  if (isRitualOpen()) {
    const pick = { 1: 'incense', 2: 'garland', 3: 'dessert' }[e.key];
    if (pick) offerItem(pick);
    else if (e.key === 'Escape') closeRitual();
    return;
  }
  const k = e.key.toLowerCase();
  if (k === 'a' || e.key === 'ArrowLeft') setMove(-1);
  if (k === 'd' || e.key === 'ArrowRight') setMove(1);
  if (e.repeat) {
    if (e.code === 'Space') e.preventDefault();
    return; // held keys must not spam actions or skip whole conversations
  }
  if (e.key === 'Escape') {
    if (state.role === 'host' && state.started && !state.flags.cutscenePlaying && !state.flags.gameOver && !isPhotoModalOpen() && !isDialogueOpen()) {
      openPause();
      return;
    }
  }
  if (isPhotoModalOpen()) closePhotoPuzzleModal();
  if (k === 'e' || e.key === 'Enter') triggerInteract();
  if (k === 'q') toggleHide();
  if (k === 'f') toggleFlashlight();
  if (e.code === 'Space') {
    e.preventDefault();
    if (state.flags.cutscenePlaying) {
      skipCutscene();
    } else if (!document.getElementById('dialogue-box').classList.contains('hidden')) {
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
      updateObjectiveUi();
      if (!isPaused() && !state.flags.victory) state.playTime = (state.playTime || 0) + dt;
    }
  } catch (err) {
    console.error('[gameLoop]', err); // never let one bad frame freeze the game
  }
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

function updateGame(dt) {
  if (isPaused()) return; // the pause menu freezes everything: ghost, timers, movement
  updateRemoteMoveTimeout();
  if (state.flags.cutscenePlaying || state.flags.gameOver || state.flags.victory) return;

  const dialogueOpen = isDialogueOpen();
  const paused = dialogueOpen || isOverlayOpen(); // conversations and the puzzle / ritual / lock windows freeze the world

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
      if (state.player.frame % 4 === 0) playSound('footstep');
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
    g.frozen = false;
    if (g.type === 'dancer') {
      if (isGhostInBeam()) {
        g.frozen = true; // pinned by the light
        if (!state.flags.tipDancerFrozen) {
          state.flags.tipDancerFrozen = true;
          showToast('🔦 ผีนางรำหยุดนิ่งเมื่อถูกไฟฉายส่อง... อย่าหันหลังให้เธอ', '', 5000);
        }
      } else {
        g.x += Math.sign(dist) * speed * CONFIG.DANCER_UNSEEN_MULT * dt;
      }
    } else {
      moveBlindGhost(g, p, speed, dt);
    }
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
  state.gameOverAt = performance.now();
  state.moveInput = 0;
  net.remoteMoving = false;
  state.deaths = (state.deaths || 0) + 1;
  closePhotoPuzzleModal();
  if (isRitualOpen()) closeRitual();
  if (isLockOpen()) closeLock();
  duckAmbient(true);
  playSound('scare');
  const faceSrc = state.ghost.type === 'dancer' ? 'assets/ghost_dancer_2.png' : 'assets/ghost_samphawesi_1.png';
  document.getElementById('jumpscare-img').src = faceSrc;
  // Full-screen jumpscare first, then the game-over screen. Intensity follows settings.
  const js = document.getElementById('jumpscare');
  if (settings.jumpscare === 'off') {
    if (state.flags.gameOver) document.getElementById('gameover-modal').classList.remove('hidden');
  } else {
    document.getElementById('jumpscare-face').src = faceSrc;
    js.classList.remove('hidden', 'play', 'soft');
    void js.offsetWidth; // restart the CSS animation
    const soft = settings.jumpscare === 'soft';
    if (soft) js.classList.add('soft');
    js.classList.add('play');
    setTimeout(() => {
      js.classList.add('hidden');
      js.classList.remove('play', 'soft');
      if (state.flags.gameOver) document.getElementById('gameover-modal').classList.remove('hidden');
    }, soft ? 700 : (REDUCED_MOTION ? 500 : 1150));
  }
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
  ctx.fillStyle = '#050407';
  ctx.fillRect(0, 0, 1280, 720);
  const shake = computeShake();
  ctx.save();
  if (shake) ctx.translate((Math.random() - 0.5) * shake * 2, (Math.random() - 0.5) * shake * 2);
  renderScene();
  ctx.restore();
  renderPostFx();
}

// The camera trembles a little when the ghost is right on top of you (not while safely hidden).
function computeShake() {
  const g = state.ghost;
  if (REDUCED_MOTION || !g.active || g.alpha < 0.5 || state.flags.gameOver || state.flags.cutscenePlaying) return 0;
  if (state.player.hidden && !state.player.flashlight) return 0;
  const d = Math.abs(g.x - state.player.x);
  return d < 160 ? (1 - d / 160) * 3.5 : 0;
}

function renderScene() {
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
    drawGhost();
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
    renderGhostSilhouette();
  }

  // 6. Atmospheric Weather / Dust Particles
  renderAtmosphereParticles();

  // 7. Hotspot markers
  renderHotspotIndicators();
  renderObjectiveMarker();
}

// ---- ghost effects: afterimage trail while hunting, glitch bursts, the dancer's sway ----
const ghostTrail = [];
let ghostTrailAt = 0;
let ghostGlitchUntil = 0;

function drawGhost() {
  const g = state.ghost;
  const now = performance.now();
  const gImg = IMAGES[g.type === 'dancer' ? `dancerAnim${g.frame}` : `samAnim${g.frame}`] || IMAGES.dancerAnim0;
  const dancer = g.type === 'dancer';
  const bob = dancer ? Math.sin(now / 190) * 8 : -Math.abs(Math.sin(now / 140)) * 5; // float vs. lurching crawl
  const sway = dancer && !REDUCED_MOTION ? Math.sin(now / 420) * 0.07 : 0;          // slow Thai-dance sway
  const stunned = g.stunTimer > 0;
  const filter = stunned ? 'brightness(1.7) hue-rotate(120deg)' : null;
  const dist = Math.abs(g.x - state.player.x);
  const tremble = g.frozen && !REDUCED_MOTION ? (Math.random() - 0.5) * 3 : 0;

  if (!stunned && !g.frozen && g.phase === 'chase' && !REDUCED_MOTION) {
    if (now - ghostTrailAt > 70) {
      ghostTrailAt = now;
      ghostTrail.push({ img: gImg, x: g.x, y: 612 + bob, flip: g.dir === 1, rot: sway });
      if (ghostTrail.length > 4) ghostTrail.shift();
    }
  } else {
    ghostTrail.length = 0;
  }
  ghostTrail.forEach((t, i) => {
    drawGhostSprite(t.img, t.x, t.y, 245, t.flip, 'brightness(0.6) sepia(1) hue-rotate(-40deg) saturate(3)', g.alpha * 0.07 * (i + 1), t.rot);
  });

  if (!REDUCED_MOTION && now > ghostGlitchUntil && Math.random() < (dist < 300 ? 0.025 : 0.006)) {
    ghostGlitchUntil = now + 90 + Math.random() * 120;
  }
  const glitch = now < ghostGlitchUntil && !stunned;
  if (g.alpha > 0.05) drawGroundShadow(g.x, 610, 68, 14, 0.6 * g.alpha);
  drawGhostSprite(gImg, g.x + tremble, 612 + bob, 245, g.dir === 1, filter, g.alpha, g.frozen ? 0 : sway, glitch);
}

function drawGhostSprite(img, x, bottomY, h, flip, filter, alpha, rot = 0, glitch = false) {
  if (!isReady(img) || alpha <= 0) return;
  const w = h * (img.naturalWidth / img.naturalHeight);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = alpha;
  ctx.translate(x, bottomY);
  if (rot) ctx.rotate(rot);
  if (flip) ctx.scale(-1, 1);
  if (filter) ctx.filter = filter;
  if (!glitch) {
    ctx.drawImage(img, -w / 2, -h, w, h);
  } else {
    // torn horizontal slices + a colour-split ghost image
    const bands = 14;
    const sh = img.naturalHeight / bands;
    const dh = h / bands;
    for (let i = 0; i < bands; i++) {
      const off = Math.random() < 0.45 ? (Math.random() - 0.5) * 40 : 0;
      ctx.drawImage(img, 0, i * sh, img.naturalWidth, sh, -w / 2 + off, -h + i * dh, w, dh + 0.5);
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * 0.25;
    ctx.filter = 'hue-rotate(180deg)';
    ctx.drawImage(img, -w / 2 + 6, -h, w, h);
  }
  ctx.restore();
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
    // the code yantra: red Thai numerals, only legible in the flashlight / sixth sense
    drawSpriteProportional(IMAGES.talisman, 520, 470, 64); // hung low enough for the flashlight beam to reach
    ctx.save();
    ctx.font = 'bold 24px Sarabun';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#d23a2a';
    ctx.fillText(thaiCode(), 520, 500);
    ctx.restore();

    if (state.flags.offeringsPlaced) {
      drawGroundShadow(640, 610, 58, 12, 0.6);
      drawSpriteProportional(IMAGES.krathong, 640, 612, 86);
    }
  }
}

let lightCanvas = null;
let flashlightDropUntil = 0;

// The flashlight stutters when a ghost is close: short random dropouts.
function isBeamOn() {
  if (!state.player.flashlight || state.player.hidden) return false;
  const g = state.ghost;
  const now = performance.now();
  if (g.active && g.alpha > 0.5 && Math.abs(g.x - state.player.x) < 380 && now > flashlightDropUntil && Math.random() < 0.035) {
    flashlightDropUntil = now + 40 + Math.random() * 140;
  }
  return now >= flashlightDropUntil;
}
function renderDarknessAndFlashlight() {
  if (!lightCanvas) {
    lightCanvas = document.createElement('canvas');
    lightCanvas.width = 1280;
    lightCanvas.height = 720;
  }
  const dctx = lightCanvas.getContext('2d');
  const beamOn = isBeamOn();
  // The light holes below are cut with 'destination-out'; reset it every frame, or the next
  // frame's darkness fill erases instead of paints (the darkness then vanishes after frame 1).
  dctx.globalCompositeOperation = 'source-over';
  dctx.clearRect(0, 0, 1280, 720);

  // Inside the house it is properly dark: the ghost is only clearly seen in the flashlight
  // (or with the sixth sense, which lifts the darkness but draws the ghost faster).
  const DARKNESS = { 1: 0.6, 2: 0.82, 3: 0.9, 4: 0.9 };
  const baseAlpha = isSensing() ? 0.5 : (DARKNESS[state.scene] || 0.8);
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
    punchLight(290, 360, 20, 160, 0.5); // Window (dim moonlight)
    punchLight(670, 560, 12, 120 + flicker, 0.75); // Offering candle glow
  } else if (state.scene === 4) {
    punchLight(640, 370, 15, 140 + flicker, 0.75); // Altar candle glow
  }

  // Soft ambient halo around player
  const px = state.player.x;
  const py = 490;
  punchLight(px, py, 18, 115, 0.78);

  // Directional Flashlight Cone
  if (beamOn) {
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
  if (beamOn) {
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

// A faint dark shape over the darkness, so an unlit ghost is felt rather than invisible.
function renderGhostSilhouette() {
  const g = state.ghost;
  if (!g.active || g.alpha < 0.3 || !(state.scene === 3 || state.scene === 4)) return;
  const gKey = g.type === 'dancer' ? `dancerAnim${g.frame}` : `samAnim${g.frame}`;
  const bob = g.type === 'dancer' ? Math.sin(performance.now() / 190) * 8 : 0;
  drawSpriteProportional(IMAGES[gKey], g.x, 612 + bob, 245, g.dir === 1, 'brightness(0.35) contrast(1.2)', 0.22 * g.alpha);
}

// ---- post effects drawn over everything: lightning (forest), floor fog, film grain ----
const lightning = { next: performance.now() + 6000, start: -1e9 };
let fogSprite = null;
let grainPattern = null;

function makeFogSprite() {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 180;
  const g = c.getContext('2d');
  for (let i = 0; i < 7; i++) {
    const x = 60 + Math.random() * 520;
    const y = 90 + Math.random() * 50;
    const r = 70 + Math.random() * 90;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(200, 205, 215, 0.55)');
    grad.addColorStop(1, 'rgba(200, 205, 215, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 640, 180);
  }
  return c;
}

function makeGrainPattern() {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 160;
  const g = c.getContext('2d');
  const img = g.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return ctx.createPattern(c, 'repeat');
}

function lightningAlpha(t) {
  if (t < 0) return 0;
  if (t < 70) return 0.55;
  if (t < 150) return 0.08;
  if (t < 220) return 0.42;
  return Math.max(0, 0.42 * (1 - (t - 220) / 480));
}

function renderPostFx() {
  const now = performance.now();
  const sceneOn = state.started && !state.flags.cutscenePlaying;

  // Lightning in the forest, thunder a moment later
  if (state.scene === 1 && sceneOn) {
    if (!state.flags.scareFigure && state.player.x > 520 && lightning.next - now > 1500) lightning.next = now + 400;
    if (now > lightning.next) {
      if (!state.flags.scareFigure && state.player.x > 520) {
        state.flags.scareFigure = true;
        lightning.figure = true;
      }
      lightning.start = now;
      lightning.next = now + 9000 + Math.random() * 11000;
      setTimeout(() => { if (state.scene === 1) playSound('thunder', { pan: Math.random() * 1.2 - 0.6 }); }, 500 + Math.random() * 1100);
    }
    const a = REDUCED_MOTION ? lightningAlpha(now - lightning.start) * 0.4 : lightningAlpha(now - lightning.start);
    if (a > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(205, 220, 255, ${a})`;
      ctx.fillRect(0, 0, 1280, 720);
      ctx.restore();
    }
    if (lightning.figure) {
      // someone standing in the doorway of the house... only while the sky is lit
      if (a > 0.12) drawSpriteProportional(IMAGES.dancerAnim1, 1010, 392, 140, true, 'brightness(0)', 0.85);
      if (now - lightning.start > 900) lightning.figure = false;
    }
  }

  renderScareFx(now);

  // Low fog drifting along the floor
  if (state.scene <= 4) {
    if (!fogSprite) fogSprite = makeFogSprite();
    const fogAlpha = state.scene === 1 ? 0.16 : 0.09;
    ctx.save();
    ctx.globalAlpha = fogAlpha;
    for (let i = 0; i < 3; i++) {
      const speed = 9 + i * 6;
      const x = (((now / 1000) * speed + i * 470) % 1920) - 640;
      ctx.drawImage(fogSprite, x, 520 + i * 22, 640 + i * 120, 180);
    }
    ctx.restore();
  }

  // Film grain
  if (!grainPattern) grainPattern = makeGrainPattern();
  ctx.save();
  ctx.globalAlpha = state.scene === 5 ? 0.035 : 0.06;
  ctx.globalCompositeOperation = 'overlay';
  ctx.translate(Math.random() * 160, Math.random() * 160);
  ctx.fillStyle = grainPattern;
  ctx.fillRect(-160, -160, 1440, 880);
  ctx.restore();
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
    const near = isSensing() || dist < 150;
    // far spots stay as faint embers so the dark rooms never hide where to go
    ctx.save();
    ctx.globalAlpha = near ? 1 : 0.32;
    ctx.fillStyle = s.isHiddenClue ? '#59dfb7' : 'rgba(235, 185, 99, 0.85)';
    ctx.beginPath();
    ctx.arc(s.x, 370 + Math.sin(performance.now() / 250 + s.x) * 5, near ? 7 : 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// ----------------------- Mobile P2 Sixth-Sense Radar Renderer -----------------------
let lastRadarDraw = 0;


// =====================================================================================
// Fun pass: ghost rules, scripted scares, offering ritual, co-op lock, timer & ranks
// =====================================================================================

// ---- Ghost rules ------------------------------------------------------------------
// Dancer: only moves while nobody is looking. A flashlight beam on her pins her in place.
function isGhostInBeam() {
  const p = state.player;
  const g = state.ghost;
  if (!p.flashlight || p.hidden) return false;
  const now = performance.now();
  if (now < flashlightDropUntil || now < fx.blackoutUntil) return false;
  const dx = g.x - p.x;
  return Math.sign(dx) === p.dir && Math.abs(dx) < 520;
}

// Samphawesi: blind, follows footsteps. Standing still makes it lose you; it then drifts
// around (never deliberately onto a player who is standing still).
function moveBlindGhost(g, p, speed, dt) {
  const now = performance.now();
  const walking = state.moveInput !== 0 && !p.hidden;
  if (walking) {
    g.heardX = p.x;
    g.heardAt = now;
  }
  if (g.heardAt && now - g.heardAt < 600) {
    const dx = g.heardX - g.x;
    g.dir = dx >= 0 ? 1 : -1;
    // after the footsteps stop it only carries on to just short of where they were,
    // so "stand still when it's close" really is safe
    if (!walking && Math.abs(dx) < 90) return;
    g.x += Math.sign(dx) * Math.min(Math.abs(dx), CONFIG.SAMPHAWESI_HEAR_SPEED * (speed / CONFIG.GHOST_SPEED.samphawesi) * dt);
    return;
  }
  g.wanderTimer = (g.wanderTimer || 0) - dt;
  if (g.wanderTimer <= 0 || g.wanderX == null) {
    g.wanderTimer = 1.6 + Math.random() * 1.6;
    let target = g.x + (Math.random() - 0.5) * 320;
    if (Math.abs(target - p.x) < 140) target = p.x + Math.sign(g.x - p.x || 1) * 180; // sniff, then turn away
    g.wanderX = Math.max(40, Math.min(1240, target));
  }
  const wx = g.wanderX - g.x;
  if (Math.abs(wx) > 4) {
    g.dir = wx >= 0 ? 1 : -1;
    g.x += Math.sign(wx) * CONFIG.SAMPHAWESI_WANDER_SPEED * dt;
  }
}

// ---- Scripted scares ----------------------------------------------------------------
const fx = { blackoutUntil: 0, blackoutStart: 0, appear: null };

function triggerBlackout(ms, appear = null) {
  const now = performance.now();
  fx.blackoutStart = now;
  fx.blackoutUntil = now + ms;
  fx.appear = appear ? { ...appear, from: now + appear.at, to: now + appear.at + appear.dur, played: false } : null;
  playSound('whisper', { gain: 1 });
}

function renderScareFx(now) {
  if (now >= fx.blackoutUntil) return;
  const left = fx.blackoutUntil - now;
  ctx.save();
  ctx.fillStyle = `rgba(0, 0, 0, ${left < 300 ? 0.94 * (left / 300) : 0.94})`;
  ctx.fillRect(0, 0, 1280, 720);
  const ap = fx.appear;
  if (ap && now >= ap.from && now <= ap.to) {
    if (!ap.played) {
      ap.played = true;
      playSound('tension');
    }
    drawSpriteProportional(IMAGES[ap.img], ap.x, ap.bottom, ap.h, !!ap.flip, 'brightness(0.65) contrast(1.4)', 0.85);
  }
  ctx.restore();
}

// ---- Offering ritual (order matters) ---------------------------------------------------
const RITUAL_ORDER = ['incense', 'garland', 'dessert'];
const OFFER_NAMES = { incense: 'ธูปเทียน', garland: 'พวงมาลัย', dessert: 'พานขนม' };
const RITUAL_HINT = 'จุดธูปเทียนบอกกล่าวก่อน → ถวายพวงมาลัย → ปิดท้ายด้วยพานขนม';

function isRitualOpen() {
  const el = document.getElementById('ritual-modal');
  return !!el && !el.classList.contains('hidden');
}

function openRitual() {
  state.ritual = [];
  state.moveInput = 0;
  refreshRitualUi();
  document.getElementById('ritual-modal').classList.remove('hidden');
  broadcastState();
}

function closeRitual() {
  document.getElementById('ritual-modal').classList.add('hidden');
  broadcastState();
}

function refreshRitualUi() {
  const slots = document.querySelectorAll('#ritual-slots span');
  slots.forEach((el, i) => {
    const placed = state.ritual[i];
    el.textContent = placed ? OFFER_NAMES[placed] : '๑๒๓'[i];
    el.classList.toggle('filled', !!placed);
  });
  document.querySelectorAll('#ritual-modal [data-offer]').forEach((btn) => {
    btn.disabled = state.ritual.includes(btn.dataset.offer);
  });
}

function offerItem(item) {
  if (!isRitualOpen() || !OFFER_NAMES[item] || state.ritual.includes(item) || !state.inventory.offerings.includes(item)) return;
  const expected = RITUAL_ORDER[state.ritual.length];
  if (item === expected) {
    state.ritual.push(item);
    playSound('chime', { gain: 0.6 });
    refreshRitualUi();
    if (state.ritual.length === 3) completeRitual();
    broadcastState();
    return;
  }
  // wrong order: the offerings tumble, the dancer lunges closer
  state.ritual = [];
  refreshRitualUi();
  playSound('scare', { gain: 0.45 });
  vibrate([120, 60, 120]);
  const box = document.querySelector('#ritual-modal .modal-box');
  if (box) {
    box.classList.remove('shake');
    void box.offsetWidth;
    box.classList.add('shake');
  }
  angerDancer();
  showToast(`ผิดธรรมเนียม! ของเซ่นร่วงกระจาย... ต้องวาง${OFFER_NAMES[expected]}ก่อน`, 'warn', 4200);
  broadcastState();
}

function angerDancer() {
  const g = state.ghost;
  if (!g.active) return;
  const d = state.player.x - g.x;
  const step = Math.min(150, Math.max(0, Math.abs(d) - 170));
  g.x += Math.sign(d) * step;
  g.alpha = 1;
  g.phase = 'chase';
  playSound('chime', { gain: 1.3, pan: Math.max(-0.9, Math.min(0.9, (g.x - state.player.x) / 600)) });
}

function completeRitual() {
  closeRitual();
  state.flags.offeringsPlaced = true;
  playSound('chime');
  updateHud();
  queueDialogue([
    { speaker: getPlayerName(), text: 'ธูปเทียน พวงมาลัย พานขนม... ครบตามธรรมเนียม กลิ่นธูปม้วนขึ้นมาเองทั้งที่ไม่มีลม ขอให้ดวงวิญญาณในเรือนนี้ได้ไปเสียที' },
    state.flags.photosRestored
      ? { speaker: getPlayerName(), text: 'ของเซ่นครบ รูปก็ครบ... เสียงกระพรวนเงียบลงแล้ว ขอให้ท่านไปสู่สุคติ' }
      : { speaker: getPlayerName(), text: 'เหลือเพียงต่อเศษรูปทั้งสามให้ครบ... ประตูหลังเรือนยังไม่ยอมเปิด' }
  ], () => {
    if (!state.flags.photosRestored) showPhotoPuzzleModal();
    else checkRitualComplete();
  });
}

// ---- Co-op lock: a random 4-digit Thai-numeral code ------------------------------------
const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

function makeLockCode() {
  return Array.from({ length: 4 }, () => Math.floor(Math.random() * 10));
}

function thaiCode() {
  return (state.lockCode || []).map((d) => THAI_DIGITS[d]).join('');
}

function isLockOpen() {
  const el = document.getElementById('lock-modal');
  return !!el && !el.classList.contains('hidden');
}

function openLock() {
  state.lockInput = [];
  state.moveInput = 0;
  refreshLockUi();
  document.getElementById('lock-modal').classList.remove('hidden');
  broadcastState();
}

function closeLock() {
  document.getElementById('lock-modal').classList.add('hidden');
  broadcastState();
}

function lockDisplay() {
  return [0, 1, 2, 3].map((i) => (state.lockInput[i] != null ? THAI_DIGITS[state.lockInput[i]] : '_')).join(' ');
}

function refreshLockUi() {
  const el = document.getElementById('lock-display');
  if (el) el.textContent = lockDisplay();
}

function lockPress(d) {
  if (!isLockOpen() || !Number.isInteger(d) || d < -1 || d > 9) return;
  if (d === -1) state.lockInput.pop();
  else if (state.lockInput.length < 4) state.lockInput.push(d);
  playSound('step', { gain: 0.4 });
  refreshLockUi();
  broadcastState();
  if (state.lockInput.length === 4) setTimeout(checkLock, 250);
}

function checkLock() {
  if (!isLockOpen() || state.lockInput.length < 4) return;
  if (state.lockInput.join('') === state.lockCode.join('')) {
    state.flags.cabinetUnlocked = true;
    closeLock();
    playSound('creak');
    showToast('🔓 กลอนตู้ดีดออกเสียงดังกริ๊ก');
    const cabinet = getSceneHotspots(4).find((sp) => sp.id === 'hiding_cabinet_4');
    if (cabinet) cabinet.onInteract();
    return;
  }
  const box = document.querySelector('#lock-modal .modal-box');
  if (box) {
    box.classList.remove('shake');
    void box.offsetWidth;
    box.classList.add('shake');
  }
  playSound('rustle');
  vibrate([80, 40, 80]);
  state.lockInput = [];
  refreshLockUi();
  broadcastState();
  showToast('รหัสไม่ถูก... ลองส่องไฟฉายอ่านยันต์บนผนังอีกครั้ง', 'warn');
}

function isOverlayOpen() {
  return isPhotoModalOpen() || isRitualOpen() || isLockOpen();
}

// ---- Timer, ranks and the booth's hall of fame ----------------------------------------
const HOF_KEY = 'buu-horror-hof-v1';

function formatTime(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function rankFor(time, deaths) {
  if (deaths === 0 && time < 300) return '🏆 ผู้กล้าแห่งบูรพา';
  if (deaths <= 1 && time < 480) return '🥈 ผู้มีสัมผัสพิเศษ';
  if (deaths <= 3) return '🥉 ผู้รอดชีวิตจากเรือนไทย';
  return '🕯️ ดวงจิตที่หลงทาง (แต่ก็รอดมาได้!)';
}

function loadHof() {
  try {
    const list = JSON.parse(localStorage.getItem(HOF_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

const hofScore = (e) => e.time + e.deaths * 30; // each capture costs 30 s

function renderHof(el, limit, highlightAt = null) {
  if (!el) return;
  const list = loadHof().sort((a, b) => hofScore(a) - hofScore(b)).slice(0, limit);
  el.textContent = '';
  if (!list.length) return;
  const title = document.createElement('div');
  title.className = 'hof-title';
  title.textContent = '🏯 หอเกียรติยศประจำบูธ';
  el.appendChild(title);
  const ol = document.createElement('ol');
  list.forEach((e) => {
    const li = document.createElement('li');
    if (highlightAt && e.at === highlightAt) li.className = 'me';
    const name = document.createElement('span');
    name.className = 'hof-name';
    name.textContent = e.name;
    const meta = document.createElement('span');
    meta.className = 'hof-meta';
    meta.textContent = `${formatTime(e.time)} · ถูกจับ ${e.deaths}`;
    li.append(name, meta);
    ol.appendChild(li);
  });
  el.appendChild(ol);
}

function showEndingStats() {
  const t = state.playTime || 0;
  const d = state.deaths || 0;
  const stats = document.getElementById('ending-stats');
  if (stats) {
    stats.textContent = '';
    const rank = document.createElement('div');
    rank.className = 'ending-rank';
    rank.textContent = rankFor(t, d);
    const meta = document.createElement('div');
    meta.className = 'ending-meta';
    meta.textContent = `เวลา ${formatTime(t)} · ถูกวิญญาณจับ ${d} ครั้ง`;
    stats.append(rank, meta);
  }
  const entry = document.getElementById('hof-entry');
  if (entry) entry.classList.remove('hidden');
  const btn = document.getElementById('hof-save');
  if (btn) btn.disabled = false;
  renderHof(document.getElementById('hof-list'), 5);
}

function saveToHallOfFame() {
  const input = document.getElementById('hof-name');
  const name = (input && input.value ? input.value : '').replace(/\s+/g, ' ').trim().slice(0, 14) || 'ไม่ระบุชื่อ';
  const entry = { name, time: Math.round(state.playTime || 0), deaths: state.deaths || 0, rank: rankFor(state.playTime || 0, state.deaths || 0), at: Date.now() };
  const list = loadHof();
  list.push(entry);
  list.sort((a, b) => hofScore(a) - hofScore(b));
  try { localStorage.setItem(HOF_KEY, JSON.stringify(list.slice(0, 30))); } catch (_) {}
  const btn = document.getElementById('hof-save');
  if (btn) btn.disabled = true;
  renderHof(document.getElementById('hof-list'), 5, entry.at);
  showToast('🏯 บันทึกชื่อลงหอเกียรติยศแล้ว');
}

window.addEventListener('DOMContentLoaded', () => {
  const box = document.getElementById('title-hof');
  if (!box) return;
  renderHof(box, 3);
  box.classList.toggle('hidden', !loadHof().length);
});

// ----------------------- Objectives: always say what to do next -----------------------
// Playtesters understood the controls but not the goal. One plain-language objective is
// derived from the game state every frame, shown at the top of the screen, pointed at with
// a golden arrow in the room, announced with a chapter card, and mirrored on both phones.
const CHAPTERS = {
  1: 'บทที่ 1 · ป่ามืดหลังอุบัติเหตุ',
  2: 'บทที่ 2 · โถงรูปถ่าย',
  3: 'บทที่ 3 · ห้องเครื่องเซ่น',
  4: 'บทที่ 4 · พิธีปลดผนึก',
  5: 'บทสุดท้าย · รุ่งอรุณ'
};

function currentObjective() {
  const inv = state.inventory;
  const f = state.flags;
  const s = state.scene;
  const has = (o) => inv.offerings.includes(o);
  const photo = (n) => inv.photos.includes(n);
  const hideTip = !state.ghost.active ? ''
    : s === 3 ? ' — มันตาบอด: ถ้ามันเข้าใกล้ ให้หยุดเดินแล้วยืนนิ่ง'
    : s === 4 ? ' — ส่องไฟฉายใส่ผีนางรำไว้ เธอจะขยับไม่ได้'
    : '';
  if (s === 1) return { text: 'เดินไปทางขวา แล้วขอความช่วยเหลือที่ประตูเรือนไทย', target: 'mansion_front_door' };
  if (s === 2) {
    if (!photo(1)) return { text: 'สำรวจตู้ไม้สักกลางห้อง (มีบางอย่างซ่อนอยู่)', target: 'hiding_cabinet_2' };
    if (!has('garland')) return { text: 'หาของเซ่นไหว้ชิ้นแรกบนโต๊ะริมหน้าต่าง', target: 'table_offering_1' };
    return { text: 'ตามเสียงกุกกักไปที่ประตูทางขวา', target: 'door_to_scene3' };
  }
  if (s === 3) {
    if (!photo(1) || !has('garland')) return { text: 'ยังเก็บของในโถงรูปถ่ายไม่ครบ — ย้อนกลับทางประตูซ้าย', target: 'door_back_scene2' };
    if (!f.samphawesiTriggered) return { text: 'เข้าไปดูว่าใครนั่งอยู่กลางห้อง', target: 'samphawesi_offering_spot' };
    if (!has('incense')) return { text: 'หาธูปเทียนข้างตุ่มน้ำทางซ้าย' + hideTip, target: 'hiding_jar_3' };
    if (!photo(2)) return { text: 'เอาเศษรูปชิ้นที่ 2 บนโต๊ะมุมขวา' + hideTip, target: 'photo_piece_2_spot' };
    return { text: 'ไปประตูทางขวาสุด เข้าโถงด้านใน', target: 'door_to_scene4' };
  }
  if (s === 4) {
    if (!has('dessert')) {
      if (!f.cabinetUnlocked && !f.codeRead) return { text: 'ตู้ไม้ทางซ้ายถูกล็อก — รหัสเขียนอยู่บนยันต์ที่ผนัง (ส่องไฟฉายอ่าน)' + hideTip, target: 'yantra_code' };
      if (!f.cabinetUnlocked) return { text: `ใส่รหัส ${thaiCode()} ที่ตู้ไม้ทางซ้าย` + hideTip, target: 'hiding_cabinet_4' };
      return { text: 'หยิบพานขนมในตู้ไม้ทางซ้าย' + hideTip, target: 'hiding_cabinet_4' };
    }
    if (!photo(3)) return { text: 'สำรวจหิ้งบูชากลางห้อง (เศษรูปชิ้นสุดท้ายอยู่ที่นั่น)' + hideTip, target: 'shrine_altar_spot' };
    if (inv.offerings.length < 3 || inv.photos.length < 3) {
      return { text: `ยังขาดของ (ของเซ่น ${inv.offerings.length}/3 · เศษรูป ${inv.photos.length}/3) — ย้อนกลับไปหาในห้องก่อนหน้า`, target: 'door_back_scene3' };
    }
    if (!f.offeringsPlaced) return { text: 'ถวายของที่หิ้งบูชาตามธรรมเนียม: ' + RITUAL_HINT, target: 'shrine_altar_spot' };
    if (!f.photosRestored) return { text: 'ต่อเศษรูปให้ครบ: ที่หิ้งบูชา หรือปุ่ม 🖼️ ดูกรอบรูป แล้วแตะรูปทั้ง 3 ชิ้น', target: 'shrine_altar_spot' };
    return { text: 'ประตูหลังเรือนเปิดแล้ว — ออกไปทางขวาสุด', target: 'back_exit_door' };
  }
  if (s === 5) return { text: 'คุยกับคุณลุงที่ยืนรออยู่', target: 'uncle_raj_pattern' };
  return { text: '', target: null };
}

let lastObjectiveText = '';
let objectiveSince = 0;

function updateObjectiveUi() {
  const bar = document.getElementById('objective-bar');
  if (!bar) return;
  const show = state.role === 'host' && state.started && !state.flags.victory && !state.flags.cutscenePlaying && !isDialogueOpen();
  bar.classList.toggle('hidden', !show);
  const obj = currentObjective();
  if (obj.text !== lastObjectiveText) {
    lastObjectiveText = obj.text;
    objectiveSince = performance.now();
    document.getElementById('objective-text').textContent = obj.text;
    bar.classList.remove('obj-new');
    void bar.offsetWidth; // restart the "new objective" glow
    bar.classList.add('obj-new');
  }
}

// Golden arrow over the next target; it grows and spells out the action if the player
// has been on the same step for a while.
const IS_TOUCH = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
function renderObjectiveMarker() {
  if (state.flags.cutscenePlaying || state.flags.gameOver || isDialogueOpen()) return;
  const obj = currentObjective();
  if (!obj.target) return;
  const spot = getSceneHotspots(state.scene).find((sp) => sp.id === obj.target);
  if (!spot) return;
  const now = performance.now();
  const stuck = now - objectiveSince > 15000;
  const bob = REDUCED_MOTION ? 0 : Math.sin(now / 220) * 6;
  const size = stuck ? 16 : 11;
  const y = 318 + bob;
  ctx.save();
  ctx.fillStyle = '#ffd36b';
  ctx.shadowColor = 'rgba(255, 200, 90, 0.9)';
  ctx.shadowBlur = stuck ? 18 : 10;
  ctx.beginPath();
  ctx.moveTo(spot.x - size, y - size);
  ctx.lineTo(spot.x + size, y - size);
  ctx.lineTo(spot.x, y + size * 0.6);
  ctx.closePath();
  ctx.fill();
  if (stuck) {
    ctx.font = 'bold 18px Sarabun';
    ctx.textAlign = 'center';
    ctx.fillText(IS_TOUCH ? 'แตะ 🔍 สำรวจ ที่นี่' : 'มาที่นี่ แล้วกด E', spot.x, y - size - 10);
  }
  ctx.restore();
}

// Chapter card when a scene is entered for the first time: name + what to do here.
function showChapterCard(scene) {
  if (!state.seenChapters) state.seenChapters = new Set();
  if (state.seenChapters.has(scene) || !CHAPTERS[scene]) return;
  state.seenChapters.add(scene);
  const card = document.getElementById('chapter-card');
  if (!card) return;
  document.getElementById('chapter-title').textContent = CHAPTERS[scene];
  document.getElementById('chapter-goal').textContent = '🎯 ' + currentObjective().text;
  card.classList.remove('hidden', 'play');
  void card.offsetWidth;
  card.classList.add('play');
  clearTimeout(showChapterCard.timer);
  showChapterCard.timer = setTimeout(() => card.classList.add('hidden'), 4200);
}

function showControlsTip() {
  showToast(IS_TOUCH
    ? '👆 แตะ ◀ ▶ เพื่อเดิน · เจอจุดแสงสีทองให้แตะ 🔍 สำรวจ · ทำตาม 🎯 เป้าหมาย ด้านบนจอ'
    : '⌨️ เดิน A/D หรือ ← → · เจอจุดแสงสีทองกด E · ทำตาม 🎯 เป้าหมาย ด้านบนจอ', '', 8000);
}

// Names on P2's map, and when each spot is finished (shown greyed with ✓).
const RADAR_INFO = {
  forest_sign: { label: 'เสาไฟ' },
  mansion_front_door: { label: 'ประตูเรือน →' },
  dust_floor: { label: 'กองฝุ่น', done: () => state.flags.inspectedDust },
  portrait_wall: { label: 'กรอบรูป', done: () => state.flags.photosRestored },
  hiding_cabinet_2: { label: 'ตู้ · เศษรูป 1', done: () => state.inventory.photos.includes(1) },
  table_offering_1: { label: 'โต๊ะ · พวงมาลัย', done: () => state.inventory.offerings.includes('garland') },
  door_to_scene3: { label: 'ประตู →' },
  door_back_scene2: { label: '← ประตู' },
  hiding_jar_3: { label: 'ตุ่ม · ธูปเทียน', done: () => state.inventory.offerings.includes('incense') },
  samphawesi_offering_spot: { label: 'กระทง', done: () => state.flags.samphawesiTriggered },
  photo_piece_2_spot: { label: 'โต๊ะ · เศษรูป 2', done: () => state.inventory.photos.includes(2) },
  door_to_scene4: { label: 'ประตู →' },
  door_back_scene3: { label: '← ประตู' },
  hiding_cabinet_4: { label: 'ตู้ล็อก · ขนม', done: () => state.inventory.offerings.includes('dessert') },
  yantra_code: { label: 'ยันต์ · รหัส', done: () => state.flags.codeRead || state.flags.cabinetUnlocked },
  shrine_altar_spot: { label: 'หิ้ง · เศษรูป 3', done: () => state.flags.offeringsPlaced && state.flags.photosRestored },
  back_exit_door: { label: 'ทางออก →' },
  uncle_raj_pattern: { label: 'คุณลุง' }
};

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
    rctx.font = 'bold 20px Sarabun';
    rctx.fillText(SCENE_TITLES[state.scene] || 'เรือนไทย', 14, 30);

    // Floor line
    rctx.strokeStyle = '#59dfb7';
    rctx.lineWidth = 2;
    rctx.beginPath();
    rctx.moveTo(20, 195);
    rctx.lineTo(580, 195);
    rctx.stroke();

    // Hidden Clues & Hiding Spots on P2 Radar
    const spots = getSceneHotspots(state.scene);
    rctx.textAlign = 'center';
    spots.forEach((s, i) => {
      const rx = (s.x / 1280) * 560 + 20;
      const info = RADAR_INFO[s.id] || { label: s.isHidingSpot ? 'ที่ซ่อน' : 'จุดสำรวจ' };
      const done = info.done ? info.done() : false;
      rctx.fillStyle = done ? '#4a5652' : (s.isHidingSpot ? '#4da6ff' : '#ffd166');
      rctx.fillRect(rx - 8, 165, 16, 26);
      if (state.remoteGoal && state.remoteGoal.target === s.id) {
        // the current objective: a pulsing gold ring
        rctx.strokeStyle = '#ffd36b';
        rctx.lineWidth = 3;
        rctx.beginPath();
        rctx.arc(rx, 178, 22 + Math.sin(performance.now() / 200) * 3, 0, Math.PI * 2);
        rctx.stroke();
      }
      // The canvas is shown at ~55% on phones, so text is drawn large and kept inside the edges.
      rctx.font = '600 19px Sarabun';
      rctx.fillStyle = done ? '#7d8a85' : '#f3e5c8';
      const text = (done ? '✓ ' : '') + info.label;
      const half = rctx.measureText(text).width / 2;
      rctx.fillText(text, Math.max(half + 4, Math.min(600 - half - 4, rx)), i % 2 ? 156 : 128); // staggered rows
    });
    rctx.textAlign = 'left';

    // Player P1 position (Cyan circle)
    const p1x = (state.player.x / 1280) * 560 + 20;
    rctx.fillStyle = '#00f5d4';
    rctx.beginPath();
    rctx.arc(p1x, 175, 10, 0, Math.PI * 2);
    rctx.fill();
    rctx.font = 'bold 18px Sarabun';
    rctx.fillText(state.player.hidden ? 'P1 (ซ่อน)' : 'P1', Math.min(p1x - 10, 500), 96);

    // Ghost position (Pulsing Red Skull/Dot)
    if (state.ghost.active) {
      const gx = Math.max(20, Math.min(580, (state.ghost.x / 1280) * 560 + 20));
      rctx.globalAlpha = Math.max(0.25, state.ghost.alpha == null ? 1 : state.ghost.alpha);
      rctx.fillStyle = '#ff3b3b';
      rctx.beginPath();
      rctx.arc(gx, 170, 13 + Math.sin(performance.now() / 120) * 3, 0, Math.PI * 2);
      rctx.fill();
      rctx.fillStyle = '#fff';
      const faded = state.ghost.alpha != null && state.ghost.alpha < 0.4;
      rctx.font = 'bold 18px Sarabun';
      rctx.fillText(faded ? 'หายไปในความมืด…' : (state.ghost.type === 'dancer' ? 'ผีนางรำ!' : 'สัมภเวสี!'), Math.max(4, Math.min(gx - 30, 450)), 70);
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
    const rg = state.remoteGoal || {};
    if (clueEl && rg.context === 'ritual') {
      clueEl.textContent = 'ตำราพิธีในสมุดข่อย: ' + RITUAL_HINT + ' — บอก P1 ทีละชิ้น!';
    } else if (clueEl && rg.code && (rg.context === 'lock' || rg.target === 'yantra_code' || rg.target === 'hiding_cabinet_4')) {
      clueEl.textContent = 'นิมิตเห็นยันต์บนผนังเขียนว่า ' + rg.code + ' — นี่คือรหัสตู้ บอก P1!';
    } else if (clueEl && state.remoteGoal && state.remoteGoal.goal) {
      clueEl.textContent = 'นิมิตบอกทาง: ' + state.remoteGoal.goal + ' — บอก P1 ด้วย!';
    } else if (clueEl) {
      if (state.scene === 1) clueEl.textContent = 'นิมิตบอกทาง: ให้ P1 เดินไปขวาสุดเพื่อสำรวจประตูเรือนไทย';
      if (state.scene === 2) clueEl.textContent = 'นิมิตบอกทาง: เศษรูปชิ้นที่ 1 อยู่ในตู้ไม้สัก และพวงมาลัยอยู่บนโต๊ะริมหน้าต่างขวา';
      if (state.scene === 3) clueEl.textContent = 'นิมิตบอกทาง: ธูปเทียนอยู่ข้างตุ่มน้ำซ้าย เศษรูปชิ้นที่ 2 อยู่บนโต๊ะขวา (ระวังสัมภเวสี!)';
      if (state.scene === 4) clueEl.textContent = 'นิมิตบอกทาง: ขนมอยู่ในตู้ซ้าย เศษรูปชิ้นที่ 3 อยู่ใต้หิ้งบูชากลางห้อง ถวายให้ครบแล้วออกประตูขวา!';
      if (state.scene === 5) clueEl.textContent = 'รอดพ้นอาถรรพ์แล้ว! ให้ P1 เดินไปคุยกับคุณลุงชุดราชปะแตน';
    }
  }
  requestAnimationFrame(renderP2RadarLoop);
}

// ----------------------- Settings sheet & kiosk helpers -----------------------
function openSettings() {
  refreshSettingsUi();
  document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settings-modal').classList.add('hidden');
}

function refreshSettingsUi() {
  const shown = Math.round((audioMuted ? 0 : audioVolume) * 100);
  const vol = document.getElementById('settings-volume');
  if (vol) vol.value = String(shown);
  const volLabel = document.getElementById('settings-volume-value');
  if (volLabel) volLabel.textContent = shown + '%';

  const mute = document.getElementById('settings-mute');
  if (mute) {
    mute.classList.toggle('on', audioMuted);
    mute.setAttribute('aria-checked', String(audioMuted));
  }

  const levels = document.querySelectorAll('#settings-jumpscare [data-level]');
  for (let i = 0; i < levels.length; i++) {
    const on = levels[i].dataset.level === settings.jumpscare;
    levels[i].classList.toggle('on', on);
    levels[i].setAttribute('aria-pressed', String(on));
  }

  const reduce = document.getElementById('settings-reduce-motion');
  if (reduce) {
    reduce.classList.toggle('on', settings.reduceMotion);
    reduce.setAttribute('aria-checked', String(settings.reduceMotion));
  }

  const autofs = document.getElementById('settings-autofs');
  if (autofs) {
    autofs.classList.toggle('on', settings.autoFullscreen);
    autofs.setAttribute('aria-checked', String(settings.autoFullscreen));
    autofs.disabled = !canFullscreen();
  }
}

function setMuted(on) {
  if (audioMuted !== !!on) toggleAudioMute();
  refreshSettingsUi();
}

function setJumpscareLevel(level) {
  if (level !== 'full' && level !== 'soft' && level !== 'off') return;
  settings.jumpscare = level;
  saveSettings();
  refreshSettingsUi();
}

function setReduceMotion(on) {
  settings.reduceMotion = !!on;
  REDUCED_MOTION = settings.reduceMotion;
  saveSettings();
  refreshSettingsUi();
}

function setAutoFullscreen(on) {
  settings.autoFullscreen = !!on;
  saveSettings();
  refreshSettingsUi();
}

// Browsers only allow fullscreen from a user gesture, so this is called from the
// start-game click handlers rather than at page load.
function applyAutoFullscreen() {
  if (!settings.autoFullscreen || !canFullscreen()) return;
  if (document.fullscreenElement || document.webkitFullscreenElement) return;
  toggleFullscreen().catch(() => {});
}

// Booth helper: hand the machine to the next visitor with no save left behind.
function requestClearSave() {
  const hasSave = !!loadCheckpoint();
  if (hasSave && !window.confirm('ล้างจุดเซฟของคนก่อนหน้าหรือไม่?\nคนเล่นคนถัดไปจะเริ่มเกมใหม่ตั้งแต่ต้น')) return;
  clearCheckpoint();
  const btn = document.getElementById('btn-resume');
  if (btn) btn.classList.add('hidden');
  closeSettings();
  showToast('ล้างจุดเซฟแล้ว — พร้อมให้คนถัดไปเริ่มใหม่');
}

// Escape closes the settings sheet from the title screen too (the game key handler
// above only runs once a game has started).
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const modal = document.getElementById('settings-modal');
  if (modal && !modal.classList.contains('hidden')) closeSettings();
});


// ----------------------- Pause menu -----------------------
function isPaused() {
  return !!state.paused;
}

function openPause() {
  if (state.role !== 'host') return;
  if (!state.started) return;
  if (state.flags.cutscenePlaying || state.flags.gameOver || state.flags.victory || isPhotoModalOpen() || isDialogueOpen()) return;
  state.paused = true;
  state.moveInput = 0;
  net.remoteMoving = false;
  duckAmbient(true);
  document.getElementById('pause-modal').classList.remove('hidden');
  broadcastState(); // phones show "paused"
}

function closePause() {
  if (!isPaused()) return;
  state.paused = false;
  duckAmbient(false);
  document.getElementById('pause-modal').classList.add('hidden');
  broadcastState();
}

// Leave the game for the title screen. A fresh page load is the cleanest reset of every
// timer, sound and room; the checkpoint survives it, so "เล่นต่อ" can pick up again.
function exitToTitle({ keepSave }) {
  if (keepSave) saveCheckpoint();
  else clearCheckpoint();
  state.paused = false;
  window.location.href = window.location.pathname;
}

// Pause menu: back to the title, keeping the save.
function pauseExitToTitle() {
  exitToTitle({ keepSave: true });
}

function togglePause() {
  if (isPaused()) closePause();
  else openPause();
}

// "Clear save and go back": in a game it confirms, wipes the save and returns to the title;
// on the title screen it just clears the save. Cancelling changes nothing (the menu stays open).
function requestPauseExitToTitle() {
  if (!state.started) {
    requestClearSave();
    return;
  }
  if (!window.confirm('ล้างจุดเซฟแล้วกลับสู่หน้าแรกหรือไม่?\nคนเล่นคนถัดไปจะเริ่มเกมใหม่ตั้งแต่ต้น')) return;
  exitToTitle({ keepSave: false });
}

// Settings from inside the pause menu (the sheet sits above it).
function openSettingsFromPause() {
  openSettings();
}


