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

  // Scene 3: incense, the samphawesi wakes up, photo piece 2
  await browser.evaluate(`__pt.use('hiding_jar_3')`);
  await settle(browser);
  await browser.evaluate(`__pt.use('lore_page_3')`);
  await settle(browser);
  await browser.evaluate(`__pt.use('samphawesi_offering_spot')`);
  await settle(browser);
  s = await snap(browser);
  assert.equal(s.ghostActive, true, 'the samphawesi hunts after its cutscene');
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
