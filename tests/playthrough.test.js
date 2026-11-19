// Full playthrough smoke test: starts the local server, opens the game in headless Chrome
// and plays it from the title screen to the ending through the same functions the keys and
// phone buttons call (walk to a spot, interact, answer the ritual / lock / photo windows).
// It fails on any page error, on a step that does not move the story on, or if the ending
// never shows. A second test checks the booth staff panel (Ctrl+Shift+K).
//
// Needs Chrome or Edge on the machine; without one the tests are skipped, not failed.
// Set CHROME_PATH to point at a browser somewhere else.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');

function findBrowser() {
  const env = process.env;
  const candidates = [
    env.CHROME_PATH,
    env.ProgramFiles && path.join(env.ProgramFiles, 'Google/Chrome/Application/chrome.exe'),
    env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Google/Chrome/Application/chrome.exe'),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe'),
    env.ProgramFiles && path.join(env.ProgramFiles, 'Microsoft/Edge/Application/msedge.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

const BROWSER = findBrowser();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, { timeout = 10000, every = 100, what = 'condition' } = {}) {
  const until = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await sleep(every);
  }
}

function startServer() {
  const port = 40000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, ['local-server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), PUBLIC_TUNNEL: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const ready = new Promise((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (b) => {
      out += b;
      if (/running at/i.test(out)) resolve();
    });
    child.stderr.on('data', (b) => { out += b; });
    child.on('exit', (code) => reject(new Error(`server exited (${code}): ${out}`)));
  });
  return { port, child, ready };
}

// A tiny Chrome DevTools Protocol client over Node's built-in WebSocket.
async function launchBrowser() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'buu-playtest-'));
  const proc = spawn(BROWSER, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
    '--window-size=1280,800',
    'about:blank'
  ], { stdio: 'ignore' });
  const portFile = path.join(profile, 'DevToolsActivePort');
  const port = await waitFor(() => {
    try { return fs.readFileSync(portFile, 'utf8').split('\n')[0].trim() || null; } catch (_) { return null; }
  }, { timeout: 15000, what: 'Chrome to start' });
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method) {
      listeners.forEach((fn) => fn(msg));
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  // Evaluate in the page's global scope (the game's top-level `const state` etc. are visible).
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error(`page threw: ${(d.exception && d.exception.description) || d.text}`);
    }
    return r.result.value;
  };
  const close = async () => {
    try { await send('Browser.close'); } catch (_) {}
    try { ws.close(); } catch (_) {}
    await sleep(300);
    try { proc.kill(); } catch (_) {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {}
  };
  return { send, evaluate, on: (fn) => listeners.push(fn), close };
}

// Collect everything that would show up as a red error in the console.
function watchErrors(browser) {
  const errors = [];
  browser.on((msg) => {
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push(`exception: ${(d.exception && d.exception.description) || d.text}`);
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      const e = msg.params.entry;
      // browser "interventions" (e.g. vibrate() before anyone tapped the page) are notices, not bugs
      if (e.source !== 'intervention' && !/favicon/.test(e.url || '')) errors.push(`log: ${e.text} ${e.url || ''}`);
    }
  });
  return errors;
}

async function openGame(browser, port) {
  await browser.send('Runtime.enable');
  await browser.send('Log.enable');
  await browser.send('Page.enable');
  await browser.send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  await waitFor(() => browser.evaluate(`document.readyState === 'complete' && typeof state === 'object' && typeof startSoloGame === 'function'`),
    { timeout: 20000, what: 'the game page to load' });
}

// In-page helpers that play like a person: close whatever is in the way, then act.
const HELPERS = `
  window.__pt = {
    // read every line of the conversation on screen (first press completes the typing)
    drain() {
      let guard = 0;
      while (isDialogueOpen() && guard++ < 200) advanceDialogue();
      return !isDialogueOpen();
    },
    at(id) {
      const spot = getSceneHotspots(state.scene).find((s) => s.id === id);
      if (!spot) throw new Error('no hotspot ' + id + ' in scene ' + state.scene);
      state.player.x = spot.x;
      state.player.hidden = false;
      return spot;
    },
    use(id) {
      this.drain();
      this.at(id);
      triggerInteract();
      return true;
    },
    busy() {
      return state.flags.cutscenePlaying || isDialogueOpen();
    },
    snapshot() {
      return {
        scene: state.scene,
        offerings: [...state.inventory.offerings].sort(),
        photos: [...state.inventory.photos].sort(),
        placed: state.inventory.placedPhotos.length,
        offeringsPlaced: !!state.flags.offeringsPlaced,
        photosRestored: !!state.flags.photosRestored,
        victory: !!state.flags.victory,
        gameOver: !!state.flags.gameOver,
        ghostActive: !!state.ghost.active,
        cutscene: !!state.flags.cutscenePlaying,
        dialogue: isDialogueOpen(),
        photoModal: isPhotoModalOpen(),
        ritual: isRitualOpen(),
        lock: isLockOpen(),
        closeup: !document.getElementById('closeup').classList.contains('hidden'),
        intro: isStoryIntroOpen(),
        playerX: state.player.x,
        loopErrors: staff.errors
      };
    }
  };
  true;
`;

async function settle(browser, { timeout = 15000 } = {}) {
  // finish cutscenes and conversations, including the ones a callback opens next
  await waitFor(async () => {
    const s = await browser.evaluate(`(() => {
      if (isChoiceOpen()) { choicePick(window.__ptAnswer || 0); return false; }
      if (state.flags.cutscenePlaying) { skipCutscene(); return false; }
      if (isDialogueOpen()) { __pt.drain(); return false; }
      return true;
    })()`);
    return s;
  }, { timeout, every: 150, what: 'cutscenes and dialogue to finish' });
  await sleep(120);
  // a callback may have opened one more right after the last check
  const again = await browser.evaluate(`state.flags.cutscenePlaying || isDialogueOpen()`);
  if (again) await settle(browser, { timeout });
}

const snap = (browser) => browser.evaluate('__pt.snapshot()');

test('a full solo playthrough reaches the ending without errors', { skip: !BROWSER && 'no Chrome/Edge found', timeout: 180000 }, async (t) => {
  const server = startServer();
  t.after(() => server.child.kill());
  await server.ready;
  const browser = await launchBrowser();
  t.after(() => browser.close());
  const errors = watchErrors(browser);

  await openGame(browser, server.port);
  await browser.evaluate(HELPERS);
  // nobody can be caught: this test is about the story, not about dodging the ghost
  await browser.evaluate('CONFIG.CATCH_DIST = -1; true');

  // Title -> prologue -> scene 1
  await browser.evaluate(`selectCharacter('female'); startSoloGame(); true`);
  await waitFor(() => browser.evaluate('isStoryIntroOpen()'), { what: 'the prologue to start' });
  await browser.evaluate('window.skipStoryIntro(); true');
  let s = await snap(browser);
  assert.equal(s.intro, false, 'prologue closes on skip');
  assert.equal(s.scene, 1);

  // Scene 1: the forest; the wet flyer in the grass opens its close-up, then the door leads in
  await browser.evaluate(`__pt.use('forest_sign')`);
  await settle(browser);
  await browser.evaluate(`__pt.use('buu_flyer')`);
  s = await snap(browser);
  assert.equal(s.closeup, true, 'the flyer opens as a close-up');
  await settle(browser);
  s = await snap(browser);
  assert.equal(s.closeup, false, 'the close-up closes again');
  // the secret lantern at the far left: ดร.ประจิต
  await browser.evaluate(`__pt.use('prajit')`);
  s = await snap(browser);
  assert.equal(s.closeup, true, 'the lantern opens the close-up of ดร.ประจิต');
  await settle(browser);
  assert.equal(await browser.evaluate(`state.flags.prajitMet && bellCooldownSecs() < CONFIG.BELL_COOLDOWN && !getSceneHotspots(1).some((h) => h.id === 'prajit')`), true, 'meeting him speeds up the bell and he is gone');
  await browser.evaluate(`__pt.use('mansion_front_door')`);
  await settle(browser);
  s = await snap(browser);
  assert.equal(s.scene, 2, 'the front door leads into the house');

  // Scene 2: photo piece 1 in the cabinet, the garland on the table
  await browser.evaluate(`__pt.use('dust_floor')`);
  await settle(browser);
  await browser.evaluate(`__pt.use('lore_page_2')`);
  await settle(browser);
  await browser.evaluate(`__pt.use('hiding_cabinet_2')`);
  await settle(browser);
  await browser.evaluate(`__pt.use('table_offering_1')`);
  await settle(browser);
  s = await snap(browser);
  assert.deepEqual(s.photos, [1]);
  assert.deepEqual(s.offerings, ['garland']);
  // the portrait wall opens the photo window; one piece goes in
  await browser.evaluate(`__pt.use('portrait_wall')`);
  await settle(browser);
  s = await snap(browser);
  assert.equal(s.photoModal, true, 'portrait wall opens the photo window');
  await browser.evaluate('placeNextPhotoPiece(); closePhotoPuzzleModal(); true');
  await browser.evaluate(`__pt.use('door_to_scene3')`);
  await settle(browser);
  s = await snap(browser);
  assert.equal(s.scene, 3);

  // Scene 3: the samphawesi wakes up, the incense under the house, photo piece 2
  await browser.evaluate(`__pt.use('lore_page_3')`);
  await settle(browser);
  await browser.evaluate(`__pt.use('samphawesi_offering_spot')`);
  await settle(browser);
  s = await snap(browser);
  assert.equal(s.ghostActive, true, 'the samphawesi hunts after its cutscene');
  await browser.evaluate(`__pt.use('trapdoor_3')`);
  await settle(browser);
  assert.equal(await browser.evaluate('under.active && !!state.flags.inUnder && state.scene === 3'), true, 'the trapdoor leads under the house');
  await browser.evaluate(`under.sam.x = 80; under.sam.mode = 'leave'; state.ghost.stunTimer = 60; __pt.use('under_shrine')`); // he is busy at the far end
  await settle(browser);
  assert.equal(await browser.evaluate(`state.inventory.offerings.includes('incense')`), true, 'the incense lies on the little shrine');
  await browser.evaluate(`__pt.use('under_ladder')`);
  await settle(browser);
  assert.equal(await browser.evaluate('!under.active && !state.flags.inUnder && state.scene === 3'), true, 'the ladder leads back up');
  await browser.evaluate(`__pt.use('photo_piece_2_spot')`);
  await settle(browser);
  await browser.evaluate(`__pt.use('door_to_scene4')`);
  await settle(browser);
  s = await snap(browser);
  assert.equal(s.scene, 4);
  assert.deepEqual(s.offerings, ['garland', 'incense']);
  assert.deepEqual(s.photos, [1, 2]);
  assert.equal(s.ghostActive, true, 'the dancer is waiting in scene 4');

  // Scene 4: read the code, open the locked cabinet (dessert), photo 3 at the altar
  await browser.evaluate(`__pt.use('yantra_code')`);
  await settle(browser);
  await browser.evaluate(`__pt.use('lore_page_4')`);
  await settle(browser);
  assert.equal(await browser.evaluate('loreFound()'), 3, 'all three diary pages were read');
  await browser.evaluate(`__pt.use('hiding_cabinet_4')`);
  s = await snap(browser);
  assert.equal(s.lock, true, 'the cabinet is locked first');
  await browser.evaluate('lockPress(9); lockPress(9); lockPress(9); lockPress(9); true');
  await sleep(400);
  // wrong code (unless it happens to be 9999) leaves it locked; then the real one
  await browser.evaluate(`(() => {
    if (state.flags.cabinetUnlocked) return true;
    if (!isLockOpen()) openLock();
    state.lockInput = [];
    state.lockCode.forEach((d) => lockPress(d));
    return true;
  })()`);
  await waitFor(() => browser.evaluate('!isLockOpen()'), { what: 'the lock to open' });
  await settle(browser);
  s = await snap(browser);
  assert.deepEqual(s.offerings, ['dessert', 'garland', 'incense'], 'the dessert tray was behind the lock');

  await browser.evaluate(`__pt.use('shrine_altar_spot')`); // photo 3 under the altar
  await settle(browser);
  await sleep(1300); // its blackout
  await browser.evaluate(`__pt.use('shrine_altar_spot')`); // the offering ritual
  s = await snap(browser);
  assert.equal(s.ritual, true, 'the altar opens the ritual');
  // wrong order first: it must reset, not complete
  await browser.evaluate(`offerItem('dessert'); true`);
  s = await snap(browser);
  assert.equal(s.offeringsPlaced, false, 'a wrong order does not finish the ritual');
  assert.equal(s.ritual, false, 'a wrong order snuffs the candles and closes the ritual');
  await sleep(1600); // the blackout and the dancer's flash
  await browser.evaluate(`__pt.use('shrine_altar_spot')`);
  s = await snap(browser);
  assert.equal(s.ritual, true, 'the altar reopens the ritual');
  await browser.evaluate(`offerItem('incense'); offerItem('garland'); offerItem('dessert'); true`);
  s = await snap(browser);
  assert.equal(s.offeringsPlaced, true, 'the right order finishes the ritual');
  // the photo window follows the ritual's conversation
  await browser.evaluate('__pt.drain(); true');
  await waitFor(() => browser.evaluate('isPhotoModalOpen()'), { what: 'the photo window after the ritual' });
  await browser.evaluate('placeNextPhotoPiece(); placeNextPhotoPiece(); placeNextPhotoPiece(); true');
  await settle(browser);
  s = await snap(browser);
  assert.equal(s.photosRestored, true);
  assert.equal(s.ghostActive, true, 'the dancer stays until her song is finished');
  await browser.evaluate(`__pt.use('back_exit_door')`);
  await settle(browser);
  s = await snap(browser);
  assert.equal(s.scene, 4, 'the back door stays shut until the ranat has been played');

  // The ranat: listen to each phrase, play it back (one wrong note first)
  await browser.evaluate(`__pt.use('ranat_ek')`);
  await settle(browser);
  await waitFor(() => browser.evaluate(`isRanatOpen() && ranat.phase === 'input'`), { what: 'the first phrase to finish playing' });
  await browser.evaluate(`ranatPress(((ranat.seq[0] + 1) % 5) + 1); true`);
  assert.equal(await browser.evaluate('ranat.miss'), 1, 'a wrong note counts as a miss');
  assert.equal(await browser.evaluate('isRanatOpen()'), true, 'one wrong note does not close the ranat');
  for (let round = 0; round < 3; round++) {
    await waitFor(() => browser.evaluate(`ranat.phase === 'input' && ranat.round === ${round}`), { what: `phrase ${round + 1} to finish playing` });
    await browser.evaluate(`ranat.seq.slice(0, RANAT.rounds[ranat.round]).forEach((n) => ranatPress(n + 1)); true`);
  }
  await waitFor(() => browser.evaluate('!!state.flags.songPlayed'), { what: 'the song to be finished' });
  await settle(browser);
  s = await snap(browser);
  assert.equal(s.ghostActive, false, 'the dancer leaves once the offerings, the photo and her song are done');

  // The spirit bridge: run, tear free from the hands, stand still while the blind one listens
  await browser.evaluate(`__pt.use('back_exit_door')`);
  await settle(browser);
  s = await snap(browser);
  assert.equal(s.scene, 5, 'the back door opens onto the spirit bridge');
  assert.equal(await browser.evaluate('chase.active'), true, 'the run across the bridge starts');
  await browser.evaluate('CONFIG.PLAYER_SPEED = 1300; true'); // a person takes ~40 s; the test hurries
  await waitFor(() => browser.evaluate(`(() => {
    if (state.flags.gameOver) throw new Error('caught on the bridge (' + chase.cause + ')');
    if (!chase.active) return true;
    if (isDialogueOpen()) { __pt.drain(); return false; }
    if (mash.active) { for (let i = 0; i < 20 && mash.active; i++) mashPress(); return false; }
    setMove(chase.listen ? 0 : 1);
    return false;
  })()`), { timeout: 40000, every: 40, what: 'the far end of the bridge' });
  await browser.evaluate('CONFIG.PLAYER_SPEED = 230; setMove(0); true');
  assert.equal(await browser.evaluate('chase.next'), 6, 'every obstacle on the bridge was met');
  await settle(browser);
  s = await snap(browser);
  assert.equal(await browser.evaluate('!!state.flags.escaped'), true, 'the bridge ends in the dawn');

  // Scene 5: the uncle, the closing cutscene, the ending screen
  await browser.evaluate(`__pt.use('uncle_raj_pattern')`);
  await settle(browser, { timeout: 30000 });
  await waitFor(() => browser.evaluate('state.flags.victory'), { timeout: 20000, what: 'the ending' });
  const ending = await browser.evaluate(`!document.getElementById('ending-modal').classList.contains('hidden')`);
  assert.equal(ending, true, 'the ending screen is on show');
  const endBg = await browser.evaluate(`document.getElementById('ending-bg').getAttribute('src')`);
  assert.match(endBg, /ending_true/, 'with all three diary pages the end screen shows the house at peace');
  assert.match(await browser.evaluate(`document.getElementById('ending-stats').textContent`), /ดร.ประจิต/, 'the end screen has his badge');
  assert.equal(await browser.evaluate('!!state.flags.promiseBroken'), false, 'the playthrough keeps the promise');
  assert.match(await browser.evaluate(`document.querySelector('#ending-modal .ending-kicker').textContent`), /รอดพ้น/);
  assert.equal(await browser.evaluate('night2Unlocked()'), true, 'finishing unlocks the second night');

  // let a few frames render the ending, then look for any error on the way
  await sleep(500);
  s = await snap(browser);
  assert.equal(s.loopErrors, 0, 'no frame of the game loop failed');
  assert.deepEqual(errors, [], 'no errors in the page console');
});

test('the booth staff panel opens with Ctrl+Shift+K, skips a room and resets', { skip: !BROWSER && 'no Chrome/Edge found', timeout: 90000 }, async (t) => {
  const server = startServer();
  t.after(() => server.child.kill());
  await server.ready;
  const browser = await launchBrowser();
  t.after(() => browser.close());
  const errors = watchErrors(browser);

  await openGame(browser, server.port);
  await browser.evaluate(HELPERS);
  const key = async (k, code, modifiers = 0) => {
    const base = { key: k, code, modifiers, windowsVirtualKeyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : 27 };
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  };
  const CTRL_SHIFT = 2 | 8;
  const panelOpen = () => browser.evaluate(`!document.getElementById('staff-modal').classList.contains('hidden')`);

  // on the title screen
  await key('K', 'KeyK', CTRL_SHIFT);
  assert.equal(await panelOpen(), true, 'Ctrl+Shift+K opens the panel on the title screen');
  const rows = await browser.evaluate(`document.getElementById('staff-status').textContent`);
  assert.match(rows, /หน้าแรก/);
  await key('Escape', 'Escape');
  assert.equal(await panelOpen(), false, 'Esc closes it');

  // in a game: the panel pauses, and 2 carries the player into the next room
  await browser.evaluate(`startSoloGame(); true`);
  await waitFor(() => browser.evaluate('isStoryIntroOpen()'), { what: 'the prologue' });
  await key('K', 'KeyK', CTRL_SHIFT);
  assert.equal(await panelOpen(), true);
  assert.equal(await browser.evaluate('isPaused()'), true, 'the game is paused while the panel is open');
  assert.equal(await browser.evaluate('isStoryIntroOpen()'), true, 'the shortcut did not reach the prologue');
  await key('2', 'Digit2');
  let s = await snap(browser);
  assert.equal(await panelOpen(), false, 'the panel closes after the skip');
  assert.equal(s.intro, false, 'the prologue was closed');
  assert.equal(s.scene, 2, 'scene 1 -> 2');

  for (const want of [3, 4, 5]) {
    await key('K', 'KeyK', CTRL_SHIFT);
    await key('2', 'Digit2');
    s = await snap(browser);
    assert.equal(s.scene, want, `skip to scene ${want}`);
  }
  assert.deepEqual(s.offerings, ['dessert', 'garland', 'incense']);
  assert.equal(s.photosRestored, true);
  assert.equal(s.ghostActive, false);
  await settle(browser);
  // the ending still plays normally after a skip
  await browser.evaluate(`__pt.use('uncle_raj_pattern')`);
  await settle(browser, { timeout: 30000 });
  await waitFor(() => browser.evaluate('state.flags.victory'), { timeout: 20000, what: 'the ending after skipping' });

  // 1 resets for the next visitor: back to the title with no save
  await key('K', 'KeyK', CTRL_SHIFT);
  await key('1', 'Digit1');
  await waitFor(() => browser.evaluate(`document.readyState === 'complete' && typeof state === 'object' && state.started === false && document.getElementById('title-screen').classList.contains('active')`),
    { timeout: 20000, what: 'the title screen after reset' });
  const save = await browser.evaluate(`sessionStorage.getItem('buu-horror-checkpoint-v1')`);
  assert.equal(save, null, 'the save was cleared');

  assert.deepEqual(errors, [], 'no errors in the page console');
});

test('a ghost grab can be fought off once, and the bridge teaches its rules', { skip: !BROWSER && 'no Chrome/Edge found', timeout: 90000 }, async (t) => {
  const server = startServer();
  t.after(() => server.child.kill());
  await server.ready;
  const browser = await launchBrowser();
  t.after(() => browser.close());
  const errors = watchErrors(browser);

  await openGame(browser, server.port);
  await browser.evaluate(HELPERS);
  await browser.evaluate(`startSoloGame(); true`);
  await waitFor(() => browser.evaluate('isStoryIntroOpen()'), { what: 'the prologue' });
  await browser.evaluate(`window.skipStoryIntro(); grantProgressUpTo(4); enterScene(4, 400); true`);
  await settle(browser);

  // the dancer reaches the player: first a struggle, not a game over
  const grab = `state.ghost.stunTimer = 0; state.ghost.alpha = 1; state.unhideGrace = 0; state.player.flashlight = false; state.ghost.x = state.player.x + 30; true`;
  await browser.evaluate(grab);
  await waitFor(() => browser.evaluate('mash.active'), { what: 'the struggle to start' });
  assert.equal(await browser.evaluate('state.flags.gameOver'), false, 'the first grab is not a game over');
  await browser.evaluate('for (let i = 0; i < STRUGGLE.need; i++) triggerInteract(); true');
  assert.equal(await browser.evaluate('mash.active'), false, 'mashing ends the struggle');
  assert.equal(await browser.evaluate('state.flags.gameOver'), false, 'and the player is free');
  assert.equal(await browser.evaluate('state.ghost.stunTimer > 0'), true, 'the ghost reels for a moment');
  // the second grab in the same room is final
  await browser.evaluate(grab);
  await waitFor(() => browser.evaluate('state.flags.gameOver'), { what: 'the second grab to be a game over' });
  await browser.evaluate('retryFromCheckpoint(); true');
  assert.equal(await browser.evaluate('state.struggleLeft'), 1, 'a new life gets a new chance');

  // not mashing: the grip holds and the ghost wins
  await browser.evaluate(grab);
  await waitFor(() => browser.evaluate('mash.active'), { what: 'the struggle after a retry' });
  await waitFor(() => browser.evaluate('state.flags.gameOver'), { timeout: 8000, what: 'the grip to win when nobody mashes' });
  await browser.evaluate('retryFromCheckpoint(); true');

  // the P1 phone plays the ranat through its number pad (the same input as the cabinet lock)
  await browser.evaluate('state.ghost.stunTimer = 60; state.flags.ranatSeen = true; openRanat(); true');
  await waitFor(() => browser.evaluate("ranat.phase === 'input'"), { what: 'the ranat to wait for the player' });
  assert.equal(await browser.evaluate('hostContext()'), 'lock', 'the phone shows its number pad for the ranat');
  await browser.evaluate("handleIncomingRemoteInput({ action: 'digit', value: ranat.seq[0] + 1 }); true");
  assert.equal(await browser.evaluate('ranat.pos'), 1, 'a digit from the phone strikes a bar');
  await browser.evaluate("handleIncomingRemoteInput({ action: 'digit', value: -1 }); true");
  assert.equal(await browser.evaluate('ranat.phase'), 'demo', 'backspace on the phone replays the phrase');
  await browser.evaluate('closeRanat(); true');

  // the bridge: standing still lets the dark catch up
  await browser.evaluate(`state.flags.offeringsPlaced = state.flags.photosRestored = state.flags.songPlayed = true; state.flags.escaped = false; enterScene(5, 220); true`);
  await settle(browser);
  assert.equal(await browser.evaluate('chase.active'), true);
  await waitFor(() => browser.evaluate(`(() => { if (isDialogueOpen()) __pt.drain(); return state.flags.gameOver; })()`), { timeout: 12000, what: 'the dark to catch a player who stands still' });
  assert.match(await browser.evaluate(`document.getElementById('gameover-ghost').textContent`), /ความมืด/);
  await browser.evaluate('retryFromCheckpoint(); true');
  assert.equal(await browser.evaluate('chase.active && !state.flags.gameOver'), true, 'a retry puts the player back on the bridge');

  // walking on while the blind one listens is the other way to lose
  await browser.evaluate('chase.next = 1; chase.dist = CHASE.EVENTS[1].at - 40; chase.wall = chase.dist - 400; setMove(1); true');
  await waitFor(() => browser.evaluate(`(() => { if (!state.flags.gameOver) setMove(1); return state.flags.gameOver; })()`), { timeout: 8000, what: 'being heard' });
  assert.equal(await browser.evaluate('chase.cause'), 'listen');
  await browser.evaluate('retryFromCheckpoint(); true');
  assert.equal(await browser.evaluate('chase.dist'), 790, 'the retry starts just past the last obstacle cleared');

  // the staff skip carries the player across
  assert.equal(await browser.evaluate('staffSkipScene()'), true);
  assert.equal(await browser.evaluate('!chase.active && !!state.flags.escaped && state.scene === 5'), true);
  await sleep(300);
  const s = await snap(browser);
  assert.equal(s.loopErrors, 0, 'no frame of the game loop failed');
  assert.deepEqual(errors, [], 'no errors in the page console');
});

// ---- two players: the main screen plus two phones (each its own headless Chrome) ----
async function openPhone(port, code, role) {
  const phone = await launchBrowser();
  const errors = watchErrors(phone);
  await phone.send('Runtime.enable');
  await phone.send('Log.enable');
  await phone.send('Page.enable');
  await phone.send('Page.navigate', { url: `http://127.0.0.1:${port}/?room=${code}&role=${role}` });
  await waitFor(() => phone.evaluate(`typeof state === 'object' && state.role === '${role}' && !!net.playerToken`),
    { timeout: 20000, what: `the ${role} phone to join` });
  return { phone, errors };
}

test('co-op: the phones play the ranat and the bridge together with the main screen', { skip: !BROWSER && 'no Chrome/Edge found', timeout: 150000 }, async (t) => {
  const server = startServer();
  t.after(() => server.child.kill());
  await server.ready;
  const host = await launchBrowser();
  t.after(() => host.close());
  const hostErrors = watchErrors(host);
  await openGame(host, server.port);
  await host.evaluate(HELPERS);

  await host.evaluate('openCoopLobby().then(() => true)');
  const code = await waitFor(() => host.evaluate('state.roomCode'), { what: 'a room code' });
  const p1 = await openPhone(server.port, code, 'p1');
  t.after(() => p1.phone.close());
  const p2 = await openPhone(server.port, code, 'p2');
  t.after(() => p2.phone.close());
  await waitFor(() => host.evaluate('!!(net.players && net.players.p1 && net.players.p2)'), { timeout: 10000, what: 'the lobby to see both phones' });

  await host.evaluate('startFromLobby(); true');
  await waitFor(() => host.evaluate('isStoryIntroOpen()'), { what: 'the prologue' });
  // under the house: P2 sees the one walking on the floor above P1
  await host.evaluate(`window.skipStoryIntro(); grantProgressUpTo(3); state.flags.samphawesiTriggered = true; enterScene(3, 460); true`);
  await settle(host);
  await host.evaluate('startUnder(); true');
  await settle(host);
  await waitFor(() => p2.phone.evaluate(`/ใต้ถุนเรือน/.test(document.getElementById('p2-clue-text').textContent)`), { timeout: 8000, what: 'P2 to switch to the under-house view' });
  await host.evaluate(`under.sam.x = state.player.x; under.sam.mode = 'walk'; under.sam.lastListen = 0; state.ghost.stunTimer = 0; true`);
  await waitFor(() => p2.phone.evaluate(`state.remoteGoal.underState === 'listen'`), { timeout: 8000, what: 'P2 to see him listening above P1' });
  await waitFor(() => p1.phone.evaluate(`document.getElementById('p1-btn-interact').textContent.includes('หยุดนิ่ง')`), { timeout: 8000, what: 'the P1 button to say freeze' });
  await host.evaluate('state.ghost.stunTimer = 60; grantProgressUpTo(4); enterScene(4, 400); true');
  await settle(host);
  await host.evaluate('state.ghost.stunTimer = 120; true');

  // ranat: P2 hears the phrase, P1 strikes it on the phone's number pad
  await host.evaluate('state.flags.ranatSeen = true; openRanat(); true');
  const phrase = await host.evaluate(`ranat.seq.slice(0, RANAT.rounds[ranat.round]).map((n) => THAI_DIGITS[n + 1]).join(' · ')`);
  await waitFor(() => p2.phone.evaluate(`document.getElementById('p2-clue-text').textContent`).then((s) => s.includes(phrase)),
    { timeout: 8000, what: 'P2 to see the ranat phrase' });
  assert.equal(await p2.phone.evaluate(`document.getElementById('p2-clue-text').textContent.includes('รหัสตู้')`), false, 'P2 is not shown the cabinet code while the ranat is open');
  await waitFor(() => host.evaluate("ranat.phase === 'input'"), { what: 'the ranat to wait for the player' });
  await waitFor(() => p1.phone.evaluate(`!document.getElementById('p1-lock').classList.contains('hidden')`), { timeout: 8000, what: 'the P1 number pad' });
  const first = await host.evaluate('ranat.seq[0] + 1');
  await p1.phone.evaluate(`[...document.querySelectorAll('#p1-lock .keypad button')].find((b) => b.getAttribute('onclick') === "sendRemoteInput('digit', ${first})").click(); true`);
  await waitFor(() => host.evaluate('ranat.pos === 1'), { timeout: 5000, what: 'the P1 phone to strike the right bar' });
  await host.evaluate('closeRanat(); true');

  // bridge: P2's radar switches to the bridge, P1 runs from the phone, P2 rings the bell
  await host.evaluate(`state.flags.offeringsPlaced = state.flags.photosRestored = state.flags.songPlayed = true; state.flags.escaped = false; enterScene(5, 220); true`);
  await settle(host);
  assert.equal(await host.evaluate('chase.active'), true);
  await waitFor(() => p2.phone.evaluate(`state.scene === 5 && /สะพานข้ามภพ/.test(document.getElementById('p2-clue-text').textContent)`),
    { timeout: 8000, what: 'P2 to switch to the bridge radar' });
  const before = await host.evaluate('chase.dist');
  await p1.phone.evaluate('startRemoteMove(1); true');
  await waitFor(() => host.evaluate(`(() => { if (isDialogueOpen()) __pt.drain(); return chase.dist > ${before} + 60; })()`), { timeout: 8000, what: 'the P1 phone to run the player along the bridge' });
  await p1.phone.evaluate('stopRemoteMove(); true');
  await waitFor(() => p2.phone.evaluate(`(state.remoteGoal.bridgePct || 0) > 0 && state.remoteGoal.bridgeState !== ''`), { timeout: 8000, what: 'P2 to see P1 on the bridge' });

  await host.evaluate('state.bellCooldown = 0; state.ghost.stunTimer = 0; broadcastState(); true');
  await waitFor(() => p2.phone.evaluate(`!document.getElementById('btn-stun-ghost').disabled`), { timeout: 8000, what: 'the P2 bell to be ready' });
  await p2.phone.evaluate(`document.getElementById('btn-stun-ghost').click(); true`);
  await waitFor(() => host.evaluate('state.ghost.stunTimer > 0'), { timeout: 5000, what: 'the P2 bell to hold back the dark' });

  // across the bridge: P2's radar goes back to the house view
  assert.equal(await host.evaluate('staffSkipScene()'), true);
  await waitFor(() => p2.phone.evaluate(`!!state.flags.escaped && !/สะพานข้ามภพ/.test(document.getElementById('p2-clue-text').textContent)`),
    { timeout: 8000, what: 'P2 to leave the bridge view' });

  // the promise at the gate: the P1 phone moves the highlight and answers
  await settle(host);
  await host.evaluate(`__pt.use('uncle_raj_pattern')`);
  await waitFor(() => host.evaluate(`(() => { if (isDialogueOpen()) __pt.drain(); return isChoiceOpen(); })()`), { timeout: 10000, what: 'the promise question' });
  await waitFor(() => p1.phone.evaluate(`document.getElementById('p1-btn-interact').textContent.includes('สัญญา')`), { timeout: 8000, what: 'the P1 button to offer the promise' });
  await p1.phone.evaluate('startRemoteMove(1); true');
  await sleep(500); // held: repeats every 150 ms, but only the first press moves the highlight
  await p1.phone.evaluate('stopRemoteMove(); true');
  await waitFor(() => host.evaluate('choice.idx === 1'), { timeout: 5000, what: 'the P1 phone to pick the second answer' });
  await waitFor(() => p1.phone.evaluate(`document.getElementById('p1-btn-interact').textContent.includes('ไม่รับปาก')`), { timeout: 8000, what: 'the P1 button to follow' });
  await p1.phone.evaluate(`document.getElementById('p1-btn-interact').click(); true`);
  await waitFor(() => host.evaluate('!isChoiceOpen() && !!state.flags.promiseBroken'), { timeout: 5000, what: 'the P1 phone to answer' });

  await sleep(300);
  assert.equal(await host.evaluate('staff.errors'), 0, 'no frame of the game loop failed');
  assert.deepEqual(hostErrors, [], 'no errors on the main screen');
  assert.deepEqual(p1.errors, [], 'no errors on the P1 phone');
  assert.deepEqual(p2.errors, [], 'no errors on the P2 phone');
});

test('refusing the promise ends in the hospital at night, and the second night is harder', { skip: !BROWSER && 'no Chrome/Edge found', timeout: 120000 }, async (t) => {
  const server = startServer();
  t.after(() => server.child.kill());
  await server.ready;
  const browser = await launchBrowser();
  t.after(() => browser.close());
  const errors = watchErrors(browser);

  await openGame(browser, server.port);
  await browser.evaluate(HELPERS);
  assert.equal(await browser.evaluate(`document.getElementById('btn-night2').classList.contains('hidden')`), true, 'no second night before anyone has finished');
  await browser.evaluate(`startSoloGame(); true`);
  await waitFor(() => browser.evaluate('isStoryIntroOpen()'), { what: 'the prologue' });
  await browser.evaluate(`window.skipStoryIntro(); grantProgressUpTo(5); state.flags.offeringsPlaced = state.flags.photosRestored = state.flags.songPlayed = state.flags.escaped = true; enterScene(5, 600); true`);
  await settle(browser);

  // the uncle asks; the keyboard picks the second answer
  await browser.evaluate(`__pt.use('uncle_raj_pattern')`);
  await waitFor(() => browser.evaluate(`(() => { if (isDialogueOpen()) __pt.drain(); return isChoiceOpen(); })()`), { timeout: 10000, what: 'the promise question' });
  assert.equal(await browser.evaluate('hostContext()'), 'choice');
  assert.equal(await browser.evaluate('isWorldFrozen()'), true, 'nothing moves while the question is up');
  const press = (key) => browser.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', bubbles: true })); true`);
  await press('ArrowRight');
  assert.equal(await browser.evaluate('choice.idx'), 1);
  await press('e');
  assert.equal(await browser.evaluate('!isChoiceOpen() && !!state.flags.promiseBroken'), true, 'E answers with the highlighted choice');

  await settle(browser, { timeout: 30000 });
  await waitFor(() => browser.evaluate('state.flags.victory'), { timeout: 20000, what: 'the broken-promise ending' });
  assert.match(await browser.evaluate(`document.querySelector('#ending-modal .ending-kicker').textContent`), /ผิดสัญญา/);
  assert.equal(await browser.evaluate(`document.getElementById('ending-bg').classList.contains('night')`), true, 'the end screen is the hospital at night');
  assert.match(await browser.evaluate(`document.getElementById('ending-stats').textContent`), /ยังมีอีกตอนจบ/);
  assert.equal(await browser.evaluate('night2Unlocked()'), true);
  assert.deepEqual(errors, [], 'no errors in the first night');

  // the second night: from the title, no prologue, harder rules
  await browser.evaluate('restartGame(); true');
  await waitFor(() => browser.evaluate(`document.readyState === 'complete' && typeof state === 'object' && state.started === false && typeof startSecondNight === 'function'`),
    { timeout: 20000, what: 'the title screen' });
  await browser.evaluate(HELPERS);
  assert.equal(await browser.evaluate(`document.getElementById('btn-night2').classList.contains('hidden')`), false, 'the title offers the second night');
  await browser.evaluate(`document.getElementById('btn-night2').click(); true`);
  await waitFor(() => browser.evaluate('state.started && isDialogueOpen()'), { what: 'the second night to start' });
  assert.equal(await browser.evaluate('isStoryIntroOpen()'), false, 'the prologue is skipped');
  assert.equal(await browser.evaluate('isNight2() && state.scene === 1'), true);
  assert.equal(await browser.evaluate('nightGhostSpeed() > 1 && bellCooldownSecs() > CONFIG.BELL_COOLDOWN && nightWall() > 1'), true, 'the ghosts, the bell and the bridge are harder');
  await settle(browser);
  await browser.evaluate(`saveCheckpoint(); true`);
  assert.equal(await browser.evaluate(`JSON.parse(sessionStorage.getItem('buu-horror-checkpoint-v1')).flags.night2`), true, 'a checkpoint keeps the second night');

  await sleep(300);
  assert.equal(await browser.evaluate('staff.errors'), 0, 'no frame of the game loop failed');
  assert.deepEqual(errors, [], 'no errors in the page console');
});

test('under the house: standing still while he listens is safe, walking gets you heard', { skip: !BROWSER && 'no Chrome/Edge found', timeout: 90000 }, async (t) => {
  const server = startServer();
  t.after(() => server.child.kill());
  await server.ready;
  const browser = await launchBrowser();
  t.after(() => browser.close());
  const errors = watchErrors(browser);

  await openGame(browser, server.port);
  await browser.evaluate(HELPERS);
  await browser.evaluate(`startSoloGame(); true`);
  await waitFor(() => browser.evaluate('isStoryIntroOpen()'), { what: 'the prologue' });
  await browser.evaluate(`window.skipStoryIntro(); grantProgressUpTo(3); state.flags.samphawesiTriggered = true; enterScene(3, 300); true`);
  await settle(browser);
  assert.equal(await browser.evaluate(`currentObjective().target`), 'trapdoor_3', 'room 3 points at the trapdoor for the incense');
  await browser.evaluate(`__pt.use('trapdoor_3')`);
  await settle(browser);
  assert.equal(await browser.evaluate('under.active'), true);
  assert.equal(await browser.evaluate(`document.getElementById('hud-scene-title').textContent`), 'ฉากที่ 3: ใต้ถุนเรือน');

  // he stops right above: holding still lets him walk on
  const listenAbove = `under.sam.x = state.player.x + 20; under.sam.mode = 'walk'; under.sam.lastListen = 0; state.ghost.stunTimer = 0; true`;
  await browser.evaluate(listenAbove);
  await waitFor(() => browser.evaluate(`under.sam.mode === 'listen'`), { timeout: 3000, what: 'him to stop and listen' });
  assert.match(await browser.evaluate('underPrompt()'), /หยุดนิ่ง/, 'the prompt (and the P1 phone) says to freeze');
  await waitFor(() => browser.evaluate(`under.sam.mode === 'leave'`), { timeout: 4000, what: 'him to walk on' });
  assert.equal(await browser.evaluate('state.flags.gameOver'), false, 'standing still is safe');

  // walking while he listens above: heard
  await browser.evaluate(listenAbove);
  await waitFor(() => browser.evaluate(`under.sam.mode === 'listen'`), { timeout: 3000, what: 'him to listen again' });
  await sleep(600); // past the grace (UNDER.GRACE_MS = 450)
  await waitFor(() => browser.evaluate(`(() => { if (!state.flags.gameOver) setMove(1); return state.flags.gameOver; })()`), { timeout: 4000, what: 'being heard' });
  assert.match(await browser.evaluate(`document.getElementById('gameover-ghost').textContent`), /ใต้ถุน/);
  await browser.evaluate('setMove(0); retryFromCheckpoint(); true');
  assert.equal(await browser.evaluate('under.active && state.player.x === UNDER.LADDER_X + 40'), true, 'a retry starts at the foot of the ladder');

  // the bell sends him away
  await browser.evaluate(`state.bellCooldown = 0; ${listenAbove}`);
  await waitFor(() => browser.evaluate(`under.sam.mode === 'listen'`), { timeout: 3000, what: 'him to listen' });
  assert.equal(await browser.evaluate(`useBell('P2')`), true);
  assert.equal(await browser.evaluate(`under.sam.mode`), 'leave', 'the bell drives him off');

  // a checkpoint taken down here comes back down here
  await browser.evaluate('saveCheckpoint(); true');
  const cp = await browser.evaluate(`JSON.parse(sessionStorage.getItem('buu-horror-checkpoint-v1'))`);
  assert.equal(cp.flags.inUnder, true);
  await browser.evaluate('enterScene(3, 600); true');
  assert.equal(await browser.evaluate('under.active'), false, 'entering room 3 normally leaves the crawl space');
  await browser.evaluate('state.flags.inUnder = true; enterScene(3, 600); true');
  assert.equal(await browser.evaluate('under.active && state.player.x === UNDER.LADDER_X + 40'), true, 'resuming a save made underneath puts you back underneath');
  await browser.evaluate('enterScene(4, 150); true');
  assert.equal(await browser.evaluate('!under.active && !state.flags.inUnder'), true, 'another room clears it');

  await sleep(300);
  assert.equal(await browser.evaluate('staff.errors'), 0, 'no frame of the game loop failed');
  assert.deepEqual(errors, [], 'no errors in the page console');
});
