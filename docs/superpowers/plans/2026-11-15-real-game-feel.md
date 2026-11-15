# Real Game Feel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the in-house scenes feel like a real game: darker rooms, bigger ghosts, living rooms, action feedback, in-world `[E]` prompts, lighter top bar, and the Esc fix.

**Architecture:** All changes are canvas drawing in `public/game.js` (render pipeline `renderScene` → `renderDarknessAndFlashlight` → particles → markers → `renderPostFx`) plus a little CSS for the top bar. New effects keep their state in small module-level arrays/timestamps next to `DUST_MOTES`.

**Tech Stack:** Vanilla JS canvas 1280×720, no dependencies.

**Spec:** `docs/superpowers/specs/2026-11-15-real-game-feel-design.md`

## Global Constraints
- Bottom button bar stays.
- No new image assets, no changes to ghost rules, puzzles, hotspot positions, phone screens or co-op sync.
- Honour `REDUCED_MOTION` (no shake/zoom/hitstop flash when set).
- `CATCH_DIST` unchanged; code talisman must stay readable.
- `npm test` passes.

## Review Focus
- Sixth sense on → darkness lifts to 0.5 as before (the spec's darkening must not override it).
- Hidden player → no footstep dust, no `[E]` prompt over the player.
- Dialogue / cutscene / pause open → hitstop and prompts don't fire; world-freeze still respected.
- Touch devices → prompt text says `แตะ สำรวจ`, not `[E]`.
- Scene 5 (dawn) and scene 1 (forest) → no indoor effects (window shadow, moon shaft).

There are no unit tests for the browser game (tests cover server/QR only), so each task's "test" is a scripted in-browser check with `mcp__Claude_Browser__javascript_tool` + screenshot.

---

### Task 1: Esc skips the cutscene without opening pause
**Files:** `public/story-intro.js:1211-1216`, `public/game.js:2958`
- [ ] Reproduce: start solo, press Escape during the intro → pause modal visible.
- [ ] Fix: in `onStoryKeyDown` call `e.stopImmediatePropagation()`; additionally record `window.storyIntroClosedAt = performance.now()` in `finishStory` and make the game's Esc branch ignore Esc within 300 ms of it.
- [ ] Verify: Escape during intro → game visible, `isPaused() === false`; Escape again in-game → pause opens.

### Task 2: Darker rooms, irregular light flicker
**Files:** `public/game.js` `renderDarknessAndFlashlight`
- [ ] `DARKNESS = { 1: 0.6, 2: 0.88, 3: 0.94, 4: 0.94 }`; player halo `punchLight(px, py, 14, 95, 0.7)`.
- [ ] Replace `flicker` sine with `lightFlicker(seed)` = sum of two sines + small noise, returns px offset (±10).
- [ ] Verify: canvas average luminance in scene 3 with beam off lower than before (was ~24); talisman digits readable in beam at scene 4; hotspot dots visible.

### Task 3: Bigger ghosts
**Files:** `public/game.js` `drawGhost`, `renderGhostSilhouette`, `renderScene` idle samphawesi
- [ ] `const GHOST_H = 300;` used for sprite, trail and silhouette; idle samphawesi 195 → 230; ground shadow rx 68 → 82.
- [ ] Verify: screenshot scene 3 and 4 with ghost active.

### Task 4: Living rooms
**Files:** `public/game.js` new `renderRoomLife(now)` called in `renderScene` after props, before the darkness (flames drawn after the darkness so they glow).
- [ ] Candle flames: `drawFlame(x, y, scale)` at the candle points already used for light (scene 3: 670,548; scene 4: 640,358) drawn after darkness, additive.
- [ ] Moon shaft: scenes 2–4, slanted translucent quad from the window light point (2: 990,380; 3: 290,360) drawn with `screen`, alpha pulsing 0.05–0.09.
- [ ] Window shadow: scenes 2–4, `windowShadow = { at, x }`; at most once per 40 s, 25% chance per check, a dark figure slides across the window rect over 1.2 s. Not while frozen.
- [ ] Verify: screenshots + force `windowShadow.at = 0` to trigger.

### Task 5: Action feedback
**Files:** `public/game.js` — `updateGame` (steps), pickup sites (where `state.inventory.offerings.push` / `photos.push` happen), `enterScene`, `renderGame`.
- [ ] `spawnDust(x)` on each step while moving and not hidden (scenes 1–4); particles in `FOOT_DUST` array, drawn in `renderAtmosphereParticles`.
- [ ] `pickupFx(imgKey)` → `hitstopUntil = now + 60`, gold flash alpha 0.25 fading 250 ms, flying icon from player to top bar (~ (640, 20)) over 600 ms. `updateGame` skips world update while `now < hitstopUntil`.
- [ ] `enterScene` sets `sceneZoomAt = now`; `renderGame` scales around player by `1 + 0.04 * (1 - t)` over 900 ms (skip when `REDUCED_MOTION`).
- [ ] Verify: pick up garland in scene 2 via `triggerInteract`; screenshot mid-effect.

### Task 6: `[E]` prompts over hotspots
**Files:** `public/game.js` `renderHotspotIndicators`
- [ ] For the active hotspot (`getActiveHotspot()`), draw a box above the dot at y≈330: dark fill `rgba(8,6,8,0.88)`, 1px gold border `#f0cf95`, 2px corners, key chip `E` (or `แตะ` on `IS_TOUCH`) + `shortLabel(s.label)` (cut to 22 graphemes with `…`), font Sarabun 16px. Not when hidden, dialogue open or frozen.
- [ ] Verify: walk near a hotspot, screenshot.

### Task 7: Lighter top bar, docs, ship
**Files:** `public/style.css` (`.hud-bar` override at end), `README.md`
- [ ] `.hud-bar` background → gradient from `rgba(0,0,0,0.65)` to transparent, no box border; buttons unchanged.
- [ ] Full playthrough check scenes 1–5 at 1280×800 and mobile landscape; `npm test`.
- [ ] README feature list + history row; commit, push to main (fetch first; leave `.claude/` out).
