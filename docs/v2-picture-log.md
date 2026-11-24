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

## Task 4: the vendoring tool

Written on ce5272a. `node tools/vendor-three.js <webgl|webgpu> <workdir>` turns three.js 0.187.0, which ships ES modules only, into one classic script that defines the global `THREE`. It was run with the scratchpad folder that already held both packages as `<workdir>`; nothing was downloaded. Nothing in the game changed: `vendor/three.min.js` (r128) is still what `build.js` reads. The two built files are on disk and not committed; task 5 decides which one stays.

- three 0.187.0 (`REVISION` reads `187`), esbuild 0.28.2, node 22.22.2. The tool pins both package versions and fetches a package only when it is missing from `<workdir>` or there at another version.
- esbuild options: `bundle`, `format: 'iife'`, `globalName: 'THREE'`, `minify`, `legalComments: 'inline'`, a banner (the licence header) and a footer (below). No target is set.

| file | bytes | gzip -9 | SHA-256 |
|---|---|---|---|
| `vendor/three.webgl.js` | 594,148 | 148,333 | `1c5121c6aed776ba0d5f180dd63174727359ba4a85590ddd4ef387fbac38da46` |
| `vendor/three.webgpu.js` | 853,346 | 232,390 | `525bee5ef2429c0e035ef0e67006f42573db46159da9031c5926c71537ae48b9` |
| `vendor/three.min.js` (r128, for scale) | 603,445 | 148,752 | not taken |

The page: `node build.js` at ce5272a gives a standalone page of 1,322,522 bytes and a fragment of 1,317,899. By arithmetic alone (take out r128, put in the new file), the standalone page would be about 1,313,000 bytes with the WebGL flavour and about 1,572,000 with the WebGPU flavour, against the limit of 2,500,000. That is an estimate. No page was built with either file; task 5 measures it.

### Names each entry exports

Step 1 of the task: every addon path and name in the plan was checked against the unpacked `three@0.187.0` package, by reading each file's `export` lines and its JSDoc. None differ from the plan, so the plan's list is unchanged. The three.js website was not consulted: the package is the authority, and its JSDoc is the text of the 0.187 documentation.

| plan name | file in the package | what the file exports |
|---|---|---|
| `CSM` | `examples/jsm/csm/CSM.js` | `CSM` |
| `Sky` | `examples/jsm/objects/Sky.js` | `Sky` |
| `EffectComposer` | `examples/jsm/postprocessing/EffectComposer.js` | `EffectComposer` |
| `RenderPass` | `examples/jsm/postprocessing/RenderPass.js` | `RenderPass` |
| `ShaderPass` | `examples/jsm/postprocessing/ShaderPass.js` | `ShaderPass` |
| `UnrealBloomPass` | `examples/jsm/postprocessing/UnrealBloomPass.js` | `UnrealBloomPass` |
| `OutputPass` | `examples/jsm/postprocessing/OutputPass.js` | `OutputPass` |
| `CSMShadowNode` | `examples/jsm/csm/CSMShadowNode.js` | `CSMShadowNode` |
| `SkyMesh` | `examples/jsm/objects/SkyMesh.js` | `SkyMesh` |
| the bloom node | `examples/jsm/tsl/display/BloomNode.js` | the function `bloom` by name, the class `BloomNode` as the default |

`build/three.webgpu.js` has `class RenderPipeline`, and `PostProcessing` is a subclass of it that warns it was renamed in r183. `forceWebGL` is a parameter of `WebGPURenderer`.

`grep -oh "THREE\.[A-Za-z0-9_]*" src/*.js | sort -u` on the tree gives 43 names. `sRGBEncoding` is gone from 0.187 and is in neither entry. `WebGLRenderer` is not in the WebGPU build.

`vendor/three.webgl.js`, 56 names on `THREE`:

- 42 the source uses today: `ACESFilmicToneMapping AmbientLight BackSide BoxGeometry BufferAttribute BufferGeometry CanvasTexture Color CylinderGeometry DirectionalLight DoubleSide EquirectangularReflectionMapping Euler Float32BufferAttribute Fog Group HemisphereLight LinearFilter LinearMipmapLinearFilter Matrix4 Mesh MeshBasicMaterial MeshStandardMaterial NearestFilter NearestMipmapLinearFilter NoToneMapping OrthographicCamera PCFSoftShadowMap PMREMGenerator PerspectiveCamera PlaneGeometry Quaternion RGBAFormat RepeatWrapping Scene ShaderMaterial SphereGeometry TorusGeometry Vector2 Vector3 WebGLRenderTarget WebGLRenderer`
- 7 the move needs that the source does not name yet: `HalfFloatType LinearSRGBColorSpace MathUtils Object3D PCFShadowMap REVISION SRGBColorSpace`
- 7 addons: `CSM Sky EffectComposer RenderPass ShaderPass UnrealBloomPass OutputPass`

`vendor/three.webgpu.js`, 58 names on `THREE`:

- 41 the source uses today: the 42 above less `WebGLRenderer`
- the same 7 the move needs
- 6 for this renderer: `MeshBasicNodeMaterial NodeMaterial QuadMesh RenderPipeline RenderTarget WebGPURenderer`
- `TSL`, an object holding 16 functions from `three/tsl`: `Fn If clamp dot float floor mix mod pass renderOutput texture uniform uv vec2 vec3 vec4`
- 3 addons: `CSMShadowNode SkyMesh bloom`

Choices the plan did not make, each open to change in task 5 by editing an entry and running the tool again:

- The `three/tsl` functions sit under `THREE.TSL`, the name three.js itself gives them, and not flat on `THREE`. They cannot be flat: `log` is a console helper in `three/webgpu` and a logarithm in `three/tsl`. The 16 are what `POST_FRAG` needs when it is written as nodes, plus `pass` and `renderOutput`. No game code uses them yet, so the list is a starting point.
- The seven names "the move needs" are my reading of tasks 5 and 6, not a list from the plan.
- `ShaderMaterial` is exported by the WebGPU build, but `WebGPURenderer` does not draw it, so the post pass has to become a node material on that path.

What the lists save, measured by bundling `export *` in their place with the same options: WebGL 797,980 bytes against 594,148 (203,832 saved); WebGPU 1,134,480 against 853,346 (281,134 saved).

One thing found while building, for whoever adds an addon: in the WebGPU flavour a plain `import ... from 'three'` inside an addon must resolve to the WebGPU build. `CSMFrustum.js` imports `Vector3` and `Matrix4` from `three`, and sent to `build/three.module.js` that one import pulled the whole WebGL shader library into the file: 1,016,492 bytes, where the same entry with `three` mapped to `build/three.webgpu.js` gives 853,346. The tool does the mapping. The WebGL flavour has no `three/webgpu` or `three/tsl` at all, so an addon written for the other renderer fails the build there.

### Licence

Each file begins with three.js's own header, read from the package at build time and not typed into the tool:

```
/**
 * @license
 * Copyright 2010-2026 Three.js Authors
 * SPDX-License-Identifier: MIT
 */
```

`legalComments: 'inline'` keeps every `@license` comment where it stands, so an addon that carries its own notice would keep it. The bundler's own list of inputs is 16 package files for the WebGL file and 7 for the WebGPU file. Apart from the three.js build files (`three.core.js`, `three.module.js`, `three.webgpu.js`, `three.tsl.js`), none of them has a licence notice of its own today (each was searched for `@license`, `@preserve`, `copyright` in any case, `SPDX`, `/*!` and `//!`). The header therefore appears 3 times in the WebGL file and 4 times in the WebGPU file: once at the top, and once at the head of each three.js build file that went in.

### The CSP check

`grep -c "new Function\|eval(\|WebAssembly" vendor/three.webgl.js vendor/three.webgpu.js` prints `0` for both files. There is no hit to explain. Counting each token by occurrence and not by line gives the same: `new Function` 0, `eval(` 0 and `WebAssembly` 0 in each file, and the bare word `eval` and the string `wasm` do not occur either.

Wider than the brief's grep, since a minifier can hide things:

- `Function(` occurs 29 times in the WebGPU file and never in the WebGL file. All 29 are the tails of method names: `parseFunction(`, `getNodeFunction(`, `generateWrapFunction(`, `setRenderObjectFunction(`, `getRenderObjectFunction(`, `getShadowRenderObjectFunction(`, `_handleObjectFunction(`, `_currentRenderObjectFunction(`, `getToneMappingFunction(` and `compareFunction(`. None is the `Function` constructor.
- `import(`, `importScripts`, `new Worker`, `fetch(` and `XMLHttpRequest`: 0 in both files.
- `</script`: 0 in both files, so `build.js` will not refuse either.
- URLs: `http://www.w3.org/1999/xhtml` in both (the namespace passed to `createElementNS`); in the WebGL file one link inside a shader comment; in the WebGPU file one link inside a warning message and one shader comment link that occurs twice. Nothing fetches them.

In a browser: each file was put into a page as an inline classic script, served with the `Content-Security-Policy` header from `deploy/.htaccess`, in the stills browser (Chromium 159.0.8154.6, headless, SwiftShader). Both defined `window.THREE`, drew a red box through a post chain (the WebGL file through `EffectComposer`, `RenderPass`, `UnrealBloomPass`, a `ShaderPass` and `OutputPass`, with a `Sky` and a `CSM` constructed; the WebGPU file through `RenderPipeline`, `TSL.pass` and `bloom`, with a `SkyMesh`, a `CSMShadowNode` and a `TSL.Fn` node constructed), read back 255,0,0,255 at the centre of the canvas, and raised no `securitypolicyviolation` event and no page error. **That browser has no WebGPU adapter, so the WebGPU file ran on its WebGL 2 fallback both times, with and without `forceWebGL`. The WebGPU backend itself has not been run by anything in this task.** `node test/csp.js` was not run, because no page was built with either file.

### Under node

Loaded the way `test/physics.test.js` loads the r128 file: `global.window = global; global.self = global; new Function(source)();` then `global.THREE`.

- WebGL file: evaluates, `global.THREE` is defined with 56 names, none undefined.
- WebGPU file: evaluates, `global.THREE` is defined with 58 names, none undefined. No global is missing; it needs nothing a browser has in order to load.
- Both also evaluate in bare node, with neither `window` nor `self` set.
- In each, a `Vector3` turned by a `Quaternion` made from an `Euler` gave the right answer, a `Mesh` of a `BoxGeometry` and a `MeshStandardMaterial` could be made and added to a `Group`, and `MathUtils.generateUUID()` returned a string.

This works because of one line the plan did not have. esbuild's `--global-name=THREE` writes `var THREE = ...`, which is a global in a page but a local inside `new Function`, so `global.THREE` came out undefined. The tool adds the footer `globalThis.THREE=THREE;`. In a page it changes nothing.

Past what the task asked, because task 5 has to know (criterion 6): `test/sim-parity.test.js` was run against each new file, with the one line that names the vendor file swapped in memory and the test left unchanged on disk, never with `--record`. All four digests match the golden file with the WebGL file and with the WebGPU file (4 passed, 0 failed, each time). The test as committed, on r128, also passes.

### Repeatability

Each flavour was built twice from the scratchpad workdir, and once more from a second workdir that the tool filled itself (its fetch path, run with `npm_config_offline=true` so npm could only read its own cache and nothing was downloaded). The three builds of each flavour are identical byte for byte (`cmp`), with the SHA-256 values in the table above. The second workdir is at a different path, so the path does not reach the output.

The tool refuses, with exit code 2 and before doing anything, when `<workdir>` is the repo, a folder inside it, or a symlink to either; it also stops when `<workdir>` is not a folder or the flavour is not one of the two. (As first committed, at a69c112, that refusal could be passed by a path in another letter case. See "The workdir check, corrected" below.) An import in an entry that is not `three`, `three/webgpu`, `three/tsl` or `three/addons/...` fails the build, and a failed build leaves the file in `vendor/` as it was.

### The workdir check, corrected

The review of a69c112 found that the check above compared two strings from `fs.realpathSync`. That call follows symlinks but does not correct letter case, and this disk (APFS) ignores case, so the repo typed in another case was a different string, passed the check, and the tool would have gone on to run `npm install` with the repo as its prefix. Nothing of the kind was ever run: the fault was found by reading and by evaluating the comparison alone.

The check now goes by identity. Two folders are the same folder when `fs.statSync` gives the same `dev` and `ino` for both (read as BigInt), however their paths are spelt. The tool refuses when:

- the repo is met on the way up from the workdir (the workdir is the repo, or inside it; the way up starts from the real path, so a symlink is followed first);
- the workdir is met on the way up from the repo (the repo is inside it; node looks in every `node_modules` above a script, so packages put there would reach the repo's own requires);
- the workdir holds a `.git` entry of any kind;
- any of those checks cannot be made.

The check is a function, `workdirRefusal`, which the file exports when another script requires it; required, the file does nothing else. That let the check be tried on the repo itself without the tool, and so npm, ever running there. A throwaway script outside the repo called it with each input below. "Before" is the old comparison worked out from the same strings; "now" is what `workdirRefusal` returned. `<repo>` is the path `git rev-parse --show-toplevel` prints.

| input | before | now | reason given |
|---|---|---|---|
| `<repo>`, as git gives it | refused | refused | it is the repo, or inside it |
| `<repo>` in upper case, every letter | **accepted** | refused | it is the repo, or inside it |
| `<repo>/tools` | refused | refused | it is the repo, or inside it |
| the parent folder of `<repo>` | **accepted** | refused | the repo is inside it |
| the home folder | **accepted** | refused | the repo is inside it |
| a symlink in the scratchpad that points at `<repo>` | refused | refused | it is the repo, or inside it |
| the real workdir, `<scratchpad>/three` | accepted | accepted | |
| `<repo>/tools` in upper case, every letter | **accepted** | refused | it is the repo, or inside it |
| `<repo>` with one letter in the wrong case | **accepted** | refused | it is the repo, or inside it |
| a symlink in the scratchpad that points at `<repo>/tools` | refused | refused | it is the repo, or inside it |
| `/` | **accepted** | refused | the repo is inside it |
| a scratch folder that holds a file named `.git` | accepted | refused | it holds a .git entry |
| a folder that does not exist | refused | refused | workdir is not a folder |
| a file | refused | refused | workdir is not a folder |
| an empty scratch folder | accepted | accepted | |

Fifteen inputs, fifteen as wanted. The first seven are the ones the fix was asked to prove. After the run the repo had no `node_modules`, and `package.json` and both lockfiles were unchanged.

The `require` of esbuild is also wrapped now. With a workdir whose esbuild folder held only its `package.json`, the tool prints one line (`vendor-three: esbuild in <workdir> could not be loaded (Cannot find module ...). Take esbuild out of its node_modules and run this again, which fetches it afresh.`) and exits 1, where it printed a stack before. A workdir whose esbuild has no platform binary (no `@esbuild` folder) does not fail at the `require` at all: esbuild looks for its binary when the build starts, and the tool's last `catch` already turned that into one line, `vendor-three: The package "@esbuild/darwin-arm64" could not be found, and is needed by esbuild.`, exit 1. Both were run against scratch workdirs, with npm held offline, and neither touched a file in `vendor/`.

Then each flavour was built once more from the real workdir with the corrected tool. `cmp` against copies of the two files taken before the run reports no difference, and the SHA-256 values are the two in the table at the head of this section.

### One thing for task 6 that this turned up

`PCFSoftShadowMap` is still exported by 0.187 but is no longer drawn. Both renderers warn once and use `PCFShadowMap` (the WebGL message: `WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead.`). The renderer's shadow map type is set to `PCFSoftShadowMap` in `buildRenderer` today, so "shadows as today" in task 6 step 7 cannot be the same filter. `PCFShadowMap` is in both entries for that reason. How different the shadow edge looks is not known; nothing was drawn with shadows here.

## Task 6, stage A: the port to three.js 0.187

The game now draws through `WebGPURenderer` from `vendor/three.bundle.js` (three.js 0.187.0, the WebGPU flavour, which carries its own WebGL 2 fallback). This stage is the port only, in the seven steps of the task brief, one commit each. Stage B (failing politely, the tools, the tests) and stage C (the gate, the bench, the browsers) come after it.

How each step was measured. `node build.js`, then the three capture commands of the brief into `stills/move-<step>`, then `node tools/stills-compare.js stills/before-main stills/move-<step>`. The stills are taken headless, where there is no WebGPU adapter, so they show the fallback. Every build measured here is a `dev` build of the working tree just before its commit, so its stamp carries the sha of the commit before it and a star. "Range" is the lowest and the highest channel mean over the 28 stills (0 to 255); "over 6" is the number of stills with any channel mean above the gate. The compare tool exits 1 while any still is over the gate, which is expected until the stage is done.

The console of the stills page was watched on every capture (a preloaded script outside the repo that prints console errors and changes nothing else), because the stills tool reports page errors but not console errors, and a node material that fails to build is a console error. None was printed on any capture recorded below.

Added in fix round 1: that claim rests on a script that is not in the repo, so it cannot be checked again from the repo. `tools/stills.js` as committed listens for page errors only, and would pass a still taken over a broken material. Stage B puts the console check into the tool. Until it does, "no console error" in this log means "none seen by a script kept in the scratchpad".

| step | build | range of means | over 6 | what the step did |
|---|---|---|---|---|
| reference | `stills/before-main`, r128 | 0 | 0 | the merged main |
| A1 | `v0.113 dev 1308d33*` | 21.4 to 84.8 | 28 | the bundle; `WebGPURenderer`; boot waits for `init()`; `RenderTarget`; the post pass as a node; the environment handed over directly. Colours wrong, as expected |
| A2 | `v0.114 dev c33c599*` | 6.0 to 29.9 | 28 | colour management off, as the first statement of the game. Lit surfaces come back up: nothing is converted twice any more |
| A3 | `v0.115 dev 20abfe9*` | 11.6 to 35.4 | 28 | canvas textures and the environment canvas flagged sRGB. The means go UP: the textures stop reading too bright, and the lights are still short by a factor of pi (step A4) |
| A4 | `v0.116 dev c9cd75b*` | 1.7 to 14.0 | 10 | the hemisphere, directional and ambient lights multiplied by pi, which r128 did inside its shaders |
| A5 | `v0.117 dev 11a8615*` | 1.2 to 8.4 | 6 | the haze colour handed over as the linear colour the output step turns back into the hex: the plain conversion for Retro, run backwards through ACES for Modern. (Noted in fix round 1: the body of this step's commit, a13deb3, says the stands at Indianapolis are a case of fog part way into the haze. That claim was retracted at A6, in the body of 2faa079 and under "A6: where the rest comes from". The commit message stands as written.) |
| A6 | `v0.118 dev a13deb3*` | 1.2 to 7.1 | 4 | `envMapIntensity` made to apply again (0.187 ignores it for `scene.environment`): the car paint's 1.15 is back, and the sea at Monaco is given 1.15 |
| A7 | `v0.119 dev 2faa079*` | 1.2 to 7.1 | 4 | `PCFShadowMap` asked for by name (the picture is A6's to the last digit: 0.187 was already drawing it in place of `PCFSoftShadowMap`). Radius and intensity tried, neither moves the picture, both left at the engine's values |

### A1: the bundle, and a game that draws through it

- The bundle. `tools/three-entry.webgpu.js` gained `ColorManagement` and `UnsignedByteType`. `node tools/vendor-three.js webgpu <workdir>` with the scratchpad workdir gave 853,393 bytes, SHA-256 `168f663c9d45b6ef64a3441e5e5d571a497a1dfaffac1bc66f9f80bc15ae53a0` (it was 853,346 before the two names). It is committed as `vendor/three.bundle.js`. r128 moved to `tools/vendor/three-r128.min.js`, where only `tools/bake-tracks.js` and, through it, `test/track-bake.test.js` read it.
- Page size: `dist/index.html` 1,577,683 bytes, `dist/artifact.html` 1,573,060 (r128: 1,322,526 and 1,317,903).
- Boots, draws and runs a race, Retro and Modern, at Silverstone: headless Chromium on the fallback (the renderer chose it by itself), the system Chrome 158.0.8127.38 headed on WebGPU (`renderer.backend.isWebGPUBackend` true and `backend.device` a `GPUDevice`), and the same Chrome with `?renderer=webgl` (`isWebGLBackend` true). In each, a race was started with Enter and the throttle held for 9 s: state RACING, the player at 39 to 40 m/s, frames advancing, nothing on the console but the warning that `PCFSoftShadowMap` is gone (step A7 removes it).
- The canvas has no samples: on the fallback `getContextAttributes().antialias` is false and `SAMPLES` is 0, headless and in Chrome, with main's renderer arguments unchanged.
- The two backends agree. Chrome, Silverstone, chase camera, tick 900, the canvas read back in the task that drew it and reduced to the spike's 32 x 18 grid of cell means: mean difference 0.001 of a level in Retro and in Modern, worst cell 0.07 and 0.04.
- One post node for each tier, not one node switched by a uniform as the spike had it: the target is rebuilt on a tier change anyway (8 bit sRGB for Retro, half float for Modern), so the node is built for the tier then, and a Retro frame does not compute a tone map it discards.
- The sweep in `applyQuality` that set `needsUpdate` on every material is gone: it existed because r128 compiled tone mapping into every material, and tone mapping is now in the post node. Checked that nothing else needed it: a tier change at run time gives the same picture as loading in that tier, in both directions, at Monaco (high camera, tick 600) and at Silverstone (chase, tick 900). Headless on the fallback the four pairs of stills are the same file byte for byte. In Chrome on WebGPU the four pairs agree to 0.000 on the grid mean and 0.00 on the worst cell, and so does a repeat of the loaded case. (Headed screenshots of the same pairs differed by up to 0.8 of a level, which is the compositor scaling the canvas for the screenshot, not the game: the canvas itself, read back, is the same.)
- The pinned page. Node UUIDs are made lazily in 0.187 and are what a shader build uses to tell its nodes apart, so in a pinned page (where the stream starts again at every 2D context) two nodes of one shader can be dealt the same UUID if a 2D context is made between two shader builds. A throwaway check that read the canvas through a 2D context and then changed tier hit exactly that (`THREE.TSL: TypeError: i.getInputType is not a function`). The stills tool makes no 2D context after boot, and it is not affected: stills of the three older circuits (chase and high, both tiers), pinned against unpinned, are the same files byte for byte, with no console error. The live game is not pinned and cannot be affected. It is a thing to know for any tool that pins and also reads a canvas.

### A2: colour management off

`THREE.ColorManagement.enabled = false` is the first statement of `src/10-core.js`, guarded with `typeof THREE !== 'undefined'`. That file is the first in the build order that touches the engine, and the tables below it call `srgb()` as they load, so its first line is the first thing the game runs with the engine present. The guard is there because `test/music.test.js` evaluates the file with no `THREE` at all. The other place it could have gone, `build.js`'s wrapper, would have left every test that evaluates the source files running the engine in a state the game never runs it in.

Per still average of the three channel means: Retro 33.6 at A1, 12.7 now; Modern 41.9 at A1, 17.4 now.

The Retro pass, checked the spike's way now that an unlit colour reaches it unchanged: everything but the sky dome hidden, Retro, Silverstone, the canvas read back at full size in the task that drew it and compared pixel by pixel with r128 (the spike's saved r128 build, `v0.110 dev 77a37a5*`), headless on the fallback.

| tier | pixels | differing | identical | largest difference |
|---|---|---|---|---|
| Retro, 8 bit sRGB target | 310,272 | 33 | 99.99% | 8 |
| Modern, half float target | 1,418,688 | 13,539 | 99.05% | 2 |

The spike had 99.56% for Retro headless with a half float target and 99.74% in Chrome with an 8 bit one. In Modern every differing pixel is out by 1 or 2 levels (11,537 by 1, 2,002 by 2): the tone mapping is the engine's own ACES on a half float frame, where r128 ran its own on the way into an 8 bit target.

One thing this turned up about the stills themselves. The same two frames taken as screenshots, the way the stills tool takes them, are NOT 99.99% identical: 49.8% of pixels are identical, nearly all the rest differ by exactly 1 level, and the channel means are 0.21, 0.28 and 0.17. The canvas holds the same pixels; the browser scales and composites the new canvas a shade differently from the old one. So every Retro still carries about a quarter of a level that is not the game's picture. It is far below the gate and it is not hidden in any figure here, but a still that reads 0.3 against the reference is not evidence of a difference in the game. The cause was not looked for (the new canvas's context is made by the engine with an alpha channel, where r128's was opaque; that is a guess).

### A3: texture colour space

`texture.encoding = THREE.sRGBEncoding` became `texture.colorSpace = THREE.SRGBColorSpace` in `texFromCanvas` (`src/10-core.js`) and on the environment canvas (`buildEnvironment`). Between A1 and here the old line assigned `undefined` to a property the engine no longer reads, so every canvas texture was taken as linear and read too bright. The car's blob shadow texture (`src/30-cars.js`) never had the flag on r128 and is left without it.

The means rise at this step (Retro 12.7 to 17.6, Modern 17.4 to 24.7 on the per still average), and that is the step working, not failing. At A2 two errors pulled against each other: textures too bright, lights too dim. This step removes the first, so textured surfaces are now darker than the reference everywhere, which is what a scene lit at 1/pi of its strength should look like. The sky, which is unlit and has no texture, did not move.

### A4: light intensity

The three lights in `buildWorld` are multiplied by `Math.PI` (1.05, 1.35 and 0.4 stay as the tuned numbers, with the factor written beside them). Per still average: Retro 17.6 to 4.4, Modern 24.7 to 4.9.

Ten stills are still over 6: the `high` camera on all four circuits in both tiers, and the Indianapolis chase view in both tiers. All ten look a long way across the circuit, which is where fog is (step A5).

Checked by measurement, the spike's way: maps and vertex colours switched off on both engines (the sky left alone), Silverstone, chase camera, tick 900, headless on the fallback, the canvas read back and reduced to the 32 x 18 grid. r128 is the spike's saved r128 build.

| cell | Retro, r128 | Retro, 0.187 | Modern, r128 | Modern, 0.187 |
|---|---|---|---|---|
| sky, top centre | 172,197,225 | 172,197,225 | 202,215,226 | 202,215,226 |
| sky, upper left | 184,196,210 | 184,196,210 | 208,213,219 | 208,213,219 |
| lit ground, bottom left | 212,212,212 | 212,212,212 | 234,235,235 | 234,235,235 |
| lit ground, bottom right | 212,212,212 | 212,212,212 | 234,235,235 | 234,234,235 |
| lit ground, lower middle | 239,239,239 | 239,239,239 | 247,248,248 | 247,247,248 |
| lit ground, far | 251,251,251 | 251,251,251 | 252,253,253 | 252,252,253 |

Over all 576 cells, with fog also off: mean difference 0.23 of a level in Retro (worst cell 9.0) and 0.23 in Modern (worst cell 3.2). With the materials white the lit ground is near the top of the range, so this shows the lights are right and says little about dark surfaces. (The cells differ from the spike's 245,245,246 and 211,221,229 because the spike read other cells in a headed window; the point is that the two engines agree, cell for cell.)

### A5: fog

r128 mixed fog in after tone mapping and encoding, so a fully fogged surface read as the haze hex (`SKY_HAZE`, `0xe9c39a`) in either tier. 0.187 mixes it in linear light before the output step. `applyHaze`, called from `applyQuality`, now sets the fog colour for the tier.

Retro has no tone mapping, so the colour is `srgb(SKY_HAZE)`, the plain conversion. That is the only candidate and it is exact where a surface is fully fogged.

Modern had two candidates, both measured on the 14 Modern stills (the Retro stills are the same in both runs, to the last digit):

- (a) the plain linear conversion, as the spike had it. A fully fogged surface then reads 224,208,183 after ACES and the encode, where r128 read 233,195,154.
- (b) the hex run backwards through the output step (the inverse of the engine's ACES at the exposure of 1.12, then of the encode), which gives the linear colour 0.947, 0.412, 0.192. A fully fogged surface reads 233,195,154 again.

| Modern, 14 stills | (a) plain linear | (b) backwards through ACES |
|---|---|---|
| average of the channel means, R G B | 4.18, 3.55, 4.42 | 4.48, 2.89, 3.21 |
| average over all three channels | 4.05 | 3.52 |
| range of channel means | 1.9 to 7.4 | 1.2 to 8.4 |
| stills over 6 | 5 | 4 |
| pixels off by more than 24, average | 7.83% | 6.28% |
| all 28 stills: range, over 6 | 1.4 to 7.4, 7 | 1.2 to 8.4, 6 |

(b) is kept: the lower means on the Modern stills, which is the rule the brief set. It is not better on every figure. Green and blue come down a great deal on the far views, red goes up a little (Monaco `high` 7.4 to 8.4, Indianapolis `high` 6.2 to 7.1), and so the highest single figure in the set is higher than with (a). (a) is the spike's result exactly: 1.4 to 7.4, seven over 6, the same seven stills.

| still | A4, R G B | (a), R G B | (b), R G B |
|---|---|---|---|
| brands-hatch-v1.modern.chase | 3.2, 2.8, 5.0 | 3.1, 2.4, 4.1 | 3.2, 2.1, 3.5 |
| brands-hatch-v1.modern.high | 6.5, 7.4, 14.0 | 5.9, 4.1, 7.3 | 6.8, 1.4, 2.2 |
| indianapolis-v1.modern.chase | 6.4, 5.6, 5.0 | 6.4, 5.5, 4.9 | 6.5, 5.5, 4.8 |
| indianapolis-v1.modern.high | 6.7, 7.8, 11.2 | 6.2, 5.2, 6.4 | 7.1, 3.1, 2.7 |
| monaco-gp-v1.modern.apex | 3.7, 3.7, 4.3 | 3.6, 3.6, 4.0 | 3.7, 3.5, 3.8 |
| monaco-gp-v1.modern.chase | 5.1, 5.0, 5.4 | 5.0, 4.7, 4.8 | 5.2, 4.4, 4.4 |
| monaco-gp-v1.modern.grid | 2.8, 2.9, 3.0 | 2.8, 2.9, 3.0 | 2.8, 2.8, 2.9 |
| monaco-gp-v1.modern.high | 7.9, 7.2, 8.1 | 7.4, 5.7, 5.5 | 8.4, 4.5, 3.9 |
| silverstone-v1.modern.apex | 1.9, 2.2, 2.9 | 1.9, 2.1, 2.6 | 2.0, 1.9, 2.3 |
| silverstone-v1.modern.chase | 2.7, 2.3, 3.7 | 2.6, 2.2, 3.4 | 2.7, 2.1, 3.2 |
| silverstone-v1.modern.grid | 3.3, 3.1, 3.5 | 3.2, 3.0, 3.3 | 3.3, 2.9, 3.1 |
| silverstone-v1.modern.helmet | 2.6, 3.0, 3.4 | 2.6, 2.9, 3.2 | 2.6, 2.9, 3.1 |
| silverstone-v1.modern.high | 5.5, 5.7, 11.4 | 5.0, 3.2, 6.2 | 5.6, 1.2, 2.3 |
| silverstone-v1.modern.stands | 2.9, 2.6, 3.7 | 2.8, 2.3, 3.1 | 3.0, 2.0, 2.7 |

The Retro stills, before and after (the plain conversion):

| still | A4, R G B | A5, R G B |
|---|---|---|
| brands-hatch-v1.retro.chase | 2.6, 2.4, 3.7 | 2.3, 1.9, 2.8 |
| brands-hatch-v1.retro.high | 5.3, 6.4, 9.4 | 3.2, 1.6, 2.0 |
| indianapolis-v1.retro.chase | 6.7, 5.7, 5.1 | 6.7, 5.6, 5.0 |
| indianapolis-v1.retro.high | 7.0, 7.4, 8.5 | 5.5, 3.9, 3.1 |
| monaco-gp-v1.retro.apex | 4.0, 3.7, 4.2 | 3.9, 3.6, 4.0 |
| monaco-gp-v1.retro.chase | 5.0, 4.8, 5.1 | 4.8, 4.5, 4.6 |
| monaco-gp-v1.retro.grid | 3.8, 3.5, 3.6 | 3.8, 3.5, 3.5 |
| monaco-gp-v1.retro.high | 7.4, 6.5, 6.7 | 6.8, 4.8, 4.3 |
| silverstone-v1.retro.apex | 1.7, 1.9, 2.5 | 1.6, 1.7, 2.1 |
| silverstone-v1.retro.chase | 2.0, 2.0, 2.9 | 1.9, 1.8, 2.6 |
| silverstone-v1.retro.grid | 3.1, 2.9, 3.1 | 3.0, 2.7, 2.8 |
| silverstone-v1.retro.helmet | 2.2, 2.5, 3.0 | 2.2, 2.4, 2.9 |
| silverstone-v1.retro.high | 4.4, 5.0, 7.6 | 2.8, 1.4, 2.0 |
| silverstone-v1.retro.stands | 3.0, 2.7, 3.5 | 2.8, 2.2, 2.8 |

Checked in the running game, headless, Silverstone, both engines side by side, a 16 x 16 block of the canvas read back:

| case | Retro, r128 | Retro, 0.187 | Modern, r128 | Modern, 0.187 |
|---|---|---|---|---|
| fully fogged ground (fog pulled in to the camera), lower centre | 224,190,150 | 224,190,150 | 242,196,146 | 242,196,146 |
| the same, near the centre | 232,196,155 | 232,196,155 | 246,199,148 | 246,199,148 |
| the clear colour (sky dome hidden) | 213,179,142 | 213,179,142 | 237,191,142 | 237,191,142 |

(The cells are not the hex itself because the grade and the vignette of the post pass come after, the same on both engines.) The clear colour is the same hex handed over the same way, so `applyHaze` sets it too. It is never seen in play: the sky dome covers it.

A tier change at run time still gives the same stills as loading in the tier, byte for byte, in both directions at Monaco and Silverstone, so the fog colour follows the tier.

What this step cannot close. It is exact only where a surface is fully fogged. Part way into the haze, r128 mixed encoded values and 0.187 mixes linear light, and a dark surface half way in comes out paler than it did. No fog colour moves that.

CORRECTED at step A6. This paragraph first named the stands at Indianapolis as the plainest case of that, and the A5 commit message (a13deb3) and a comment in `applyHaze` said the same. That was a guess from looking at the pair of stills, and it is wrong: with fog switched off on both engines the Indianapolis chase view differs from r128 by just as much as with it on. The stands are pale for another reason. The measurement and the real cause are under "A6: where the rest comes from". The comment is corrected in the A6 commit; the commit message stands as it was written.

### A6: light from the environment

The question the spike left open: does `envMapIntensity` still apply to `scene.environment` in 0.187? It does not. Read in the package source (`src/nodes/accessors/MaterialProperties.js`): the strength a material takes is `material.envMap ? material.envMapIntensity : scene.environmentIntensity`. On r128 the material's number scaled the scene's environment too. So the car paint's `envMapIntensity: 1.15` has been read by nobody since step A1. Confirmed in the running game: setting it to 5 on the body, with no map of its own, changes no cell of the picture.

What was tried. Each variant was applied in the running game after the photo frame (headless, the fallback), the canvas read back and reduced to the 32 x 18 grid, and compared with r128's grid for the same shot (the spike's saved r128 build). The figure is the mean difference over all 576 cells and three channels.

| variant | Silverstone chase, Modern | Silverstone chase, Retro | Monaco high, Modern | Monaco high, Retro | Indianapolis chase, Modern | Indianapolis chase, Retro |
|---|---|---|---|---|---|---|
| as A5 left it | 2.469 | 1.827 | 5.348 | 5.058 | 5.228 | 5.329 |
| body `envMapIntensity` 5, no map of its own | 2.469 | 1.827 | 5.348 | 5.058 | 5.228 | 5.329 |
| body given the environment as its own map, 1.15 | 2.396 | 1.783 | 5.347 | 5.059 | 4.859 | 5.132 |
| the same at 1.3 | 2.336 | 1.752 | 5.347 | 5.060 | 4.676 | 5.055 |
| the same at 1.5 | 2.286 | 1.739 | 5.348 | 5.062 | 4.954 | 5.235 |
| the same at 1.7 | 2.344 | 1.786 | 5.350 | 5.064 | 5.404 | 5.563 |
| `scene.environmentIntensity` 0.85 | 1.832 | 1.224 | 6.494 | 5.904 | 4.750 | 4.679 |
| `scene.environmentIntensity` 1.15 | 3.994 | 3.045 | 6.665 | 6.274 | 6.502 | 6.509 |
| `scene.environmentIntensity` 1.3 | 5.576 | 4.249 | 8.958 | 8.240 | 8.063 | 7.819 |
| sea given the environment as its own map, 1.15 | 2.469 | 1.827 | 5.013 | 4.759 | 5.228 | 5.329 |
| the same at 1.3 | 2.469 | 1.827 | 5.620 | 5.209 | 5.228 | 5.329 |

Single cells, Modern, r128 first:

| cell | r128 | as A5 left it | with the variant |
|---|---|---|---|
| player's car, rear (Silverstone chase) | 51,56,66 | 37,41,51 | body 1.15: 41,45,55. 1.3: 45,50,59. 1.5: 50,55,65. 1.7: 55,60,70 |
| player's car, top | 122,112,98 | 110,97,77 | body 1.15: 114,102,83. 1.3: 117,106,88. 1.5: 121,111,95. 1.7: 124,115,100 |
| sea, the light part (Monaco high) | 94,161,190 | 77,152,183 | sea 1.15: 87,158,189. 1.3: 97,164,194 |
| sea, the middle | 0,132,176 | 0,131,175 | sea 1.15: 0,136,180. 1.3: 0,141,185 |
| grass in the middle distance (Silverstone chase) | 94,160,75 | 107,165,99 | scene 0.85: 104,162,95. scene 1.15: 110,168,104 |

What that says:

- The scene's own strength is not the setting. Raising it brings the car and the light part of the sea toward r128 and takes everything else away from it (the whole picture is worse at 1.15 on every shot). Lowering it helps the far views a little and takes the car and the sea further off. Left at 1.
- The car body, given the environment as its own map so that its 1.15 applies again, moves toward r128 on every shot and nothing else moves. Applied. This restores what the number did; it tunes nothing.
- The sea is the same kind of surface (smooth and metallic) and is duller for the same reason, but it never had a strength of its own. At 1.15 its light part comes most of the way back and the picture is closer on both Monaco shots; at 1.3 the darker water overshoots and the picture is worse than leaving it. Applied at 1.15. This one IS a tuned number, put there for the engine move.
- The grass is not a matter of strength at all. In the middle distance it is paler and less green than on r128 (the spike called it darker; measured here it is lighter, with the blue channel up by 24). Fog is not the reason: the cell reads the same with fog off on both engines. The reason is how 0.187 shades a rough surface seen at a shallow angle, which the next section measures. No strength setting separates the grass from everything else lit by the same environment. Left.

On the 28 stills:

| variant | Retro, per still average | Modern, per still average | range of means | over 6 |
|---|---|---|---|---|
| as A5 left it | 3.27 | 3.52 | 1.2 to 8.4 | 6 |
| body 1.15 applying again | 3.21 | 3.43 | 1.2 to 8.4 | 5 |
| body at 1.3 | 3.19 | 3.39 | 1.2 to 8.4 | 5 |
| body at 1.5 | 3.22 | 3.43 | 1.2 to 8.4 | 5 |
| body 1.15 and sea 1.15 (kept) | 3.17 | 3.39 | 1.2 to 7.1 | 4 |

The body is left at its own 1.15. At 1.5 the player's own car reads almost exactly as on r128 (50,55,65 against 51,56,66), but the stills do not tell 1.15, 1.3 and 1.5 apart (0.04 of a level at most), and with 33 cars at Indianapolis 1.5 is worse than 1.3. Changing a tuned number of the car's look on that evidence was not justified. If the car reads dark in the pairs put to Jamie, 1.3 to 1.5 is the number to try.

The sea at 1.15 moved every Monaco still that shows it, none the wrong way on its worst channel: `high` Modern 8.4 to 7.1, `high` Retro 6.8 to 6.0 (no longer over), `chase` Modern 5.0 to 4.7, `chase` Retro 4.7 to 4.5.

How it is done. `Game.prototype.ownEnvironment` gives every standard material that asks for a strength other than 1 the scene's environment as its own `envMap`, which is what makes 0.187 read the number. It runs over the scene at the end of `buildWorld` and over each car in `buildGrid`. Both backends draw it the same: Chrome, Monaco, high camera, WebGPU against the forced fallback, mean 0.003 (Retro) and 0.004 (Modern) of a level, worst cell 0.20 and 0.15.

### A6: where the rest comes from

Asked while looking for an environment setting, because it decides what a setting could do: how much of what is left is fog? The same shots were taken with `scene.fog` removed on BOTH engines (headless, the canvas grid against r128's, mean over 576 cells and three channels), on the build with step A6 in it.

| shot | tier | with fog | fog off on both |
|---|---|---|---|
| Silverstone, chase | Modern | 2.40 | 2.32 |
| Indianapolis, chase | Modern | 4.86 | 4.85 |
| Indianapolis, chase | Retro | 5.13 | 5.16 |
| Silverstone, high | Modern | 3.00 | 1.76 |
| Silverstone, high | Retro | 1.93 | 1.41 |
| Monaco, high | Modern | 5.01 | 4.17 |
| Monaco, high | Retro | 4.76 | 4.46 |
| Indianapolis, high | Modern | 4.22 | 3.57 |
| Indianapolis, high | Retro | 3.96 | 3.98 |
| Brands Hatch, high | Modern | 3.42 | 1.98 |
| Brands Hatch, high | Retro | 2.16 | 1.62 |

(Silverstone chase in Retro is missing: with fog removed, the r128 page drew a black frame on two tries, so there is no pair. Nothing is claimed for it.)

So fog is a real part of what is left in the far views of Modern (Brands Hatch and Silverstone `high` lose about 40% of their difference without it), a smaller part in Retro, and no part at all of the Indianapolis chase view.

What it is at Indianapolis, and on grass everywhere. With fog off on both engines, single cells:

| cell | tier | r128 | 0.187 |
|---|---|---|---|
| Indianapolis stands, right | Modern | 122,122,123 | 138,136,133 |
| Indianapolis stands, left | Modern | 127,120,126 | 141,131,134 |
| Indianapolis stands, right | Retro | 113,114,109 | 134,133,121 |
| Indianapolis stands, left | Retro | 119,109,109 | 143,128,120 |
| Indianapolis infield grass | Modern | 137,157,89 | 144,160,102 |
| Silverstone grass, left | Modern | 94,160,75 | 107,165,99 |
| Silverstone grass, right | Modern | 72,153,52 | 88,158,81 |

These are fully rough surfaces that are not metal (the crowd and the grass are both `roughness: 1.0`), seen at a shallow angle, and on 0.187 they are paler and greyer. The cause is in the two engines' source. r128 worked out how much of the environment a surface mirrors with a short approximation (`integrateSpecularBRDF`, with `F_Schlick_RoughnessDependent`), which for a fully rough surface gives about 1.6% at every angle. 0.187 looks the same quantity up in a table computed from the full model, and for a fully rough surface at a shallow angle that is several times more. So grass and seats seen along their surface now reflect some of the bright horizon they face. (For a smooth surface the difference goes the other way: r128's term added reflection at shallow angles that 0.187 does not have, which is the car and the sea being duller.) The r128 half of this was read in `tools/vendor/three-r128.min.js`; the size of the 0.187 figure is from knowing the model, not from a measurement of the table.

CORRECTED in fix round 1. For the crowd the paragraph above is wrong. The stands are pale because of where a texture is smoothed, not because of what a rough surface mirrors: with r128 made to smooth textures in linear light as 0.187 does, or with nothing smoothed on either engine, the crowd reads the same on both engines to within 4 levels. Nothing in this section tested that. For the grass the account stands, and the environment is confirmed as the source of the extra (with no environment on either engine the grass agrees). The measurements are under "Task 6, stage A, fix round 1: the true causes".

No setting reaches it. `envMapIntensity` and `scene.environmentIntensity` scale all the light a surface takes from the environment, the matt part with the mirrored part, and the matt part is right (step A4's check). What would reach it is not a setting: a material that can turn its own mirror term down (`MeshPhysicalMaterial`'s specular intensity, which is not in the bundle), or a node on the grass and the crowd. That is a change of material, not of a number, and it was not tried. It goes to the controller as the main thing still open: see the stage summary.

### A7: shadows

`renderer.shadowMap.type = THREE.PCFShadowMap`. Since step A1 the game had asked for `PCFSoftShadowMap`, which 0.187 answers with a warning and `PCFShadowMap`, so the picture does not change at this step: the 28 comparisons are the same as A6's to the last digit, and the warning is gone from the console.

The Modern shadow map works as before. It is 2048 across the 70 m box set up in `buildWorld`, `updateProjectionMatrix` is still called after the box is edited, the box follows the player's car (the photo frames at tick 900 and the race screenshots both show the cars' shadows under them, far from where the box started), and it switches with the tier: a tier change at run time gives the same picture as loading in the tier (steps A1 and A5). The two bias values are unchanged; no acne and no detached shadow in any still or in enlarged crops of the car and tree shadows.

How much of what is left is shadows: almost none. Modern only (Retro has no shadow map), headless, the canvas grid against r128's for the same shot, mean over 576 cells and three channels, with the worst cell in brackets. "Shadows off on both" removes the shadow map from both engines.

| variant | Silverstone chase | Silverstone apex | Silverstone high | Monaco high | Monaco chase | Monaco apex | Brands Hatch high |
|---|---|---|---|---|---|---|---|
| as it is: radius 1, intensity 1 | 2.396 (45) | 1.819 (27) | 2.998 (51) | 5.012 (49) | 3.782 (44) | 3.306 (41) | 3.420 (49) |
| shadows off on both engines | 2.281 (33) | 1.794 (26) | 2.971 (49) | 4.900 (49) | 3.729 (44) | 3.303 (41) | 3.397 (46) |
| attempt 1: radius 0.5 | 2.394 (45) | 1.819 (27) | 2.998 (51) | 5.011 (49) | 3.777 (44) | 3.306 (41) | 3.420 (49) |
| attempt 1, further: radius 0 | 2.393 (45) | 1.819 (27) | 2.998 (51) | 5.011 (49) | 3.776 (44) | 3.306 (41) | 3.420 (49) |
| attempt 2: radius 2 | 2.401 (45) | 1.819 (27) | 2.998 (51) | 5.012 (49) | 3.792 (44) | 3.306 (41) | 3.419 (49) |
| attempt 3: intensity 0.95 | 2.421 (46) | 1.820 (27) | 2.999 (51) | 5.071 (49) | 3.841 (44) | 3.306 (41) | 3.420 (49) |
| attempt 3, further: intensity 0.9 | 2.447 (46) | 1.821 (27) | 2.999 (51) | 5.133 (49) | 3.901 (44) | 3.307 (41) | 3.421 (49) |

Three attempts, as the brief allows, and nothing to apply:

- Radius. r128's filter was a fixed 3 x 3 kernel with no radius. 0.187's takes five samples on a disc of `shadow.radius` texels, turned differently at each pixel. From 0 to 2 the picture moves by 0.02 of a level at most. A shadow texel is under 7 cm (140 m over 2048), so the edge is thinner than a pixel from every camera in the set. Left at 1.
- Intensity. It can only make the shadow lighter, and lighter is further from r128 on every shot where it shows. So the shadows are not too dark. Left at 1.
- With the shadow map off on both engines the difference from r128 falls by 0.12 at most (Silverstone chase and Monaco high) and by 0.05 or less elsewhere. Shadows are not what keeps any still over 6.

What the spike saw as "a slightly lighter shadow" is real and is not the shadow. Read off the stills at Silverstone (Modern, chase): the grass inside the tree's shadow is 7,100,13 on r128 and 38,112,52 on 0.187, while the lit grass beside it is 98,166,77 and 109,170,99, and the road inside the car's own shadow is 72,82,127 and 75,85,128. The road, seen steeply, matches. The grass, seen along its surface, carries the same pale extra in the shadow as out of it, and it shows more against the dark. That is the rough surface at a shallow angle of step A6, not the strength of the shadow.

One real change in the shadows, and it is not a setting. On r128 the shadow pass ignored a material's alpha test, so a tree (two crossed cards with a cut out texture) cast the shadow of its whole cards: a dark slab on the grass. On 0.187 the shadow pass honours the alpha test and the tree casts its own outline. It is a small part of the picture and it is the better picture, but it differs from what is live, so it goes to Jamie with the pairs.

### Tried after the steps and NOT applied: where the fog starts

The fog colour of step A5 cannot put right a surface that is only part way into the haze, because the engines mix in different spaces. Mixed in linear light, the same fog factor reads as much more haze on a dark surface than it did mixed in encoded values. Starting the fog further out undoes most of that. `scene.fog` is `Fog(SKY_HAZE, 150, 980)`; the first number was changed, in a build that was thrown away, and the 28 stills taken each time:

| fog starts at | Retro, per still average | Modern, per still average | range of means | over 6 |
|---|---|---|---|---|
| 150 m (as shipped, and as on r128) | 3.17 | 3.39 | 1.2 to 7.1 | 4 |
| 250 m | 2.97 | 3.02 | 0.9 to 6.3 | 1 |
| 300 m | 3.05 | 3.01 | 1.1 to 6.3 | 1 |
| 350 m | 3.16 | 3.06 | 1.2 to 6.3 | 2 |
| 390 m | 3.25 | 3.12 | 1.4 to 6.6 | 3 |

At 250 m or 300 m every Modern still is under 6 (the highest is 5.7) and one still is left over: the Indianapolis chase view in Retro at 6.3, which is the stands and not fog. This was not asked for (the brief's step A5 is the fog's colour) and it changes a number of the game's look that players see at 150 to 300 m, so it is not in any commit. It is recorded because it is one line, it is measured, and it would take the count over 6 from four to one. It needs a ruling.

RULED, and applied in fix round 1 at 250 m (commit f04d83c), with the stills this section did not keep: `stills/fog-150`, `stills/fog-250` and `stills/fog-300`. The 150, 250 and 300 rows above were measured again and agree. See "Ruling 1: where the haze starts".

### Stage A as it stands

The build is `v0.119 dev 2faa079*` (the working tree of the A7 commit). 28 stills against `stills/before-main`, headless, the fallback: channel means from 1.2 to 7.1, four over 6. The spike had 1.4 to 7.4 and seven over 6.

Added in fix round 1: the count of four rested on one still that was 0.04 under the gate. `monaco-gp-v1.retro.high` reads 5.964 in the table below. It was 6.758 at A5 and came under through the sea's `envMapIntensity` of 1.15, a number tuned in this stage. A still carries about a quarter of a level that is not the game's picture (step A2), so "four over 6" and "five over 6" were the same result here, and the stage should have said so.

| still | R | G | B | pixels off by more than 24 | gate | highest channel with fog from 250 m | with fog from 300 m |
|---|---|---|---|---|---|---|---|
| brands-hatch-v1.modern.chase | 3.136 | 2.024 | 3.359 | 7.590% | ok | 3.3 | 3.3 |
| brands-hatch-v1.modern.high | 6.753 | 1.418 | 2.157 | 6.295% | OVER | 3.1 | 2.8 |
| brands-hatch-v1.retro.chase | 2.287 | 1.845 | 2.719 | 1.788% | ok | 2.6 | 2.6 |
| brands-hatch-v1.retro.high | 3.205 | 1.618 | 1.975 | 1.944% | ok | 1.9 | 2.7 |
| indianapolis-v1.modern.chase | 5.915 | 5.003 | 4.639 | 10.824% | ok | 5.7 | 5.7 |
| indianapolis-v1.modern.high | 7.100 | 3.142 | 2.746 | 8.456% | OVER | 4.6 | 4.4 |
| indianapolis-v1.retro.chase | 6.383 | 5.326 | 4.861 | 11.423% | OVER | 6.3 | 6.3 |
| indianapolis-v1.retro.high | 5.473 | 3.863 | 3.127 | 8.711% | ok | 4.7 | 5.2 |
| monaco-gp-v1.modern.apex | 3.693 | 3.458 | 3.817 | 6.355% | ok | 3.8 | 3.8 |
| monaco-gp-v1.modern.chase | 4.742 | 4.029 | 4.141 | 6.564% | ok | 4.2 | 4.1 |
| monaco-gp-v1.modern.grid | 2.728 | 2.794 | 2.873 | 2.847% | ok | 2.9 | 2.9 |
| monaco-gp-v1.modern.high | 7.108 | 4.374 | 4.165 | 8.767% | OVER | 5.1 | 5.0 |
| monaco-gp-v1.retro.apex | 3.932 | 3.567 | 3.955 | 5.829% | ok | 3.9 | 3.9 |
| monaco-gp-v1.retro.chase | 4.513 | 4.190 | 4.309 | 5.986% | ok | 4.2 | 4.2 |
| monaco-gp-v1.retro.grid | 3.721 | 3.443 | 3.465 | 4.656% | ok | 3.7 | 3.7 |
| monaco-gp-v1.retro.high | 5.964 | 4.490 | 4.271 | 8.012% | ok | 5.4 | 5.8 |
| silverstone-v1.modern.apex | 1.953 | 1.948 | 2.305 | 2.996% | ok | 2.3 | 2.3 |
| silverstone-v1.modern.chase | 2.618 | 1.999 | 3.089 | 5.162% | ok | 3.1 | 3.1 |
| silverstone-v1.modern.grid | 3.264 | 2.907 | 3.084 | 5.175% | ok | 3.2 | 3.1 |
| silverstone-v1.modern.helmet | 2.221 | 2.261 | 2.387 | 2.125% | ok | 2.4 | 2.4 |
| silverstone-v1.modern.high | 5.645 | 1.203 | 2.298 | 6.358% | ok | 2.7 | 2.4 |
| silverstone-v1.modern.stands | 2.950 | 2.025 | 2.707 | 2.517% | ok | 2.8 | 2.8 |
| silverstone-v1.retro.apex | 1.550 | 1.721 | 2.129 | 1.677% | ok | 2.1 | 2.1 |
| silverstone-v1.retro.chase | 1.887 | 1.709 | 2.523 | 1.341% | ok | 2.5 | 2.5 |
| silverstone-v1.retro.grid | 3.043 | 2.739 | 2.830 | 4.442% | ok | 3.0 | 3.0 |
| silverstone-v1.retro.helmet | 1.877 | 2.023 | 2.422 | 1.748% | ok | 2.4 | 2.4 |
| silverstone-v1.retro.high | 2.842 | 1.393 | 1.994 | 1.912% | ok | 1.8 | 2.4 |
| silverstone-v1.retro.stands | 2.834 | 2.242 | 2.778 | 3.855% | ok | 2.8 | 2.9 |

(The last two columns are the experiment above, not the shipped build.)

The four over 6, and what each is:

| still | figure | what it is | evidence |
|---|---|---|---|
| monaco-gp-v1.modern.high | 7.1 (red) | fog, part way into the haze, in Modern | 5.1 with the fog starting at 250 m |
| indianapolis-v1.modern.high | 7.1 (red) | the same | 4.6 with the fog starting at 250 m |
| brands-hatch-v1.modern.high | 6.8 (red) | the same | 3.1 with the fog starting at 250 m |
| indianapolis-v1.retro.chase | 6.4 (red) | the stands: a fully rough surface seen at a shallow angle reflects more of the bright horizon on 0.187 | 6.3 whatever the fog does; the view differs from r128 as much with fog off on both engines (step A6) |

CORRECTED in fix round 1. The table above gives fog as the whole cause of three stills. Measured with fog off on both engines, fog is 2.4 of the 7.1 at Monaco and 2.7 of the 7.1 at Indianapolis; about half of the rest at Monaco, most of the rest at Indianapolis, and most of what the fourth still differs by, is texture smoothing, which the table does not name. It is not a rough surface mirroring the horizon. The table that replaces it is under "Task 6, stage A, fix round 1: the true causes". The list below is superseded by the same section.

The three causes the spike named, as they stand:

- Where fog is mixed. Closed where a surface is fully fogged (exact, both tiers). Open part way into the haze; one line would close most of it (above), not applied.
- Light from the environment. The car paint's strength applies again and the sea has one. What is left has a second, larger half the spike did not separate: fully rough surfaces at shallow angles (grass, the crowd) are paler. No setting reaches it.
- The shadow filter. Not a cause of anything over 6. One change of behaviour (trees cast their own outline) for Jamie to see.

Both backends, at the end of the stage, system Chrome 158.0.8127.38, headed, a race started and run for 9 s in each tier on each backend at Silverstone and at Monaco, nothing on the console (no warning, no error): the canvas grid on WebGPU against the forced fallback differs by 0.001 to 0.004 of a level on the mean, worst cell 0.06 at Silverstone (chase) and 0.20 at Monaco (high). Stage C repeats this formally.

Other things checked at the end of the stage, each a quick check and not stage B's test:

- `dist/artifact.html`, wrapped in a doctype, head and body as its host wraps it, boots and draws on the fallback with no console error. `dist/index.html` is 1,586,149 bytes and `dist/artifact.html` 1,581,526.
- A renderer that cannot start ends at the fallback panel, with no uncaught error: with `getContext('webgl2')` made to return null in a browser with no WebGPU, `renderer.init()` rejects and the panel shows. The message is the engine's own (`Cannot read properties of null (reading 'getSupportedExtensions')`), which stage B replaces.
- `node test/sim-parity.test.js`: 4 passed before every commit of the stage. `test/physics.test.js`, `test/fpmath.test.js`, `test/track-bake.test.js` and `test/music.test.js` pass too.
- Not run, because they are stage B's and stage C's: `tools/bench.js`, `test/csp.js`, `tools/stills-pin-check.js`, Safari.

## Task 6, stage A, fix round 1: the true causes, and four compensations

Stage A was reviewed. This round does three things: it measures why the picture still differs from the live game (the stage A record blamed the wrong thing for most of it), it applies the rulings that came back from the review, and it tidies the small findings. Nothing in the simulation changed: `node test/sim-parity.test.js` printed 4 passed before every commit.

Read this first. The main finding of the round is not one of the rulings. Most of what still differs is neither fog nor light from the environment. It is **where a texture is smoothed**. r128 smoothed the stored, encoded values of a texture and turned the result into light afterwards; 0.187 turns each texel into light first and smooths that. For a texture of strong contrast (the crowd, Monaco's buildings) the second is brighter wherever the pattern runs together, which is every surface seen from far off or along its length. Stage A's record put this down to rough surfaces mirroring the horizon. For the crowd and the buildings that is wrong, and it is corrected below. The rulings of this round were written before that was known, so two of the compensations it applies (the crowd and the buildings) pass the rule set for them while working on the wrong thing. They are in separate commits and say so in their comments. A fix at the cause was not ruled and was not tried.

| commit | what | 28 stills against `stills/before-main` | over 6 |
|---|---|---|---|
| end of stage A, `e3f2dba` | | 1.2 to 7.1 | 4 |
| `f04d83c` | the haze starts at 250 m (ruling 1) | 0.9 to 6.3 | 1 |
| `beda014` | the crowd: `envMapIntensity` 0.6 (ruling 3) | 0.8 to 5.5 | 0 |
| `b23cb11` | the grass: `envMapIntensity` 0.9 (ruling 3) | 0.9 to 5.5 | 0 |
| `52faae7` | Monaco's buildings: `envMapIntensity` 0.8 (ruling 3) | 0.9 to 5.5 | 0 |
| `483eff1` | the small findings, and the sea's 1.15 marked as ruled (ruling 2) | 0.9 to 5.5, the same files | 0 |

### How this round was measured

- Both engines were photographed the same way. r128 was built from commit `1308d33` in a copy under the scratchpad (`git archive`, so no `.git` and no stamp: the page reads `v0.0 dev nogit`). Its 28 stills against `stills/before-main`: 0.000 on every channel of every still. So that copy is the live picture, and it can be edited for a test.
- 0.187 was built the same way from `e3f2dba` and then from each commit of this round. The stills of the `e3f2dba` copy are `stills/move-A7` again, 0.000 on all 28.
- Every trial was an edit to a copy in the scratchpad, never to the working tree. Each line below says what the edit was. (ADDED in fix round 2: this named no path. The copies, their stills and the output of every compare are kept; see "Where each round's evidence lives" under fix round 2.)
- Fog off means `new THREE.Fog(SKY_HAZE, 1e7, 2e7)` in `buildWorld` on both engines: the fog object stays and nothing is ever inside it.
- The stills are headless, so they show the fallback (WebGL 2). The real WebGPU backend was checked once at the end.
- The console. Every capture ran with a script loaded in front of the stills tool (`node -r`, kept in the scratchpad, not in the repo) that prints every console error, every console warning and every page error of the page. 28 captures of the 28 stills were taken in this round, 22 of them of 0.187. Errors: none on any capture. Warnings on 0.187: three kinds and no other, `No available adapters.`, `THREE.WebGPURenderer: WebGPU is not available, running under WebGL2 backend.` and the driver's `GPU stall due to ReadPixels` (the screenshot). As the note above says, this cannot be checked from the repo until stage B puts it in the tool. (CORRECTED in fix round 2: "three kinds and no other" is wrong. Seven of this round's trial logs carry one or both of two more; see "The console" under fix round 2.)

### The true causes

Four switches, each thrown on both engines, the 28 stills taken each time and r128's compared with 0.187's:

1. Fog off on both.
2. r128 made to smooth textures the way 0.187 does: in `texFromCanvas`, the canvas is turned into linear values before it is uploaded and the texture is flagged linear, so r128's GPU filters light and not encoded values. (The linear values are stored in 8 bits, so dark texels are a little coarse. It is a test, not a fix.)
3. Nothing smoothed on either engine: `generateMipmaps` off and nearest filtering both ways in `texFromCanvas`. If smoothing is the cause, the difference goes when there is no smoothing. This is the same question asked a second way, with no change to any pixel value.
4. No environment on either engine (`scene.environment = null`), with 1 and 2 also on.

Why 2 and 3 were tried. With fog off, the named surfaces below showed the buildings and the crowd lighter by up to 42 levels where their pattern is blurred, and by about 5 where it is resolved (the two faces of one tower: +28 on the shaded face, which is seen at a slant, +5 on the face turned to the camera). Light from the environment does not behave like that; smoothing does. The two engines' source says why. r128 has no sRGB texture format at all: it stores every 8 bit texture as `RGBA8`, the GPU builds the mip chain and filters on those stored values, and the shader decodes the filtered sample (`sRGBToLinear`, through `mapTexelToLinear`). 0.187 stores a texture flagged sRGB as `SRGB8_ALPHA8` on the fallback and `rgba8unorm-srgb` on WebGPU, so the GPU decodes every texel before it filters and builds the mip chain from decoded values. A texture that is half black and half white, seen small, comes out as 50% grey on r128 and as 50% light, which shows as 74% grey, on 0.187.

Highest channel mean of each still (the figure the gate reads):

| still | end of stage A | fog off on both engines | r128 made to smooth textures in linear light | both | fog off, and nothing smoothed on either engine |
|---|---|---|---|---|---|
| brands-hatch-v1.modern.chase | 3.359 | 3.415 | 2.963 | 3.015 | 3.122 |
| brands-hatch-v1.modern.high | 6.753 | 2.569 | 6.262 | 2.276 | 2.298 |
| brands-hatch-v1.retro.chase | 2.719 | 2.696 | 2.188 | 2.156 | 2.248 |
| brands-hatch-v1.retro.high | 3.205 | 2.095 | 2.710 | 1.766 | 1.750 |
| indianapolis-v1.modern.chase | 5.915 | 5.839 | 2.882 | 2.885 | 2.992 |
| indianapolis-v1.modern.high | 7.100 | 4.426 | 4.485 | 1.815 | 1.847 |
| indianapolis-v1.retro.chase | 6.383 | 6.400 | 2.329 | 2.335 | 2.451 |
| indianapolis-v1.retro.high | 5.473 | 5.031 | 2.063 | 1.589 | 1.636 |
| monaco-gp-v1.modern.apex | 3.817 | 3.894 | 1.938 | 1.946 | 1.939 |
| monaco-gp-v1.modern.chase | 4.742 | 4.283 | 2.640 | 2.163 | 2.243 |
| monaco-gp-v1.modern.grid | 2.873 | 2.817 | 2.237 | 2.181 | 2.069 |
| monaco-gp-v1.modern.high | 7.108 | 4.740 | 4.456 | 2.326 | 2.449 |
| monaco-gp-v1.retro.apex | 3.955 | 4.003 | 1.808 | 1.818 | 1.893 |
| monaco-gp-v1.retro.chase | 4.513 | 4.430 | 2.205 | 2.203 | 2.294 |
| monaco-gp-v1.retro.grid | 3.721 | 3.695 | 1.980 | 1.963 | 1.941 |
| monaco-gp-v1.retro.high | 5.964 | 5.274 | 2.606 | 2.043 | 2.287 |
| silverstone-v1.modern.apex | 2.305 | 2.356 | 1.833 | 1.860 | 1.990 |
| silverstone-v1.modern.chase | 3.089 | 3.098 | 2.695 | 2.702 | 2.790 |
| silverstone-v1.modern.grid | 3.264 | 3.133 | 2.298 | 2.320 | 2.347 |
| silverstone-v1.modern.helmet | 2.387 | 2.395 | 2.044 | 2.050 | 2.108 |
| silverstone-v1.modern.high | 5.645 | 2.492 | 5.172 | 2.169 | 2.194 |
| silverstone-v1.modern.stands | 2.950 | 2.741 | 2.014 | 2.049 | 2.160 |
| silverstone-v1.retro.apex | 2.129 | 2.126 | 1.466 | 1.458 | 1.549 |
| silverstone-v1.retro.chase | 2.523 | 2.504 | 1.978 | 1.961 | 1.997 |
| silverstone-v1.retro.grid | 3.043 | 3.018 | 1.811 | 1.806 | 1.873 |
| silverstone-v1.retro.helmet | 2.422 | 2.413 | 1.948 | 1.941 | 1.991 |
| silverstone-v1.retro.high | 2.842 | 2.000 | 2.362 | 1.644 | 1.650 |
| silverstone-v1.retro.stands | 2.834 | 2.798 | 1.629 | 1.649 | 1.765 |
| worst / average of the channel means / over 6 | 7.108 / 3.276 / 4 | 6.400 / 3.064 / 1 | 6.262 / 1.971 / 1 | 3.015 / 1.721 / 0 | 3.122 / 1.850 / 0 |

So, over the 28:

- Fog accounts for the far views of Modern and little else. Taking it away brings Brands Hatch and Silverstone `high` in Modern from 6.8 and 5.6 to 2.6 and 2.5, and leaves Indianapolis chase where it was.
- Texture smoothing accounts for most of the rest. With r128 smoothing as 0.187 does and nothing else changed, the average over the set falls from 3.28 to 1.97, and Indianapolis chase in Retro, the still that would not move, falls from 6.4 to 2.3. The other way of asking (nothing smoothed on either engine) gives the same answer.
- With both taken away nothing is over 3.1. What is left then is the grass seen along its surface, the car body, the sea, the trees' shadows, and the quarter of a level a screenshot carries by itself.

Named surfaces, fog off on both engines, read off the stills as the mean colour of a small rectangle (the same rectangle on both). 0.187 here is the build of `e3f2dba`, before any compensation of this round:

| still | surface | r128 | 0.187 | difference | r128 smoothing in linear light | nothing smoothed: r128 | nothing smoothed: 0.187 |
|---|---|---|---|---|---|---|---|
| monaco.modern.high | near tower, shaded face | 102,105,106 | 130,131,129 | +28,+26,+24 | 135,134,133 | 92,95,98 | 87,91,94 |
| monaco.modern.high | near tower, lit face | 77,82,81 | 82,87,87 | +5,+5,+6 | 84,88,89 | 77,83,84 | 74,81,82 |
| monaco.modern.high | small block by the hairpin | 91,94,96 | 120,121,120 | +29,+27,+25 | 124,124,122 | 81,86,89 | 79,84,88 |
| monaco.modern.high | far tower, top left | 81,81,80 | 100,97,94 | +19,+16,+13 | 103,99,95 | 79,81,82 | 76,79,80 |
| monaco.modern.high | roof, bottom right | 222,220,216 | 223,221,217 | +1,+1,+1 | 224,221,218 | 225,223,220 | 225,222,219 |
| monaco.modern.high | quay ground beside the road | 210,190,174 | 210,190,173 | -1,-1,-1 | 210,191,174 | 210,190,173 | 209,190,173 |
| monaco.modern.high | sea, light part | 99,164,190 | 93,163,190 | -6,-1,+0 | 99,164,190 | 99,164,190 | 93,163,190 |
| monaco.modern.high | sea, middle | 1,131,175 | 0,135,179 | -1,+4,+5 | 1,131,175 | 1,131,175 | 0,135,179 |
| monaco.modern.high | road | 120,124,161 | 121,124,160 | +1,+1,-1 | 121,125,161 | 120,124,160 | 120,123,159 |
| monaco.retro.high | near tower, shaded face | 97,99,99 | 126,125,122 | +29,+26,+23 | 130,129,125 | 102,103,103 | 99,100,100 |
| monaco.retro.high | near tower, lit face | 80,83,82 | 90,93,91 | +10,+9,+9 | 92,93,92 | 84,88,86 | 82,85,86 |
| monaco.retro.high | small block by the hairpin | 90,92,93 | 123,122,117 | +33,+29,+24 | 125,124,119 | 79,82,83 | 78,79,82 |
| monaco.retro.high | far tower, top left | 76,76,75 | 93,90,86 | +17,+14,+10 | 96,91,87 | 76,75,75 | 74,74,73 |
| monaco.retro.high | roof, bottom right | 165,160,155 | 190,184,174 | +25,+24,+20 | 191,185,176 | 210,210,209 | 210,210,209 |
| monaco.retro.high | quay ground beside the road | 191,161,143 | 190,161,142 | -1,+0,-1 | 191,162,143 | 191,161,143 | 190,160,142 |
| monaco.retro.high | sea, light part | 93,135,157 | 89,134,157 | -4,-1,+0 | 93,135,157 | 93,135,157 | 89,134,157 |
| monaco.retro.high | sea, middle | 33,106,137 | 29,108,140 | -4,+1,+3 | 33,106,137 | 33,106,137 | 29,108,140 |
| monaco.retro.high | road | 103,106,131 | 104,106,131 | +1,+1,+0 | 104,107,132 | 103,106,130 | 103,106,129 |
| indianapolis.modern.chase | crowd, right stand | 124,119,119 | 140,131,128 | +16,+13,+9 | 139,130,124 | 110,109,115 | 112,112,118 |
| indianapolis.modern.chase | crowd, left stand | 134,131,135 | 150,145,144 | +16,+13,+9 | 149,142,140 | 119,120,130 | 122,123,133 |
| indianapolis.modern.chase | infield grass, right | 89,145,63 | 99,148,80 | +10,+3,+17 | 91,147,65 | 87,144,63 | 94,144,78 |
| indianapolis.modern.chase | road, ahead | 128,132,170 | 131,136,172 | +4,+4,+2 | 129,133,170 | 127,132,169 | 131,135,171 |
| indianapolis.retro.chase | crowd, right stand | 114,109,104 | 131,124,113 | +17,+14,+8 | 132,123,111 | 107,106,103 | 107,109,103 |
| indianapolis.retro.chase | crowd, left stand | 123,120,116 | 153,144,131 | +29,+24,+15 | 153,143,130 | 110,112,111 | 110,115,112 |
| indianapolis.retro.chase | infield grass, right | 88,123,70 | 96,126,83 | +8,+3,+12 | 91,125,74 | 86,122,70 | 90,122,79 |
| indianapolis.retro.chase | road, ahead | 111,115,141 | 114,117,144 | +3,+3,+2 | 112,116,142 | 111,115,141 | 114,116,143 |
| indianapolis.modern.high | crowd, left, near | 149,141,130 | 160,149,134 | +11,+8,+4 | 160,149,134 | 139,134,126 | 139,134,124 |
| indianapolis.modern.high | crowd, right, far | 148,139,133 | 190,174,157 | +42,+34,+24 | 192,174,157 | 120,119,122 | 123,121,124 |
| indianapolis.modern.high | grass verge | 69,152,48 | 74,154,55 | +6,+2,+7 | 71,154,49 | 67,151,48 | 71,151,54 |
| indianapolis.modern.high | road | 120,124,162 | 122,127,163 | +3,+3,+1 | 122,126,163 | 119,123,161 | 120,124,161 |
| indianapolis.modern.high | far ground, left | 149,153,160 | 150,154,161 | +1,+1,+1 | 149,153,160 | 149,153,160 | 150,154,161 |
| indianapolis.retro.high | crowd, left, near | 142,129,110 | 166,147,122 | +25,+18,+12 | 167,148,123 | 132,122,105 | 132,122,104 |
| indianapolis.retro.high | crowd, right, far | 129,122,115 | 171,153,138 | +42,+32,+24 | 173,155,139 | 122,120,113 | 123,122,113 |
| indianapolis.retro.high | grass verge | 72,124,58 | 77,127,64 | +5,+3,+6 | 75,127,60 | 72,124,59 | 73,124,62 |
| indianapolis.retro.high | road | 103,107,132 | 105,108,133 | +2,+2,+1 | 105,108,133 | 103,106,131 | 103,107,131 |
| indianapolis.retro.high | far ground, left | 120,122,127 | 120,123,127 | +0,+1,+0 | 120,122,127 | 120,122,127 | 120,123,127 |
| silverstone.modern.chase | grass, left | 92,159,73 | 107,165,100 | +15,+6,+27 | 92,159,73 | 92,158,73 | 107,164,100 |
| silverstone.modern.chase | grass, right | 103,157,77 | 115,161,99 | +12,+4,+22 | 105,159,79 | 102,156,76 | 111,157,96 |
| silverstone.modern.chase | road | 117,120,151 | 119,123,153 | +2,+3,+1 | 118,121,152 | 117,120,151 | 119,122,152 |
| silverstone.retro.chase | grass, left | 85,131,76 | 92,134,90 | +7,+3,+14 | 86,131,76 | 86,131,76 | 92,133,89 |
| silverstone.retro.chase | grass, right | 107,138,83 | 115,142,100 | +9,+4,+17 | 110,141,88 | 104,136,83 | 109,137,94 |
| silverstone.retro.chase | road | 101,102,123 | 102,104,124 | +1,+2,+1 | 101,103,123 | 101,102,123 | 102,103,124 |

What the table says:

- The crowd and the buildings differ by up to 42 levels as shipped and by 5 or less once r128 smooths as 0.187 does, and by 5 or less with nothing smoothed. Their difference is texture smoothing, all of it. (CORRECTED in fix round 2: this read "by 4 or less with nothing smoothed". The near tower's shaded face is 5 apart in red, 92,95,98 against 87,91,94; every crowd row is within 4.)
- It grows with distance and with the angle, because that is when the pattern runs together: the near crowd at Indianapolis (`high`, Modern) is out by 11 and the far crowd by 42; the near tower's face turned to the camera by 5 and its shaded face, seen at a slant, by 28.
- The grass does not respond to either smoothing test (Silverstone, chase, Modern: +15,+6,+27 as shipped, +15,+6,+26 with r128 smoothing in linear light). Its cause is another one.
- The road, the quay and the far ground agree to within 4 levels in every case.
- The sea is a little less red in its light part and a little bluer in the middle, by 6 levels at most.

The grass, with the environment switched off on both engines (switch 4):

| surface, Modern | r128 | 0.187 |
|---|---|---|
| Silverstone, chase: grass, left | 81,143,59 | 83,142,61 |
| Silverstone, chase: grass, right | 89,138,55 | 87,134,54 |
| Indianapolis, chase: infield grass | 72,124,40 | 70,121,39 |
| Indianapolis, high: grass verge | 55,136,28 | 54,133,28 |

With no environment the grass agrees to within 4 levels, so the extra on the grass is light from the environment. It depends on the angle: seen from above the two engines agree to within 7 with the environment on (Indianapolis `high`, the verge: +6,+2,+7), seen along the surface they do not (+15,+6,+27). That fits stage A's account for the grass (a fully rough surface takes more from the environment at a shallow angle on 0.187 than r128's approximation gave it), which stays unmeasured in its detail: what is measured is where the extra comes from and when.

**The causes, as measured, in the order of their size:**

1. Texture smoothing in linear light. The crowd and Monaco's buildings come out lighter, more with distance. Named nowhere in stage A's record.
2. Fog mixed in linear light. A surface part way into the haze comes out paler and redder, most in the far views of Modern.
3. Light from the environment on grass seen along its surface: paler and less green.
4. Small: the car body a little darker, the sea a little duller, the trees casting their own outline.

CORRECTIONS to stage A's record that follow from this (the original text is left where it stands, with a note beside it):

- "A6: where the rest comes from" says the stands at Indianapolis are pale because a fully rough surface mirrors more of the horizon at a shallow angle. For the crowd that is wrong. The crowd is pale because of texture smoothing. The same section's account of the grass stands.
- "No setting reaches it" was said of both together. Nothing was tried then. This round tried `envMapIntensity` on each family (below).
- The table of the four stills over 6 gave fog as the whole cause of three of them. The table below replaces it.

**The four stills that were over 6 at the end of stage A, and what each figure is made of.** The figure is the red channel in all four. "Fog" is what goes when fog is taken off both engines; "smoothing" is what then goes when r128 is also made to smooth as 0.187 does; "left" is the rest.

| still | figure | fog | smoothing | left | what a person looking at the pair sees |
|---|---|---|---|---|---|
| monaco-gp-v1.modern.high | 7.108 | 2.4 (to 4.740) | 2.4 (to 2.326) | 2.3 | the tower blocks are lighter, most on the faces seen at a slant and on the far ones (the near tower's shaded face reads 102,105,106 on r128 and 130,131,129 on 0.187, fog off); the far ground and the far towers gain red; the sea is a shade less red |
| indianapolis-v1.modern.high | 7.100 | 2.7 (to 4.426) | 3.2 (to 1.259) | 1.3 | the crowd washes out to pale pink along both stands, more the further away (far crowd 148,139,133 on r128, 190,174,157 on 0.187, fog off); the far ground gains red |
| brands-hatch-v1.modern.high | 6.753 | 4.6 (to 2.138) | 0.5 (to 1.649) | 1.6 | a band of red across the far ground and the far loop of the track, which fades to orange sooner; the trees cast their outline, not a slab |
| indianapolis-v1.retro.chase | 6.383 | none (6.400 without it) | 4.5 (to 1.885) | 1.9 | the stands on both sides are paler, close to the camera (left stand 123,120,116 on r128, 153,144,131 on 0.187, fog off); the grass a little paler; the sky is the same |

So fog was the larger part of one of the four, about a third of two, and no part of the fourth. (CORRECTED in fix round 2: this read "about half of two". Fog is 2.4 of 7.108 and 2.7 of 7.100.) The review's own estimate from the 350 m trial (about 2.0 of 7.1 at Monaco and 2.6 of 7.1 at Indianapolis) agrees with the 2.4 and 2.7 measured here with fog off on both engines.

### Ruling 1: where the haze starts

Ruled: apply the fog start as a compensation, with stills, and keep whichever of 150, 250 and 300 m has the lowest worst mean across both tiers; on a tie, the nearer to 150; each tier its own value if they want different ones.

The three sets are kept: `stills/fog-150` (the build of `e3f2dba`), `stills/fog-250` and `stills/fog-300` (the same with the one number changed). Each against `stills/before-main`:

| still | 150 m: R, G, B | 250 m: R, G, B | 300 m: R, G, B |
|---|---|---|---|
| brands-hatch-v1.modern.chase | 3.136, 2.024, 3.359 | 2.539, 1.938, 3.306 | 2.418, 1.946, 3.304 |
| brands-hatch-v1.modern.high | 6.753, 1.418, 2.157 | 3.135, 0.885, 2.182 | 2.768, 1.144, 2.254 |
| brands-hatch-v1.retro.chase | 2.287, 1.845, 2.719 | 1.990, 1.750, 2.596 | 2.081, 1.791, 2.574 |
| brands-hatch-v1.retro.high | 3.205, 1.618, 1.975 | 1.916, 1.376, 1.384 | 2.721, 1.855, 1.310 |
| indianapolis-v1.modern.chase | 5.915, 5.003, 4.639 | 5.740, 4.959, 4.645 | 5.702, 4.949, 4.647 |
| indianapolis-v1.modern.high | 7.100, 3.142, 2.746 | 4.609, 2.617, 3.032 | 4.390, 2.789, 3.149 |
| indianapolis-v1.retro.chase | 6.383, 5.326, 4.861 | 6.272, 5.277, 4.848 | 6.264, 5.269, 4.846 |
| indianapolis-v1.retro.high | 5.473, 3.863, 3.127 | 4.650, 3.523, 2.861 | 5.184, 3.816, 2.786 |
| monaco-gp-v1.modern.apex | 3.693, 3.458, 3.817 | 3.294, 3.337, 3.811 | 3.268, 3.327, 3.814 |
| monaco-gp-v1.modern.chase | 4.742, 4.029, 4.141 | 4.160, 3.818, 4.113 | 3.959, 3.743, 4.117 |
| monaco-gp-v1.modern.grid | 2.728, 2.794, 2.873 | 2.647, 2.779, 2.889 | 2.645, 2.788, 2.899 |
| monaco-gp-v1.modern.high | 7.108, 4.374, 4.165 | 5.138, 3.949, 4.497 | 5.005, 3.996, 4.670 |
| monaco-gp-v1.retro.apex | 3.932, 3.567, 3.955 | 3.736, 3.463, 3.912 | 3.721, 3.450, 3.911 |
| monaco-gp-v1.retro.chase | 4.513, 4.190, 4.309 | 4.179, 4.000, 4.203 | 4.087, 3.934, 4.179 |
| monaco-gp-v1.retro.grid | 3.721, 3.443, 3.465 | 3.695, 3.430, 3.465 | 3.706, 3.437, 3.471 |
| monaco-gp-v1.retro.high | 5.964, 4.490, 4.271 | 5.432, 4.241, 4.101 | 5.821, 4.416, 4.077 |
| silverstone-v1.modern.apex | 1.953, 1.948, 2.305 | 1.759, 1.917, 2.327 | 1.741, 1.926, 2.344 |
| silverstone-v1.modern.chase | 2.618, 1.999, 3.089 | 2.426, 1.978, 3.118 | 2.421, 1.984, 3.136 |
| silverstone-v1.modern.grid | 3.264, 2.907, 3.084 | 3.160, 2.889, 3.090 | 3.136, 2.893, 3.098 |
| silverstone-v1.modern.helmet | 2.221, 2.261, 2.387 | 2.106, 2.246, 2.391 | 2.090, 2.249, 2.399 |
| silverstone-v1.modern.high | 5.645, 1.203, 2.298 | 2.659, 0.898, 2.351 | 2.366, 1.072, 2.437 |
| silverstone-v1.modern.stands | 2.950, 2.025, 2.707 | 2.680, 1.969, 2.788 | 2.682, 1.994, 2.820 |
| silverstone-v1.retro.apex | 1.550, 1.721, 2.129 | 1.468, 1.694, 2.119 | 1.500, 1.709, 2.125 |
| silverstone-v1.retro.chase | 1.887, 1.709, 2.523 | 1.829, 1.684, 2.507 | 1.867, 1.694, 2.509 |
| silverstone-v1.retro.grid | 3.043, 2.739, 2.830 | 2.994, 2.722, 2.814 | 3.016, 2.736, 2.814 |
| silverstone-v1.retro.helmet | 1.877, 2.023, 2.422 | 1.825, 2.002, 2.403 | 1.842, 2.009, 2.405 |
| silverstone-v1.retro.high | 2.842, 1.393, 1.994 | 1.780, 1.212, 1.531 | 2.418, 1.562, 1.434 |
| silverstone-v1.retro.stands | 2.834, 2.242, 2.778 | 2.766, 2.189, 2.772 | 2.863, 2.240, 2.771 |
| **Retro, 14 stills** | worst 6.383 (indianapolis chase), average 3.168, over 6: 1 | worst 6.272 (indianapolis chase), average 2.967, over 6: 1 | worst 6.264 (indianapolis chase), average 3.053, over 6: 1 |
| **Modern, 14 stills** | worst 7.108 (monaco high), average 3.385, over 6: 3 | worst 5.740 (indianapolis chase), average 3.018, over 6: 0 | worst 5.702 (indianapolis chase), average 3.011, over 6: 0 |
| **all 28** | worst 7.108 (monaco.modern.high), average 3.276, over 6: 4 | worst 6.272 (indianapolis.retro.chase), average 2.993, over 6: 1 | worst 6.264 (indianapolis.retro.chase), average 3.032, over 6: 1 |

What was kept: **250 m, for both tiers** (`f04d83c`). The far limit, 980 m, is unchanged, and a fully fogged surface reads as it did (step A5).

Why 250 and not 300, said plainly because the rule read to the letter gives 300. The worst still at 250 and at 300 is the Indianapolis chase view, in both tiers, and the two values are 0.008 apart on it in Retro and 0.038 in Modern. That still is not a fog still: it reads 6.400 with fog off on both engines and 6.383 with fog from 150 m. So the measure the rule names cannot tell 250 from 300 here, and that was taken as a tie, which goes to the value nearer 150. On the stills fog does govern, 250 is the better of the two in Retro (per still average 2.967 against 3.053; at 300 the four `high` views in Retro are each 0.4 to 0.8 worse than at 250, because the haze then starts too late for Retro) and the two are level in Modern (3.018 against 3.011; the `high` views are 0.1 to 0.4 better at 300). The tiers do not want different values by the rule's own measure, so there is one.

Measured again at the end of the round, on the build with the three other compensations in it: worst of the 28 is 5.489 at 250 and 5.480 at 300, Retro average 2.702 against 2.790, Modern 2.797 against 2.794. The same picture. If the rule is meant to the third decimal, the change is one number in `buildWorld`.

### Ruling 2: the sea

Ruled: the sea's `envMapIntensity: 1.15`, added in A6, is accepted as a compensation toward the live picture. Its comment in `src/20-track.js` says so now (`483eff1`). No number changed.

### Ruling 3: `envMapIntensity`, one family at a time

Ruled: try one `envMapIntensity` for each of three families, at most three values each; keep a value only if it lowers that family's stills and makes no other still worse by more than 0.2; otherwise leave the family alone.

How the rule was applied, fixed before the numbers were read:

- A family's stills are the stills that any of its three values moves by more than 0.05 on any channel.
- "Lowers the family's stills": the average of the three channel means over those stills falls, and so does the worst of them.
- "No still worse by more than 0.2": no channel of any of the 28 stills rises by more than 0.2. This is stricter than the ruling's words (it counts the family's own stills, and every channel and not only the highest).
- Among values that pass, the one with the lowest family average is kept.
- Each value was measured against the build with the haze from 250 m (`f04d83c`). The kept ones were then measured again in the order they were committed, each on top of the one before.

`envMapIntensity` scales ALL the light a material takes from the environment. That matters for what follows: it is not a control on the thing that differs, for any of the three families.

**The crowd** (`crowdMat`, the face of every stand). Family stills: brands-hatch.modern.high, brands-hatch.retro.high, indianapolis.modern.chase, indianapolis.modern.high, indianapolis.retro.chase, indianapolis.retro.high, silverstone.modern.grid, silverstone.modern.high, silverstone.modern.stands, silverstone.retro.grid, silverstone.retro.high, silverstone.retro.stands.

| value | average of the family's channel means | average of the family's highest channels | the family's worst | family stills whose highest channel rose | largest rise of any channel on any of the 28 | stills with a channel up by more than 0.2 | all 28: worst, and the count over 6 |
|---|---|---|---|---|---|---|---|
| 1 (the build with the haze from 250 m) | 2.977 | 3.540 | 6.272 | 0 | none | 0 | 6.272 (indianapolis.retro.chase), 1 |
| 0.7 | 2.772 | 3.363 | 5.704 | 2 | +0.096 (silverstone.modern.stands B) | 0 | 5.704 (indianapolis.retro.chase), 0 |
| 0.6 (kept) | 2.734 | 3.324 | 5.532 | 2 | +0.172 (silverstone.modern.stands B) | 0 | 5.532 (indianapolis.retro.chase), 0 |
| 0.4 | 2.686 | 3.278 | 5.200 | 3 | +0.347 (silverstone.modern.stands B) | 1 | 5.432 (monaco.retro.high), 0 |

Kept: **0.6** (`beda014`). 0.4 fails: the view from the Silverstone stands, in Modern, rises by 0.347 on blue. What 0.6 moves:

| still | before: R, G, B | after: R, G, B | change |
|---|---|---|---|
| brands-hatch-v1.modern.high | 3.135, 0.885, 2.182 | 3.064, 0.810, 2.123 | -0.071, -0.075, -0.059 |
| brands-hatch-v1.retro.high | 1.916, 1.376, 1.384 | 1.847, 1.306, 1.313 | -0.069, -0.070, -0.071 |
| indianapolis-v1.modern.chase | 5.740, 4.959, 4.645 | 5.119, 4.199, 3.923 | -0.621, -0.760, -0.722 |
| indianapolis-v1.modern.high | 4.609, 2.617, 3.032 | 4.305, 2.236, 2.718 | -0.304, -0.381, -0.314 |
| indianapolis-v1.retro.chase | 6.272, 5.277, 4.848 | 5.532, 4.369, 4.092 | -0.740, -0.908, -0.756 |
| indianapolis-v1.retro.high | 4.650, 3.523, 2.861 | 4.108, 2.905, 2.260 | -0.542, -0.618, -0.601 |
| silverstone-v1.modern.grid | 3.160, 2.889, 3.090 | 2.997, 2.725, 3.014 | -0.163, -0.164, -0.076 |
| silverstone-v1.modern.high | 2.659, 0.898, 2.351 | 2.602, 0.834, 2.289 | -0.057, -0.064, -0.062 |
| silverstone-v1.modern.stands | 2.680, 1.969, 2.788 | 2.663, 2.015, 2.960 | -0.017, +0.046, +0.172 |
| silverstone-v1.retro.grid | 2.994, 2.722, 2.814 | 2.788, 2.532, 2.712 | -0.206, -0.190, -0.102 |
| silverstone-v1.retro.high | 1.780, 1.212, 1.531 | 1.722, 1.152, 1.467 | -0.058, -0.060, -0.064 |
| silverstone-v1.retro.stands | 2.766, 2.189, 2.772 | 2.740, 2.162, 2.833 | -0.026, -0.027, +0.061 |

The price, and it is the point of this entry. The crowd's difference is texture smoothing, which the number does not touch. Taking light off the whole crowd pulls the far crowd toward the live picture and takes the same light off the near crowd. (CORRECTED in fix round 2: this said the near crowd "was close to right" and was pushed away. The table below says otherwise: the close crowd was 12 levels too light in red before the number, and at 0.6 it is nearer in red and green and 5 short in blue.) On the stills that nets out well under the rule. On the surfaces it looks like this (with the haze, as shipped):

| surface | live (r128) | before the number | at 0.6 |
|---|---|---|---|
| Silverstone stands view, Modern: the crowd, close | 95,90,90 | 107,99,95 | 98,90,85 |
| Indianapolis chase, Retro: the left stand | 123,120,116 | 153,144,131 | 148,138,124 |
| Indianapolis high, Modern: the far crowd | 150,141,133 | 190,174,157 | 184,166,147 |

The far crowd is still 34 levels too light in red. The number takes off 6 of the 40. No still is over 6 any more, and the crowd at a distance still washes out to pale pink in the pair.

**The grass** (the `grass` mesh of `buildTrackMeshes`, which carries the grass texture on three circuits and the city ground at Monaco). Family stills: 26 of the 28 (every still but the two Silverstone `helmet` views).

| value | average of the family's channel means | average of the family's highest channels | the family's worst | family stills whose highest channel rose | largest rise of any channel on any of the 28 | stills with a channel up by more than 0.2 | all 28: worst, and the count over 6 |
|---|---|---|---|---|---|---|---|
| 1 (the build with the haze from 250 m) | 3.057 | 3.526 | 6.272 | 0 | none | 0 | 6.272 (indianapolis.retro.chase), 1 |
| 0.75, grass and Monaco's ground | 3.006 | 3.429 | 6.196 | 6 | +0.712 (monaco.modern.high B) | 7 | 6.196 (indianapolis.retro.chase), 1 |
| 0.5, grass and Monaco's ground | 3.175 | 3.539 | 6.660 | 14 | +1.732 (monaco.modern.high B) | 14 | 6.660 (monaco.retro.high), 3 |
| 0.9, grass only (kept) | 2.995 | 3.450 | 6.230 | 0 | +0.100 (silverstone.modern.high G) | 0 | 6.230 (indianapolis.retro.chase), 1 |

Kept: **0.9, on the grass only** (`b23cb11`); Monaco's ground stays at 1. The first two values were set on the whole family and both fail: they take Monaco's stills away from the live picture (Monaco `high` in Modern +0.712 at 0.75 and +1.732 at 0.5), because Monaco's ground matched already (the quay reads 210,190,174 on r128 and 210,190,173 on 0.187). They also overshoot on green in the far views at Brands Hatch and Silverstone (+0.33 to +0.45 at 0.75). So the third value left Monaco's ground out and was chosen small enough to stay inside 0.2 on green. What it moves:

| still | before: R, G, B | after: R, G, B | change |
|---|---|---|---|
| brands-hatch-v1.modern.chase | 2.539, 1.938, 3.306 | 2.369, 1.821, 3.056 | -0.170, -0.117, -0.250 |
| brands-hatch-v1.modern.high | 3.135, 0.885, 2.182 | 2.926, 0.976, 1.843 | -0.209, +0.091, -0.339 |
| brands-hatch-v1.retro.chase | 1.990, 1.750, 2.596 | 1.890, 1.703, 2.475 | -0.100, -0.047, -0.121 |
| brands-hatch-v1.retro.high | 1.916, 1.376, 1.384 | 1.875, 1.410, 1.199 | -0.041, +0.034, -0.185 |
| indianapolis-v1.modern.chase | 5.740, 4.959, 4.645 | 5.657, 4.895, 4.527 | -0.083, -0.064, -0.118 |
| indianapolis-v1.modern.high | 4.609, 2.617, 3.032 | 4.514, 2.656, 2.887 | -0.095, +0.039, -0.145 |
| indianapolis-v1.retro.chase | 6.272, 5.277, 4.848 | 6.230, 5.244, 4.779 | -0.042, -0.033, -0.069 |
| indianapolis-v1.retro.high | 4.650, 3.523, 2.861 | 4.623, 3.531, 2.784 | -0.027, +0.008, -0.077 |
| silverstone-v1.modern.apex | 1.759, 1.917, 2.327 | 1.719, 1.887, 2.269 | -0.040, -0.030, -0.058 |
| silverstone-v1.modern.chase | 2.426, 1.978, 3.118 | 2.283, 1.864, 2.910 | -0.143, -0.114, -0.208 |
| silverstone-v1.modern.grid | 3.160, 2.889, 3.090 | 3.085, 2.832, 2.985 | -0.075, -0.057, -0.105 |
| silverstone-v1.modern.high | 2.659, 0.898, 2.351 | 2.464, 0.998, 2.021 | -0.195, +0.100, -0.330 |
| silverstone-v1.modern.stands | 2.680, 1.969, 2.788 | 2.505, 1.935, 2.546 | -0.175, -0.034, -0.242 |
| silverstone-v1.retro.chase | 1.829, 1.684, 2.507 | 1.757, 1.606, 2.374 | -0.072, -0.078, -0.133 |
| silverstone-v1.retro.grid | 2.994, 2.722, 2.814 | 2.956, 2.687, 2.752 | -0.038, -0.035, -0.062 |
| silverstone-v1.retro.high | 1.780, 1.212, 1.531 | 1.727, 1.258, 1.347 | -0.053, +0.046, -0.184 |
| silverstone-v1.retro.stands | 2.766, 2.189, 2.772 | 2.693, 2.159, 2.645 | -0.073, -0.030, -0.127 |

Measured again on top of the crowd commit: the 17 stills it moves average 2.589 before and 2.497 after, no still's highest channel rises, the largest rise of any channel is 0.100, and the worst of the 28 goes from 5.532 to 5.489.

For the grass the environment IS where the extra comes from, so the number is at least aimed at the right light. It still scales the part that was right along with the extra, which is why it can only be 0.9: Silverstone's grass from the chase camera reads 92,159,73 live, 107,165,100 before and 105,163,96 after.

**Monaco's buildings** (`buildingMat1` to `buildingMat3`). Family stills: the eight Monaco stills.

| value | average of the family's channel means | average of the family's highest channels | the family's worst | family stills whose highest channel rose | largest rise of any channel on any of the 28 | stills with a channel up by more than 0.2 | all 28: worst, and the count over 6 |
|---|---|---|---|---|---|---|---|
| 1 (the build with the haze from 250 m) | 3.845 | 4.155 | 5.432 | 0 | none | 0 | 6.272 (indianapolis.retro.chase), 1 |
| 0.8 (kept) | 3.561 | 3.892 | 4.908 | 2 | +0.114 (monaco.modern.apex G) | 0 | 6.272 (indianapolis.retro.chase), 1 |
| 0.7 | 3.492 | 3.849 | 4.685 | 2 | +0.255 (monaco.modern.apex G) | 1 | 6.272 (indianapolis.retro.chase), 1 |
| 0.4 | 3.547 | 3.948 | 5.114 | 3 | +1.303 (monaco.modern.apex B) | 2 | 6.272 (indianapolis.retro.chase), 1 |

Kept: **0.8** (`52faae7`). 0.7 fails by 0.055: the apex view in Modern rises by 0.255 on green. What 0.8 moves:

| still | before: R, G, B | after: R, G, B | change |
|---|---|---|---|
| monaco-gp-v1.modern.apex | 3.294, 3.337, 3.811 | 3.393, 3.451, 3.841 | +0.099, +0.114, +0.030 |
| monaco-gp-v1.modern.chase | 4.160, 3.818, 4.113 | 3.852, 3.437, 3.568 | -0.308, -0.381, -0.545 |
| monaco-gp-v1.modern.grid | 2.647, 2.779, 2.889 | 2.711, 2.850, 2.918 | +0.064, +0.071, +0.029 |
| monaco-gp-v1.modern.high | 5.138, 3.949, 4.497 | 4.727, 3.446, 3.863 | -0.411, -0.503, -0.634 |
| monaco-gp-v1.retro.apex | 3.736, 3.463, 3.912 | 3.568, 3.202, 3.545 | -0.168, -0.261, -0.367 |
| monaco-gp-v1.retro.chase | 4.179, 4.000, 4.203 | 3.762, 3.567, 3.670 | -0.417, -0.433, -0.533 |
| monaco-gp-v1.retro.grid | 3.695, 3.430, 3.465 | 3.563, 3.244, 3.252 | -0.132, -0.186, -0.213 |
| monaco-gp-v1.retro.high | 5.432, 4.241, 4.101 | 4.908, 3.657, 3.471 | -0.524, -0.584, -0.630 |

The same price as the crowd, for the same reason: the buildings' difference is texture smoothing. Far buildings move toward the live picture; near ones, which were right, move away (the apex and grid views in Modern, by 0.11 at most). On the surfaces: with the haze off for the first two figures and on for the third, the near tower's shaded face reads 102,105,106 live, 130,131,129 before and 125,125,123 after; its face turned to the camera 77,82,81 live, 82,87,87 before and 79,84,83 after.

### Ruling 4: tree shadows

Ruled: not compensated. On r128 the shadow pass ignored a material's alpha test, so a tree cast the shadow of its whole card, a dark slab on the grass; on 0.187 it casts its own outline. That is the engine doing the right thing. It goes to Jamie with the pairs.

### For Jamie, with the pairs

(SUPERSEDED by the list of the same name under fix round 2.)

Things that differ from the live game after this round and are for Jamie to see and accept or not:

1. **Trees cast their own outline** and not a slab (ruling 4). Not compensated, by ruling. Seen in every view with a tree near the camera, most plainly at Silverstone from the chase camera.
2. **The crowd and Monaco's buildings are lighter at a distance.** The cause is texture smoothing and is still there. Two numbers (0.6 on the crowd, 0.8 on the buildings) bring every still under the gate; the far crowd at Indianapolis is still 34 levels lighter in red than live, and the close crowd is now a little less blue than live.
3. **The haze starts at 250 m, not 150 m.** A compensation; the far limit and the colour of a fully fogged surface are as before.
4. **The grass is a little paler and less green seen along the ground.** 0.9 takes a little of it off.
5. **The sea** carries 1.15 (accepted by ruling 2) and is within 6 levels of live.
6. **The car body** is still a little darker than live at its own 1.15 (stage A: 41,45,55 against 51,56,66 on the rear of the player's car). Not touched in this round.

### Where it stands after fix round 1

`stills/after-tuning`, taken from the repo's own build of `483eff1` with a clean tree: `v0.125 dev 483eff1`. Against `stills/before-main` (`node tools/stills-compare.js stills/before-main stills/after-tuning`, which exits 0):

| still | R | G | B | pixels off by more than 24 | gate | highest channel at the end of stage A | change |
|---|---|---|---|---|---|---|---|
| brands-hatch-v1.modern.chase | 2.369 | 1.821 | 3.056 | 4.480% | ok | 3.359 | -0.303 |
| brands-hatch-v1.modern.high | 2.855 | 0.901 | 1.784 | 2.754% | ok | 6.753 | -3.898 |
| brands-hatch-v1.retro.chase | 1.890 | 1.703 | 2.475 | 1.522% | ok | 2.719 | -0.244 |
| brands-hatch-v1.retro.high | 1.806 | 1.341 | 1.128 | 0.974% | ok | 3.205 | -1.399 |
| indianapolis-v1.modern.chase | 5.036 | 4.135 | 3.805 | 8.324% | ok | 5.915 | -0.879 |
| indianapolis-v1.modern.high | 4.211 | 2.276 | 2.574 | 6.584% | ok | 7.100 | -2.889 |
| indianapolis-v1.retro.chase | 5.489 | 4.336 | 4.023 | 9.928% | ok | 6.383 | -0.894 |
| indianapolis-v1.retro.high | 4.081 | 2.913 | 2.183 | 6.821% | ok | 5.473 | -1.392 |
| monaco-gp-v1.modern.apex | 3.393 | 3.451 | 3.841 | 3.910% | ok | 3.817 | +0.024 |
| monaco-gp-v1.modern.chase | 3.852 | 3.437 | 3.568 | 4.496% | ok | 4.742 | -0.890 |
| monaco-gp-v1.modern.grid | 2.711 | 2.850 | 2.918 | 2.558% | ok | 2.873 | +0.045 |
| monaco-gp-v1.modern.high | 4.727 | 3.446 | 3.863 | 4.819% | ok | 7.108 | -2.381 |
| monaco-gp-v1.retro.apex | 3.568 | 3.202 | 3.545 | 3.488% | ok | 3.955 | -0.387 |
| monaco-gp-v1.retro.chase | 3.762 | 3.567 | 3.670 | 2.822% | ok | 4.513 | -0.751 |
| monaco-gp-v1.retro.grid | 3.563 | 3.244 | 3.252 | 3.777% | ok | 3.721 | -0.158 |
| monaco-gp-v1.retro.high | 4.908 | 3.657 | 3.471 | 4.650% | ok | 5.964 | -1.056 |
| silverstone-v1.modern.apex | 1.708 | 1.874 | 2.254 | 2.662% | ok | 2.305 | -0.051 |
| silverstone-v1.modern.chase | 2.283 | 1.864 | 2.910 | 3.661% | ok | 3.089 | -0.179 |
| silverstone-v1.modern.grid | 2.922 | 2.667 | 2.909 | 4.036% | ok | 3.264 | -0.342 |
| silverstone-v1.modern.helmet | 2.102 | 2.243 | 2.385 | 1.905% | ok | 2.387 | -0.002 |
| silverstone-v1.modern.high | 2.407 | 0.934 | 1.959 | 2.938% | ok | 5.645 | -3.238 |
| silverstone-v1.modern.stands | 2.488 | 1.982 | 2.718 | 1.949% | ok | 2.950 | -0.232 |
| silverstone-v1.retro.apex | 1.430 | 1.668 | 2.079 | 1.526% | ok | 2.129 | -0.050 |
| silverstone-v1.retro.chase | 1.757 | 1.606 | 2.374 | 1.243% | ok | 2.523 | -0.149 |
| silverstone-v1.retro.grid | 2.750 | 2.497 | 2.650 | 3.675% | ok | 3.043 | -0.293 |
| silverstone-v1.retro.helmet | 1.825 | 2.002 | 2.399 | 1.708% | ok | 2.422 | -0.023 |
| silverstone-v1.retro.high | 1.668 | 1.197 | 1.283 | 1.012% | ok | 2.842 | -1.174 |
| silverstone-v1.retro.stands | 2.666 | 2.131 | 2.705 | 3.260% | ok | 2.834 | -0.129 |

**Stills over 6: none.** The range is 0.9 to 5.5. The highest is `indianapolis-v1.retro.chase` at 5.489. No still is over 6, so no still has a cause listed beside it in that table; the five highest and what they are made of:

| still | figure | what it is |
|---|---|---|
| indianapolis-v1.retro.chase | 5.489 | the crowd in the stands, paler than live: texture smoothing (6.4 as shipped at the end of stage A, 2.3 with the smoothing made equal) |
| indianapolis-v1.modern.chase | 5.036 | the same |
| monaco-gp-v1.retro.high | 4.908 | the buildings lighter (texture smoothing), with a little fog on the far ground, and the sea a shade less red than live: its light part by 4 levels here and by 6 in Modern (ADDED in fix round 2: the sea, about a quarter of the frame, was left out of this row and the next) |
| monaco-gp-v1.modern.high | 4.727 | the same |
| indianapolis-v1.modern.high | 4.211 | the far crowd pale pink (texture smoothing), with a little fog on the far ground |

This must not be read as "the picture matches". The gate is met by four compensations, and the largest cause is compensated in the wrong place. With the haze from 250 m and nothing else, and r128 made to smooth textures as 0.187 does, the 28 stills read 0.6 to 3.1 with an average of 1.77; as the stage stands they read 0.9 to 5.5 with an average of 2.75. The first figure is what a fix at the cause could reach if it gave back r128's smoothing exactly. Such a fix was not ruled and was not tried. If one is made, the crowd's 0.6 and the buildings' 0.8 have to come out again, because they would then darken surfaces that match.

The real WebGPU backend, checked once after the last change, on the same build (`v0.125`): the system Chrome 158, headed, Modern, the canvas read back in the task that drew it and reduced to the 32 x 18 grid of cell means, WebGPU (`backend.isWebGPUBackend`, `backend.device` a `GPUDevice`) against the same Chrome with `?renderer=webgl`:

| shot | it draws | mean difference | worst cell |
|---|---|---|---|
| Silverstone, chase, tick 900 | cell means from 40 to 234 | 0.002 | 0.05 |
| Monaco, high, tick 600 | cell means from 0 to 224 | 0.004 | 0.11 |

Both within 1 level on the worst cell. Nothing on the console of either page, on either backend. Every browser the check opened was closed.

Tests after the last change: `node test/sim-parity.test.js` 4 passed; `node test/physics.test.js` 37 passed; `node test/fpmath.test.js` 3 passed; `node test/track-bake.test.js` 8 passed; `node test/music.test.js` 31 passed; `node build.js` invariants OK (`dist/index.html` 1,592,966 bytes, `dist/artifact.html` 1,588,343); then `git checkout -- dist`. Not run, as told: `tools/bench.js`, `test/csp.js`. Stage B and stage C are not started.

## Task 6, stage A, fix round 2: canvas textures smoothed as r128 smoothed them

Fix round 1 was reviewed. It had found that most of what still differed from the live picture was where a canvas texture is smoothed, and it had brought the stills under the gate with three numbers that worked on something else. This round takes those numbers out and puts the smoothing right at its cause. Nothing in the simulation changed: `node test/sim-parity.test.js` printed 4 passed before every commit.

Read this first.

1. **The fix works on both backends, and for the right reason.** A canvas texture is stored and smoothed as r128 stored and smoothed it, and turned into light in the shader afterwards. The far crowd at Indianapolis was 34 levels lighter than live in red at the end of fix round 1 and is within 2 levels now (150,141,133 live, 148,140,134 here). With the fix alone the 28 stills read 0.6 to 3.3, none over 6; the last round had measured 0.6 to 3.1 as the most an exact fix could reach.
2. **The sea's `envMapIntensity` of 1.15 came out, by the letter of its test, and that is the one decision of this round that makes a figure worse.** It still helped, and one channel of one still rose by 0.309, over the 0.2 allowed. Without it the worst still of the set goes from 3.255 to 4.556. Whether the test was meant for each channel or for each still's figure is the controller's to say: see "Ruling 3 again".
3. **No number stands in for a cause any more.** The one compensation left from the port is where the haze starts, 250 m, which the new rule keeps.

| build | range | over 6 | worst | average of the channel means: Retro, Modern, all 28 | average of the highest channels, all 28 |
|---|---|---|---|---|---|
| end of fix round 1, `8b0e0e3` (`stills/after-tuning`) | 0.901 to 5.489 | 0 | 5.489 indianapolis-v1.retro.chase | 2.702, 2.797, 2.749 | 3.204 |
| `2456c4e`, the three numbers out (`stills/fix2-reverted`) | 0.885 to 6.272 | 1 | 6.272 indianapolis-v1.retro.chase | 2.967, 3.018, 2.993 | 3.446 |
| `34942be`, textures smoothed as r128 did (`stills/fix2-filter`) | 0.603 to 3.255 | 0 | 3.255 monaco-gp-v1.modern.high | 1.638, 1.970, 1.804 | 2.130 |
| `f2aab8d`, the sea's number out | 0.603 to 4.556 | 0 | 4.556 monaco-gp-v1.modern.high | 1.681, 2.012, 1.847 | 2.222 |
| `1028956`, the small things (`stills/after-tuning-2`) | 0.603 to 4.556 | 0 | 4.556 monaco-gp-v1.modern.high | 1.681, 2.012, 1.847 | 2.222 |

The last two rows are the same 28 files: `1028956` changes comments and one line that never ran.

### Where each round's evidence lives

Neither `stills/` nor `.superpowers/` is in git. Both are folders in the repo on the machine the work was done on, and they are what the figures in this log were measured from. Fix round 1 kept its stills in a session scratchpad, which a restart can clear, and this log said "a copy in the scratchpad" with no path. That is put right here.

- Stage A: `stills/move-A1` to `stills/move-A7`, with `stills/move-A5a`, `move-A5b`, `move-A6r`, `move-A6try` and `move-fogtry` from its trials.
- Fix round 1, the sets it kept: `stills/fog-150`, `stills/fog-250`, `stills/fog-300`, `stills/after-tuning`.
- Fix round 1, everything it measured in the scratchpad, copied in this round to `stills/fix1-evidence/<name>`: `r128-fog` (r128 rebuilt, the live picture), `r128-nofog` and `new-nofog` (fog off on each engine), `r128-linfilter` and `r128-nofog-linfilter` (r128 made to smooth in linear light), `r128-nofog-nearest` and `new-nofog-nearest` (nothing smoothed), `r128-noenv` and `new-noenv` (no environment), the nine trial sets of ruling 3 (`crowd-0.7`, `crowd-0.6`, `crowd-0.4`, `grass-0.75`, `grass-0.5`, `grassonly-0.9`, `build-0.8`, `build-0.7`, `build-0.4`), the sets taken after each commit (`step-crowd`, `step-grass`, `step-build`, `step-tidy`), `cur-fog250` and `final-fog300`. Its scripts, its edited copies of the source and the output of every compare are in `.superpowers/sdd/2026-11-23-mcl64-v2-picture-part1/t6af1-evidence/`.
- Fix round 2: `stills/fix2-reverted`, `stills/fix2-filter`, `stills/fix2-fog-150`, `stills/fix2-fog-250`, `stills/fix2-fog-300`, `stills/after-tuning-2`, and under `stills/fix2-evidence/`: `grass-0.9` and `grass-0.75` (the grass trials), `grass-0.9-sea-1.15` and `grass-0.75-sea-1.15` (the same two, taken before the sea's number came out), `final-nofog`, `final-nofog-noenv` and `r128-nofog-noenv` (the switches thrown on the final build and on r128), `gpu-final-webgpu` and `gpu-final-webgl` (the system Chrome on each backend), `shimmer-r128-tick-900` to `902` and `shimmer-final-tick-900` to `902`, and `node-holding-one-texture`. The scripts, the diff of every edited copy and the output of every compare are in `.superpowers/sdd/2026-11-23-mcl64-v2-picture-part1/t6af2-evidence/`.

As before, every trial was an edit to a copy outside the working tree, the stills are headless and so show the fallback, and fog off means `new THREE.Fog(SKY_HAZE, 1e7, 2e7)`.

### Steps 1 and 2: the starting point, and the three numbers out

- `node tools/stills-compare.js stills/before-main stills/after-tuning`: 28 compared, 0.901 to 5.489, none over 6, exit 0. That is the end of fix round 1, reproduced.
- `2456c4e` takes out the crowd's 0.6, the grass's 0.9 and the buildings' 0.8 in one commit. Checked: `git diff f04d83c 2456c4e -- src/20-track.js` shows one hunk, the note `483eff1` added to the sea's comment, so the file is what it was before the three numbers went in; and the source named `envMapIntensity` only for the car paint and the sea.
- `stills/fix2-reverted` against `stills/before-main`: 0.885 to 6.272, one over 6 (`indianapolis-v1.retro.chase`, 6.272), exit 1. The brief expected about 1.0 to 6.2, which was the figure with two of the three numbers out. With the grass's out as well the picture is that of `f04d83c` again: `stills/fix2-reverted` against `stills/fog-250` reads 0.000 on every channel of all 28.

### The fix (`34942be`)

**What was wrong.** r128 stored a canvas texture as `RGBA8`, the painted values as they were. The GPU built the mip chain from those values and smoothed between texels and between mip levels on them, and the shader turned the smoothed sample into light. three.js 0.187, handed a texture flagged sRGB, stores it as `SRGB8_ALPHA8` on the fallback and `rgba8unorm-srgb` on WebGPU, and the GPU then turns every texel into light before it smooths. The mean of the light is brighter than the light of the mean, so the crowd and Monaco's buildings came out lighter wherever their pattern ran together.

**What was done.** Two halves, both in `src/10-core.js`, and one call.

- `texFromCanvas` no longer flags the texture sRGB. A texture with no colour space is stored as `RGBA8` on the fallback and `rgba8unorm` on WebGPU, the GPU builds its mip chain from the painted values and smooths on them, and that is what r128's GPU did. Filters, wrap, repeat and anisotropy are untouched. The texture carries a mark, `userData.decodeInShader`.
- `decodeCanvasMaps(root)`, beside it, gives every material whose map carries the mark two nodes. `colorNode` is the material's colour times the smoothed sample put through the engine's own `sRGBTransferEOTF`. `opacityNode` is the material's opacity times the sample's alpha. `sRGBTransferEOTF` is r128's `sRGBToLinear` constant for constant (0.9478672986, 0.0521327014, 2.4, 0.0773993808, 0.04045, read in both sources), so the shader does to the sample what r128's shader did to it, in the same order: map, then vertex colours, then the alpha test, then the lighting.
- `Game.buildWorld` calls it once, after the scene is built. The cars carry no canvas texture that needs it (the blob under a car is black, was never flagged, and is untouched).

**Why this mechanism and not the other.** The ruling named two and asked for the more exact one first. An explicit mip chain on a texture left in an sRGB format would have put right what each mip level holds and nothing else: between two texels of one level, and between two levels, the GPU would still have smoothed light and not painted values. This one leaves nothing for the GPU to do differently from r128: the same stored bytes, the same mip chain, the same filtering, and the same curve afterwards. It was tried first, it works on both backends, so the other was not built and nothing is lost.

**Three things it took.** The first two were found by something failing; the third was read in the engine's source.

- The nodes read the map, the colour and the opacity through the mesh being drawn (`reference('material.map', 'texture')` and so on), not through the material being drawn. The first try used the engine's `materialReference`. In Modern the shadow pass draws every mesh with the renderer's own shadow material and asks the mesh's material for the alpha of its colour node; the reference then looked for a map on the shadow material, found none, and the shader did not build. That was reported on the console and nowhere else (`THREE.TSL: NodeError: THREE.TSL: texture( value ) function expects a valid instance of THREE.Texture()`), which is what the console watch is for.
- One pair of nodes serves every material. A node that holds one texture (`texture(material.map)`, made for each material) was tried to see what it does: it draws with no error and with the wrong texture. Monaco's quay took the road's (`stills/fix2-evidence/node-holding-one-texture`, 13.1 against the fixed build on red). The renderer shares one compiled shader between classic materials whose properties look alike to it, and what it compares does not look inside a node.
- The sample's alpha goes on the opacity node and the colour node's own alpha is 1. The shadow pass multiplies the map's alpha in by itself, so alpha left on the colour node would be counted twice there, and a tree, which is cut out by an alpha test, could cast a thinner outline than it shows.

A mesh that carries a list of materials cannot be read through the mesh. The game has none, and one that turned up with a canvas texture is an error in `decodeCanvasMaps`, not a pale texture later.

**The bundle.** `tools/three-entry.webgpu.js` gained two names under `THREE.TSL`: `reference` and `sRGBTransferEOTF`. `node tools/vendor-three.js webgpu <workdir>` with the scratchpad workdir gave 853,426 bytes, SHA-256 `7fdd3961332e227708eb4e1b90660f7202b80d9c8d0a0409048bb6ef8087dd43` (853,393 bytes before). It is committed as `vendor/three.bundle.js` with the code that needs it, and `vendor/three.webgpu.js` was deleted. With the rebuilt bundle `node test/sim-parity.test.js` prints 4 passed. `src/10-core.js` still loads with no `THREE` (`node test/music.test.js`, 31 passed) and with r128 (`node test/track-bake.test.js`, 8 passed): `decodeCanvasMaps` needs the engine only when it is called.

**The environment canvas does not need the same,** and is left flagged sRGB. Worked out on the canvas the game paints (256 x 128, a smooth sky with a soft sun): averaging a box of texels before turning it into light, against after, differs by 0.080 of a level at worst for a 2 x 2 box and 0.299 for a 4 x 4 box. Those are the sizes the GPU smooths the canvas over when the engine reads it. Wider blurs are the engine's own, for rough surfaces, and r128 made those in light as well (its prefilter turns each sample into light as it reads it: `inputEncoding` in `tools/vendor/three-r128.min.js`).

**The cost at load.** Time from the start of navigation to the first frame, in the system Chrome, headed, Modern, a fresh browser for every run so that nothing compiled is carried over, the two builds taken turn about, seven runs each. Before is the build of `2456c4e`, after is the build with the fix. "Drawn" is the end of the first frame callback that drew; "GPU done" is when the GPU reports that frame's work finished.

| circuit | backend | before: drawn, median of 7 (lowest to highest) | after: drawn | before: GPU done, median | after: GPU done |
|---|---|---|---|---|---|
| Silverstone | WebGPU | 243 ms (211 to 261) | 224 ms (216 to 394) | 264 ms | 264 ms |
| Silverstone | fallback | 294 ms (265 to 366) | 307 ms (258 to 337) | 295 ms | 314 ms |
| Monaco | WebGPU | 297 ms (269 to 388) | 293 ms (249 to 390) | 357 ms | 349 ms |
| Monaco | fallback | 361 ms (323 to 444) | 346 ms (327 to 645) | 363 ms | 348 ms |

The medians move by 19 ms at most, in either direction, and the seven runs of one build spread over 50 to 320 ms, so no cost shows. The shader does one more conversion for each sample and the GPU one fewer.

**Seams and shimmer.** The pairs for Indianapolis `high`, Monaco `high` and the Silverstone `stands` view were looked at side by side: no seam at a texture's edge, and the three building textures are each on their own buildings. Shimmer was measured, not judged by eye: three ticks in a row (900, 901, 902) from the chase camera at Indianapolis, which moves past both stands, on r128 and on the final build, and the mean change of a surface from one tick to the next. A texture that shimmers changes more between ticks.

| view | surface | r128: tick 900 to 901, 901 to 902 | final build: the same |
|---|---|---|---|
| retro chase | crowd, right stand | 35.88, 35.96 | 34.87, 34.96 |
| retro chase | crowd, left stand | 34.12, 33.89 | 32.91, 32.75 |
| retro chase | road, ahead | 5.33, 4.81 | 5.20, 4.60 |
| modern chase | crowd, right stand | 47.01, 47.09 | 45.22, 45.31 |
| modern chase | crowd, left stand | 51.32, 51.65 | 49.14, 49.43 |
| modern chase | road, ahead | 11.38, 10.75 | 10.63, 10.10 |

The crowd changes 3% to 4% less from tick to tick than it does on r128, and the road 2% to 7% less. Nothing shimmers that did not.

**Both backends, after this commit.** The system Chrome 158, headed, WebGPU (`backend.isWebGPUBackend`, `backend.device` a `GPUDevice`) against the same Chrome with `?renderer=webgl`, the canvas reduced to a 32 x 18 grid of cell means: Silverstone `chase`, Indianapolis `high` and `chase`, Monaco `high`, each in Retro and in Modern. Worst cell 0.24 (Monaco `high`, Retro), the other seven 0.05 to 0.18, nothing on the console of any of the sixteen pages. The table for the final build is further down; the figures are the same.

**The picture.** Highest channel mean of each still against `stills/before-main`:

| still | end of fix round 1 | the three numbers out | textures smoothed as r128 did | final |
|---|---|---|---|---|
| brands-hatch-v1.modern.chase | 3.056 | 3.306 | 2.940 | 2.940 |
| brands-hatch-v1.modern.high | 2.855 | 3.135 | 2.712 | 2.712 |
| brands-hatch-v1.retro.chase | 2.475 | 2.596 | 2.106 | 2.106 |
| brands-hatch-v1.retro.high | 1.806 | 1.916 | 1.503 | 1.503 |
| indianapolis-v1.modern.chase | 5.036 | 5.740 | 2.735 | 2.735 |
| indianapolis-v1.modern.high | 4.211 | 4.609 | 2.394 | 2.394 |
| indianapolis-v1.retro.chase | 5.489 | 6.272 | 2.262 | 2.262 |
| indianapolis-v1.retro.high | 4.081 | 4.650 | 1.438 | 1.438 |
| monaco-gp-v1.modern.apex | 3.841 | 3.811 | 1.882 | 1.882 |
| monaco-gp-v1.modern.chase | 3.852 | 4.160 | 2.486 | 2.694 |
| monaco-gp-v1.modern.grid | 2.918 | 2.889 | 1.971 | 2.019 |
| monaco-gp-v1.modern.high | 4.727 | 5.138 | 3.255 | 4.556 |
| monaco-gp-v1.retro.apex | 3.568 | 3.912 | 1.836 | 1.836 |
| monaco-gp-v1.retro.chase | 3.762 | 4.203 | 2.213 | 2.378 |
| monaco-gp-v1.retro.grid | 3.563 | 3.695 | 1.838 | 1.896 |
| monaco-gp-v1.retro.high | 4.908 | 5.432 | 2.712 | 3.511 |
| silverstone-v1.modern.apex | 2.254 | 2.327 | 1.875 | 1.875 |
| silverstone-v1.modern.chase | 2.910 | 3.118 | 2.717 | 2.717 |
| silverstone-v1.modern.grid | 2.922 | 3.160 | 2.192 | 2.192 |
| silverstone-v1.modern.helmet | 2.385 | 2.391 | 2.033 | 2.033 |
| silverstone-v1.modern.high | 2.407 | 2.659 | 2.248 | 2.248 |
| silverstone-v1.modern.stands | 2.718 | 2.788 | 2.143 | 2.143 |
| silverstone-v1.retro.apex | 2.079 | 2.119 | 1.513 | 1.513 |
| silverstone-v1.retro.chase | 2.374 | 2.507 | 1.950 | 1.950 |
| silverstone-v1.retro.grid | 2.750 | 2.994 | 1.767 | 1.767 |
| silverstone-v1.retro.helmet | 2.399 | 2.403 | 1.920 | 1.920 |
| silverstone-v1.retro.high | 1.668 | 1.780 | 1.373 | 1.373 |
| silverstone-v1.retro.stands | 2.705 | 2.772 | 1.621 | 1.621 |
| worst / average of the channel means / over 6 | 5.489 / 2.749 / 0 | 6.272 / 2.993 / 1 | 3.255 / 1.804 / 0 | 4.556 / 1.847 / 0 |

So the fix takes the average from 2.993 to 1.804 and the worst from 6.272 to 3.255. The last round's measured ceiling (r128 made to smooth as 0.187 did, against the build with the haze from 250 m) was 0.593 to 3.085 with an average of 1.774. The fix reads 0.603 to 3.255 with an average of 1.804. The last column is after the sea's number came out, which moves six Monaco stills and no other.

### Ruling 3 again: the sea and the grass

Ruled: the grass's number comes out unless one value for the whole family, every circuit, passes the same test as before; the sea's 1.15 is tested again after the fix and is kept only if it still helps and harms nothing by more than 0.2.

The test is the one fix round 1 applied, and it is applied to both in the same way. A family's stills are those the number moves by more than 0.05 on any channel. Over those stills the average of the channel means must fall, and so must the worst. No channel of any of the 28 stills may rise by more than 0.2.

**The sea.** The sea at 1 (the number out) against the sea at 1.15, on the build with the fix. It moves six stills:

| still | sea at 1: R, G, B | sea at 1.15: R, G, B | change |
|---|---|---|---|
| monaco-gp-v1.modern.chase | 2.694, 2.288, 2.322 | 2.486, 2.141, 2.198 | -0.208, -0.147, -0.124 |
| monaco-gp-v1.modern.grid | 1.777, 2.019, 2.010 | 1.710, 1.971, 1.969 | -0.067, -0.048, -0.041 |
| monaco-gp-v1.modern.high | 4.556, 2.341, 2.445 | 3.255, 2.189, 2.754 | -1.301, -0.152, +0.309 |
| monaco-gp-v1.retro.chase | 2.362, 2.378, 2.367 | 2.178, 2.213, 2.197 | -0.184, -0.165, -0.170 |
| monaco-gp-v1.retro.grid | 1.660, 1.885, 1.896 | 1.600, 1.832, 1.838 | -0.060, -0.053, -0.058 |
| monaco-gp-v1.retro.high | 3.511, 2.067, 1.872 | 2.712, 1.739, 1.872 | -0.799, -0.328, +0.000 |

It still helps: over the six, the average of the channel means falls from 2.358 to 2.159 and the worst from 4.556 to 3.255. One channel rises by more than 0.2: blue in Monaco's `high` view in Modern, by 0.309. On the surfaces (Modern, the `high` view): the light part of the sea reads 99,164,190 live, 84,157,185 at 1 and 93,163,190 at 1.15; its middle reads 1,131,175 live, 0,130,174 at 1 and 0,135,179 at 1.15. So the number brings the light part 9 levels nearer in red and pushes the dark middle 4 to 5 levels too far in green and blue, and the sea is 27% of that frame (by a colour mask on the live still).

**Taken out** (`f2aab8d`): the line is as `main` has it. This is the letter of the test and it has a price. Read by each still's own figure, its highest channel, which is what the gate reads, 1.15 harms nothing: no still's figure rises, and the worst of the set is 1.3 lower with it. Read for each channel, as every number of fix round 1 was read and as the grass is read below, it fails on one channel of one still by 0.109. The stricter reading was used so that both halves of one ruling are held to one test. If the looser reading was meant, the change is one line (`envMapIntensity: 1.15` on `seaMat`), and the set is then `stills/fix2-filter`: 0.6 to 3.3.

**The grass.** One value on the whole family: the `grass` mesh of `buildTrackMeshes` on every circuit, Monaco's city ground with it. Two values, both chosen before either was read. Measured on the build with the sea's number out:

| value | stills moved | average of their channel means | their worst | largest rise of any channel on any of the 28 | stills with a channel up by more than 0.2 | all 28: worst | verdict |
|---|---|---|---|---|---|---|---|
| 1 (the build as it is) | | | 4.556 | none | 0 | 4.556 (monaco.modern.high) | |
| 0.9 | 25 | 1.866 to 1.823 | 4.556 to 4.664 | +0.238 (monaco.modern.high B) | 2 (Monaco `high`, both tiers) | 4.664 | fails |
| 0.75 | 26 | 1.845 to 1.822 | 4.556 to 4.892 | +0.754 (monaco.modern.high B) | 9 | 4.892 | fails |

Both fail twice over: the family's worst rises, and Monaco's `high` views rise by more than 0.2. They had been measured first with the sea's number still in, and failed in the same way (0.9: worst 3.255 to 3.363, +0.237; 0.75: worst 3.255 to 3.591, +0.753). A third value was not spent. The family's worst still is Monaco's `high` view in Modern, which shows no grass, only the city ground the same mesh carries; its red rose by 0.108 at 0.9 and by 0.336 at 0.75, so any value under 1 raises it and none can meet "the worst must fall". The three circuits with grass do move toward the live picture (Silverstone `chase` in Modern, blue: 2.717 to 2.509 at 0.9), which is what the number with a condition on the circuit had used. That number stays out, as ruled (`2456c4e`).

### Ruling 4: where the haze starts, by the new rule

A RULED CHANGE OF RULE. Fix round 1 was told to keep the start with the lowest worst mean, and on a tie the nearer to 150. That rule picked on a still that fog does not govern, by 0.008, and the round kept 250 against its letter. The controller changed the rule for this round:

> After the fix, capture the 28 at 150, 250 and 300 and keep the one with the lowest average of the 28 means; if two are within 0.02 of each other, keep the nearer to 150. One value for both tiers unless the tiers differ by more than 0.2 on their own averages.

The three sets are `stills/fix2-fog-150`, `stills/fix2-fog-250` and `stills/fix2-fog-300`: the build of `f2aab8d` (the fix in, the sea's number out), with the one number changed for 150 and 300. Each against `stills/before-main`. A still's mean is taken as the mean of its three channel means; the average of the highest channels is given beside it so that the choice can be seen not to hang on that reading.

| still | 150 m: R, G, B | 250 m: R, G, B | 300 m: R, G, B |
|---|---|---|---|
| brands-hatch-v1.modern.chase | 2.756, 1.691, 2.984 | 2.169, 1.618, 2.940 | 2.066, 1.640, 2.941 |
| brands-hatch-v1.modern.high | 6.315, 1.082, 1.896 | 2.712, 0.603, 1.925 | 2.388, 0.898, 2.005 |
| brands-hatch-v1.retro.chase | 1.839, 1.505, 2.213 | 1.586, 1.462, 2.106 | 1.694, 1.520, 2.090 |
| brands-hatch-v1.retro.high | 2.720, 1.210, 1.670 | 1.503, 1.083, 1.098 | 2.349, 1.602, 1.042 |
| indianapolis-v1.modern.chase | 2.530, 2.313, 2.736 | 2.309, 2.285, 2.735 | 2.347, 2.308, 2.738 |
| indianapolis-v1.modern.high | 4.943, 1.294, 1.407 | 2.394, 0.736, 1.640 | 2.190, 0.939, 1.800 |
| indianapolis-v1.retro.chase | 2.000, 1.981, 2.264 | 1.978, 1.991, 2.262 | 2.027, 2.019, 2.270 |
| indianapolis-v1.retro.high | 2.176, 1.324, 1.358 | 1.438, 1.073, 1.087 | 2.122, 1.477, 1.066 |
| monaco-gp-v1.modern.apex | 1.765, 1.784, 1.814 | 1.595, 1.882, 1.866 | 1.686, 1.908, 1.875 |
| monaco-gp-v1.modern.chase | 3.245, 2.393, 2.202 | 2.694, 2.288, 2.322 | 2.585, 2.398, 2.391 |
| monaco-gp-v1.modern.grid | 1.840, 2.025, 1.991 | 1.777, 2.019, 2.010 | 1.776, 2.027, 2.019 |
| monaco-gp-v1.modern.high | 6.182, 2.381, 1.889 | 4.556, 2.341, 2.445 | 4.590, 2.588, 2.685 |
| monaco-gp-v1.retro.apex | 1.724, 1.679, 1.722 | 1.836, 1.793, 1.789 | 1.888, 1.820, 1.802 |
| monaco-gp-v1.retro.chase | 2.501, 2.366, 2.316 | 2.362, 2.378, 2.367 | 2.551, 2.512, 2.439 |
| monaco-gp-v1.retro.grid | 1.671, 1.890, 1.891 | 1.660, 1.885, 1.896 | 1.672, 1.894, 1.903 |
| monaco-gp-v1.retro.high | 3.525, 1.854, 1.781 | 3.511, 2.067, 1.872 | 4.179, 2.435, 1.948 |
| silverstone-v1.modern.apex | 1.549, 1.623, 1.848 | 1.360, 1.599, 1.875 | 1.352, 1.616, 1.896 |
| silverstone-v1.modern.chase | 2.215, 1.638, 2.680 | 2.030, 1.627, 2.717 | 2.033, 1.638, 2.736 |
| silverstone-v1.modern.grid | 1.820, 1.790, 2.184 | 1.717, 1.773, 2.192 | 1.695, 1.780, 2.202 |
| silverstone-v1.modern.helmet | 1.936, 2.023, 2.022 | 1.829, 2.020, 2.033 | 1.824, 2.027, 2.042 |
| silverstone-v1.modern.high | 5.209, 0.853, 2.007 | 2.248, 0.610, 2.058 | 1.992, 0.816, 2.151 |
| silverstone-v1.modern.stands | 1.904, 1.241, 2.062 | 1.634, 1.185, 2.143 | 1.636, 1.211, 2.175 |
| silverstone-v1.retro.apex | 1.150, 1.372, 1.507 | 1.103, 1.375, 1.513 | 1.155, 1.405, 1.527 |
| silverstone-v1.retro.chase | 1.517, 1.379, 1.954 | 1.481, 1.373, 1.950 | 1.527, 1.393, 1.955 |
| silverstone-v1.retro.grid | 1.462, 1.573, 1.780 | 1.418, 1.564, 1.767 | 1.444, 1.583, 1.769 |
| silverstone-v1.retro.helmet | 1.594, 1.801, 1.927 | 1.563, 1.802, 1.920 | 1.588, 1.816, 1.924 |
| silverstone-v1.retro.high | 2.360, 0.979, 1.665 | 1.373, 0.919, 1.212 | 2.046, 1.310, 1.129 |
| silverstone-v1.retro.stands | 1.466, 1.212, 1.627 | 1.399, 1.160, 1.621 | 1.496, 1.211, 1.619 |
| **Retro, 14 stills** | average of the means 1.798; average of the highest channels 2.155; worst 3.525 (monaco.retro.high); over 6: 0 | average of the means 1.681; average of the highest channels 1.934; worst 3.511 (monaco.retro.high); over 6: 0 | average of the means 1.815; average of the highest channels 2.157; worst 4.179 (monaco.retro.high); over 6: 0 |
| **Modern, 14 stills** | average of the means 2.335; average of the highest channels 3.304; worst 6.315 (brands-hatch.modern.high); over 6: 2 | average of the means 2.012; average of the highest channels 2.510; worst 4.556 (monaco.modern.high); over 6: 0 | average of the means 2.038; average of the highest channels 2.469; worst 4.590 (monaco.modern.high); over 6: 0 |
| **all 28** | average of the means 2.066; average of the highest channels 2.729; worst 6.315 (brands-hatch.modern.high); over 6: 2 | average of the means 1.847; average of the highest channels 2.222; worst 4.556 (monaco.modern.high); over 6: 0 | average of the means 1.927; average of the highest channels 2.313; worst 4.590 (monaco.modern.high); over 6: 0 |

By the rule: 2.066 at 150, 1.847 at 250, 1.927 at 300. **250 is kept**, by 0.080 over 300, which is not within 0.02. Each tier taken alone chooses 250 as well (Retro 1.798, 1.681, 1.815; Modern 2.335, 2.012, 2.038), so the question of a value for each tier does not arise. Read by the highest channels the answer is the same for the 28 and for Retro; Modern alone would gain 0.041 from 300, far under the 0.2 that would give a tier its own value. No number changed in the code. The comment beside it, which said the fog start "is what makes the picture match the live one again", now says what it does (`1028956`).

### The small things (`1028956`)

- The colour management guard at the top of `src/10-core.js`: its comment now says outright that the guard is silent in exactly two cases, no `THREE` at all and r128, why each is silent, and that r128 is known by `THREE.REVISION === '128'` and by nothing looser. The code is unchanged.
- `ownEnvironment`'s check for a scene with no environment was dead: `buildEnvironment` always sets one since its try and catch went, and nothing in the source sets `scene.environment` again. It is removed, with a note in the comment.
- The haze comment, as above.

### Where it stands after fix round 2

`stills/after-tuning-2`, taken from the repo's own build of `1028956` with a clean tree: `v0.130 dev 1028956`. It is the same 28 files as `stills/fix2-fog-250` (0.000 on every channel). Against `stills/before-main` (`node tools/stills-compare.js stills/before-main stills/after-tuning-2`, which exits 0):

| still | R | G | B | pixels off by more than 24 | gate | highest channel at the end of fix round 1 | change |
|---|---|---|---|---|---|---|---|
| brands-hatch-v1.modern.chase | 2.169 | 1.618 | 2.940 | 5.984% | ok | 3.056 | -0.116 |
| brands-hatch-v1.modern.high | 2.712 | 0.603 | 1.925 | 2.009% | ok | 2.855 | -0.143 |
| brands-hatch-v1.retro.chase | 1.586 | 1.462 | 2.106 | 0.388% | ok | 2.475 | -0.369 |
| brands-hatch-v1.retro.high | 1.503 | 1.083 | 1.098 | 0.055% | ok | 1.806 | -0.303 |
| indianapolis-v1.modern.chase | 2.309 | 2.285 | 2.735 | 2.770% | ok | 5.036 | -2.301 |
| indianapolis-v1.modern.high | 2.394 | 0.736 | 1.640 | 2.042% | ok | 4.211 | -1.817 |
| indianapolis-v1.retro.chase | 1.978 | 1.991 | 2.262 | 0.459% | ok | 5.489 | -3.227 |
| indianapolis-v1.retro.high | 1.438 | 1.073 | 1.087 | 0.341% | ok | 4.081 | -2.643 |
| monaco-gp-v1.modern.apex | 1.595 | 1.882 | 1.866 | 0.544% | ok | 3.841 | -1.959 |
| monaco-gp-v1.modern.chase | 2.694 | 2.288 | 2.322 | 4.011% | ok | 3.852 | -1.158 |
| monaco-gp-v1.modern.grid | 1.777 | 2.019 | 2.010 | 2.070% | ok | 2.918 | -0.899 |
| monaco-gp-v1.modern.high | 4.556 | 2.341 | 2.445 | 1.193% | ok | 4.727 | -0.171 |
| monaco-gp-v1.retro.apex | 1.836 | 1.793 | 1.789 | 0.296% | ok | 3.568 | -1.732 |
| monaco-gp-v1.retro.chase | 2.362 | 2.378 | 2.367 | 2.585% | ok | 3.762 | -1.384 |
| monaco-gp-v1.retro.grid | 1.660 | 1.885 | 1.896 | 1.240% | ok | 3.563 | -1.667 |
| monaco-gp-v1.retro.high | 3.511 | 2.067 | 1.872 | 0.177% | ok | 4.908 | -1.397 |
| silverstone-v1.modern.apex | 1.360 | 1.599 | 1.875 | 1.865% | ok | 2.254 | -0.379 |
| silverstone-v1.modern.chase | 2.030 | 1.627 | 2.717 | 4.302% | ok | 2.910 | -0.193 |
| silverstone-v1.modern.grid | 1.717 | 1.773 | 2.192 | 2.315% | ok | 2.922 | -0.730 |
| silverstone-v1.modern.helmet | 1.829 | 2.020 | 2.033 | 1.341% | ok | 2.385 | -0.352 |
| silverstone-v1.modern.high | 2.248 | 0.610 | 2.058 | 2.142% | ok | 2.407 | -0.159 |
| silverstone-v1.modern.stands | 1.634 | 1.185 | 2.143 | 0.299% | ok | 2.718 | -0.575 |
| silverstone-v1.retro.apex | 1.103 | 1.375 | 1.513 | 0.125% | ok | 2.079 | -0.566 |
| silverstone-v1.retro.chase | 1.481 | 1.373 | 1.950 | 0.255% | ok | 2.374 | -0.424 |
| silverstone-v1.retro.grid | 1.418 | 1.564 | 1.767 | 0.293% | ok | 2.750 | -0.983 |
| silverstone-v1.retro.helmet | 1.563 | 1.802 | 1.920 | 0.669% | ok | 2.399 | -0.479 |
| silverstone-v1.retro.high | 1.373 | 0.919 | 1.212 | 0.048% | ok | 1.668 | -0.295 |
| silverstone-v1.retro.stands | 1.399 | 1.160 | 1.621 | 0.059% | ok | 2.705 | -1.084 |

**Stills over 6: none.** The range is 0.6 to 4.6; the average of the channel means is 1.681 in Retro, 2.012 in Modern and 1.847 over the 28 (2.749 at the end of fix round 1). Every still is lower than it was at the end of fix round 1. The one that gained least is Monaco's `high` view in Modern, 0.171 lower, with the sea's number out.

**The five highest, and what each is made of.** Three switches were thrown on both engines for this: fog off, fog and environment off, and (0.187 only) the sea at 1.15. r128 with fog off is `stills/fix1-evidence/r128-nofog`; the rest is under `stills/fix2-evidence/`.

| still | as shipped: R, G, B | fog off on both engines | fog and environment off on both engines | with the sea at 1.15 |
|---|---|---|---|---|
| monaco-gp-v1.modern.high | 4.556, 2.341, 2.445 | 3.640, 2.229, 1.915 | 1.992, 3.275, 3.446 | 3.255, 2.189, 2.754 |
| monaco-gp-v1.retro.high | 3.511, 2.067, 1.872 | 2.791, 1.701, 1.776 | 1.615, 2.486, 2.102 | 2.712, 1.739, 1.872 |
| brands-hatch-v1.modern.chase | 2.169, 1.618, 2.940 | 2.079, 1.710, 3.035 | 1.510, 1.773, 1.570 | no sea |
| indianapolis-v1.modern.chase | 2.309, 2.285, 2.735 | 2.299, 2.282, 2.744 | 1.937, 2.102, 2.049 | no sea |
| silverstone-v1.modern.chase | 2.030, 1.627, 2.717 | 2.010, 1.641, 2.688 | 1.727, 1.879, 1.754 | no sea |

| still | figure | what it is, and what a person looking at the pair sees |
|---|---|---|
| monaco-gp-v1.modern.high | 4.556 (red) | Fog is 0.9 of it (3.640 with fog off on both engines). The sea is the largest part: with its number back the figure is 3.255, so 1.3 of the 4.556 is the sea's reflection, duller here than live (its light part reads 99,164,190 live and 84,157,185 here). With fog and environment both off, red is 1.992. The far ground and the far towers are a little redder through the haze; the towers are a shade darker than live (shaded face 102,105,106 live, 97,100,102 here), where they were 23 levels lighter at the end of fix round 1 |
| monaco-gp-v1.retro.high | 3.511 (red) | The same: fog 0.7 (2.791 with fog off), the sea 0.8 (2.712 with its number back), 1.615 on red with fog and environment both off |
| brands-hatch-v1.modern.chase | 2.940 (blue) | Not fog (3.035 with fog off). Light from the environment on grass seen along the ground: blue is 1.570 with the environment off on both engines. The grass is paler and less green than live from the chase camera |
| indianapolis-v1.modern.chase | 2.735 (blue) | Not fog (2.744 with fog off). The same grass (infield 89,145,63 live, 96,146,78 here); blue is 2.049 with the environment off. The crowd, which was this still's whole story, is within 3 levels |
| silverstone-v1.modern.chase | 2.717 (blue) | Not fog (2.688 with fog off). The same grass (92,159,73 live, 106,164,99 here; 81,143,59 against 82,141,61 with the environment off on both); blue is 1.754 with the environment off |

With fog and environment both off the 28 stills read 1.0 to 3.4, average 1.713. That remainder was not broken down further in this round; fix round 1 named what is in it (the trees' own outline as a shadow, the car body, and the quarter of a level a screenshot carries).

**Named surfaces, on both engines.** The mean colour of a small rectangle, the same rectangle in every set. "Live" is `stills/before-main`; "now" is `stills/after-tuning-2`; the last three columns are the same with fog off on both engines (`stills/fix1-evidence/r128-nofog` and `stills/fix2-evidence/final-nofog`).

| still | surface | live | now | difference | r128, fog off | now, fog off | difference |
|---|---|---|---|---|---|---|---|
| indianapolis.modern.high | crowd, right, far | 150,141,133 | 148,140,134 | -2,-1,+1 | 148,139,133 | 148,140,134 | +0,+1,+1 |
| indianapolis.modern.high | crowd, left, near | 149,141,130 | 149,141,128 | +0,+0,-2 | 149,141,130 | 149,141,128 | +0,+0,-2 |
| indianapolis.modern.high | grass verge | 69,152,48 | 72,152,54 | +3,+0,+6 | 69,152,48 | 72,152,54 | +3,+0,+6 |
| indianapolis.modern.high | road | 120,124,162 | 121,125,162 | +1,+1,+0 | 120,124,162 | 121,125,162 | +1,+1,+0 |
| indianapolis.modern.high | far ground, left | 150,153,160 | 150,154,161 | +0,+1,+1 | 149,153,160 | 150,154,161 | +1,+1,+1 |
| indianapolis.retro.high | crowd, right, far | 131,123,116 | 128,122,115 | -3,-1,-1 | 129,122,115 | 128,122,115 | -1,+0,+0 |
| indianapolis.retro.high | crowd, left, near | 142,129,110 | 141,128,108 | -1,-1,-2 | 142,129,110 | 141,128,108 | -1,-1,-2 |
| indianapolis.retro.high | grass verge | 72,124,58 | 73,124,62 | +1,+0,+4 | 72,124,58 | 73,124,62 | +1,+0,+4 |
| indianapolis.retro.high | road | 103,107,132 | 104,107,132 | +1,+0,+0 | 103,107,132 | 104,107,132 | +1,+0,+0 |
| indianapolis.retro.high | far ground, left | 120,123,127 | 120,123,127 | +0,+0,+0 | 120,122,127 | 120,123,127 | +0,+1,+0 |
| indianapolis.modern.chase | crowd, right stand | 124,119,119 | 125,120,121 | +1,+1,+2 | 124,119,119 | 125,120,121 | +1,+1,+2 |
| indianapolis.modern.chase | crowd, left stand | 134,131,135 | 136,134,137 | +2,+3,+2 | 134,131,135 | 136,134,137 | +2,+3,+2 |
| indianapolis.modern.chase | infield grass, right | 89,145,63 | 96,146,78 | +7,+1,+15 | 89,145,63 | 96,146,78 | +7,+1,+15 |
| indianapolis.modern.chase | road, ahead | 128,132,170 | 130,135,171 | +2,+3,+1 | 128,132,170 | 130,135,171 | +2,+3,+1 |
| indianapolis.retro.chase | crowd, right stand | 114,109,104 | 114,110,105 | +0,+1,+1 | 114,109,104 | 114,110,105 | +0,+1,+1 |
| indianapolis.retro.chase | crowd, left stand | 123,120,116 | 124,121,117 | +1,+1,+1 | 123,120,116 | 124,121,117 | +1,+1,+1 |
| indianapolis.retro.chase | infield grass, right | 88,123,70 | 92,124,79 | +4,+1,+9 | 88,123,70 | 92,124,79 | +4,+1,+9 |
| indianapolis.retro.chase | road, ahead | 111,115,141 | 114,116,142 | +3,+1,+1 | 111,115,141 | 114,116,142 | +3,+1,+1 |
| silverstone.modern.stands | crowd, close | 95,90,90 | 92,88,88 | -3,-2,-2 | 95,90,90 | 92,88,88 | -3,-2,-2 |
| silverstone.retro.stands | crowd, close | 91,88,85 | 89,86,83 | -2,-2,-2 | 91,88,85 | 89,86,83 | -2,-2,-2 |
| monaco.modern.high | near tower, shaded face | 102,105,106 | 97,100,102 | -5,-5,-4 | 102,105,106 | 97,100,102 | -5,-5,-4 |
| monaco.modern.high | near tower, lit face | 77,82,81 | 75,80,79 | -2,-2,-2 | 77,82,81 | 75,80,79 | -2,-2,-2 |
| monaco.modern.high | small block by the hairpin | 94,96,97 | 88,92,94 | -6,-4,-3 | 91,94,96 | 88,92,94 | -3,-2,-2 |
| monaco.modern.high | far tower, top left | 86,84,82 | 79,79,78 | -7,-5,-4 | 81,81,80 | 78,79,78 | -3,-2,-2 |
| monaco.modern.high | roof, bottom right | 222,220,216 | 222,219,216 | +0,-1,+0 | 222,220,216 | 222,219,216 | +0,-1,+0 |
| monaco.modern.high | quay ground beside the road | 210,190,174 | 210,190,172 | +0,+0,-2 | 210,190,174 | 210,190,172 | +0,+0,-2 |
| monaco.modern.high | sea, light part | 99,164,190 | 84,157,185 | -15,-7,-5 | 99,164,190 | 84,157,185 | -15,-7,-5 |
| monaco.modern.high | sea, middle | 1,131,175 | 0,130,174 | -1,-1,-1 | 1,131,175 | 0,130,174 | -1,-1,-1 |
| monaco.modern.high | road | 120,124,161 | 120,123,159 | +0,-1,-2 | 120,124,161 | 120,123,159 | +0,-1,-2 |
| monaco.retro.high | near tower, shaded face | 97,99,99 | 93,95,96 | -4,-4,-3 | 97,99,99 | 93,95,96 | -4,-4,-3 |
| monaco.retro.high | near tower, lit face | 80,83,82 | 78,82,81 | -2,-1,-1 | 80,83,82 | 78,82,81 | -2,-1,-1 |
| monaco.retro.high | small block by the hairpin | 92,94,94 | 88,90,91 | -4,-4,-3 | 90,92,93 | 88,90,91 | -2,-2,-2 |
| monaco.retro.high | far tower, top left | 79,78,77 | 74,74,74 | -5,-4,-3 | 76,76,75 | 74,74,74 | -2,-2,-1 |
| monaco.retro.high | roof, bottom right | 165,160,155 | 164,159,153 | -1,-1,-2 | 165,160,155 | 164,159,153 | -1,-1,-2 |
| monaco.retro.high | quay ground beside the road | 191,161,143 | 190,161,142 | -1,+0,-1 | 191,161,143 | 190,161,142 | -1,+0,-1 |
| monaco.retro.high | sea, light part | 93,136,157 | 85,131,151 | -8,-5,-6 | 93,135,157 | 85,131,151 | -8,-4,-6 |
| monaco.retro.high | sea, middle | 33,106,137 | 27,106,136 | -6,+0,-1 | 33,106,137 | 27,106,136 | -6,+0,-1 |
| monaco.retro.high | road | 103,106,131 | 103,105,130 | +0,-1,-1 | 103,106,131 | 103,105,130 | +0,-1,-1 |
| silverstone.modern.chase | grass, left | 92,159,73 | 106,164,99 | +14,+5,+26 | 92,159,73 | 106,164,99 | +14,+5,+26 |
| silverstone.modern.chase | grass, right | 103,157,77 | 113,159,96 | +10,+2,+19 | 103,157,77 | 113,159,96 | +10,+2,+19 |
| silverstone.modern.chase | road | 117,120,151 | 118,122,152 | +1,+2,+1 | 117,120,151 | 118,122,152 | +1,+2,+1 |
| silverstone.retro.chase | grass, left | 85,131,76 | 92,134,89 | +7,+3,+13 | 85,131,76 | 92,134,89 | +7,+3,+13 |
| silverstone.retro.chase | grass, right | 107,138,83 | 113,139,94 | +6,+1,+11 | 107,138,83 | 113,139,94 | +6,+1,+11 |
| silverstone.retro.chase | road | 101,102,123 | 101,103,123 | +0,+1,+0 | 101,102,123 | 101,103,123 | +0,+1,+0 |

What the table says:

- **The crowd** agrees to within 3 levels in every view: far (150,141,133 against 148,140,134), near, and close from the stands (95,90,90 against 92,88,88). At the end of fix round 1 the far crowd was 34 levels lighter in red, the stands from the chase camera 9 to 25 lighter, and the close crowd 5 short in blue. It matches at every distance now, which a number on the whole surface could not do.
- **Monaco's buildings** are 2 to 7 levels darker than live with the haze and 2 to 5 with fog off, on every face read. At the end of fix round 1 the shaded face of the near tower was 23 lighter and the small block by the hairpin 21 lighter. The roof at the bottom right in Retro, 25 lighter with the smoothing wrong, is within 2.
- **The grass** is where it was, because its cause is another one: seen along the ground it is up to 14 levels redder and 26 bluer than live (Silverstone `chase`, Modern), seen from above within 6.
- **The sea** is less red than live in its light part, by 15 levels in Modern and 8 in Retro, with its number out.
- **The road, the quay and the far ground** agree to within 3 levels in every view.

The grass, the sea and one tower face again with the environment switched off on both engines as well (`stills/fix2-evidence/r128-nofog-noenv` and `final-nofog-noenv`), beside the fog off figures from the table above:

| still | surface | r128, fog off | now, fog off | difference | r128, fog and environment off | now, fog and environment off | difference |
|---|---|---|---|---|---|---|---|
| indianapolis.modern.high | crowd, right, far | 148,139,133 | 148,140,134 | +0,+1,+1 | 128,116,100 | 125,113,97 | -3,-3,-3 |
| indianapolis.modern.high | grass verge | 69,152,48 | 72,152,54 | +3,+0,+6 | 53,134,27 | 51,131,26 | -2,-3,-1 |
| indianapolis.retro.high | crowd, right, far | 129,122,115 | 128,122,115 | -1,+0,+0 | 115,104,91 | 113,102,89 | -2,-2,-2 |
| indianapolis.retro.high | grass verge | 72,124,58 | 73,124,62 | +1,+0,+4 | 65,111,46 | 64,109,46 | -1,-2,+0 |
| indianapolis.modern.chase | infield grass, right | 89,145,63 | 96,146,78 | +7,+1,+15 | 69,122,38 | 66,118,36 | -3,-4,-2 |
| indianapolis.retro.chase | infield grass, right | 88,123,70 | 92,124,79 | +4,+1,+9 | 75,104,51 | 73,102,51 | -2,-2,+0 |
| monaco.modern.high | near tower, shaded face | 102,105,106 | 97,100,102 | -5,-5,-4 | 69,70,68 | 66,67,65 | -3,-3,-3 |
| monaco.modern.high | sea, light part | 99,164,190 | 84,157,185 | -15,-7,-5 | 29,104,128 | 28,97,121 | -1,-7,-7 |
| monaco.modern.high | sea, middle | 1,131,175 | 0,130,174 | -1,-1,-1 | 0,88,120 | 0,85,117 | +0,-3,-3 |
| monaco.retro.high | near tower, shaded face | 97,99,99 | 93,95,96 | -4,-4,-3 | 75,75,74 | 73,74,73 | -2,-1,-1 |
| monaco.retro.high | sea, light part | 93,135,157 | 85,131,151 | -8,-4,-6 | 30,96,107 | 30,90,103 | +0,-6,-4 |
| monaco.retro.high | sea, middle | 33,106,137 | 27,106,136 | -6,+0,-1 | 2,83,99 | 2,79,98 | +0,-4,-1 |
| silverstone.modern.chase | grass, left | 92,159,73 | 106,164,99 | +14,+5,+26 | 81,143,59 | 82,141,61 | +1,-2,+2 |
| silverstone.modern.chase | grass, right | 103,157,77 | 113,159,96 | +10,+2,+19 | 87,136,52 | 85,132,50 | -2,-4,-2 |
| silverstone.retro.chase | grass, left | 85,131,76 | 92,134,89 | +7,+3,+13 | 81,119,68 | 80,116,67 | -1,-3,-1 |
| silverstone.retro.chase | grass, right | 107,138,83 | 113,139,94 | +6,+1,+11 | 96,120,66 | 95,117,65 | -1,-3,-1 |

With no environment the grass agrees to within 4 levels, the tower to within 3 and the sea's red to within 1. So what is left on the grass and on the sea is light from the environment, as fix round 1 found for the grass, and no smoothing is in it. (With the environment off the sea is up to 7 levels lower in green and blue than on r128. That is the water under direct light alone, a picture the game never shows, and it was not looked into.)

**The real WebGPU backend,** checked after the last change on the build of `1028956` (`v0.130`): the system Chrome 158, headed, WebGPU (`backend.isWebGPUBackend`, `backend.device` a `GPUDevice`) against the same Chrome with `?renderer=webgl`, the canvas read back in the task that drew it and reduced to the 32 x 18 grid of cell means.

| shot | tier | it draws (cell means) | mean difference | worst cell |
|---|---|---|---|---|
| Silverstone, chase, tick 900 | Retro | 50 to 230 | 0.002 | 0.09 |
| Silverstone, chase, tick 900 | Modern | 40 to 234 | 0.002 | 0.05 |
| Indianapolis, high, tick 900 | Retro | 52 to 231 | 0.002 | 0.18 |
| Indianapolis, high, tick 900 | Modern | 43 to 240 | 0.001 | 0.05 |
| Indianapolis, chase, tick 900 | Retro | 37 to 231 | 0.007 | 0.13 |
| Indianapolis, chase, tick 900 | Modern | 15 to 229 | 0.005 | 0.17 |
| Monaco, high, tick 600 | Retro | 17 to 207 | 0.003 | 0.24 |
| Monaco, high, tick 600 | Modern | 0 to 223 | 0.004 | 0.11 |

All eight within 1 level on the worst cell; the worst is 0.24. Nothing on the console of any of the sixteen pages. The far crowd and the far buildings were read on both backends from the screenshots of the same pages (`stills/fix2-evidence/gpu-final-webgpu` and `gpu-final-webgl`), with the rectangles of the table above: every crowd rectangle at Indianapolis and every building rectangle at Monaco reads the same on WebGPU as on the fallback, to the level, in both tiers (far crowd 151,143,134 on both in Modern; far tower 82,82,82 on both). The one Chrome the check opened was closed.

**The console.** Every capture ran with the same script in front of the stills tool as in fix round 1 (`node -r`, kept outside the repo), which prints every console error, console warning and page error. In this round: 14 captures of the 28 stills on 0.187, one on r128, and 9 smaller ones. Errors: none, on any capture of a build that was kept. The one build that failed is the first try described above, and its errors are how it was found. Warnings on 0.187: the three kinds of fix round 1, and two more that came once each in three of the captures, as a run of the stills tool ends and its page goes away: `WebGL: CONTEXT_LOST_WEBGL: loseContext: context lost` and `A valid external Instance reference no longer exists.` The first is in an r128 capture of fix round 1 as well (`r128-noenv`), so it is the page going away and not the engine move. The stills of a capture that carried them are the same files as those of one that did not.

CORRECTION to fix round 1 on that point: it reported three kinds of warning and no other. Seven of its own trial logs carry one or both of the two above (a capture counts 24 warnings with them or without).

### Corrections made in this round to the record of fix round 1

Each is marked where it stands in the text above this section.

- "About half of two" of the four stills over 6 was fog: about a third (2.4 of 7.108 and 2.7 of 7.100).
- The crowd and the buildings agreed "by 4 or less with nothing smoothed": 5 for one surface, the near tower's shaded face.
- "The near crowd, which was close to right": its own table gave the close crowd as 12 levels too light in red before the number.
- The table of the five highest left the sea out of the two Monaco `high` stills.
- "A copy in the scratchpad" named no path: see "Where each round's evidence lives".
- Three kinds of console warning "and no other": five, as above.

### For Jamie, with the pairs

This replaces the list of fix round 1. Things that differ from the live game after this round:

1. **Trees cast their own outline** and not a slab. Not compensated, by ruling 4 of fix round 1.
2. **The grass is paler and less green seen along the ground** on the three circuits that have grass. It is light from the environment and no number is on it now. It is the largest thing left in the chase views.
3. **The sea at Monaco is less red in its light part,** by 15 levels in Modern. The number that took 9 of them back is out, by the letter of its test; see "Ruling 3 again".
4. **The haze starts at 250 m, not 150 m.** A compensation, kept by the new rule.
5. **Monaco's buildings are a shade darker,** by 2 to 7 levels. They were up to 26 lighter.
6. **The car body** is still a little darker than live at its own 1.15 (stage A). Not touched in this round.

The crowd and the far buildings washing out, which was item 2 of the earlier list, is gone.

### Tests

After the last change: `node test/sim-parity.test.js` 4 passed (and before every commit); `node test/physics.test.js` 37 passed; `node test/fpmath.test.js` 3 passed; `node test/track-bake.test.js` 8 passed; `node test/music.test.js` 31 passed; `node build.js` invariants OK (`dist/index.html` 1,593,262 bytes and `dist/artifact.html` 1,588,640 on the clean build of `1028956`); then `git checkout -- dist`. No warning in any test's output. Not run, as told: `tools/bench.js`, `test/csp.js`. Stage B and stage C are not started.

## Task 6, stage B: failing politely, the tools and the tests

Stage B of the engine move: a boot that can fail politely, a test of the picture's failure paths (`test/picture.js`), the tools made true on both backends, and the build's papers. One step was carried into it from the review of fix round 2 and is done first.

### B0: the sea's light back, read by the still

Fix round 2 took the sea's `envMapIntensity: 1.15` out (`f2aab8d`), because its test, "harms nothing by more than 0.2", was read for each channel of each still, and one channel of one still rose by 0.309 (blue, Monaco's `high` view in Modern, 2.445 to 2.754).

RULED by the controller after that round: "harms nothing by more than 0.2" is read **per still**, on the figure the gate reads, which is a still's highest channel. It is not read per channel. By that reading the number harms nothing: no still's figure rises, and the worst still of the set falls from 4.556 to 3.255. So the number goes back.

What was done: `f2aab8d` reverted as a new commit. The sea's material carries `envMapIntensity: 1.15` again, with its comment, which now also says how its test is read. `ownEnvironment`'s comment names the sea again beside the car paint. Nothing else changed.

`stills/after-tuning-3`, the working tree of this commit (`v0.131 dev 9a88ce9*`), against `stills/before-main` (`node tools/stills-compare.js stills/before-main stills/after-tuning-3`, which exits 0):

| still | R | G | B | pixels off by more than 24 | gate | highest channel with the number out | change |
|---|---|---|---|---|---|---|---|
| brands-hatch-v1.modern.chase | 2.169 | 1.618 | 2.940 | 5.984% | ok | 2.940 | +0.000 |
| brands-hatch-v1.modern.high | 2.712 | 0.603 | 1.925 | 2.009% | ok | 2.712 | +0.000 |
| brands-hatch-v1.retro.chase | 1.586 | 1.462 | 2.106 | 0.388% | ok | 2.106 | +0.000 |
| brands-hatch-v1.retro.high | 1.503 | 1.083 | 1.098 | 0.055% | ok | 1.503 | +0.000 |
| indianapolis-v1.modern.chase | 2.309 | 2.285 | 2.735 | 2.770% | ok | 2.735 | +0.000 |
| indianapolis-v1.modern.high | 2.394 | 0.736 | 1.640 | 2.042% | ok | 2.394 | +0.000 |
| indianapolis-v1.retro.chase | 1.978 | 1.991 | 2.262 | 0.459% | ok | 2.262 | +0.000 |
| indianapolis-v1.retro.high | 1.438 | 1.073 | 1.087 | 0.341% | ok | 1.438 | +0.000 |
| monaco-gp-v1.modern.apex | 1.595 | 1.882 | 1.866 | 0.544% | ok | 1.882 | +0.000 |
| monaco-gp-v1.modern.chase | 2.486 | 2.141 | 2.198 | 1.891% | ok | 2.694 | -0.208 |
| monaco-gp-v1.modern.grid | 1.710 | 1.971 | 1.969 | 1.412% | ok | 2.019 | -0.048 |
| monaco-gp-v1.modern.high | 3.255 | 2.189 | 2.754 | 1.187% | ok | 4.556 | -1.301 |
| monaco-gp-v1.retro.apex | 1.836 | 1.793 | 1.789 | 0.296% | ok | 1.836 | +0.000 |
| monaco-gp-v1.retro.chase | 2.178 | 2.213 | 2.197 | 0.540% | ok | 2.378 | -0.165 |
| monaco-gp-v1.retro.grid | 1.600 | 1.832 | 1.838 | 0.716% | ok | 1.896 | -0.058 |
| monaco-gp-v1.retro.high | 2.712 | 1.739 | 1.872 | 0.178% | ok | 3.511 | -0.799 |
| silverstone-v1.modern.apex | 1.360 | 1.599 | 1.875 | 1.865% | ok | 1.875 | +0.000 |
| silverstone-v1.modern.chase | 2.030 | 1.627 | 2.717 | 4.302% | ok | 2.717 | +0.000 |
| silverstone-v1.modern.grid | 1.717 | 1.773 | 2.192 | 2.315% | ok | 2.192 | +0.000 |
| silverstone-v1.modern.helmet | 1.829 | 2.020 | 2.033 | 1.341% | ok | 2.033 | +0.000 |
| silverstone-v1.modern.high | 2.248 | 0.610 | 2.058 | 2.142% | ok | 2.248 | +0.000 |
| silverstone-v1.modern.stands | 1.634 | 1.185 | 2.143 | 0.299% | ok | 2.143 | +0.000 |
| silverstone-v1.retro.apex | 1.103 | 1.375 | 1.513 | 0.125% | ok | 1.513 | +0.000 |
| silverstone-v1.retro.chase | 1.481 | 1.373 | 1.950 | 0.255% | ok | 1.950 | +0.000 |
| silverstone-v1.retro.grid | 1.418 | 1.564 | 1.767 | 0.293% | ok | 1.767 | +0.000 |
| silverstone-v1.retro.helmet | 1.563 | 1.802 | 1.920 | 0.669% | ok | 1.920 | +0.000 |
| silverstone-v1.retro.high | 1.373 | 0.919 | 1.212 | 0.048% | ok | 1.373 | +0.000 |
| silverstone-v1.retro.stands | 1.399 | 1.160 | 1.621 | 0.059% | ok | 1.621 | +0.000 |

**Stills over 6: none.** 28 compared; the range is 0.603 to 3.255. The average of the channel means is 1.638 in Retro, 1.970 in Modern and 1.804 over the 28 (1.681, 2.012 and 1.847 with the number out); the average of the highest channels over the 28 is 2.130 (2.222). The six stills that move are the six Monaco stills that show the sea; the other 22 are the same files as `stills/after-tuning-2`, and all 28 are the same files as `stills/fix2-filter`, the set fix round 2 took with the number still in (0.000 on every channel of every still).

By the still, as ruled: of the six that move, every one has a lower figure than with the number out (the largest fall is 1.301, the smallest 0.048), and no still's figure rises. By the channel, for the record: one channel still rises by more than 0.2, the same one as before (blue in `monaco-gp-v1.modern.high`, 2.445 to 2.754).

The sea itself, from the same rectangles as before, in Monaco's `high` view, to one decimal because the rounding matters here (see "Corrections to the record of fix round 2" further down):

| surface | tier | live | with the number out | with 1.15 |
|---|---|---|---|---|
| sea, light part | Modern | 99.4, 164.0, 189.6 | 83.9, 157.3, 184.8 | 92.8, 162.8, 189.6 |
| sea, middle | Modern | 0.7, 131.2, 174.7 | 0.0, 129.7, 174.0 | 0.1, 134.9, 179.4 |
| sea, light part | Retro | 93.4, 135.6, 157.3 | 85.0, 130.6, 150.8 | 89.1, 134.2, 156.9 |
| sea, middle | Retro | 32.8, 106.5, 136.6 | 26.8, 106.0, 136.3 | 29.0, 107.8, 139.8 |

So the light part of the sea is 6.6 levels less red than live in Modern where it was 15.5 without the number, and the dark middle is 3.7 too green and 4.7 too blue where it was within 1.5. That is the trade the ruling accepts.

The console of the page was watched on this capture by the script kept outside the repo, as in fix round 2: no error; 24 warnings of the three expected kinds (`No available adapters.`, the notice that the renderer is running on its WebGL 2 backend, and the driver's `GPU stall due to ReadPixels`). Step B3 puts that watch into the tool. `node test/sim-parity.test.js`: 4 passed.
