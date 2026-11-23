# MCL-64 v2 Picture, Part One (Engine Move and Look Demo) Implementation Plan

> **For agentic workers:** REQUIRED SUB SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move MCL-64 to current three.js without changing a lap time or the look of Retro and Modern, add a third graphics tier called Ultra, and end with a look demo Jamie can judge: before and after stills of shadows across the whole view, a real sky and four times of day.

**Architecture:** Two small safety nets go in first (baked track data and a headless parity test of today's race loop) so the engine move cannot move a lap time unnoticed. A photo hook and a stills tool give repeatable pictures before and after. A throwaway spike chooses the renderer. Then the engine is swapped behind a picture parity gate, and Ultra is built on top as a tier that only adds, leaving Retro and Modern as they are.

**Tech Stack:** Plain JavaScript concatenated by `build.js`. three.js 0.187.0, bundled once by hand into one vendored file that defines the global `THREE`. Either `WebGPURenderer` with its WebGL 2 fallback or `WebGLRenderer`, decided in task 5. Playwright (local only) for stills and browser checks.

**Spec:** `docs/superpowers/specs/2026-11-23-mcl64-v2-design.md`, read with its section "Build order, revised", which puts the picture first. This plan covers 2.1, the Ultra tier from 2.2 as a manual choice, and from 2.3 the shadows, sky, time of day, bloom, grading and antialiasing. Part two (clouds and cloud shadows, motion blur, dusk lighting, rain look, wet road, effects, world and car detail, the Auto governor, budgets, release) is planned after Jamie has seen the look demo.

**Line references:** `G` is `src/40-game.js`, `C` is `src/30-cars.js`, `T` is `src/20-track.js`, `K` is `src/10-core.js`, `H` is `src/index.template.html`, all as of commit `716885a`.

## Global Constraints

- The simulation does not change. `SIM_VERSION` stays `'sim-2'`. `node test/sim-parity.test.js` passes on every commit from task 1 on. Nothing under `supabase/` changes. No leaderboard change.
- Retro keeps looking like Retro and Modern like Modern: the picture parity gate in task 6 is met and stays met.
- Ultra only adds. It is a manual choice in settings in this part; no device is moved to it automatically.
- The standalone page stays under 2,500,000 bytes (today: 1,117,523).
- The page fetches nothing from another host and needs no eval and no WebAssembly. `node test/csp.js` reports no violations.
- `node build.js` works with no install step and only reads the vendored file. The bundler lives in `tools/` and is run by hand when the three.js version changes.
- Both outputs build and pass their invariants. `dist/artifact.html` must boot; where its host blocks WebGPU it uses the WebGL path.
- One sign change, and one colour pipeline change, per commit, each measured in the running game.
- No tool trailers on commits. Subject, blank line, body, nothing after.
- Do not commit `dist/` during this plan. Build to check, then `git checkout -- dist`.
- Stills are not committed. `stills/` is in `.gitignore`. Numbers that come from them are written to `docs/v2-picture-log.md`, which is committed.
- All prose follows Jamie's rules: British English, no em or en dashes, no hyphenated compounds in prose, ranges as words.
- Gates. Tasks 1 to 11 are local. Any push, preview deploy or merge needs `roasts/ROAST_<step>.md` in the Jarvis folder and Jamie's GO.
- Downloads need Jamie's yes once, asked with the plan: the `three@0.187.0` and `esbuild` packages from the npm registry, and Playwright with its Chromium if it is not already on this Mac. All three install into the scratchpad, never into the repo, which keeps having no `package.json`.

## Review Focus

Conditions the spec implies but does not spell out. Each has a check in the task named, in `test/picture.js`.

1. A browser with no WebGPU (Firefox, older Safari, the artifact host). The fallback path draws the same picture; the page is never blank. Task 6.
2. The renderer fails to start, or the graphics context is lost mid race. The existing fallback panel appears with a message; no uncaught error, no frozen black canvas. Task 6.
3. Saved settings holding a tier or time of day this build does not know. They fall back to the defaults; the game boots. Task 7.
4. Switching tier and time of day many times in one session. Textures, geometries and render targets return to their baseline counts; nothing leaks, nothing throws. Tasks 7 and 9.
5. A very small window (160 x 120) and a very large one (3840 x 2160) in Ultra. Every buffer stays inside the existing pixel cap; no error. Task 10.

## File Structure

| File | Responsibility |
|---|---|
| `test/lib/sim.js` | Test helpers: `STEP`, `stateBytes`, `sha256`, `quantise`, `makeReporter`, `throws`. |
| `test/sim-parity.test.js` | Runs today's race loop headless on the working tree and compares digests. In CI. |
| `test/golden/sim-2.json` | The three committed digests. |
| `tools/bake-tracks.js`, `src/12-trackdata.js`, `test/track-bake.test.js` | Baked centrelines, their generator and their proof. |
| `tools/vendor/three-r128.min.js` | r128 kept for the bake tool and its test after the engine move. Not shipped. |
| `tools/three-entry.webgl.js`, `tools/three-entry.webgpu.js`, `tools/vendor-three.js` | What goes into the vendored bundle, and the script that builds it. |
| `vendor/three.bundle.js` | The vendored engine. Replaces `vendor/three.min.js`. |
| `tools/stills.js`, `tools/stills-compare.js` | Capture stills through the photo hook; compare two sets. Local. |
| `test/picture.js` | Local Playwright checks for the Review Focus items. Not in CI, like `test/csp.js`. |
| `src/32-sky.js` | Ultra sky, sun position by time of day, environment and fog from the sky. |
| `src/33-shadows.js` | Ultra cascaded shadows and the caster and receiver flags. |
| `src/40-game.js` | Renderer set up, tiers, post pass, photo and bench hooks. |
| `docs/v2-renderer-decision.md` | The spike's evidence and the decision. |
| `docs/v2-picture-log.md` | Baselines, parity numbers, frame times, with the device named. |

---

### Task 1: Headless parity test of today's race loop

The proof, kept for the whole picture stage, that no lap time moved.

**Files:**
- Create: `test/lib/sim.js`, `test/sim-parity.test.js`, `test/golden/sim-2.json`
- Modify: `.github/workflows/test.yml` (new job `parity`, node 22, `node test/sim-parity.test.js`)

**Interfaces:**
- Produces, in `test/lib/sim.js`:
  - `STEP = 1 / 60`
  - `stateBytes(cars, raceTimeMs) -> Uint8Array`: a `Float64Array` holding, for each car in index order, `pos.x, pos.z, yaw, vFwd, vLat, yawRate, progress, finishTime, bestLap, lapsDone`, then `raceTimeMs` last; returned as the bytes of its buffer.
  - `sha256(bytes) -> string` (hex, node `crypto`).
  - `quantise(inp) -> inp`: the rule at G:1023 to 1025.
  - `makeReporter() -> { assert(cond, name, detail), ok(name), skip(name, why), done() }`, output shaped like `test/physics.test.js`; `done()` exits 1 on any failure.
  - `throws(fn, part) -> boolean`.
- Produces: `test/golden/sim-2.json` as `{ "recordedAt": "716885a", "races": { "silverstone-v1": { "ticks": <int>, "sha256": "<hex>" }, "indianapolis-v1": {...}, "brands-hatch-v1": {...} } }`.
- `node test/sim-parity.test.js` compares; `--record` rewrites the file and is only run in this task.

- [ ] **Step 1: Write `test/lib/sim.js`.**
- [ ] **Step 2: Write `test/sim-parity.test.js`.** It loads the vendored three.js and the source chain the way `test/physics.test.js:50` to 66 does (it reads the vendor path and the chain from one place at the top, because task 6 changes the vendor file). It appends two overrides so no mesh is built: `buildCarMesh = function () { return { group: {}, wheels: [], head: {}, steerWheel: {}, shadow: {}, chassis: {} }; }` and `Vehicle.prototype.sync = function () {};`. The race loop is a transcription of `Game.buildGrid`, `gridOrder`, `resetRace(false)` (G:256 to 364), `tick` (G:1585 to 1658), `inDrsZone`, `checkLap` and `updatePositions` (G:1705 to 1776), with every `audio`, `flash`, `showSplit` and `setLights` call removed, and:
  - the player's input each tick is `quantise(driver.update(dt, cars, time))` with `driver = new AIDriver(player, track, 0.965, 7)` made once per race, `time` being the clock after `time += dt`;
  - `input.keyDrs` always true;
  - the loop runs until `state === FINISHED` (the 2.6 s hold and `settleField` included), capped at 72,000 ticks.
- [ ] **Step 3: Record and check stability.** `node test/sim-parity.test.js --record`, then `node test/sim-parity.test.js` twice. Expected: three PASS lines each time. Each player finish time is between 240,000 and 420,000 ms.
- [ ] **Step 4: Prove the test can fail.** Temporarily change `DRAG` (C:294) from `0.0019` to `0.00191`, run the test, expect three FAIL lines, revert. Say so in the commit body.
- [ ] **Step 5: Commit** `Add a headless parity test of the sim-2 race loop`.

### Task 2: Bake the circuit centrelines

A newer `CatmullRomCurve3` could move the samples and change every lap. After this task the track no longer asks three.js where it is.

**Files:**
- Create: `tools/bake-tracks.js`, `src/12-trackdata.js` (generated), `test/track-bake.test.js`
- Modify: `src/20-track.js:191-248` (add `geom`), `src/20-track.js:292-308` (read baked data), `build.js:82-90` (file list), `test/physics.test.js:59`, `test/sim-parity.test.js` (chain), `.github/workflows/test.yml`

**Interfaces:**
- Produces: `var TRACK_BAKED = { 'silverstone': { n: 900, x: [...], y: [...], z: [...] }, 'indianapolis': {...}, 'brands-hatch': {...} };` Numbers are written with `String(value)`, which JavaScript guarantees to read back exactly.
- Produces: each `TRACKS` entry gains `geom: 'silverstone' | 'indianapolis' | 'brands-hatch'`. `Track` fills `this.p` from `TRACK_BAKED[def.geom]` (still as `THREE.Vector3`, so nothing else changes) and no longer builds `this.curve`.

- [ ] **Step 1: Write `tools/bake-tracks.js`:** sample each circuit exactly as T:297 to 308 does today and write the file, with a header saying it is generated and by what.
- [ ] **Step 2: Write the failing test `test/track-bake.test.js`**

```js
for (const def of TRACKS) {
  const fresh = sampleWithThree(def);               // the same call the tool makes, against r128
  const b = TRACK_BAKED[def.geom];
  let same = b.n === 900 && b.x.length === 900 && b.y.length === 900 && b.z.length === 900;
  for (let i = 0; same && i < 900; i++) same = b.x[i] === fresh[i].x && b.y[i] === fresh[i].y && b.z[i] === fresh[i].z;
  t.assert(same, def.name + ' baked centreline equals a fresh r128 sampling', '');
  t.assert(b.x.concat(b.y, b.z).every((v) => Number(String(v)) === v), def.name + ' numbers round trip', '');
}
```

- [ ] **Step 3: Run it** (fails: no baked file), run the tool, switch `Track` to the baked data, run again. Expected: PASS for all three.
- [ ] **Step 4: Run** `node test/sim-parity.test.js && node test/physics.test.js && node build.js && git checkout -- dist`. Expected: digests identical, build prints `invariants OK`. Note the new page size in the commit body.
- [ ] **Step 5: Commit** `Bake the circuit centrelines to data`.

### Task 3: Photo hook, bench hook, stills tools and the "before" set

**Files:**
- Create: `tools/stills.js`, `tools/stills-compare.js`, `docs/v2-picture-log.md`
- Modify: `src/40-game.js` (hooks on `window.MCL64`), `.gitignore` (add `stills/`)

**Interfaces:**
- Produces: `PHOTO_CAMS = ['chase', 'helmet', 'grid', 'high', 'apex', 'stands']`:
  - `chase` and `helmet`: the game's own cameras 0 and 2 on the player.
  - `grid`: 3 m up, on the outside edge of the road 30 m past the start line, looking back at the grid.
  - `high`: 70 m above the start line, looking down the main straight.
  - `apex`: 1.2 m up on the inside kerb of the first named corner, looking back up the road.
  - `stands`: from the top row of the main grandstand, looking across the track.
- Produces: `MCL64.photo({ circuit, tick, cam, quality, timeOfDay }) -> Promise<void>`: selects the circuit and tier, starts a race, drives the player with the demo driver for exactly `tick` sim ticks with no drawing, places the named camera, draws one frame with the HUD hidden, and resolves. The same arguments always give the same frame. `timeOfDay` is ignored until task 9.
- Produces: `MCL64.bench({ circuit, quality, seconds }) -> Promise<{ frames, avgMs, p95Ms }>`: runs the attract demo for that long and reports frame times.
- Produces: `node tools/stills.js --out <dir> [--quality retro,modern] [--circuit <ids>] [--tod <names>] [--tick 900]`: builds nothing; serves `dist/` (reuse the server in `test/csp.js:65`), opens Chromium at 1280 x 720 with device pixel ratio 1, calls `photo` for each combination and saves `<dir>/<circuit>.<quality>.<tod>.<cam>.png`.
- Produces: `node tools/stills-compare.js <dirA> <dirB> [--max 6]`: for each file name present in both, prints the mean absolute difference per channel on a scale of 0 to 255 and the share of pixels differing by more than 24; exits 1 if any mean is above `--max`. The comparison runs in a browser page through Playwright, so no image library is needed.

- [ ] **Step 1: Add the two hooks.** They are render side only. Run `node test/sim-parity.test.js`: unchanged.
- [ ] **Step 2: Write the two tools.**
- [ ] **Step 3: Prove the stills are repeatable.** Build. Capture Silverstone, Retro and Modern, all six cameras, twice into `stills/before` and `stills/before-again`. `node tools/stills-compare.js stills/before stills/before-again --max 0.5`. Expected: every mean under 0.5. If not, the photo hook is not deterministic yet (clouds drift on wall time at G:2589; pin them to the sim tick inside `photo`).
- [ ] **Step 4: Capture the full "before" set:** Silverstone all six cameras, Indianapolis and Brands Hatch `chase` and `high`, Retro and Modern. 20 images in `stills/before`. Keep this folder until the plan is finished.
- [ ] **Step 5: Record the frame time baseline.** In Chrome on this Mac at 1728 x 1028, run `MCL64.bench({ circuit: 'silverstone-v1', quality: 'modern', seconds: 20 })` and the same for Retro and for Indianapolis in Modern. Write the numbers, the browser version and the Mac model to `docs/v2-picture-log.md`.
- [ ] **Step 6:** `git checkout -- dist`. **Commit** `Add a photo hook, a bench hook and stills tools`.

### Task 4: The vendoring tool

**Files:**
- Create: `tools/vendor-three.js`, `tools/three-entry.webgl.js`, `tools/three-entry.webgpu.js`

**Interfaces:**
- Produces: `node tools/vendor-three.js <webgl|webgpu> <workdir>`: in `<workdir>` (the scratchpad) fetches `three@0.187.0` and `esbuild`, bundles the entry for that flavour as one classic script that assigns the global `THREE` (`--format=iife --global-name=THREE --minify`), puts three's own licence header first, writes `vendor/three.<flavour>.js`, and prints the byte size and the SHA-256.
- `tools/three-entry.webgl.js` exports the core from `three` plus the addons this game will use on that path: `CSM`, `Sky`, `EffectComposer`, `RenderPass`, `ShaderPass`, `UnrealBloomPass`, `OutputPass`.
- `tools/three-entry.webgpu.js` exports `three/webgpu`, the `three/tsl` functions used, `CSMShadowNode`, `SkyMesh` and the bloom node.
- Each entry lists names one by one, not `export *`, so the bundler can leave out what the game never touches. Start from every `THREE.<Name>` the source uses today: `grep -oh "THREE\.[A-Za-z0-9_]*" src/*.js | sort -u`.

- [ ] **Step 1: Confirm the addon names and paths against the 0.187 documentation and the unpacked package** before writing the entries. The names above came from the documentation on 23 Nov 2026 and from memory; the package on disk is the authority. Correct this plan's list in the same commit if any differ.
- [ ] **Step 2: Write the tool and the entries. Build both flavours.** Expected: two files, each starting with the three.js licence header, each defining `THREE` when evaluated. Record both sizes in `docs/v2-picture-log.md`.
- [ ] **Step 3: Check neither file needs what the CSP forbids:** `grep -c "new Function\|eval(\|WebAssembly" vendor/three.webgl.js vendor/three.webgpu.js`, and read every hit. Record the result.
- [ ] **Step 4: Commit the tool and entries only.** The two built files are not committed yet (`git status` shows them untracked; task 5 decides which one stays). Message: `Add a tool that vendors three.js as one global bundle`.

### Task 5: Renderer spike

Thrown away afterwards. It answers one question: can `WebGPURenderer`, with its WebGL 2 fallback, carry all three tiers?

**Files:**
- Create: `docs/v2-renderer-decision.md`
- Work in a local branch `spike/renderer` cut from this one. Nothing from that branch is merged; only the decision document is committed here.

**Pass criteria, all required for WebGPU to be chosen:**

1. The existing scene draws correctly on WebGPU and on the fallback in current Chrome, Safari and Firefox on this Mac, and in Safari in the iOS Simulator.
2. The Retro dither and quantise pass (G:21 to 55) is reproduced.
3. The built page is under 2,500,000 bytes.
4. `node test/csp.js` reports no violations.
5. Modern frame time on the fallback is no worse than the task 3 baseline (within 5%).
6. The bundle evaluates under node, so `test/sim-parity.test.js` can run against it. If it cannot, that does not fail WebGPU by itself, but tasks 2, 4 and 5 of the playability plan (the sim without THREE) must then be done before task 6 here. Say so in the decision.

- [ ] **Step 1: On the spike branch, get today's scene drawing on `vendor/three.webgpu.js`,** by the shortest route. Tidy code is not the aim.
- [ ] **Step 2: Test each criterion and write down the evidence:** screenshots per browser, the byte size, the CSP output, the bench numbers, the parity test output.
- [ ] **Step 3: Write `docs/v2-renderer-decision.md`:** a table of the six criteria with pass or fail and the evidence, then one line: `Decision: WebGPURenderer` or `Decision: WebGLRenderer`. If any of 1 to 5 fails, the decision is `WebGLRenderer` from the same release with the classic addons. Every feature in this plan is still delivered that way.
- [ ] **Step 4: Back on this branch,** keep the chosen flavour as `vendor/three.bundle.js`, delete the other built file, delete the spike branch. **Commit** the decision document only (`Record the renderer decision`); the bundle is committed in task 6 with the code that uses it.

### Task 6: The engine move

**Files:**
- Create: `vendor/three.bundle.js`, `tools/vendor/three-r128.min.js` (moved from `vendor/three.min.js`), `test/picture.js`
- Modify: `build.js:97,136-150,340-355` (vendor path, notice text, invariants), `src/40-game.js:14-55,103-144,156-253,2477-2502,2584-2602,2643-2654`, `src/10-core.js:172,186`, `src/30-cars.js:15`, `src/20-track.js:905,1139-1141`, `tools/bake-tracks.js` and `test/track-bake.test.js` (read r128 from `tools/vendor/`), `test/physics.test.js:53`, `test/sim-parity.test.js` (vendor path), `THIRD-PARTY.md`, `CLAUDE.md` (build section)

**Interfaces:**
- `build.js` reads `vendor/three.bundle.js`. Its three.js notice names the real version (it says r131 today for a vendored r128; correct it to the version in the bundle's own header). New invariants: the standalone page is at most 2,500,000 bytes; the bundle's header names three.js 0.187.
- `Game.prototype.buildRenderer` becomes able to fail politely: on the WebGPU path set up is asynchronous, so boot waits for it and shows the existing fallback panel (G:2635) if it rejects. The boot probe asks for `webgl2` (G:2649).
- A URL switch for testing only: `?renderer=webgl` forces the fallback path.
- The post pass tone maps and encodes, because the renderer no longer does either when drawing into a render target (the arrangement at G:121 to 128). Retro: no tone mapping. Modern: ACES at exposure 1.12, then the same grade as today.

Migrate the colour pipeline in this order, **one commit each**, capturing `stills/move-N` after each and reading the comparison against `stills/before`. The picture gets worse before it gets better; what matters is that each step moves it the way that step predicts.

- [ ] **Step 1: Swap the bundle and make it boot.** Renderer construction, `webgl2` probe, shader syntax for the post pass, the global `THREE` for every source file and for the two node tests. Expected first symptom of anything missed: a dark, flat frame. Run `node test/sim-parity.test.js`: digests identical. If they are not, stop: something in the sim depended on the engine.
- [ ] **Step 2: Texture colour space.** `sRGBEncoding` and `.encoding` (K:186, G:128, G:185) become `SRGBColorSpace` and `.colorSpace`.
- [ ] **Step 3: Remove the double conversion.** `convertSRGBToLinear()` (K:172, C:15) goes, because colour management now converts hex input itself.
- [ ] **Step 4: Raw hex colours that now shift the other way:** sky (T:1139 to 1141), fog and clear colour (G:113, G:201), lights (G:207 to 213, G:368, T:905). Correct each so the drawn colour matches the before still.
- [ ] **Step 5: Light intensity.** The legacy scale is gone; expect about a factor of pi on the hemisphere, directional and ambient lights (G:207 to 213). Set each by measurement against the before stills, not by multiplying and hoping.
- [ ] **Step 6: Tone mapping and output encoding in the post pass,** as specified above. Sky and clouds use `MeshBasicMaterial` and are tone mapped today; keep them so.
- [ ] **Step 7: Shadows as today.** The Modern shadow map (2048, the 70 m box that follows the car, G:215 to 232) works as before, including `updateProjectionMatrix` after the box is edited.
- [ ] **Step 8: The picture parity gate.** Capture the full 20 image set into `stills/after-move`. Run `node tools/stills-compare.js stills/before stills/after-move --max 6`. Expected: every image at or under a mean of 6, on both tiers. Look at the three worst pairs by eye as well. Write the table of numbers and the threshold into `docs/v2-picture-log.md`. If 6 cannot be met for a reason that is a real improvement or an unavoidable difference in the engine, state the reason and the number in the log and stop for Jamie's view; do not quietly raise the threshold.
- [ ] **Step 9: Write `test/picture.js`** (Playwright, local) and make it pass:

```js
/* Review Focus 1 */
await boot('?renderer=webgl');
check(await canvasIsNotBlank() && consoleErrors.length === 0, 'the fallback path draws with no errors');
check(await bootWith({ disableWebGPU: true }), 'a browser with no WebGPU still gets a picture');
/* Review Focus 2 */
await bootWith({ breakRenderer: true });            // make getContext return null before load
check(await isVisible('#fallback') && uncaught.length === 0, 'a renderer that cannot start shows the fallback panel');
await boot(''); await loseContext();                // WEBGL_lose_context on the fallback, device.destroy() on WebGPU
check(uncaught.length === 0 && (await isVisible('#fallback') || await canvasIsNotBlank()), 'a lost context is reported or recovered, never a frozen black canvas');
```

- [ ] **Step 10: Run everything.** `node test/sim-parity.test.js`, `node test/physics.test.js`, `node test/fpmath.test.js`, `node test/track-bake.test.js`, `node build.js`, `node test/csp.js`, `node test/picture.js`. Bench Modern in Chrome: within 10% of the baseline; write it in the log. Open the page in Chrome, Safari and Firefox on this Mac and in the iOS Simulator: a race starts in Retro and in Modern. `git checkout -- dist`.
- [ ] **Step 11: Commit** the last step as `Complete the move to three.js 0.187`. The body gives the parity numbers, the page size before and after, and the bench before and after.

### Task 7: The Ultra tier, as a place to put things

**Files:**
- Modify: `src/40-game.js:1065-1124` (settings), `src/40-game.js:2477-2502` (`applyQuality`), `src/40-game.js:911-941` (`resize`), `src/index.template.html:1027-1029`, `test/picture.js`

**Interfaces:**
- Produces: `settings.quality` is `'retro' | 'modern' | 'ultra'`. `settings.timeOfDay` is `'morning' | 'midday' | 'golden' | 'dusk'`, default `'midday'`. Anything else read from storage falls back to the default for that field.
- Produces: `var TIERS = { retro: {...}, modern: {...}, ultra: {...} }`: one table that `applyQuality` and `resize` read, in place of the scattered `modern ?` tests. Fields: `target` (`'small'` or `'super'`), `toneMapping`, `exposure`, `shadows` (`'blob' | 'single' | 'cascades'`), `sky` (`'dome' | 'physical'`), `post` (`'retro' | 'grade' | 'full'`), `overlays` (boolean).
- Produces: `Game.prototype.applyQuality()` tears down what the previous tier built and builds what the new one needs. In this task Ultra equals Modern in every field; tasks 8 to 10 change one field each.
- The settings button cycles RETRO 240p, MODERN, ULTRA. The hint line for Ultra reads: `Ultra: shadows across the whole view, a real sky and time of day.` A second row, TIME OF DAY, is shown only while Ultra is selected.
- The scanline and glow overlays (H:115 to 137) follow `overlays`: on for Retro only.

- [ ] **Step 1: Add the failing checks to `test/picture.js`**

```js
/* Review Focus 3 */
await bootWithSettings({ quality: 'hyper', timeOfDay: 'midnight' });
check(await setting('quality') === 'modern' && await setting('timeOfDay') === 'midday' && uncaught.length === 0,
  'an unknown tier or time of day falls back to the defaults');
/* Review Focus 4 */
const base = await memoryCounts('modern');          // renderer.info.memory after one settle frame
for (let i = 0; i < 30; i++) for (const q of ['ultra', 'retro', 'modern']) await setQuality(q);
const after = await memoryCounts('modern');
check(after.textures <= base.textures && after.geometries <= base.geometries && uncaught.length === 0,
  'thirty trips round the tiers leak nothing', JSON.stringify([base, after]));
```

- [ ] **Step 2: Run** (fail), **implement**, **run** (pass).
- [ ] **Step 3: Parity still holds.** `node tools/stills.js --out stills/after-tiers` then compare against `stills/after-move` with `--max 0.5` for Retro and Modern. Expected: unchanged. Ultra stills equal Modern stills at this commit.
- [ ] **Step 4: Commit** `Add an Ultra tier and a time of day setting`.

### Task 8: Shadows across the whole view (Ultra)

**Files:**
- Create: `src/33-shadows.js`
- Modify: `src/40-game.js` (`buildWorld`, `applyQuality`, `updateCamera` where the sun follows the car at G:2010), `src/20-track.js:719-722,797-1110` (caster and receiver flags on stands, gantry, trees, signs, ground), `src/30-cars.js:224,238`, `build.js` (file list)

**Interfaces:**
- Produces: `function ShadowRig(scene, camera, sun)`; `setMode(mode)` with `'blob' | 'single' | 'cascades'`; `update()` once per frame; `dispose()`.
  - `'single'` is today's map, unchanged.
  - `'cascades'`: on the WebGPU path `CSMShadowNode` on the sun's shadow; on the WebGL path the `CSM` addon with its material set up. Starting values: 4 cascades, 2048 each, far limit 700 m, practical split.
- In Ultra: cars, trees, stands, the gantry and signs cast; road, kerbs, runoff, grass and the stand faces receive. In Retro and Modern the flags are as they are today, set by `applyQuality` from `TIERS`.

- [ ] **Step 1: Implement `ShadowRig` and move today's single map into it** with no change in the picture. Compare Retro and Modern stills against `stills/after-tiers` with `--max 0.5`. Commit this step alone: `Move the shadow set up into a ShadowRig`.
- [ ] **Step 2: Add the cascades mode and the Ultra caster and receiver flags.**
- [ ] **Step 3: Look at it.** Capture Ultra at Silverstone, all six cameras, and Indianapolis `high`. Expected, by eye: in `high` the stands, the gantry and the trees throw shadows on the ground and the road; in `grid` every car on the grid has a shadow, including the back row; in `apex` a car 300 m up the road has a shadow; no shadow floats away from its tyre; no hard seam where one cascade hands over to the next. Capture ticks 900 and 903 from `chase` and compare: static shadow edges do not crawl between the two.
- [ ] **Step 4: Measure.** Bench Ultra at Silverstone and at Indianapolis (33 cars) in Chrome at 1728 x 1028. Write both in the log. Target for this part: an average at or under 16.7 ms at Silverstone. If it misses, try three cascades or 1536 maps before anything else, and say what was traded.
- [ ] **Step 5:** `node test/picture.js && node test/sim-parity.test.js`. **Commit** `Add cascaded shadows across the whole view in Ultra`.

### Task 9: A real sky and time of day (Ultra)

**Files:**
- Create: `src/32-sky.js`
- Modify: `src/40-game.js:156-197` (`buildEnvironment`), `src/40-game.js:199-213` (lights, fog), `src/40-game.js` (`applyQuality`, settings row), `build.js`, `test/picture.js`

**Interfaces:**
- Produces: `var TIME_OF_DAY = { morning: { elevation: 22, azimuth: 100 }, midday: { elevation: 58, azimuth: 170 }, golden: { elevation: 12, azimuth: 250 }, dusk: { elevation: 3, azimuth: 265 } };` in degrees. Starting values, tuned by eye per circuit so the main straight is never lit flat from directly behind the camera.
- Produces: `function SkyRig(scene, renderer, sun, hemi, ambient)`; `setMode('dome' | 'physical')`; `setTimeOfDay(name)`; `dispose()`.
  - `'dome'` is today's vertex coloured dome and painted environment, unchanged.
  - `'physical'`: the `SkyMesh` (WebGPU path) or `Sky` (WebGL path) addon with a visible sun disc. `setTimeOfDay` moves the sun light to match, sets its colour and strength and the fill lights for that hour, rebuilds `scene.environment` from the sky through `PMREMGenerator`, and sets the fog colour from the sky at the horizon in the direction the camera faces at the start line.
- Changing the time of day never touches the sim.

- [ ] **Step 1: Move today's dome and environment into `SkyRig` mode `'dome'`** with no change in the picture (compare, `--max 0.5`). Commit alone: `Move the sky set up into a SkyRig`.
- [ ] **Step 2: Add `'physical'` and the four times of day. Extend `photo` to honour `timeOfDay`.**
- [ ] **Step 3: Add to `test/picture.js`:** in Ultra, forty changes of time of day leave the texture and render target counts at their baseline, with no uncaught error (Review Focus 4, second half).
- [ ] **Step 4: Look at it.** Capture Ultra at Silverstone, six cameras, four times of day (24 images). Expected, by eye: the sun disc is where the shadows say it is; car paint reflects the sky of that hour and not the old painted one; golden hour throws long shadows and warm light without crushing the shaded side of the stands to black; dusk is low sun, not night, and the road is still readable from `chase` and `helmet`; the horizon meets the fog with no visible band.
- [ ] **Step 5:** Run `node test/picture.js && node test/sim-parity.test.js`; Retro and Modern stills unchanged. **Commit** `Add a physical sky and four times of day in Ultra`.

### Task 10: Bloom, grading and antialiasing (Ultra)

**Files:**
- Modify: `src/40-game.js:14-55` (post), `src/40-game.js:911-941` (`resize`), `src/40-game.js:2584-2602` (`render`), `test/picture.js`

**Interfaces:**
- Produces: `TIERS.ultra.post = 'full'`: the scene pass, bloom, tone mapping, a grade per time of day, then output. WebGPU path: the node pipeline (`RenderPipeline`, `pass`, the bloom node). WebGL path: `EffectComposer` with `RenderPass`, `UnrealBloomPass`, a grade `ShaderPass`, `OutputPass`.
- Bloom is for things that are truly bright (the sun disc, glints on paint, start lights), so the threshold sits above lit asphalt. Starting values: strength 0.35, radius 0.6, threshold 1.0 on scene referred values.
- `var GRADES = { morning: {...}, midday: {...}, golden: {...}, dusk: {...} }`: lift, gain and saturation per time of day. Midday is neutral.
- Antialiasing in Ultra: keep the supersampled target (factor 1.35 times the device pixel ratio, capped at 5,200,000 pixels, G:922 to 932) unless multisampling on the chosen renderer gives a cleaner edge for less; state which and why in the log.
- Retro and Modern post is untouched.

- [ ] **Step 1: Add the failing check (Review Focus 5):**

```js
for (const [w, h] of [[160, 120], [3840, 2160]]) {
  await resizeTo(w, h); await setQuality('ultra');
  const px = await drawBufferPixels();
  check(px <= 5200000 && uncaught.length === 0 && await canvasIsNotBlank(), 'Ultra at ' + w + ' x ' + h + ' stays inside the pixel cap', String(px));
}
```

- [ ] **Step 2: Implement.**
- [ ] **Step 3: Look and measure.** Recapture the 24 Ultra images. Expected: highlights glow, midtones are not washed out, the HUD is as sharp as before (it is a separate canvas), no halo round the car against the sky. Bench Ultra at both circuits; write the numbers in the log next to task 8's.
- [ ] **Step 4:** Run the whole local suite; Retro and Modern stills unchanged. **Commit** `Add bloom, grading and antialiasing to Ultra`.

### Task 11: The look demo

This is the point of the plan: Jamie sees the difference and says what he thinks before anything else is built.

- [ ] **Step 1: Build and capture.** `node build.js`. Capture into `stills/look-demo`: at Silverstone, Modern (the "before") and Ultra at all four times of day, six cameras; at Indianapolis and Brands Hatch, Modern and Ultra at golden hour, `chase` and `high`. `git checkout -- dist` is NOT run this time: leave the build in place for step 3.
- [ ] **Step 2: Make one page of pairs.** `stills/look-demo/index.html`: each Modern still beside its Ultra still, grouped by camera, with the time of day as a row of buttons. Images are referenced by relative path. Nothing is fetched from anywhere else.
- [ ] **Step 3: Put it in front of Jamie.** Send the eight strongest pairs as image files in the session (each pair is the same camera in Modern and in Ultra), with one line each saying what to look at. Say that the built game is in `dist/index.html` on this Mac and that Ultra is under Settings, Graphics. Say plainly what is not there yet: clouds, rain, the wet road, motion blur, smoke and dust, car and world detail, and the automatic choice of tier.
- [ ] **Step 4: Write the numbers into `docs/v2-picture-log.md`** and commit it: `Record the look demo measurements`. Update the README only where it would now be untrue (three.js version, build description, test list). Commit: `Bring the README up to date with the engine move`.
- [ ] **Step 5: Stop for Jamie.** One decision: is this the direction? If yes, which time of day is the default, and part two is planned. If it needs changing, what. Offer, as a separate gated step, a preview on the test site so it can be seen on a phone: that needs a push and a deploy, so it needs a roast and a GO.
