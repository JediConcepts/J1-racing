# MCL-64 v2 picture log

Started 23 Nov 2026, on branch v2-upgrade, before the engine move (three.js r128).

- Machine: Mac14,6 (Apple M2 Max), built-in display at a device pixel ratio of 2 and 120 Hz.
- Bench browser: Google Chrome 158.0.8127.36, headed, through Playwright `channel: 'chrome'`. WebGL renderer reported: ANGLE Metal on the Apple M2 Max.
- Stills browser: Playwright Chromium 159.0.8154.6, headless, SwiftShader (`--use-gl=swiftshader --enable-unsafe-swiftshader`), 1280 x 720, device pixel ratio 1.

Stills are taken with `node tools/stills.js` and compared with `node tools/stills-compare.js`. Frame times are taken with `node tools/bench.js`. The stills themselves are not committed; the numbers are recorded here.

- A still is the game picture only: the HUD and the page's scanline and glow layers are hidden for the photo frame.
- Stills are shorter than 720, because the game stage is the 720 viewport minus the page around it: 1280 x 622 on the stale base, 1280 x 607 on the merged main (see the 913ee61 sections below).
- Changing circuit inside a hook reloads the page (a circuit is only built at boot); the hook rejects, and the tools wait for the circuit to load and call it again.

## Baseline (stale base 18bb12f, superseded)

Superseded by "913ee61: baseline" below. These figures were measured on a branch cut from a stale local `main` (18bb12f), eight commits behind what is live. They are kept for the record only.

`node tools/bench.js --quality <q> --circuit <id> --seconds 20`: the attract demo for 20 s after a 1 s warm up, in a 1728 x 1028 viewport at device pixel ratio 2. Frame time is the gap between animation frames. Chrome is launched with `--disable-gpu-vsync --disable-frame-rate-limit`, so frames are not held to the display's 120 Hz refresh; fps is frames over seconds, and a capped run would show 120 (or 60) fps with a mean of 8.33 ms (or 16.67 ms).

| circuit | tier | frames | fps | mean ms | p95 ms |
|---|---|---|---|---|---|
| silverstone-v1 | modern | 9448 | 472.4 | 2.12 | 6.7 |
| silverstone-v1 | retro | 20230 | 1011.5 | 0.99 | 2.6 |
| indianapolis-v1 | modern | 9230 | 461.5 | 2.17 | 6.5 |

All three are uncapped. A repeat of Silverstone Modern gave 9460 frames, 473.0 fps, 2.11 ms mean, 6.8 ms p95, so run to run spread is about 1%.

## Repeatability (stale base 18bb12f, superseded)

Superseded by "913ee61: repeatability" below. Same stale base as the section above; the stills it describes (`stills/before`, `stills/before-again`) are 1280 x 622 and show the older scenery.

Silverstone, Retro and Modern, all six cameras, tick 900, captured twice into separate folders and compared with `node tools/stills-compare.js stills/before stills/before-again --max 0.5`:

| still | R | G | B | pixels off by more than 24 |
|---|---|---|---|---|
| silverstone-v1.modern.midday.apex | 0.000 | 0.000 | 0.000 | 0.000% |
| silverstone-v1.modern.midday.chase | 0.000 | 0.000 | 0.000 | 0.000% |
| silverstone-v1.modern.midday.grid | 0.000 | 0.000 | 0.000 | 0.000% |
| silverstone-v1.modern.midday.helmet | 0.000 | 0.000 | 0.000 | 0.000% |
| silverstone-v1.modern.midday.high | 0.000 | 0.000 | 0.000 | 0.000% |
| silverstone-v1.modern.midday.stands | 0.000 | 0.000 | 0.000 | 0.000% |
| silverstone-v1.retro.midday.apex | 0.000 | 0.000 | 0.000 | 0.000% |
| silverstone-v1.retro.midday.chase | 0.000 | 0.000 | 0.000 | 0.000% |
| silverstone-v1.retro.midday.grid | 0.000 | 0.000 | 0.000 | 0.000% |
| silverstone-v1.retro.midday.helmet | 0.000 | 0.000 | 0.000 | 0.000% |
| silverstone-v1.retro.midday.high | 0.000 | 0.000 | 0.000 | 0.000% |
| silverstone-v1.retro.midday.stands | 0.000 | 0.000 | 0.000 | 0.000% |

Every pair is identical to the pixel. A third capture taking six of the stills in a different order (Modern first, cameras `stands,apex,chase`) was also identical to the first set, so a still does not depend on which stills were taken before it in the same page.

## 913ee61: the merged main is the reference

`v2-upgrade` was cut from a stale local `main` (18bb12f). The real `main` (95da9ab, eight commits further on, and what is live) was merged in at 913ee61. It brought Monaco GP as a fourth circuit and changed the picture on the three older ones. What is live is the reference picture: every later still and frame time in this log is compared with the 913ee61 sections, not with the two sections above.

Where the numbers below were taken: the bench at 1f2fee9, the stills at 0d4dad8. Between 913ee61 and 1f2fee9 the only change to the game's source is the photo hook itself. Between 1f2fee9 and 0d4dad8 the only change in `src/` is the bound on the photo hook's `tick` (a whole number from 0 to 72000), which draws nothing; `vendor/` and `build.js` did not change. All 68 stills (`stills/main-a`, `stills/main-b`, `stills/before-main`) come from one clean build at 0d4dad8, stamped `v0.104 dev 0d4dad8`, whose `dist/index.html` is 1322520 bytes.

An earlier set of the same stills was taken with the first form of the pin and is replaced. This log first said those were all taken at 4dbf7ce. That was right for the reference set only: the repeatability pair (`stills/main-a`, `stills/main-b`) came from a build of 1f2fee9 with the pin still uncommitted in the tree, stamped `v0.101 dev 1f2fee9*`. The game's source was the same in both builds. See "0d4dad8: the pin and the engine" for why the set was retaken.

## 913ee61: stills

- Size: 1280 x 607. Main changed the page around the stage, so the stage is 15 px shorter in the same 1280 x 720 viewport than on the stale base (1280 x 622).
- Halo: hidden. Main added the H key halo toggle with the halo hidden to start, and the photo hook sets it hidden before every still, whatever was toggled earlier.
- Cameras: `stands` is not available at Monaco, which has no main grandstand. The hook rejects it there and `tools/stills.js` skips it and says so.
- `Math.random` is pinned in the stills page (`pinRandom` in `tools/browser.js`, called by `tools/stills.js` and `tools/stills-pin-check.js` only). Main's `makeBuildingTex` (`src/10-core.js`) draws the three Monaco building textures with `Math.random`, so in the live game Monaco's buildings differ on every page load, and two captures of one frame did not match (channel means of 1.7 to 6.1 across the eight Monaco stills before the pin). The game's source is left as it is. `tools/bench.js` does not pin it, because the bench measures the game as players get it.
- The pin rule: `Math.random` is one fixed generator (mulberry32, seed `0x4d434c36`), started again from the seed every time a canvas is asked for a 2D context (`getContext('2d')` on `HTMLCanvasElement` and `OffscreenCanvas`). Changing the seed, the generator or that rule invalidates every earlier still.
- The cost of that rule, accepted: canvas textures that used to differ only by their random draws now share one pattern. The three Monaco building textures have the same specks and the same missing windows, and differ only in their two colours. A Monaco still shows one fixed set of buildings, and not a set a player can be dealt: in the live game the buildings differ on every load and the three textures differ from each other.

Tick used per circuit:

| circuit | tick | why |
|---|---|---|
| monaco-gp-v1 | 600 | five seconds after the lights: the player is in the middle of the start straight, all five other cars are in the `chase` view, and the whole field is in the `high` view and inside the shadow box |
| silverstone-v1 | 900 | the default, as before |
| indianapolis-v1 | 900 | the default, as before |
| brands-hatch-v1 | 900 | the default, as before |

Monaco ticks that were tried and turned down: 720 (the player is hard against the inside barrier of the first left hander), 900 (on the kerb at La Rascasse, close behind another car), 1500 (a clean street with five cars ahead, but no car in the `high` view), 2400 (clean, but the other cars are small and far away).

## 913ee61: repeatability

Silverstone (all six cameras, tick 900) and Monaco (`chase`, `grid`, `high`, `apex`, tick 600), Retro and Modern, captured twice into separate folders with the pinned tool at 0d4dad8 and compared with `node tools/stills-compare.js stills/main-a stills/main-b --max 0.5`. 20 compared, exit 0.

| still | R | G | B | pixels off by more than 24 |
|---|---|---|---|---|
| monaco-gp-v1.modern.midday.apex | 0.000 | 0.000 | 0.000 | 0.000% |
| monaco-gp-v1.modern.midday.chase | 0.000 | 0.000 | 0.000 | 0.000% |
| monaco-gp-v1.modern.midday.grid | 0.000 | 0.000 | 0.000 | 0.000% |
| monaco-gp-v1.modern.midday.high | 0.000 | 0.000 | 0.000 | 0.000% |
| monaco-gp-v1.retro.midday.apex | 0.000 | 0.000 | 0.000 | 0.000% |
| monaco-gp-v1.retro.midday.chase | 0.000 | 0.000 | 0.000 | 0.000% |
| monaco-gp-v1.retro.midday.grid | 0.000 | 0.000 | 0.000 | 0.000% |
| monaco-gp-v1.retro.midday.high | 0.000 | 0.000 | 0.000 | 0.000% |
| silverstone-v1.modern.midday.apex | 0.000 | 0.000 | 0.000 | 0.000% |
| silverstone-v1.modern.midday.chase | 0.000 | 0.000 | 0.000 | 0.000% |
| silverstone-v1.modern.midday.grid | 0.000 | 0.000 | 0.000 | 0.000% |
| silverstone-v1.modern.midday.helmet | 0.000 | 0.000 | 0.000 | 0.000% |
| silverstone-v1.modern.midday.high | 0.000 | 0.000 | 0.000 | 0.000% |
| silverstone-v1.modern.midday.stands | 0.000 | 0.000 | 0.000 | 0.000% |
| silverstone-v1.retro.midday.apex | 0.000 | 0.000 | 0.000 | 0.000% |
| silverstone-v1.retro.midday.chase | 0.000 | 0.000 | 0.000 | 0.000% |
| silverstone-v1.retro.midday.grid | 0.000 | 0.000 | 0.000 | 0.000% |
| silverstone-v1.retro.midday.helmet | 0.000 | 0.000 | 0.000 | 0.000% |
| silverstone-v1.retro.midday.high | 0.000 | 0.000 | 0.000 | 0.000% |
| silverstone-v1.retro.midday.stands | 0.000 | 0.000 | 0.000 | 0.000% |

Every pair is identical to the pixel. Two further checks, both also identical to the pixel: the reference set below, a third capture, against `stills/main-a` (the 20 stills they share); and the 20 stills of the three older circuits in the reference set against the same 20 taken with no pin at all and against the same 20 taken with the first form of the pin, so neither form of the pin moves anything on a circuit that does not use `Math.random` for its picture.

## 0d4dad8: the pin and the engine

The first form of the pin (4dbf7ce) gave the stills page one fixed `Math.random` stream and never started it again. The vendored three.js draws four values from `Math.random` for every UUID it makes, and it makes one for every geometry, material, texture and object. The Monaco building textures are drawn late in scene building, so they started at a point in the stream that depended on how many objects the engine had built before them. Any change that added or removed one object earlier in boot, and above all a newer three.js, would have rolled different buildings although their code had not changed.

The check is `node tools/stills-pin-check.js <dist dir> [<dist dir> ...]`. It serves each dist folder given, takes Monaco Modern `high` at tick 600 the way `tools/stills.js` does, and prints the sha256 of the PNG. Two builds were given to it: this repo's, and a scratch copy of the tree (outside the repo) with one unused `new THREE.Object3D();` added as the first line of `Game.prototype.buildWorld`.

| pin | build as it is | build with one more object | result |
|---|---|---|---|
| first form (4dbf7ce, as at a4fad18) | `27aa3fa408fcb86d4e021d94809d976f97575556d7949664812d7407e40454d4` | `2a790c89cd5c48abd53ee4cd420be580f4207df5ae83ba196cdd208ed3658e49` | differ |
| started again at every 2D context (0d4dad8) | `f3f38cd9812b0c3f40cbd128b2129297bb8d35cd94fc98d09aad979c17225d42` | `f3f38cd9812b0c3f40cbd128b2129297bb8d35cd94fc98d09aad979c17225d42` | equal |

So the fault was real, and the new rule removes it. Both rows used the same two builds, made from the source at a4fad18. Two controls:

- An untouched scratch copy, built the same way as the one with the extra object, gave the same hash as this repo's build under each form of the pin, so the difference in the first row is the extra object and not the copy or its build stamp.
- The check run again on the clean build at 0d4dad8 gave `f3f38cd9...` once more, and that is also the sha256 of `monaco-gp-v1.modern.midday.high.png` in each of the three retaken sets. Under the first form of the pin `27aa3fa4...` was likewise the hash of that still in the sets now replaced.

The rule and its accepted cost are under "913ee61: stills". One side effect to carry into the engine move: because the stream starts again so often, the UUIDs three.js makes repeat in a pinned page. The vendored three.js reads UUIDs only for JSON export, loading and animation bindings, none of which the game uses, and the 20 stills of the three older circuits did not move by a pixel. A newer three.js has to be checked for that again, and `tools/stills-pin-check.js` should be run again after the move.

## 913ee61: reference set

`stills/before-main`, 28 images, Retro and Modern, all taken with the pinned tool at 0d4dad8: Silverstone with all six cameras; Indianapolis and Brands Hatch with `chase` and `high`; Monaco with `chase`, `grid`, `high` and `apex`. This is the "before" picture for the rest of the v2 work. The images are not committed.

Against the set it replaces (the first form of the pin): the 20 stills of the three older circuits are identical to the pixel, and the eight Monaco stills differ, with channel means of 1.1 to 6.8, because the buildings are a different fixed set.

The stale sets (`stills/before`, `stills/before-again`) are kept but cannot be compared with this one in numbers. They are 1280 x 622 and the new stills are 1280 x 607, so `node tools/stills-compare.js stills/before stills/before-main` prints a SIZE line for each of the 20 shared names and exits 1. The stage is a different shape, the cameras frame differently, and a difference figure would mean nothing. What changed between the two is listed under "Picture changes that came with main".

## 913ee61: baseline

`node tools/bench.js --quality <q> --circuit <id> --seconds 20`, as in the stale section: system Chrome 158.0.8127.36, headed, 1728 x 1028 viewport, device pixel ratio 2, ANGLE Metal on the Apple M2 Max, the attract demo for 20 s after a 1 s warm up, launched with `--disable-gpu-vsync --disable-frame-rate-limit`. No page errors on any run. Measured at 1f2fee9 and not run again for this section, because nothing in the game changed since.

The bench now records three sizes. The render target is what the 3D scene is drawn into (`game.gw` x `game.gh`), the canvas is the WebGL canvas, and the drawing buffer is what the browser allocated for it.

| circuit | tier | frames | fps | mean ms | p95 ms | render target | canvas | drawing buffer |
|---|---|---|---|---|---|---|---|---|
| silverstone-v1 | modern | 3805 | 190.3 | 5.26 | 14.4 | 3072x1693 | 6144x3386 | 6144x3386 |
| silverstone-v1 | retro | 19444 | 972.2 | 1.03 | 2.7 | 697x384 | 1394x768 | 1394x768 |
| indianapolis-v1 | modern | 3788 | 189.4 | 5.24 | 14.6 | 3072x1693 | 6144x3386 | 6144x3386 |
| monaco-gp-v1 | modern | 3490 | 174.5 | 5.73 | 10.6 | 3072x1693 | 6144x3386 | 6144x3386 |

All four are uncapped.

Modern at Silverstone rose from a mean of 2.12 ms on the stale base to 5.26 ms on main (472.4 fps down to 190.3), and Indianapolis from 2.17 ms to 5.24 ms. Retro is about where it was (0.99 ms then, 1.03 ms now). The likely cause came with main: the renderer is now created with `antialias: true` and `setPixelRatio(window.devicePixelRatio)`, where the stale base had `antialias: false` and `setPixelRatio(1)`. On this display that makes the canvas and its drawing buffer 6144 x 3386 for a 3072 x 1693 render target, twice the render target each way. It is a likely cause and not a measured one: nothing isolates it, since no run was made with either setting put back, and main changed other things in the picture as well (listed below). The stale bench did not record sizes. Any later frame time is compared with this table, at these sizes.

## 913ee61: Picture changes that came with main

For the three older circuits (Silverstone, Indianapolis, Brands Hatch), against the stale base:

- The scenery seed changed, so the trees and clouds moved.
- Trees cast shadows.
- A 4000 x 4000 grey ground plane at y = -10.
- A new chequered start banner.
- Unlit corner boards.
- The pit board material changed (`pitMat` lost its roughness and metalness settings, so it takes the defaults).
- `antialias: true` and the full device pixel ratio on the renderer.

Monaco is new with main, so it has no earlier picture. Its buildings are different on every load in the live game (see "913ee61: stills"); the stills show one fixed set of them.

What is live is the reference picture. None of the above is a fault to be put back.
