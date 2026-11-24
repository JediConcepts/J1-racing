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
