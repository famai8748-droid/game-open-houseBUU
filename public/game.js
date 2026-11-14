/* ============================================================================
 * เรือนซ่อนวิญญาณ (The Veiled Thai House) - Main Game & Multiplayer Engine
 * ============================================================================ */

const urlParams = new URLSearchParams(window.location.search);
const initialRoomParam = urlParams.get('room');
const initialRoleParam = urlParams.get('role'); // 'p1' | 'p2'
let eventSource = null;

// ----------------------- Web Audio Horror Synthesizer -----------------------
let audioCtx = null;
let audioMuted = false;

function initAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) audioCtx = new AudioContext();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function toggleAudioMute() {
  audioMuted = !audioMuted;
  const btn = document.getElementById('btn-mute');
  if (btn) btn.textContent = audioMuted ? '🔇 เสียง: ปิด' : '🔊 เสียง: เปิด';
}

function playSound(type) {
  if (audioMuted) return;
  initAudio();
  if (!audioCtx) return;

  const now = audioCtx.currentTime;

  if (type === 'step') {
    // Low wooden floorboard thud
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(95 + Math.random() * 25, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.09);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.095);
  } else if (type === 'creak') {
    // Long eerie wooden door creak
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.linearRampToValueAtTime(210, now + 0.45);
    osc.frequency.linearRampToValueAtTime(115, now + 1.25);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.35);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 1.4);
  } else if (type === 'rustle') {
    // Unexplained "กุกกัก... กุกกัก..." sound
    for (let i = 0; i < 2; i++) {
      const t = now + i * 0.22;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(180 + i * 40, t);
      osc.frequency.exponentialRampToValueAtTime(65, t + 0.12);
      gain.gain.setValueAtTime(0.11, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.14);
    }
  } else if (type === 'chime') {
    // Thai dancer ankle bell (กระพรวนข้อเท้า)
    [1320, 1760].forEach((freq, idx) => {
      const t = now + idx * 0.12;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.46);
    });
  } else if (type === 'pickup') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.21);
  } else if (type === 'scare') {
    // Jumpscare stinger chord
    [110, 146, 233, 311].forEach((freq) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.88);
    });
  }
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
    alertLevel: 5
  },
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
          playDoorCutscene(2, 1100, 'ย้อนกลับไปโถงรูปถ่าย...');
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
          playDoorCutscene(3, 1100, 'กลับไปห้องเครื่องเซ่น...');
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
        isHiddenClue: !state.Flags?.offeringsPlaced,
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
              { speaker: getPlayerName(), text: 'เหลือแค่ประกอบ "เศษรูปถ่ายทั้ง 3 ชิ้น" ให้ครบเพื่อปลดผนึกประตูหลังเรือน!' }
            ], () => {
              if (!state.flags.photosRestored) showPhotoPuzzleModal();
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
  const infoRes = await fetch('/api/server-info');
  const info = await infoRes.json();
  const hostOrigin = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
    ? window.location.origin
    : (info.publicUrl || `http://${info.lanIp}:${info.port}`);

  const createRes = await fetch('/api/create-room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'coop', character: state.character })
  });
  const res = await createRes.json();
  if (!res || !res.ok) return;

  state.roomCode = res.room.code;
  connectRoomEventStream(state.roomCode);

  document.getElementById('lobby-room-code').textContent = state.roomCode;
  document.getElementById('hud-room-badge').textContent = `ห้อง: ${state.roomCode}`;
  document.getElementById('hud-room-badge').classList.remove('hidden');

  const p1Url = `${hostOrigin}/?room=${state.roomCode}&role=p1`;
  const p2Url = `${hostOrigin}/?room=${state.roomCode}&role=p2`;

  const qr1 = await (await fetch(`/api/qr?text=${encodeURIComponent(p1Url)}`)).json();
  const qr2 = await (await fetch(`/api/qr?text=${encodeURIComponent(p2Url)}`)).json();

  document.getElementById('qr-p1-img').src = qr1.dataUrl;
  document.getElementById('qr-p2-img').src = qr2.dataUrl;
  document.getElementById('lobby-url-hint').textContent = `สแกนด้วยกล้องมือถือ หรือเปิดลิงก์: ${hostOrigin} แล้วกรอกรหัส ${state.roomCode}`;
  document.getElementById('coop-modal').classList.remove('hidden');
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
  if (!code) {
    alert('กรุณากรอกรหัสห้อง 4 หลักก่อนครับ');
    return;
  }
  joinAsMobileRole(code, role);
}

async function joinAsMobileRole(code, role) {
  initAudio();
  state.role = role;
  state.roomCode = code;
  connectRoomEventStream(code);

  await fetch('/api/join-room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, role })
  });

  if (role === 'p1') {
    document.getElementById('p1-room-label').textContent = `ห้อง ${code}`;
    switchScreen('p1-screen');
  } else {
    document.getElementById('p2-room-label').textContent = `ห้อง ${code}`;
    switchScreen('p2-screen');
    requestAnimationFrame(renderP2RadarLoop);
  }
}

// Check if opened directly via QR scan URL (?room=XXXX&role=p1/p2)
if (initialRoomParam && (initialRoleParam === 'p1' || initialRoleParam === 'p2')) {
  window.addEventListener('DOMContentLoaded', () => {
    joinAsMobileRole(initialRoomParam, initialRoleParam);
  });
}

// ----------------------- Real-Time SSE & Vercel Serverless Polling Sync -----------------------
let pollTimer = null;

function handleIncomingRemoteInput({ action, value }) {
  if (state.role !== 'host') return;
  if (action === 'move') setMove(value);
  if (action === 'interact') {
    if (!document.getElementById('dialogue-box').classList.contains('hidden')) {
      advanceDialogue();
    } else {
      triggerInteract();
    }
  }
  if (action === 'hide') toggleHide();
  if (action === 'flashlight') toggleFlashlight();
  if (action === 'stun_ghost') {
    state.ghost.stunTimer = 4.0;
    playSound('chime');
    queueDialogue([
      { speaker: 'ญาณทิพย์ (P2)', text: '🔔 สั่นกระดิ่งอาคม! ตรึงร่างวิญญาณไว้ให้ 4 วินาที รีบหนีหรือซ่อนตัวเร็ว!' }
    ]);
  }
  if (action === 'sixth_sense_pulse') {
    state.player.sixthSense = true;
    document.getElementById('sixth-sense-overlay').classList.remove('hidden');
    setTimeout(() => {
      state.player.sixthSense = false;
      document.getElementById('sixth-sense-overlay').classList.add('hidden');
    }, 3500);
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

function applyRoomStateToClient(room) {
  if (!room || state.role === 'host') return;
  state.scene = room.scene;
  Object.assign(state.player, room.player);
  Object.assign(state.inventory, room.inventory);
  Object.assign(state.flags, room.flags);
  Object.assign(state.ghost, room.ghost);

  const p1Off = document.getElementById('p1-inv-offerings');
  const p1Pho = document.getElementById('p1-inv-photos');
  if (p1Off) p1Off.textContent = `${state.inventory.offerings.length}/3`;
  if (p1Pho) p1Pho.textContent = `${state.inventory.photos.length}/3`;
}

function connectRoomEventStream(code) {
  if (eventSource) eventSource.close();
  try {
    eventSource = new EventSource(`/api/events?code=${encodeURIComponent(code)}`);
    eventSource.addEventListener('room_updated', (ev) => {
      const room = JSON.parse(ev.data);
      updateLobbyPlayerStatus(room.players);
    });
    eventSource.addEventListener('remote_input', (ev) => {
      handleIncomingRemoteInput(JSON.parse(ev.data));
    });
    eventSource.addEventListener('state_synced', (ev) => {
      applyRoomStateToClient(JSON.parse(ev.data));
    });
  } catch (_) {}

  // Serverless Polling Fallback (for Vercel deployments where SSE is stateless)
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!state.roomCode) return;
    if (state.role !== 'host') {
      try {
        const r = await fetch(`/api/room-state?code=${encodeURIComponent(state.roomCode)}`);
        if (r.ok) {
          const data = await r.json();
          if (data.room) applyRoomStateToClient(data.room);
        }
      } catch (_) {}
    } else if (!state.started) {
      broadcastState();
    }
  }, 320);
}

function sendRemoteInput(action, value) {
  playSound('step');
  fetch('/api/player-input', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: state.roomCode, role: state.role, action, value })
  }).catch(() => {});
}

function broadcastState() {
  if (!state.roomCode || state.role !== 'host') return;
  fetch('/api/sync-state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: state.roomCode,
      statePatch: {
        scene: state.scene,
        character: state.character,
        started: state.started,
        player: state.player,
        inventory: state.inventory,
        flags: state.flags,
        ghost: state.ghost
      }
    })
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.players) updateLobbyPlayerStatus(data.players);
      if (Array.isArray(data.inputs)) {
        data.inputs.forEach((inp) => handleIncomingRemoteInput(inp));
      }
    })
    .catch(() => {});
}

// ----------------------- Story & Cutscene Logic -----------------------
function startIntroSequence() {
  state.scene = 1;
  state.player.x = 160;
  updateHud();
  queueDialogue([
    { speaker: 'เหตุการณ์ก่อนหน้า', text: 'หลังจากกลับจากงานศพของเพื่อนสนิทพร้อมครอบครัว... รถของคุณประสบอุบัติเหตุรุนแรงกลางทางมืด' },
    { speaker: getPlayerName(), text: 'อึก... ปวดหัวจัง... ที่นี่ที่ไหนเนี่ย? พ่อครับ! แม่ครับ!' },
    { speaker: getPlayerName(), text: 'รอบตัวมีแต่ป่ามืดและเงียบสงัด... ข้างหน้านั้นมีบ้านทรงไทยเก่าเปิดไฟอยู่ ลองเดินไปขอความช่วยเหลือดูดีกว่า' }
  ]);
}

function queueDialogue(lines, onComplete = null) {
  state.dialogueQueue = lines.map((l) => ({ ...l }));
  state.dialogueOnComplete = onComplete;
  state.moveInput = 0;
  showNextDialogueLine();
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

function renderCutsceneFrameDataURL(prefix, idx) {
  const c = document.createElement('canvas');
  c.width = 800;
  c.height = 450;
  const cx = c.getContext('2d');
  cx.imageSmoothingEnabled = false;

  const studentImg = state.character === 'female' ? IMAGES.femaleWalk0 : IMAGES.maleWalk0;
  const studentWalkImg = state.character === 'female' ? IMAGES[`femaleWalk${idx % 8}`] : IMAGES[`maleWalk${idx % 8}`];

  if (prefix === 'cutscene_door') {
    const bg = IMAGES.bg1;
    if (bg && bg.complete && bg.naturalWidth) cx.drawImage(bg, 0, 0, 800, 450);
    cx.fillStyle = 'rgba(4, 6, 12, 0.72)';
    cx.fillRect(0, 0, 800, 450);

    // Dark interior cavity behind the double doors
    const gap = [0, 8, 28, 64, 110, 148][idx] || 0;
    cx.fillStyle = '#030408';
    cx.fillRect(400 - gap, 70, gap * 2, 330);

    if (idx >= 3 && IMAGES.dancerAnim1 && IMAGES.dancerAnim1.complete && IMAGES.dancerAnim1.naturalWidth) {
      cx.save();
      cx.globalAlpha = idx === 3 ? 0.85 : 0.45;
      cx.drawImage(IMAGES.dancerAnim1, 345, 130, 110, 220);
      cx.restore();
    }

    const door = IMAGES.door;
    if (door && door.complete && door.naturalWidth) {
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

    if (studentWalkImg && studentWalkImg.complete && studentWalkImg.naturalWidth) {
      cx.drawImage(studentWalkImg, 135 + idx * 24, 175, 115, 230);
    }
  } else if (prefix === 'cutscene_sam') {
    const bg = IMAGES.bg3;
    if (bg && bg.complete && bg.naturalWidth) cx.drawImage(bg, 0, 0, 800, 450);
    cx.fillStyle = 'rgba(6, 5, 10, 0.65)';
    cx.fillRect(0, 0, 800, 450);

    if (IMAGES.krathong && IMAGES.krathong.complete && IMAGES.krathong.naturalWidth) {
      cx.drawImage(IMAGES.krathong, 515, 325, 76, 62);
    }
    const samFrameMap = [0, 0, 1, 2, 4, 6];
    const samImg = IMAGES[`samAnim${samFrameMap[idx] || 0}`];
    if (samImg && samImg.complete && samImg.naturalWidth) {
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
    if (studentImg && studentImg.complete && studentImg.naturalWidth) {
      cx.drawImage(studentImg, 130, 175, 115, 230);
    }
  } else {
    const bg = idx < 2 ? IMAGES.bg2 : IMAGES.bg5;
    if (bg && bg.complete && bg.naturalWidth) cx.drawImage(bg, 0, 0, 800, 450);
    if (idx < 2) {
      cx.fillStyle = 'rgba(10, 8, 14, 0.55)';
      cx.fillRect(0, 0, 800, 450);
      if (IMAGES.frameBroken && IMAGES.frameBroken.complete && IMAGES.frameBroken.naturalWidth) {
        cx.drawImage(IMAGES.frameBroken, 290, 75, 220, 270);
      }
      const spread = idx === 0 ? 55 : 0;
      if (IMAGES.photo1 && IMAGES.photo1.complete) cx.drawImage(IMAGES.photo1, 320 - spread, 110 - spread / 2, 85, 105);
      if (IMAGES.photo2 && IMAGES.photo2.complete) cx.drawImage(IMAGES.photo2, 395 + spread, 115 - spread / 3, 85, 105);
      if (IMAGES.photo3 && IMAGES.photo3.complete) cx.drawImage(IMAGES.photo3, 355, 195 + spread, 95, 105);
    } else {
      const uncleImg = idx % 2 === 0 ? IMAGES.uncle0 : IMAGES.uncle1;
      if (uncleImg && uncleImg.complete && uncleImg.naturalWidth) {
        cx.drawImage(uncleImg, 495, 165, 118, 235);
      }
      if (studentWalkImg && studentWalkImg.complete && studentWalkImg.naturalWidth) {
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
  return c.toDataURL('image/jpeg', 0.9);
}

function playFrameByFrameCutscene(prefix, frameCaptions, frameDurationMs, onComplete) {
  state.flags.cutscenePlaying = true;
  state.moveInput = 0;
  const overlay = document.getElementById('door-cutscene');
  const frameImg = document.getElementById('cutscene-frame-img');
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
    frameImg.src = renderCutsceneFrameDataURL(prefix, idx);
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
  state.player.x = startX;
  state.player.hidden = false;
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
      state.ghost.x = 920;
    }
  } else if (sceneNum === 4) {
    state.ghost.type = 'dancer';
    state.ghost.active = !state.flags.offeringsPlaced || !state.flags.photosRestored;
    state.ghost.x = 980;
    playSound('chime');
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
    state.ghost.x = 780;
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
  modal.classList.remove('hidden');
}

function closePhotoPuzzleModal() {
  document.getElementById('photo-modal').classList.add('hidden');
}

function placePhotoPiece(num) {
  if (!state.inventory.photos.includes(num)) {
    alert(`คุณยังไม่ได้เก็บเศษรูปภาพชิ้นที่ ${num} ในเรือนไทยครับ!`);
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
      { speaker: getPlayerName(), text: 'ตอนนี้รู้ความจริงแล้ว ถ้านำของเซ่นไหว้ไปวางครบ 3 ชิ้น ประตูหลังเรือนในฉากที่ 4 จะเปิดออกทันที!' }
    ]);
  } else {
    showPhotoPuzzleModal();
  }
  broadcastState();
}

// ----------------------- Controls & Actions -----------------------
function setMove(dir) {
  if (state.flags.cutscenePlaying || state.flags.gameOver) return;
  if (!document.getElementById('dialogue-box').classList.contains('hidden')) return;
  if (state.player.hidden && dir !== 0) {
    state.player.hidden = false; // stepping out of hiding
  }
  state.moveInput = dir;
  if (dir !== 0) state.player.dir = dir;
}

function triggerInteract() {
  if (state.flags.cutscenePlaying || state.flags.gameOver) return;
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
  const spot = getActiveHotspot();
  if (state.player.hidden) {
    state.player.hidden = false;
    playSound('step');
  } else if (spot && spot.isHidingSpot) {
    state.player.hidden = true;
    state.player.flashlight = false;
    state.moveInput = 0;
    playSound('step');
  } else {
    queueDialogue([
      { speaker: getPlayerName(), text: 'ต้องเดินไปยืนหน้า "ตู้ไม้สัก" หรือ "ตุ่มน้ำ" ก่อนครับ ถึงจะกดมุดซ่อนตัวได้!' }
    ]);
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
  const spots = getSceneHotspots(state.scene);
  return spots.find((s) => Math.abs(state.player.x - s.x) <= s.width / 2 + 24) || null;
}

function retryFromCheckpoint() {
  state.flags.gameOver = false;
  document.getElementById('gameover-modal').classList.add('hidden');
  document.getElementById('danger-overlay').classList.add('hidden');
  state.player.x = 180;
  state.player.hidden = false;
  state.ghost.x = 1020;
  state.ghost.stunTimer = 2.0;
  broadcastState();
}

function updateHud() {
  document.getElementById('hud-scene-title').textContent = SCENE_TITLES[state.scene] || '';
  document.getElementById('hud-offerings').textContent = `${state.inventory.offerings.length}/3`;
  document.getElementById('hud-photos').textContent = `${state.inventory.photos.length}/3`;
  document.getElementById('hud-offerings-placed').classList.toggle('hidden', !state.flags.offeringsPlaced);
  document.getElementById('hud-photos-placed').classList.toggle('hidden', !state.flags.photosRestored);
}

// Keyboard listeners
window.addEventListener('keydown', (e) => {
  if (state.role !== 'host' || !state.started) return;
  const k = e.key.toLowerCase();
  if (k === 'a' || e.key === 'ArrowLeft') setMove(-1);
  if (k === 'd' || e.key === 'ArrowRight') setMove(1);
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

  if (state.role === 'host' && state.started) {
    updateGame(dt);
    renderGame();
  }
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

function updateGame(dt) {
  if (state.flags.cutscenePlaying || state.flags.gameOver || state.flags.victory) return;

  const dialogueOpen = !document.getElementById('dialogue-box').classList.contains('hidden');

  // Player movement (8-frame walk cycle)
  if (!dialogueOpen && state.moveInput !== 0 && !state.player.hidden) {
    const speed = 230;
    state.player.x = Math.max(80, Math.min(1200, state.player.x + state.moveInput * speed * dt));
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
  if (spot && !dialogueOpen) {
    promptEl.innerHTML = `กด <strong>[E]</strong> : ${spot.label}`;
    promptEl.classList.remove('hidden');
  } else {
    promptEl.classList.add('hidden');
  }

  // Ghost AI (Scenes 3 & 4)
  if (state.ghost.active && !dialogueOpen) {
    if (state.ghost.stunTimer > 0) {
      state.ghost.stunTimer = Math.max(0, state.ghost.stunTimer - dt);
    } else {
      const dist = state.player.x - state.ghost.x;
      state.ghost.dir = dist >= 0 ? 1 : -1;

      // If player is hidden and flashlight off, ghost patrols away slowly
      let ghostSpeed = state.ghost.type === 'dancer' ? 115 : 95;
      if (state.player.sixthSense) ghostSpeed *= 1.35; // Sixth sense attracts ghost faster

      if (state.player.hidden && !state.player.flashlight) {
        // Patrol back and forth
        state.ghost.x += (Math.sin(performance.now() / 900) > 0 ? 1 : -1) * 65 * dt;
      } else {
        state.ghost.x += Math.sign(dist) * ghostSpeed * dt;
      }

      // Check capture collision
      const absDist = Math.abs(state.player.x - state.ghost.x);
      state.ghost.alertLevel = Math.max(8, Math.min(100, Math.round(100 - absDist / 9)));

      document.getElementById('danger-overlay').classList.toggle('hidden', absDist > 260 || state.player.hidden);

      if (absDist < 58 && !state.player.hidden) {
        triggerGameOver();
      }
    }

    state.ghost.animTimer += dt;
    if (state.ghost.animTimer >= 0.16) {
      state.ghost.animTimer = 0;
      state.ghost.frame = (state.ghost.frame + 1) % 8;
      if (state.ghost.frame === 0 && Math.random() < 0.45) {
        playSound(state.ghost.type === 'dancer' ? 'chime' : 'rustle');
      }
    }
  } else {
    state.ghost.alertLevel = 5;
    document.getElementById('danger-overlay').classList.add('hidden');
  }

  // Periodic sync to mobile P1/P2
  state.ambientTimer += dt;
  if (state.ambientTimer >= 0.12) {
    state.ambientTimer = 0;
    broadcastState();
  }
}

function triggerGameOver() {
  state.flags.gameOver = true;
  state.moveInput = 0;
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

function drawSpriteProportional(img, bottomCenterX, bottomY, targetHeight, flipX = false, extraFilter = null) {
  if (!img || !img.complete || !img.naturalHeight) return { w: 100, h: targetHeight };
  const aspect = img.naturalWidth / img.naturalHeight;
  const targetWidth = targetHeight * aspect;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
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

  if (bgImg && bgImg.complete) {
    ctx.drawImage(bgImg, 0, 0, 1280, 720);
  }

  // 2. Draw Interactive Props per Scene (with proportional scaling & floor shadows)
  drawSceneProps();

  // 3. Draw Ghost or NPC (8-frame animation!)
  if (state.scene === 3 && !state.flags.samphawesiTriggered) {
    drawGroundShadow(765, 608, 70, 14, 0.65);
    const idleIdx = Math.floor(performance.now() / 320) % 3;
    drawSpriteProportional(IMAGES[`samAnim${idleIdx}`] || IMAGES.sam0, 765, 610, 195, false);
  } else if (state.ghost.active && (state.scene === 3 || state.scene === 4)) {
    const gKey = state.ghost.type === 'dancer' ? `dancerAnim${state.ghost.frame}` : `samAnim${state.ghost.frame}`;
    const gImg = IMAGES[gKey] || IMAGES.dancer0;
    const bob = state.ghost.type === 'dancer' ? Math.sin(performance.now() / 190) * 8 : 0;
    const filter = state.ghost.stunTimer > 0 ? 'brightness(1.7) hue-rotate(120deg)' : null;
    drawGroundShadow(state.ghost.x, 610, 68, 14, 0.6);
    drawSpriteProportional(gImg, state.ghost.x, 612 + bob, 245, state.ghost.dir === 1, filter);
  } else if (state.scene === 5) {
    drawGroundShadow(835, 612, 52, 12, 0.5);
    drawSpriteProportional(IMAGES.uncle0, 835, 614, 240, false);
  }

  // 4. Draw Player (8-frame articulated walk cycle!)
  if (!state.player.hidden) {
    const prefix = state.character === 'female' ? 'femaleWalk' : 'maleWalk';
    const sprite = IMAGES[`${prefix}${state.player.frame}`] || IMAGES.male0;
    drawGroundShadow(state.player.x, 614, 48, 12, 0.65);
    drawSpriteProportional(sprite, state.player.x, 616, 238, state.player.dir === -1);
  } else {
    ctx.fillStyle = '#8cf5d9';
    ctx.font = 'bold 16px Sarabun';
    ctx.textAlign = 'center';
    ctx.fillText('🏺 [กำลังซ่อนตัว... กด Q หรือเดินเพื่อออก]', state.player.x, 340);
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

  const baseAlpha = state.player.sixthSense ? 0.48 : (state.scene === 1 ? 0.58 : 0.76);
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
    if (state.player.sixthSense || dist < 150) {
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
function renderP2RadarLoop() {
  if (state.role !== 'p2') return;
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
      const gx = (state.ghost.x / 1280) * 560 + 20;
      rctx.fillStyle = '#ff3b3b';
      rctx.beginPath();
      rctx.arc(gx, 170, 13 + Math.sin(performance.now() / 120) * 3, 0, Math.PI * 2);
      rctx.fill();
      rctx.fillStyle = '#fff';
      rctx.fillText(state.ghost.type === 'dancer' ? 'ผีนางรำ!' : 'สัมภเวสี!', gx - 22, 145);
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
