# MCL-64 v2 Picture, Part One (Engine Move and Look Demo) Implementation Plan

> **For agentic workers:** REQUIRED SUB SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move MCL-64 to current three.js without changing a lap time or the look of Retro and Modern, add a third graphics tier called Ultra, and end with a look demo Jamie can judge: before and after stills of shadows across the whole view, a real sky and four times of day.

**Architecture:** Two small safety nets go in first (baked track data and a headless parity test of today's race loop) so the engine move cannot move a lap time unnoticed. A photo hook and a stills tool give repeatable pictures before and after. A throwaway spike chooses the renderer. Then the engine is swapped behind a picture parity gate, and Ultra is built on top as a tier that only adds, leaving Retro and Modern as they are.

**Tech Stack:** Plain JavaScript concatenated by `build.js`. three.js 0.187.0, bundled once by hand into one vendored file that defines the global `THREE`. Either `WebGPURenderer` with its WebGL 2 fallback or `WebGLRenderer`, decided in task 5. Playwright (local only) for stills and browser checks.

**Spec:** `docs/superpowers/specs/2026-11-23-mcl64-v2-design.md`, read with its section "Build order, revised", which puts the picture first. This plan covers 2.1, the Ultra tier from 2.2 as a manual choice, and from 2.3 the shadows, sky, time of day, bloom, grading and antialiasing. Part two (clouds and cloud shadows, motion blur, dusk lighting, rain look, wet road, effects, world and car detail, the Auto governor, budgets, release) is planned after Jamie has seen the look demo.

**Base:** origin/main 95da9ab, merged into v2-upgrade at 913ee61 on 23 Nov 2026. Line references below were written against an older copy and are stale: find code by function name.

**Line references:** `G` is `src/40-game.js`, `C` is `src/30-cars.js`, `T` is `src/20-track.js`, `K` is `src/10-core.js`, `H` is `src/index.template.html`, all as of commit `716885a`, which stood on a stale copy of `main` (18bb12f). The numbers are kept as written. In tasks 4 to 11 the function or symbol is named beside each one, and the name is what to search for.

**Where the plan stands (23 Nov 2026):** tasks 1 to 3 are done and were repaired on the real `main`; each carries a status note and its text is otherwise left as it was written. Tasks 4 to 11 remain and are corrected below for the real `main`.

## Global Constraints

- The simulation does not change. `SIM_VERSION` stays `'sim-2'`. `node test/sim-parity.test.js` passes on every commit from task 1 on. Nothing under `supabase/` changes. No leaderboard change.
- Four circuits everywhere: `monaco-gp-v1` (first in `TRACKS`), `silverstone-v1`, `indianapolis-v1`, `brands-hatch-v1`. Name a circuit by its id, never by its index.
- Retro keeps looking like Retro and Modern like Modern: the picture parity gate in task 6 is met and stays met.
- What is live is the reference picture. The reference stills are the 28 in `stills/before-main`, taken from the merged `main` (see `docs/v2-picture-log.md`). Nothing that came with `main` is a fault to be put back in this plan.
- Ultra only adds. It is a manual choice in settings in this part; no device is moved to it automatically.
- The standalone page stays under 2,500,000 bytes (today about 1.32 MB; the exact figure for each build is in `docs/v2-picture-log.md`).
- The page fetches nothing from another host and needs no eval and no WebAssembly. `node test/csp.js` reports no violations.
- `node build.js` works with no install step and only reads the vendored file. The bundler lives in `tools/` and is run by hand when the three.js version changes.
- Both outputs build. `dist/artifact.html` must still build and boot; where its host blocks WebGPU it uses the WebGL path. On `main` the artifact now carries the cloud layer, and five of its build checks were replaced with `// removed` in `build.js`. This plan does not rely on those checks and does not restore them. Whether the removal was meant is an open question for Jamie.
- Every "run everything" step also runs `node test/music.test.js`. It loads `src/05-fpmath.js` and `src/10-core.js` as plain scripts with no `THREE`, so `src/10-core.js` must stay free of module syntax and must not need `THREE` at load.
- Bench: four rows every time (Modern at Silverstone, Retro at Silverstone, Modern at Indianapolis, Modern at Monaco) with `node tools/bench.js`, compared on the mean, because p95 is noisy with the frame limit off. Baseline means on `main`: 5.26, 1.03, 5.24 and 5.73 ms (the table "913ee61: baseline" in `docs/v2-picture-log.md`).
- Builds are named by sha and channel, never by the v number alone. The number is the commit count, and two different builds have already carried the same one.
- One sign change, and one colour pipeline change, per commit, each measured in the running game.
- No tool trailers on commits. Subject, blank line, body, nothing after.
- Do not commit `dist/` during this plan. Build to check, then `git checkout -- dist`.
- Stills are not committed. `stills/` is in `.gitignore`. Numbers that come from them are written to `docs/v2-picture-log.md`, which is committed.
- All prose follows Jamie's rules: British English, no em or en dashes, no hyphenated compounds in prose, ranges as words.
- Gates. Tasks 1 to 11 are local. Any push, preview deploy or merge needs `roasts/ROAST_<step>.md` in the Jarvis folder and Jamie's GO.
- Downloads need Jamie's yes once, asked with the plan: the `three@0.187.0` and `esbuild` packages from the npm registry, and Playwright with its Chromium if it is not already on this Mac. All three install into the scratchpad, never into the repo.
- `node build.js` needs no install; nothing is installed into the repo; the `package.json`, lockfiles, `server.js` and `src/db` that came with the Monaco export are left exactly as main has them; tools find Playwright and the bundler through the scratchpad.

## Review Focus

Conditions the spec implies but does not spell out. Each has a check in the task named, in `test/picture.js`.

1. A browser with no WebGPU (Firefox, older Safari, the artifact host). The fallback path draws the same picture; the page is never blank. Task 6.
2. The renderer fails to start, or the graphics context is lost mid race. The existing fallback panel appears with a message; no uncaught error, no frozen black canvas. Task 6.
3. Saved settings holding a tier or time of day this build does not know. They fall back to the defaults; the game boots. Task 7.
4. Switching tier and time of day many times in one session. Textures, geometries and render targets return to their baseline counts; nothing leaks, nothing throws. Tasks 7 and 9.
5. A very small window (160 x 120) and a very large one (3840 x 2160) in Ultra, at device pixel ratios 1 and 2. The render target and the canvas both stay inside the existing pixel cap; no error. The rule that keeps Ultra's canvas there is made in task 7 (`canvas` in `TIERS`); the check that verifies it is in task 10.

## File Structure

| File | Responsibility |
|---|---|
| `test/lib/sim.js` | Test helpers: `STEP`, `stateBytes`, `sha256`, `quantise`, `makeReporter`, `throws`. |
| `test/sim-parity.test.js` | Runs today's race loop headless on the working tree and compares digests. In CI. |
| `test/golden/sim-2.json` | The four committed digests, one for each circuit. |
| `tools/bake-tracks.js`, `src/12-trackdata.js`, `test/track-bake.test.js` | Baked centrelines, their generator and their proof. |
| `tools/vendor/three-r128.min.js` | r128 kept for the bake tool and its test after the engine move. Not shipped. |
| `tools/three-entry.webgl.js`, `tools/three-entry.webgpu.js`, `tools/vendor-three.js` | What goes into the vendored bundle, and the script that builds it. |
| `vendor/three.bundle.js` | The vendored engine. Replaces `vendor/three.min.js`. |
| `tools/stills.js`, `tools/stills-compare.js` | Capture stills through the photo hook; compare two sets. Local. |
| `tools/browser.js` | Shared by the stills and bench tools: finds Playwright, serves `dist/`, the launch arguments, and the pinned `Math.random` the stills page runs on. |
| `tools/bench.js` | Frame times through the bench hook, the same way every time. Local. |
| `tools/stills-pin-check.js` | Shows a Monaco still does not depend on how many objects the engine builds. Local. |
| `test/picture.js` | Local Playwright checks for the Review Focus items. Not in CI, like `test/csp.js`. |
| `src/32-sky.js` | Ultra sky, sun position by time of day, environment and fog from the sky. |
| `src/33-shadows.js` | Ultra cascaded shadows and the caster and receiver flags. |
| `src/40-game.js` | Renderer set up, tiers, post pass, photo and bench hooks. |
| `docs/v2-renderer-decision.md` | The spike's evidence and the decision. |
| `docs/v2-picture-log.md` | Baselines, parity numbers, frame times, with the device named. |

---

### Task 1: Headless parity test of today's race loop

> **Status: done, then repaired on the real main.** Built at 3f8d0ce on the stale base. Repaired by the merge 913ee61 and by 6a56c6e (`Add Monaco to the parity test`), with a small follow-up in 0d4dad8. The text below is left as written. What differs from it:
> - Four circuits and four hashes. `RACES` in `test/sim-parity.test.js` lists `monaco-gp-v1` first, and `test/golden/sim-2.json` holds four digests with `recordedAt` `913ee61`. The three older hashes did not change in the merge, which is the proof that `main` moved no lap time on those circuits.
> - Expected output is four PASS lines. Monaco finishes in 220,433 ms, below the 240,000 ms in step 3; the other three are 321,550, 369,183 and 306,550 ms.
> - The race runner throws when `trackById` returns a different circuit from the one asked for, because the fallback is the first circuit, which is now Monaco.
> - On `main`, `buildCarMesh` also returns `halo`. The override in step 2 leaves it undefined, which is harmless. `DRAG` in step 4 is `var DRAG` in `src/30-cars.js`.
> - `--record` takes the commit sha through `--recorded-at`.
> - `.github/workflows/test.yml` now has five jobs: maths, physics, parity, music and migrations.

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

> **Status: done, then repaired on the real main.** Built at 29dd8de on the stale base. Repaired inside the merge 913ee61, so that the merge is green by itself. The text below is left as written. What differs from it:
> - Baked data for four circuits. Monaco's `TRACKS` entry has `geom: 'monaco'`, and `TRACK_BAKED` in `src/12-trackdata.js` has a fourth block of 900 samples. The arrays for the three older circuits are unchanged.
> - `tools/bake-tracks.js` throws when a circuit has no `geom` key, or when two circuits share one.
> - `node test/track-bake.test.js` prints eight PASS lines (two for each circuit), and `node test/physics.test.js` passes 37 assertions, including the order of `TRACKS`.

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

> **Status: done, then repaired on the real main.** Built at 486fcdd and 7e202ea on the stale base. Repaired by 1f2fee9, 4dbf7ce, a4fad18, 0d4dad8 and 2fc7f13. The text below is left as written. What differs from it:
> - The reference stills are the 28 in `stills/before-main`, not the 20 in `stills/before`: Silverstone with all six cameras; Indianapolis and Brands Hatch with `chase` and `high`; Monaco with `chase`, `grid`, `high` and `apex`; Retro and Modern. They are 1280 x 607, the halo is hidden, Monaco is taken at tick 600 and the other three at tick 900. `stills/before` is a picture of the stale base and is superseded.
> - `Math.random` is pinned by the stills tool (`pinRandom` in `tools/browser.js`) and the stream starts again at every 2D canvas context, because Monaco's building textures are drawn with `Math.random` and differ on every load in the live game. The bench does not pin it.
> - `stands` is refused at Monaco, which has no main grandstand, and `tools/stills.js` skips it there. The tool's defaults are every circuit and tick 900, so the Indianapolis, Brands Hatch and Monaco captures always pass `--circuit`, `--cam` and, for Monaco, `--tick 600`.
> - A still is the game picture only: the hook hides the HUD and the page's scanline and glow layers. The hook cannot post to the leaderboard, and refuses a tick past the end of the race.
> - The bench baseline is the table "913ee61: baseline" in `docs/v2-picture-log.md`: four rows, taken with `node tools/bench.js`, with the frame limit off, each with its render target, canvas and drawing buffer size.
> - Extra tools: `tools/browser.js`, `tools/bench.js`, `tools/stills-pin-check.js`.

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
- Each entry lists names one by one, not `export *`, so the bundler can leave out what the game never touches. Start from every `THREE.<Name>` the source uses today: `grep -oh "THREE\.[A-Za-z0-9_]*" src/*.js | sort -u`. The source now includes Monaco's scenery (`buildMonacoTunnelAndUrbanScenery` in `src/20-track.js`), so run the grep on the tree as it is and do not copy an older list.
- `node build.js` needs no install; nothing is installed into the repo; the `package.json`, lockfiles, `server.js` and `src/db` that came with the Monaco export are left exactly as main has them; tools find Playwright and the bundler through the scratchpad. The tool never runs `npm install` in the repo and never reads the repo's `package.json`. That file names `three` at `^0.185.1`, which nothing uses: the version vendored here is `0.187.0`, taken from the scratchpad.

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

1. The existing scene draws correctly on WebGPU and on the fallback in current Chrome, Safari and Firefox on this Mac, and in Safari in the iOS Simulator. The existing scene is all four circuits: `monaco-gp-v1`, `silverstone-v1`, `indianapolis-v1` and `brands-hatch-v1`. Monaco is the heavy one (the tunnel, the sea, the yachts and roughly 650 shadow casters, a count taken from the delta study and not measured on this branch), so it is looked at in every browser.
2. The Retro dither and quantise pass (G:21 to 55, `POST_FRAG`) is reproduced.
3. The built page is under 2,500,000 bytes (today about 1.32 MB; the exact figure for each build is in `docs/v2-picture-log.md`).
4. `node test/csp.js` reports no violations.
5. Modern frame time on the fallback is no worse than the task 3 baseline (within 5%). The baseline is the table "913ee61: baseline" in `docs/v2-picture-log.md`, taken with `node tools/bench.js --quality <q> --circuit <id> --seconds 20`. Run all four rows (Modern at Silverstone, Retro at Silverstone, Modern at Indianapolis, Modern at Monaco) and compare on the mean, because p95 is noisy with the frame limit off. Baseline means: 5.26, 1.03, 5.24 and 5.73 ms. The spike's renderer keeps main's settings (`antialias: true` and the full device pixel ratio, so a 6144 x 3386 canvas for a 3072 x 1693 render target in Modern at ratio 2), or the figures do not compare like with like.
6. The bundle evaluates under node, so `test/sim-parity.test.js` can run against it and its four digests still pass. If it cannot, that does not fail WebGPU by itself, but tasks 2, 4 and 5 of the playability plan (the sim without THREE) must then be done before task 6 here. Say so in the decision.

- [ ] **Step 1: On the spike branch, get today's scene drawing on `vendor/three.webgpu.js`,** by the shortest route. Tidy code is not the aim.
- [ ] **Step 2: Test each criterion and write down the evidence:** screenshots per browser, the byte size, the CSP output, the bench numbers, the parity test output. Name each build by its sha and channel. If `tools/stills.js` is used here: it pins `Math.random` and starts the stream again at every 2D canvas context, so in a pinned page three.js UUIDs repeat. That is harmless on r128. If pictures break only in the pinned page on the new engine, have the stills tool replace `THREE.MathUtils.generateUUID` with a counter based unique generator after the bundle loads, and run the control again: stills of the older circuits, pinned against unpinned, must match.
- [ ] **Step 3: Write `docs/v2-renderer-decision.md`:** a table of the six criteria with pass or fail and the evidence, then one line: `Decision: WebGPURenderer` or `Decision: WebGLRenderer`. If any of 1 to 5 fails, the decision is `WebGLRenderer` from the same release with the classic addons. Every feature in this plan is still delivered that way.
- [ ] **Step 4: Back on this branch,** keep the chosen flavour as `vendor/three.bundle.js`, delete the other built file, delete the spike branch. **Commit** the decision document only (`Record the renderer decision`); the bundle is committed in task 6 with the code that uses it.

### Task 6: The engine move

**Files:**
- Create: `vendor/three.bundle.js`, `tools/vendor/three-r128.min.js` (moved from `vendor/three.min.js`), `test/picture.js`
- Modify: `build.js:97,136-150,340-355` (vendor path: the `read('vendor/three.min.js')` line; notice text: the `three.js r131` string in `NOTICE`; invariants: the block at the foot that fills `problems`), `src/40-game.js:14-55,103-144,156-253,2477-2502,2584-2602,2643-2654` (`POST_VERT` and `POST_FRAG`; `buildRenderer`; `buildEnvironment` and `buildWorld`; `applyQuality`; `render`; the boot check and the WebGL probe in the closure at the foot of the file), `src/10-core.js:172,186` (`srgb`, `texFromCanvas`), `src/30-cars.js:15` (`part`), `src/20-track.js:905,1139-1141` (the start light material in `buildStartGantry`; the sky colours in `buildSky`), `src/20-track.js` (`buildMonacoTunnelAndUrbanScenery`: the raw colours named in step 4), `tools/bake-tracks.js` and `test/track-bake.test.js` (read r128 from `tools/vendor/`), `test/physics.test.js:53` (the `read('vendor/three.min.js')` line), `test/sim-parity.test.js` (vendor path, the `VENDOR` constant), `tools/bench.js`, `tools/stills.js`, `tools/browser.js` and `tools/stills-pin-check.js` (only as far as the new renderer needs: see Interfaces), `THIRD-PARTY.md`, `CLAUDE.md` (build section)

**Interfaces:**
- `build.js` reads `vendor/three.bundle.js`. Its three.js notice names the real version (it says r131 today for a vendored r128; correct it to the version in the bundle's own header). New invariants: the standalone page is at most 2,500,000 bytes; the bundle's header names three.js 0.187.
- `dist/artifact.html` must still build and boot. On `main`, `build.js` puts the cloud layer into it (`const fragment = render(cloudBlob)`) and five of its build checks were replaced with `// removed`. Do not rely on those checks and do not restore them. Whether the removal was meant is an open question for Jamie. The checks that are left for the fragment (no doctype, no `<body>`, the three.js notice) keep passing.
- `Game.prototype.buildRenderer` becomes able to fail politely: on the WebGPU path set up is asynchronous, so boot waits for it and shows the existing fallback panel (G:2635, `fail()` and `#fallback` in the closure at the foot of `src/40-game.js`) if it rejects. The boot probe asks for `webgl2` (G:2649, the `probe.getContext('webgl')` line).
- Pixel ratio and antialiasing. Main's renderer is created with `antialias: true` and `setPixelRatio(window.devicePixelRatio || 1)`, so in Modern at ratio 2 the canvas is 6144 x 3386 for a 3072 x 1693 render target (the bench viewport, 1728 x 1028). The scene is drawn into the render target and only the final quad goes to the canvas. The engine move keeps that behaviour exactly, so the parity stills and the bench compare like with like. Whether it should change is a question for Jamie and is not decided in this plan.
- A URL switch for testing only: `?renderer=webgl` forces the fallback path.
- The post pass tone maps and encodes, because the renderer no longer does either when drawing into a render target (the arrangement at G:121 to 128: `this.rt` and its `texture.encoding` in `buildRenderer`). Retro: no tone mapping. Modern: ACES at exposure 1.12, then the same grade as today.
- `src/10-core.js` stays a plain script with no module syntax and no need for `THREE` at load, because `test/music.test.js` evaluates it with `src/05-fpmath.js` and nothing else.
- The local tools were written for main's WebGL renderer and may need changing for the new one: `tools/bench.js`, `tools/stills.js`, `tools/browser.js` and `tools/stills-pin-check.js`. Today the bench reads the graphics card's name and the drawing buffer size from a WebGL context (`renderer.getContext()`, `WEBGL_debug_renderer_info`, `drawingBufferWidth`), which a WebGPU backend may not give (not confirmed: check it against the bundle), and the stills tools launch headless Chromium on SwiftShader (`CHROMIUM_ARGS` in `tools/browser.js`). Change them only as far as the chosen renderer needs. The bench line keeps its three sizes (render target, canvas, drawing buffer), so later rows compare with the baseline.
- Which path is benched: the one the game picks by default in Chrome on this Mac, with no `?renderer=` switch. Name that path (WebGPU or WebGL) in the log beside each figure.

The reference is `stills/before-main`: 28 images taken from the merged `main`, which is what is live. Every capture of that set in this task and later uses the same three commands, with a new `--out` folder (Playwright on `NODE_PATH`, see `tools/browser.js`; `node build.js` first):

```bash
node tools/stills.js --out <dir> --circuit silverstone-v1
node tools/stills.js --out <dir> --circuit indianapolis-v1,brands-hatch-v1 --cam chase,high
node tools/stills.js --out <dir> --circuit monaco-gp-v1 --cam chase,grid,high,apex --tick 600
```

That is Silverstone with all six cameras, Indianapolis and Brands Hatch with `chase` and `high`, Monaco with `chase`, `grid`, `high` and `apex`, in Retro and Modern. The stills are 1280 x 607 with the halo hidden. Never run the tool with no `--circuit`: its defaults are every circuit at tick 900.

The stills tool pins `Math.random` and starts the stream again at every 2D canvas context, so in a pinned page three.js UUIDs repeat. That is harmless on r128. If pictures break only in the pinned page on the new engine, the stills tool replaces `THREE.MathUtils.generateUUID` with a counter based unique generator after the bundle loads, and the control is run again: stills of the older circuits, pinned against unpinned, must match. Run `node tools/stills-pin-check.js` again after the move as well (its header says how).

Migrate the colour pipeline in this order, **one commit each**, capturing `stills/move-N` after each and reading the comparison against `stills/before-main`, Monaco's eight stills included. The picture gets worse before it gets better; what matters is that each step moves it the way that step predicts.

- [ ] **Step 1: Swap the bundle and make it boot.** Renderer construction, `webgl2` probe, shader syntax for the post pass, the global `THREE` for every source file and for the node tests that load it (`test/physics.test.js`, `test/sim-parity.test.js`; `test/track-bake.test.js` and `tools/bake-tracks.js` stay on r128). Expected first symptom of anything missed: a dark, flat frame. Run `node test/sim-parity.test.js`: all four digests identical. If they are not, stop: something in the sim depended on the engine.
- [ ] **Step 2: Texture colour space.** `sRGBEncoding` and `.encoding` (K:186, G:128, G:185: `texFromCanvas`, the render target in `buildRenderer`, the canvas texture in `buildEnvironment`) become `SRGBColorSpace` and `.colorSpace`.
- [ ] **Step 3: Remove the double conversion.** `convertSRGBToLinear()` (K:172, C:15: `srgb` and `part`) goes, because colour management now converts hex input itself. Every colour that goes through `srgb()` is covered by that one change, including the ones Monaco added (`buildMonacoTunnelAndUrbanScenery`, the city paving in `buildTrackMeshes`) and the grey ground plane in `buildScenery`. Check them in the Monaco stills.
- [ ] **Step 4: Raw hex colours that now shift the other way:** sky (T:1139 to 1141, `zenith` and `mid` in `buildSky`, and `SKY_HAZE`), fog and clear colour (G:113, G:201: `setClearColor(SKY_HAZE)` in `buildRenderer`, `new THREE.Fog(SKY_HAZE, ...)` in `buildWorld`), lights (G:207 to 213, the three lights in `buildWorld`; G:368, `setLights`; T:905, the start light material in `buildStartGantry`). Monaco added two more in `buildMonacoTunnelAndUrbanScenery`: `goldLight = new THREE.Color(0xffd700)`, used as a vertex colour on the tunnel's light strips, and the yacht window material `color: 0x050505`. Find any others with `grep -n "new THREE.Color(0x\|color: 0x\|setHex(\|Light(0x" src/*.js`. Correct each so the drawn colour matches the before still.
- [ ] **Step 5: Light intensity.** The legacy scale is gone; expect about a factor of pi on the hemisphere, directional and ambient lights (G:207 to 213, in `buildWorld`). Set each by measurement against the before stills, not by multiplying and hoping.
- [ ] **Step 6: Tone mapping and output encoding in the post pass,** as specified above. Sky and clouds use `MeshBasicMaterial` and are tone mapped today; keep them so. The same holds for the other unlit materials: the start banner and start lights, the corner boards, the car's blob shadow, and at Monaco the tunnel's light strips, its banner, the casino sign and the yacht windows.
- [ ] **Step 7: Shadows as today.** The Modern shadow map (2048, the 70 m box that follows the car, G:215 to 232, set up in `buildWorld` and moved in `updateCamera`) works as before, including `updateProjectionMatrix` after the box is edited. "As today" means main's flags at HEAD: read them with `grep -n "castShadow\|receiveShadow" src/*.js`. On `main` the trees cast and receive on every circuit, and at Monaco the tunnel, the hotel, the casino, the yachts and the street buildings cast as well.
- [ ] **Step 8: The picture parity gate.** Capture the full 28 image set into `stills/after-move` with the three commands above. Run `node tools/stills-compare.js stills/before-main stills/after-move --max 6`. Expected: 28 compared, every image at or under a mean of 6, on both tiers. Look at the three worst pairs by eye as well. Write the table of numbers and the threshold into `docs/v2-picture-log.md`. If 6 cannot be met for a reason that is a real improvement or an unavoidable difference in the engine, state the reason and the number in the log and stop for Jamie's view; do not quietly raise the threshold. One place to look first, not confirmed by a render: the tree shadows, because a reader of the merge reported that r128's shadow pass ignores the tree texture's alpha test, and a newer engine may draw their shape differently. Write in the log which path the stills ran on: the stills tool uses headless Chromium, which may not offer WebGPU, so the 28 images may exercise only the fallback. If so, say it plainly, and check the other path by eye in Chrome on this Mac with the same six cameras at Silverstone and `chase` and `high` at Monaco.
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

- [ ] **Step 10: Run everything.** `node test/sim-parity.test.js`, `node test/physics.test.js`, `node test/fpmath.test.js`, `node test/track-bake.test.js`, `node test/music.test.js`, `node build.js`, `node test/csp.js`, `node test/picture.js`. Both outputs build, and `dist/artifact.html` boots. Bench in Chrome, four rows with `node tools/bench.js --quality <q> --circuit <id> --seconds 20`: Modern at Silverstone, Retro at Silverstone, Modern at Indianapolis, Modern at Monaco. Compare on the mean, because p95 is noisy with the frame limit off: each within 10% of its baseline (5.26, 1.03, 5.24 and 5.73 ms). The path benched is the one the game picks by default in Chrome on this Mac; name it in the log beside each figure. Write the four rows in the log with the render target, canvas and drawing buffer sizes, which must equal the baseline's. Open the page in Chrome, Safari and Firefox on this Mac and in the iOS Simulator: a race starts in Retro and in Modern, at Silverstone and at Monaco. `git checkout -- dist`.
- [ ] **Step 11: Commit** the last step as `Complete the move to three.js 0.187`. The body gives the parity numbers, the page size before and after, and the bench before and after, and names each build by its sha and channel.

### Task 7: The Ultra tier, as a place to put things

**Files:**
- Modify: `src/40-game.js:1065-1124` (settings: `loadSettings`, `applySettings`, `syncSettingsUi`), `src/40-game.js:2477-2502` (`applyQuality`), `src/40-game.js:911-941` (`resize`), `src/40-game.js` (`hookSelect`, the selection helper that `MCL64.photo` and `MCL64.bench` use), `src/index.template.html:1027-1029` (the `#set-quality` button and `#set-quality-hint`), `test/picture.js`, `tools/stills.js` (only if its `--quality` handling needs widening: at HEAD it passes the names straight to the hook and checks nothing itself, so its usage text is the one place that names the two tiers)

**Interfaces:**
- Produces: `settings.quality` is `'retro' | 'modern' | 'ultra'`. `settings.timeOfDay` is `'morning' | 'midday' | 'golden' | 'dusk'`, default `'midday'`. Anything else read from storage falls back to the default for that field.
- Produces: `var TIERS = { retro: {...}, modern: {...}, ultra: {...} }`: one table that `applyQuality` and `resize` read, in place of the scattered `modern ?` tests. Fields: `target` (`'small'` or `'super'`), `toneMapping`, `exposure`, `shadows` (`'blob' | 'single' | 'cascades'`), `sky` (`'dome' | 'physical'`), `post` (`'retro' | 'grade' | 'full'`), `overlays` (boolean), `canvas` (`'device'` or `'target'`).
- `canvas` is the rule for the size of the canvas drawing buffer. `'device'` for `retro` and `modern` is main's behaviour: the canvas drawing buffer is the render target times the device pixel ratio. `'target'` for `ultra`: the canvas drawing buffer equals the render target, so the canvas is no larger than the one buffer the cap already limits (the cap's rounding is described in the next point, and task 10 makes it exact). `applyQuality` sets the renderer's pixel ratio from it (the device pixel ratio for `'device'`, as `buildRenderer` does on `main`; 1 for `'target'`) and `resize` follows. Ultra does not inherit main's canvas: the tier is new, so the rule is in force from the commit that creates it, and every Ultra bench row in tasks 8 to 10 is taken with it.
- The sizes this gives on the bench display (1728 x 1028 viewport, device pixel ratio 2): Modern has a 6144 x 3386 canvas for a 3072 x 1693 render target, exactly as on `main`; Ultra has a 3072 x 1693 canvas for a 3072 x 1693 render target. The two differ on purpose. One detail of the cap: `resize` rounds each side after it scales to the cap, so the product can land a few hundred pixels over the round number (3072 x 1693 is 5,200,896).
- Produces: `Game.prototype.applyQuality()` tears down what the previous tier built and builds what the new one needs. In this task Ultra equals Modern in every field except `canvas`; tasks 8 to 10 change one field each.
- `hookSelect` refuses any tier but `retro` and `modern` today (it throws `unknown quality`). It must accept `'ultra'`, or any key of `TIERS`, so that `MCL64.photo` and `MCL64.bench` can select Ultra: the stills in step 3 and every Ultra bench row from task 8 on go through it.
- The settings button cycles RETRO 240p, MODERN, ULTRA. The hint line for Ultra reads: `Ultra: shadows across the whole view, a real sky and time of day.` A second row, TIME OF DAY, is shown only while Ultra is selected.
- The scanline and glow overlays (H:115 to 137, the `.scanlines` and `.glow` rules) follow `overlays`: on for Retro only.
- `resize` keeps main's sizes for Retro and Modern exactly: the Modern render target, and a canvas that is the render target times the device pixel ratio, because the renderer is created with the full device pixel ratio. Moving the sizes into `TIERS` must not change either. Ultra's render target is sized as Modern's, and its canvas equals it (`canvas` above).
- The H key halo toggle that came with `main` (`toggleHalo`, `applyHalo`) is not a tier setting and is left alone.

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

  Also check the rule this task introduces, in a page opened at device pixel ratio 2: in Ultra `canvas.width * canvas.height` equals `game.gw * game.gh`, and in Modern the canvas is the render target times 2 each way, as on `main`.

- [ ] **Step 2: Run** (fail), **implement**, **run** (pass).
- [ ] **Step 3: Parity still holds.** Capture the 28 image set into `stills/after-tiers` with the three commands below, then compare against `stills/after-move` with `--max 0.5` for Retro and Modern. Expected: 28 compared, unchanged. Ultra stills equal Modern stills at this commit, at Monaco as well.

```bash
node tools/stills.js --out stills/after-tiers --circuit silverstone-v1
node tools/stills.js --out stills/after-tiers --circuit indianapolis-v1,brands-hatch-v1 --cam chase,high
node tools/stills.js --out stills/after-tiers --circuit monaco-gp-v1 --cam chase,grid,high,apex --tick 600
```

  Never run the tool with no `--circuit`: its defaults are every circuit at tick 900, and Monaco's reference stills are at tick 600.

  The tool's default is `--quality retro,modern`, so those three commands take no Ultra still. Take the Ultra stills with the same three commands and `--quality ultra`, into their own folder:

```bash
node tools/stills.js --out stills/after-tiers-ultra --quality ultra --circuit silverstone-v1
node tools/stills.js --out stills/after-tiers-ultra --quality ultra --circuit indianapolis-v1,brands-hatch-v1 --cam chase,high
node tools/stills.js --out stills/after-tiers-ultra --quality ultra --circuit monaco-gp-v1 --cam chase,grid,high,apex --tick 600
```

  That is 14 images. The compare tool pairs files by name, and the tier is part of the name, so copy the 14 Modern stills from `stills/after-tiers` into a scratch folder with `.modern.` in each name changed to `.ultra.`, then compare that folder with `stills/after-tiers-ultra` at `--max 0.5`. Expected: 14 compared, unchanged. The stills are taken at device pixel ratio 1, where the `'device'` and `'target'` canvas rules give the same picture, so the `canvas` field does not make Ultra differ from Modern here.
- [ ] **Step 4: Commit** `Add an Ultra tier and a time of day setting`.

### Task 8: Shadows across the whole view (Ultra)

**Files:**
- Create: `src/33-shadows.js`
- Modify: `src/40-game.js` (`buildWorld`, `applyQuality`, `updateCamera` where the sun follows the car at G:2010), `src/20-track.js:719-722,797-1110` (caster and receiver flags on stands, gantry, trees, signs, ground: the `receiveShadow` traverse at the end of `buildTrackMeshes`, then `buildStandRing`, `buildStartGantry` and `buildScenery`; Monaco's own flags are in `buildMonacoTunnelAndUrbanScenery`), `src/30-cars.js:224,238` (the chassis, wheel and halo `castShadow` lines in `buildCarMesh`), `build.js` (file list)

**Interfaces:**
- Produces: `function ShadowRig(scene, camera, sun)`; `setMode(mode)` with `'blob' | 'single' | 'cascades'`; `update()` once per frame; `dispose()`.
  - `'single'` is today's map, unchanged.
  - `'cascades'`: on the WebGPU path `CSMShadowNode` on the sun's shadow; on the WebGL path the `CSM` addon with its material set up. Starting values: 4 cascades, 2048 each, far limit 700 m, practical split.
- In Ultra: cars, trees, stands, the gantry and signs cast; road, kerbs, runoff, grass and the stand faces receive. In Retro and Modern the flags are as they are today, set by `applyQuality` from `TIERS`.
- "As today" means main's flags, whatever they are at HEAD: read them from the code with `grep -n "castShadow\|receiveShadow" src/*.js`, and do not take them from an older description. On `main` when this was written: every car's chassis, wheels and halo mesh cast (the halo only shows when H is pressed); the trees cast and receive on every circuit; the track ribbons and the grey ground plane receive; stands, the gantry and signs cast nothing; at Monaco the tunnel, the hotel, the casino, every yacht and every street building cast and receive, and the sea receives. That is roughly 650 casters at Monaco, a count taken from the delta study and not measured on this branch.
- Modern's 70 m shadow box follows the player's car, not the camera: `updateCamera` moves the sun and its target to the player, and `photo` calls it before it places a fixed camera. So a car near the player has a shadow in Modern whichever camera takes the still. At tick 900 on the three older circuits the player has left the start, so Silverstone's `grid` and `stands` stills have no car in view and show no car shadows, and in the `high` stills and Silverstone's `apex` the field is in view but far from the camera, so any car shadow there is small. At Monaco (tick 600) the field is still on the start straight and inside the box, so `high` does show them (`docs/v2-picture-log.md`, "Tick used per circuit"). A car shadow lost from a Monaco still is therefore a fault, not today's behaviour.
- Monaco in this task: Ultra must run at Monaco without error, and its bench figure is recorded. Its polish (the tunnel's lighting, the sea, limiting or merging its casters) is part two, with one exception given in step 4.
- Ultra is benched with the canvas rule from task 7 already in force (`canvas: 'target'` in `TIERS`), so the Ultra rows here, in task 9 and in task 10 are like for like. Ultra and Modern differ in canvas size on purpose: on the bench display Modern has a 6144 x 3386 canvas for a 3072 x 1693 render target, and Ultra has a 3072 x 1693 canvas for the same render target. Write that note beside the bench table in the log, with the sizes each row reports.

- [ ] **Step 1: Implement `ShadowRig` and move today's single map into it** with no change in the picture. Capture the 28 image set into `stills/after-shadows` (Silverstone with no `--cam`; Indianapolis and Brands Hatch with `--cam chase,high`; Monaco with `--cam chase,grid,high,apex --tick 600`; always pass `--circuit`) and compare Retro and Modern against `stills/after-tiers` with `--max 0.5`. Commit this step alone: `Move the shadow set up into a ShadowRig`.
- [ ] **Step 2: Add the cascades mode and the Ultra caster and receiver flags.**
- [ ] **Step 3: Look at it.** Capture Ultra at Silverstone, all six cameras, and Indianapolis `high`. Expected, by eye: in `high` the stands, the gantry and the trees throw shadows on the ground and the road; in `grid` every car on the grid has a shadow, including the back row (take this one still at `--cam grid --tick 120`, during the countdown, when the field is still on the grid; at tick 900 the `grid` camera sees an empty straight; the other five cameras stay at tick 900); in `apex` a car 300 m up the road has a shadow; no shadow floats away from its tyre; no hard seam where one cascade hands over to the next. Capture ticks 900 and 903 from `chase` and compare: static shadow edges do not crawl between the two. Then capture Ultra at Monaco, `chase` and `high` at tick 600: the page reports no error and the picture is not blank. Say in the log what the tunnel looks like; it is not judged here.
- [ ] **Step 4: Measure.** Bench in Chrome at 1728 x 1028 with `node tools/bench.js --quality <q> --circuit <id> --seconds 20`. First the four baseline rows (Modern at Silverstone, Retro at Silverstone, Modern at Indianapolis, Modern at Monaco), compared on the mean with 5.26, 1.03, 5.24 and 5.73 ms, each within 10%, to show Retro and Modern have not moved. Then Ultra at Silverstone, at Indianapolis (33 cars) and at Monaco. Write every row in the log, with the note that Ultra and Modern differ in canvas size on purpose (see Interfaces) and the three sizes each row reports. Target for this part: an average at or under 16.7 ms at Silverstone. If it misses, try three cascades or 1536 maps before anything else, and say what was traded. Monaco has its own figure: Ultra at Monaco is recorded, and if its mean is above 16.7 ms, limit or merge Monaco's shadow casters in this task and say what was traded. If it is still above 16.7 ms after that, record the figure and carry it to the look demo as a known limit; do not hold the task for it. If Monaco's mean is at or under 16.7 ms, its casters are left for part two.
- [ ] **Step 5:** `node test/picture.js && node test/sim-parity.test.js && node test/music.test.js`. Then prove this task's real change (the flags `applyQuality` now sets from `TIERS`, and any limiting or merging of Monaco's casters) left Retro and Modern alone: capture the 28 image set into `stills/after-cascades`, then `node tools/stills-compare.js stills/after-shadows stills/after-cascades --max 0.5` (28 compared, unchanged) and `node tools/stills-compare.js stills/before-main stills/after-cascades --max 6`. **Commit** `Add cascaded shadows across the whole view in Ultra`.

### Task 9: A real sky and time of day (Ultra)

**Files:**
- Create: `src/32-sky.js`
- Modify: `src/40-game.js:156-197` (`buildEnvironment`), `src/40-game.js:199-213` (lights, fog: the top of `buildWorld`), `src/40-game.js` (`applyQuality`, settings row), `build.js`, `test/picture.js`

**Interfaces:**
- Produces: `var TIME_OF_DAY = { morning: { elevation: 22, azimuth: 100 }, midday: { elevation: 58, azimuth: 170 }, golden: { elevation: 12, azimuth: 250 }, dusk: { elevation: 3, azimuth: 265 } };` in degrees. Starting values, tuned by eye per circuit so the main straight is never lit flat from directly behind the camera.
- Produces: `function SkyRig(scene, renderer, sun, hemi, ambient)`; `setMode('dome' | 'physical')`; `setTimeOfDay(name)`; `dispose()`.
  - `'dome'` is today's vertex coloured dome and painted environment, unchanged.
  - `'physical'`: the `SkyMesh` (WebGPU path) or `Sky` (WebGL path) addon with a visible sun disc. `setTimeOfDay` moves the sun light to match, sets its colour and strength and the fill lights for that hour, rebuilds `scene.environment` from the sky through `PMREMGenerator`, and sets the fog colour from the sky at the horizon in the direction the camera faces at the start line.
- Changing the time of day never touches the sim.
- The grey ground plane to the horizon exists on `main` (4000 x 4000 at y = -10, built in `buildScenery` on every circuit), so Ultra's sky does not sit over a void.
- Monaco in this task: Ultra must run at Monaco without error, and its bench figure is recorded. In Modern the only thing that darkens the tunnel is the shadow its roof casts from the one sun; its light strips are unlit materials and give no light. Sky and fill light that are not shadowed may light it like open air. Its lighting, and the sea, are part two: say in the log what they look like and do not fix them here.
- Ultra is benched with the canvas rule from task 7 in force (`canvas: 'target'` in `TIERS`), as in task 8, so the Ultra rows are like for like. Ultra and Modern differ in canvas size on purpose: on the bench display Modern has a 6144 x 3386 canvas for a 3072 x 1693 render target, and Ultra has a 3072 x 1693 canvas for the same render target. Write that note beside the bench table in the log, with the sizes each row reports.
- The Retro and Modern stills in this task are the 28 image set, the same 28 as the reference in `stills/before-main`: Silverstone with all six cameras (no `--cam`), Indianapolis and Brands Hatch with `--cam chase,high`, Monaco with `--cam chase,grid,high,apex --tick 600`. Always pass `--circuit`. They are compared with `--max 0.5` against `stills/after-cascades`, the 28 image set taken at the end of task 8, and the gate against the reference still holds: `node tools/stills-compare.js stills/before-main <dir> --max 6`.

- [ ] **Step 1: Move today's dome and environment into `SkyRig` mode `'dome'`** with no change in the picture. Capture the 28 image set into `stills/after-skyrig` and run `node tools/stills-compare.js stills/after-cascades stills/after-skyrig --max 0.5`. Expected: 28 compared, unchanged. Commit alone: `Move the sky set up into a SkyRig`.
- [ ] **Step 2: Add `'physical'` and the four times of day. Extend `photo` to honour `timeOfDay`.**
- [ ] **Step 3: Add to `test/picture.js`:** in Ultra, forty changes of time of day leave the texture and render target counts at their baseline, with no uncaught error (Review Focus 4, second half).
- [ ] **Step 4: Look at it.** Capture the whole Ultra set into `stills/ultra-sky`, 32 images: Silverstone with six cameras at four times of day (24), and Monaco `chase` and `high` at tick 600 at four times of day (8).

```bash
node tools/stills.js --out stills/ultra-sky --quality ultra --circuit silverstone-v1 --tod morning,midday,golden,dusk
node tools/stills.js --out stills/ultra-sky --quality ultra --circuit monaco-gp-v1 --cam chase,high --tick 600 --tod morning,midday,golden,dusk
```

  Expected at Silverstone, by eye: the sun disc is where the shadows say it is; car paint reflects the sky of that hour and not the old painted one; golden hour throws long shadows and warm light without crushing the shaded side of the stands to black; dusk is low sun, not night, and the road is still readable from `chase` and `helmet`; the horizon meets the fog with no visible band; the ground plane meets the sky with no gap. Expected at Monaco: the page reports no error and the picture is not blank.
- [ ] **Step 5:** Run `node test/picture.js && node test/sim-parity.test.js && node test/music.test.js`. Retro and Modern stills unchanged: capture the 28 image set into `stills/after-sky`, then `node tools/stills-compare.js stills/after-cascades stills/after-sky --max 0.5` (28 compared, unchanged) and `node tools/stills-compare.js stills/before-main stills/after-sky --max 6`. Bench the four baseline rows (Modern at Silverstone, Retro at Silverstone, Modern at Indianapolis, Modern at Monaco; compare on the mean with 5.26, 1.03, 5.24 and 5.73 ms, each within 10%; command: `node tools/bench.js --quality <q> --circuit <id> --seconds 20`) and Ultra at Monaco, and write them in the log. **Commit** `Add a physical sky and four times of day in Ultra`.

### Task 10: Bloom, grading and antialiasing (Ultra)

**Files:**
- Modify: `src/40-game.js:14-55` (post: `POST_VERT` and `POST_FRAG`), `src/40-game.js:911-941` (`resize`), `src/40-game.js:2584-2602` (`render`), `test/picture.js`

**Interfaces:**
- Produces: `TIERS.ultra.post = 'full'`: the scene pass, bloom, tone mapping, a grade per time of day, then output. WebGPU path: the node pipeline (`RenderPipeline`, `pass`, the bloom node). WebGL path: `EffectComposer` with `RenderPass`, `UnrealBloomPass`, a grade `ShaderPass`, `OutputPass`.
- Bloom is for things that are truly bright (the sun disc, glints on paint, start lights), so the threshold sits above lit asphalt. Starting values: strength 0.35, radius 0.6, threshold 1.0 on scene referred values.
- `var GRADES = { morning: {...}, midday: {...}, golden: {...}, dusk: {...} }`: lift, gain and saturation per time of day. Midday is neutral.
- Antialiasing in Ultra: keep the supersampled target (factor 1.35 times the device pixel ratio, with the ratio held between 1 and 2, capped at 5,200,000 pixels, G:922 to 932: `maxPx` in `resize`) unless multisampling on the chosen renderer gives a cleaner edge for less; state which and why in the log.
- The pixel cap in Ultra covers both the render target and the canvas, at device pixel ratios 1 and 2. On `main` the cap limits the render target only: the renderer is created with `antialias: true` and the full device pixel ratio (`buildRenderer`), so the canvas is the render target times that ratio each way. In Modern at ratio 2 that is a 6144 x 3386 canvas for a 3072 x 1693 render target, well over the cap. Retro and Modern keep that behaviour exactly as `main` has it; whether it should change is a question for Jamie and is not decided in this plan. Ultra's canvas has been inside the cap from the start: task 7 gave `TIERS` the field `canvas`, which is `'target'` for `ultra` (the canvas drawing buffer equals the render target) and `'device'` for `retro` and `modern`. This task does not introduce that rule. Its check (step 1) verifies it at device pixel ratios 1 and 2, and whatever this task does to the render target or the post chain must keep it true.
- One detail of the cap: `resize` rounds each side after it scales to the cap, so the product can land a few hundred pixels over the round number (on the bench display the render target is 3072 x 1693, which is 5,200,896). The check compares with 5,200,000 exactly. If it trips on that rounding alone, round Ultra's sides down so the product stays at or under the cap, leave Retro and Modern as they are, and say so in the log; do not loosen the check.
- The Ultra bench rows in tasks 8 and 9 were taken with the same canvas rule, so this task's rows are like for like with theirs. Ultra and Modern differ in canvas size on purpose: on the bench display Modern has a 6144 x 3386 canvas for a 3072 x 1693 render target, and Ultra's canvas equals its render target. Write that note beside the bench table in the log, with the sizes each row reports.
- Retro and Modern post is untouched.
- The Retro and Modern stills in this task are the 28 image set, the same 28 as the reference in `stills/before-main`: Silverstone with all six cameras (no `--cam`), Indianapolis and Brands Hatch with `--cam chase,high`, Monaco with `--cam chase,grid,high,apex --tick 600`. Always pass `--circuit`. They are compared with `--max 0.5` against `stills/after-sky`, the set taken at the end of task 9.
- Monaco in this task: Ultra must run at Monaco without error, and its bench figure is recorded. Its polish is part two.

- [ ] **Step 1: Add the check (Review Focus 5).** It verifies the canvas rule from task 7 and does not introduce it, so the canvas half may pass before step 2; the check must still be in place and passing when this task is committed.

```js
/* The renderer reads the device pixel ratio once, when it is made, so each ratio needs its own page. */
for (const dpr of [1, 2]) for (const [w, h] of [[160, 120], [3840, 2160]]) {
  await bootAt(w, h, dpr); await setQuality('ultra');
  const px = await bufferPixels();                   // { target: game.gw * game.gh, canvas: canvas.width * canvas.height }
  check(px.target <= 5200000 && px.canvas <= 5200000 && uncaught.length === 0 && await canvasIsNotBlank(),
    'Ultra at ' + w + ' x ' + h + ', ratio ' + dpr + ', keeps the render target and the canvas inside the pixel cap', JSON.stringify(px));
}
```

- [ ] **Step 2: Implement.**
- [ ] **Step 3: Look and measure.** Recapture the 32 Ultra images into `stills/ultra-post`, with the two commands from task 9 step 4 and the new folder name. Expected: highlights glow, midtones are not washed out, the HUD is as sharp as before (it is a separate canvas), no halo round the car against the sky. Capture Ultra at Monaco, `chase` and `high` at tick 600: no error, not blank. Bench the four baseline rows (Modern at Silverstone, Retro at Silverstone, Modern at Indianapolis, Modern at Monaco; compare on the mean with 5.26, 1.03, 5.24 and 5.73 ms, each within 10%; command: `node tools/bench.js --quality <q> --circuit <id> --seconds 20`), then Ultra at Silverstone, Indianapolis and Monaco; write the numbers in the log next to task 8's.
- [ ] **Step 4:** Run the whole local suite (`node test/sim-parity.test.js`, `node test/physics.test.js`, `node test/fpmath.test.js`, `node test/track-bake.test.js`, `node test/music.test.js`, `node build.js`, `node test/csp.js`, `node test/picture.js`). Retro and Modern stills unchanged: capture the 28 image set into `stills/after-post`, then `node tools/stills-compare.js stills/after-sky stills/after-post --max 0.5` (28 compared, unchanged) and `node tools/stills-compare.js stills/before-main stills/after-post --max 6`. **Commit** `Add bloom, grading and antialiasing to Ultra`.

### Task 11: The look demo

This is the point of the plan: Jamie sees the difference and says what he thinks before anything else is built.

- [ ] **Step 1: Build and capture.** `node build.js`. Capture into `stills/look-demo`: at Silverstone, Modern (the "before") and Ultra at all four times of day, six cameras; at Indianapolis and Brands Hatch, Modern and Ultra at golden hour, `chase` and `high`; at Monaco, Modern and Ultra at golden hour, `chase` and `high`, at tick 600 (`--circuit monaco-gp-v1 --cam chase,high --tick 600`). Always pass `--circuit`. `git checkout -- dist` is NOT run this time: leave the build in place for step 3.
- [ ] **Step 2: Make one page of pairs.** `stills/look-demo/index.html`: each Modern still beside its Ultra still, grouped by camera, with the time of day as a row of buttons. Images are referenced by relative path. Nothing is fetched from anywhere else. The Monaco pairs are labelled as not yet polished.
- [ ] **Step 3: Put it in front of Jamie.** Send the eight strongest pairs as image files in the session (each pair is the same camera in Modern and in Ultra), with one line each saying what to look at. Say that the built game is in `dist/index.html` on this Mac, name that build by its sha and channel, and say that Ultra is under Settings, Graphics. Say plainly what is not there yet: clouds, rain, the wet road, motion blur, smoke and dust, car and world detail, the automatic choice of tier, and Monaco's polish (the tunnel's lighting, the sea and its shadow casters). If task 8 carried a Monaco frame time above 16.7 ms as a known limit, give that figure here as well.
- [ ] **Step 4: Write the numbers into `docs/v2-picture-log.md`** and commit it: `Record the look demo measurements`. Run everything first: `node test/sim-parity.test.js`, `node test/physics.test.js`, `node test/fpmath.test.js`, `node test/track-bake.test.js`, `node test/music.test.js`, `node test/csp.js`, `node test/picture.js`. Update the README only where it would now be untrue (three.js version, build description, the list of suites and its count of assertions, which the parity and bake tests change). Commit: `Bring the README up to date with the engine move`.
- [ ] **Step 5: Stop for Jamie.** One decision: is this the direction? If yes, which time of day is the default, and part two is planned. If it needs changing, what. Offer, as a separate gated step, a preview on the test site so it can be seen on a phone: that needs a push and a deploy, so it needs a roast and a GO. The questions this plan left open are in the design under "Calls I made that Jamie should check" (the pixel ratio on phones, the artifact build checks, the Monaco export's scaffolding): name them, and do not fold them into the one decision.
