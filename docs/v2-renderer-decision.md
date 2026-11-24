# v2 renderer decision

Task 5 of the picture plan. The game runs on three.js r128 with `WebGLRenderer`. Task 6 moves it to 0.187.0, and this document says which renderer that task builds on. The question was: can `WebGPURenderer`, with its WebGL 2 fallback, carry all three tiers?

The spike drew today's scene (all four circuits, Retro and Modern) with `WebGPURenderer` from `vendor/three.webgpu.js` on a local branch, `spike/renderer`, which is now deleted. Its whole diff against `v2-upgrade` is saved (see "Where the evidence is"). Nothing from it was merged.

## The six criteria

| # | criterion | result | evidence in short |
|---|---|---|---|
| 1 | The existing scene draws correctly on WebGPU and on the fallback, in Chrome, Safari, Firefox and Safari in the iOS Simulator | PASS where it could be tested. Firefox and the iOS Simulator: NOT TESTED | Chrome 158 and Safari 27, both backends, all four circuits, both tiers, three views of Monaco. The two backends agree to within 0.4 of a level (0 to 255) on the worst of 576 cells, and Safari agrees with Chrome to within 1.0. Against r128 the picture differs: channel means of 1.5 to 6.5 in Chrome, and 1.4 to 7.4 on the 28 headless stills, seven of them over the compare tool's limit of 6. No tolerance was set for the spike, so "correctly" here means that everything draws and nothing is missing or broken, not that the picture matches r128. Both backends show the same differences (listed below) |
| 2 | The Retro dither and quantise pass is reproduced | PASS | Fed the same input (the sky alone), 99.15% of pixels are identical to r128 on WebGPU and on the fallback. The rest are one palette step out. With an 8 bit target, 99.74% |
| 3 | The built page is under 2,500,000 bytes | PASS | 1,583,540 bytes with the WebGPU bundle (built, not estimated) |
| 4 | `node test/csp.js` reports no violations | PASS | `RESULT: PASS`, 0 unexpected violations (headless, so the fallback). The real WebGPU backend under the same header in headed Chrome: 0 `securitypolicyviolation` events |
| 5 | Frame time on the fallback is no worse than the baseline (within 5%), four rows | PASS on the design's wording (Modern rows). The plan's added Retro row is outside its 5% limit: see the ruling. | Two runs of the four rows, canvas multisampled as on main. Modern: 2% to 17% faster than the baseline, in both runs. Retro, on the frame counts: 1.0826 ms (outside) and 1.0707 ms (inside) against a limit of 1.0815. Of twelve runs of that row three are inside the limit and nine are outside |
| 6 | The bundle evaluates under node and the four sim parity digests pass against it | PASS | 4 passed, 0 failed, against the bundle as task 4 built it and against the one rebuilt for the spike |

Decision: WebGPURenderer
Provisional on: Firefox and iOS (not tested on this Mac)

The ruling on criterion 5. The first form of this record called the Retro row a pass with no margin. It is not one, and the row is recorded here as it measured.

- The design's criterion 5 reads: "Modern frame time on the fallback is no worse than today." The plan widened that to four rows with a 5% limit. Where the plan and the design differ, the design binds.
- On the design's wording criterion 5 passes: the three Modern rows on the fallback are faster than the baseline in both runs.
- The Retro row the plan added does NOT pass the plan's 5% limit. On the fallback, Retro at Silverstone is about 5% to 6% slower than the recorded baseline and 6% to 9% slower than r128 measured beside it, which is 0.05 to 0.09 ms a frame at over 900 frames a second. It is recorded as outside the plan's limit, not as a pass. The real WebGPU backend is level with r128 in Retro. (The run by run figures behind each of these, on frame counts, are under "Criterion 5: frame time".)
- Ruled by the controller on 24 Nov 2026: the decision stands on the design's criterion. The Retro figure goes to Jamie with the look demo as a known cost of the fallback.

Where the provisional part is settled. Safari and Chrome are checked again at the end of task 6. Safari on an iPhone is checked on Jamie's phone at the look demo. Firefox and a WebKit build can be checked earlier than that only if Jamie allows two more downloads (Playwright's Firefox and WebKit); the controller will ask him. Until one of those says otherwise the decision stays provisional, and task 6 builds on it knowing that.

The way back, if a later test (Firefox, iOS, or anything in task 6) turns this down: `WebGLRenderer` from the same release with the classic addons, built from `vendor/three.webgl.js`. That file is not kept in the repo. `node tools/vendor-three.js webgl <workdir>` builds it again to the same bytes (594,148 bytes, SHA-256 `1c5121c6aed776ba0d5f180dd63174727359ba4a85590ddd4ef387fbac38da46`). Every feature in the plan is still delivered that way. Of what the spike learned, the colour, light, fog and shadow notes below are expected to carry over to that route, because they seem to come from the engine version and not from the renderer. That is reasoned and was not tested: `WebGLRenderer` from 0.187 never drew the scene or ran the bench (the spike's source does not run on that flavour), so nothing here says how it looks or how fast it is, in Retro included. The node post pass and the asynchronous start do not carry over.

What is on disk now: `vendor/three.bundle.js` is the WebGPU flavour exactly as task 4 built it (853,346 bytes, SHA-256 `525bee5ef2429c0e035ef0e67006f42573db46159da9031c5926c71537ae48b9`), untracked. Task 6 commits it with the code that uses it, after adding the names listed under "Names the entry needs".

## Builds, browsers, machine

| build | stamp | what it is | `dist/index.html` |
|---|---|---|---|
| reference | `v0.110 dev 77a37a5*` | `v2-upgrade` as it stands, r128. The star is the two untracked bundle files | 1,322,526 bytes |
| spike A | `v0.111 dev 6286766` | the spike, first form. Used for the first Safari run only | 1,582,249 bytes |
| spike B | `v0.112 dev abb93ba` | spike A plus a watchdog in the page's own report. Nothing in the renderer changed. Used for all other pictures, the CSP checks and the bench | 1,582,849 bytes |
| spike C | `v0.113 dev 14d8a86` | spike B plus a switch for an 8 bit Retro target. Used for that measurement and for the page sizes | 1,583,540 bytes |

All three spike builds are `dev` builds of the local branch; none was pushed.

- Chrome: Google Chrome 158.0.8127.38, the system browser, headed, driven through Playwright (`channel: 'chrome'`). The baseline in `docs/v2-picture-log.md` was taken on 158.0.8127.36.
- Headless: Playwright's Chromium 159.0.8154.6 with the stills launch arguments (SwiftShader). It has no WebGPU adapter, so it only ever runs the fallback, which the renderer chooses by itself there.
- Safari: 27.0.1 (22625.1.29.11.28) on macOS 27.0.1 (26A434). Not automated: the spike page reported on itself to a local server.
- Firefox: not installed. NOT TESTED.
- Safari in the iOS Simulator: no Xcode on this Mac. NOT TESTED.
- GPU: Apple M2 Max (38 core GPU, Metal 4). Chrome's WebGPU adapter reports vendor `apple`, architecture `metal-3`. Its fallback is `ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max)`. Safari's WebGPU adapter reports `apple`; its WebGL 2 reports `Apple GPU`.
- Displays: the built-in panel at a device pixel ratio of 2, and two 1080p screens at 1.
- The machine was not idle during the bench: the load average was between 4 and 10 throughout, from other programs.

Which backend ran was asked of the renderer every time (`renderer.backend.isWebGPUBackend` or `isWebGLBackend`), and checked a second way: on WebGPU that `backend.device` is a `GPUDevice`, on the fallback the GL renderer string. The fallback was forced with `forceWebGL: true` behind `?renderer=webgl`.

## Criterion 1: the scene draws

Twelve shots, each on both backends: Silverstone, Indianapolis and Brands Hatch from the chase camera at tick 900; Monaco from the chase camera at tick 600 (the street), from the high camera at tick 600 (the sea, the yachts, the buildings and their shadows) and from the chase camera at tick 3600 (inside the tunnel); each in Modern and in Retro. Every shot is the photo hook's frame, with `Math.random` pinned so Monaco's buildings are the same set each time.

How pictures were compared: the page reads its own canvas back in the task that drew it, at full size, and takes the exact mean colour of each cell of a 32 x 18 grid. Two shots are compared by the mean absolute difference of those 576 cell means, on a scale of 0 to 255, and by the worst single cell.

| comparison | canvas | mean difference per channel | worst cell | pairs |
|---|---|---|---|---|
| Chrome WebGPU against Chrome fallback | 6144 x 3386 (Modern), 1394 x 768 (Retro) | 0.00 to 0.01 | 0.4 | 12 |
| Safari WebGPU against Safari fallback | 1500 x 1133, 508 x 384 | 0.00 to 0.01 | 0.4 | 12 |
| Safari WebGPU against Chrome WebGPU, same stage size, pixel ratio 1 | 1500 x 1133, 508 x 384 | 0.01 to 0.06 | 1.0 | 12 |
| Safari fallback against Chrome fallback, pixel ratio 1 | the same | 0.01 to 0.06 | 1.0 | 12 |
| Safari against Chrome, both backends, pixel ratio 2 | 5248 x 3962, 1016 x 768 | 0.01 to 0.05 | 1.0 | 24 |
| Chrome WebGPU against r128 in Chrome | 6144 x 3386, 1394 x 768 | 1.5 to 6.5 | 46.7 | 12 |
| Chrome fallback against r128 in Chrome | the same | 1.5 to 6.5 | 46.7 | 12 |

| browser | WebGPU backend | WebGL 2 fallback |
|---|---|---|
| Chrome 158, headed | draws: 12 shots, no warning and no error on the console | draws when forced: 12 shots, no warning and no error |
| Chromium 159, headless | no adapter | draws, chosen by the renderer itself with the warning `WebGPU is not available, running under WebGL2 backend`: 28 stills, the CSP test |
| Safari 27.0.1 | draws, and Safari chose it by itself: 12 shots at each of two pixel ratios, nothing logged | draws when forced: 12 shots at each of two pixel ratios, nothing logged |
| Firefox | NOT TESTED | NOT TESTED |
| Safari, iOS Simulator | NOT TESTED | NOT TESTED |

Untested is not failed.

Safari ran twice. The first run (spike A, on the built-in panel, pixel ratio 2, a 5248 x 3962 canvas in Modern) stopped once: the 23rd of 24 pages, the Monaco tunnel in Modern on the forced fallback, never reported. Opening that address again worked, and so did the page after it. The second run (spike B, at a pixel ratio of 1, so by then on one of the 1080p screens) went through all 24 without stopping. The cause of the one stop was not found. Spike A had no watchdog, and a tab that is not in front gets no animation frames, which would look the same from the server. But the stop was on the heaviest fallback case in the set (Monaco, Modern, the 5248 x 3962 canvas), and the build with the watchdog (spike B) ran that case only at a pixel ratio of 1, on a 1500 x 1133 canvas. It never ran it at the large canvas. So for that case at that size there is one stop and one success (the same address opened again), both on the build that could not say why. It is recorded as an open point: not shown to be a fault of the renderer, and not excluded as one. Task 6 runs that case again in Safari at a pixel ratio of 2.

Stills on the fallback, the way every later still is taken (`tools/stills.js`, headless, pinned), against the reference set `stills/before-main`: 28 compared, channel means from 1.4 to 7.4. Seven are over the comparison tool's default limit of 6 (the `high` camera on all four circuits in Modern and at Monaco in Retro, and the Indianapolis chase view in both tiers). The comparison's output was not saved at the time; it was run again from the saved stills for this correction and gave the same figures. The old reference set was not matched by the spike, which took the shortest mapping of each setting and tuned nothing. Task 6 will try to match it, and anything still over the limit goes to Jamie with pictures.

The pinned page: on 0.187 the UUIDs three.js makes still repeat in a pinned page. That did not break anything here. On the three older circuits the pinned and the unpinned picture are the same file, byte for byte: checked on the fallback (headless, Modern and Retro) and on WebGPU (headed Chrome, Modern, full size 6144 x 3386). So the stills tool needs no UUID generator of its own. (Replacing `THREE.MathUtils.generateUUID` would not have reached the engine anyway: inside a bundle the engine calls its own inner function, not the property on `MathUtils`. That was reasoned and not tried.)

A tier change at run time gives the same picture as loading in that tier, to the pixel, in both directions and on both backends (Monaco, high camera), with the shadows coming on and going off as they should. Of the four comparisons only one fallback pair was saved (`tier/`, two files identical byte for byte); the others were read off the screen.

Time to the first frames, with a fresh browser each time: r128 234 to 264 ms to the game object (one cold start at 520 ms), the fallback 244 to 297 ms, WebGPU 202 to 246 ms. The asynchronous start costs nothing that shows.

### What differs from r128, on every circuit

These come from the engine version and from how the spike mapped the old settings on to it. The two backends show them identically. That shows they are not a fault of one backend. That they belong to 0.187 as a whole, and so would show on its `WebGLRenderer` as well, is reasoned and not tested: both backends here share the same node materials, and the classic renderer never drew the scene.

- Fog. r128 mixed fog in after tone mapping and encoding, so the haze read as its hex. 0.187 mixes it in linear light, before the output step. The spike converts the fog colour to linear, which is exact where a surface is fully fogged in Retro and close elsewhere. Far things are a little paler: the stands at Indianapolis are the largest difference in the set (56 of 576 cells off by more than 24 in Retro), and the orange band at the horizon is greyer.
- Light from the environment at grazing angles. Grass seen along the ground is darker and less green than on r128, and the car body is a little darker (a cell on the car reads 129,114,92 against 144,133,115). The physically based model changed between the two releases. The car body's `envMapIntensity: 1.15` was left as it is; whether 0.187 still applies it to `scene.environment` was not checked.
- Shadows. `PCFSoftShadowMap` is gone, so `PCFShadowMap` is used. Edges are softer and the shadow is a little lighter (the tree shadows at Silverstone, the buildings at Monaco). The bias values were left alone and no acne or detached shadow shows in any shot.
- Lighting itself matches. With the maps and vertex colours switched off on both engines, the lit ground reads 245,245,246 on the spike and 245,246,246 on r128, and the sky reads 211,221,229 on both.

### Monaco

Measured on this branch: 791 meshes, 689 of them shadow casters, 661 receivers (the plan's figure of roughly 650 casters was an estimate). Silverstone has 167 meshes and 37 casters.

- The tunnel draws correctly on both backends in both browsers. The walls are slightly darker than on r128.
- The sea draws. Its reflection of the sky is a little weaker: the lightest part of the water reads 50,143,179 against 66,150,184 on r128. Turning the environment picture round made no difference, so this is the shading model and not a mirrored environment.
- The buildings, the yachts and the many casters draw, with the softer shadows noted above. Nothing is missing and nothing flickers between the two backends.
- Monaco in Modern is not a weak spot for frame time on the mean. With a multisampled canvas the fallback took 5.49 and 5.12 ms where r128 beside it took 5.82 and 5.96. Without one it took 3.51 and 2.76, and WebGPU 2.91 and 2.30.
- Its p95 is another matter. With a multisampled canvas the fallback's p95 at Monaco was worse than r128 beside it in both runs: 16.4 ms against 11.1 in run 1, and 15.4 against 11.1 in run 2 (48% and 39% worse; the baseline's p95 is 10.6). The other two Modern rows do not show it (their p95 was a little better than r128 in both runs). The plan compares on the mean, so this fails nothing, and it was not looked into. It goes away with the samples: without them the fallback's p95 at Monaco was 9.3 and 8.1 ms, and on WebGPU 8.0 and 5.9. Task 6 will not have the samples (see item 13 below), but the long frames at Monaco are worth a look if they come back.

Nothing at Monaco looked wrong in a way that points at the renderer.

## Criterion 2: the Retro pass

`POST_FRAG` was rewritten as a node material, function for function: the same Bayer matrix built from the same arithmetic, the same `1/52` dither, the same 31 level quantise, the same Modern grade and the same vignette. The frame it reads is linear and not yet tone mapped, so the pass first tone maps (Modern only), encodes to sRGB with r128's own formula, and rounds to 8 bits as the old render target did.

The test gives both engines the same input: everything but the sky dome hidden (the sky is unlit, so no lighting difference reaches the pass), Retro at Silverstone, canvas read at full size, compared pixel by pixel with r128.

| against r128 | pixels | differing | identical | largest difference |
|---|---|---|---|---|
| WebGPU, headed Chrome, half float target | 1,070,592 | 9,081 | 99.15% | 9 |
| fallback, headed Chrome, half float target | 1,070,592 | 9,086 | 99.15% | 9 |
| fallback, headless, half float target | 310,272 | 1,357 | 99.56% | 9 |
| WebGPU, headed Chrome, 8 bit sRGB target | 1,070,592 | 2,812 | 99.74% | 9 |
| fallback, headed Chrome, 8 bit sRGB target | 1,070,592 | 2,809 | 99.74% | 9 |

Every differing pixel but a few dozen is out by 6 to 9 levels, which is one step of the 5 bit palette after the vignette: a value that sat on a step boundary and rounded the other way. The pattern lines up; a pattern turned upside down would differ nearly everywhere. One thing to know: on this renderer `uv()` on a full screen pass has its origin at the top on both backends, where the old `vUv` had it at the bottom, so the pass flips `y` before it indexes the matrix.

## Criterion 3: page size

Built on the spike branch at `v0.113 dev 14d8a86`, clean tree:

| bundle | bundle bytes | `dist/index.html` | `dist/artifact.html` | page, gzip -9 |
|---|---|---|---|---|
| WebGPU flavour, rebuilt with one more name | 853,369 | 1,583,540 | 1,578,918 | 472,779 |
| WebGPU flavour as task 4 built it | 853,346 | 1,583,517 | 1,578,895 | not taken |
| WebGL flavour | 594,148 | 1,324,319 | 1,319,697 | 388,783 |
| r128, for scale (`v0.110 dev 77a37a5*`) | 603,445 | 1,322,526 | 1,317,903 | not taken |

The spike's own source is 11,090 bytes larger than `v2-upgrade`'s (the report helpers and switches), so task 6's page will be nearer 1,572,000 bytes with the WebGPU flavour. The limit is 2,500,000. The WebGL flavour page was built for its size only; the spike's source does not run on it.

## Criterion 4: CSP

- `node test/csp.js` against spike B: `booted (canvas + webgl + motion): yes`, `Supabase origin reachable: yes`, `off-origin exfil blocked: yes`, `unexpected violations: 0`, `RESULT: PASS`. It runs headless, so it saw the fallback.
- The real WebGPU backend, headed Chrome, the page served with every header parsed out of `deploy/.htaccess` the way `test/csp.js` does it, listening for `securitypolicyviolation`: Modern at Monaco in the attract demo, Retro at Silverstone, and the photo frame with its report, each on WebGPU; then Modern at Monaco on the forced fallback. Each time the header was sent, the backend was the one asked for, frames were advancing, and there were 0 violation events and 0 console errors or warnings.
- Not done: Safari under the header.

One thing for task 6: `test/csp.js` decides the game booted partly by asking the game canvas for a `webgl2` context. That is true on the fallback and would be false on a canvas that holds a WebGPU context, so the test passes only because it runs headless. It needs a check that fits both.

## Criterion 5: frame time

`node tools/bench.js --quality <q> --circuit <id> --seconds 20`, as the baseline was taken: system Chrome, headed, 1728 x 1028 viewport, device pixel ratio 2, the attract demo for 20 s after a 1 s warm up, `--disable-gpu-vsync --disable-frame-rate-limit`. No page error on any run. On the spike branch the tool took a `--query` argument to pass the switches through, and asked the renderer which backend ran. The bench lines carry no build stamp: that they measured spike B rests on the order of the work, not on the lines.

Like for like needs a word. `antialias: true` does not mean on this renderer what it meant on r128. On r128 it gave the canvas four samples, and the game then drew one full screen triangle to it, so the samples bought nothing and cost a great deal at 6144 x 3386. On `WebGPURenderer` the WebGPU backend never multisamples a full screen pass, and the WebGL 2 backend decides when its context is made: it asks for samples only if no output conversion is pending, and by default one is. So with the same arguments as main, the spike's fallback canvas has no samples. To compare like with like the spike has a switch (`msaa=1`) that makes the fallback canvas multisampled as main's is (`getContextAttributes().antialias` true, `SAMPLES` 4). The criterion is judged on that. The figures without it are given too, because that is what the same arguments give by default.

Every row printed the same three sizes as the baseline: render target 3072 x 1693, canvas and drawing buffer 6144 x 3386 in Modern; 697 x 384 and 1394 x 768 in Retro. (One WebGPU row in run 1 printed 3069 x 1695 and 6138 x 3390.)

The four rows the plan asks for: the forced fallback with a multisampled canvas, against the baseline table in `docs/v2-picture-log.md`. The design asks only for the Modern ones (see the ruling under the decision).

| circuit | tier | baseline mean ms | run 1 mean ms | run 2 mean ms | run 1 against baseline | run 2 against baseline | limit (baseline + 5%) |
|---|---|---|---|---|---|---|---|
| silverstone-v1 | modern | 5.26 | 4.58 | 4.34 | 12.9% faster | 17.5% faster | 5.52 |
| silverstone-v1 | retro | 1.03 (1.0286) | 1.08 (1.0826) | 1.07 (1.0707) | 5.25% slower: outside | 4.10% slower: inside | 1.0815 |
| indianapolis-v1 | modern | 5.24 | 4.62 | 5.13 | 11.8% faster | 2.1% faster | 5.50 |
| monaco-gp-v1 | modern | 5.73 | 5.49 | 5.12 | 4.2% faster | 10.6% faster | 6.02 |

In the Retro row the figures in brackets, and the two percentages, are on the frame counts: 19444 frames in the baseline, 18474 in run 1 and 18679 in run 2. The first form of this record compared the printed 1.08 with the limit and called run 1 "4.9% slower" and inside it. Run 1 is 1.0826 ms, which is outside 1.0815.

Why frame counts. The bench hook rounds its mean to two decimals. At 1 ms a frame that is 1% of the figure, and the limit is given to four decimals, so the printed figure cannot be held against it. Each bench line also prints the number of frames in its 20 s window, and the mean is 20000 / frames. That is exact but for a long frame across either end of the window, which changes the sum the hook divides. In Modern such frames show: four logged lines, and the baseline's Indianapolis row, print a mean 0.02 to 0.04 ms below 20000 / frames. In Retro every printed mean agrees with its frame count to the two decimals printed, which bounds the effect at under 0.01 ms a frame and cannot show that it is nil. Run 1 would need 0.0011 ms of it to come inside the limit, which is a first counted frame 20 ms late, where a Retro frame is 1 ms and the p95 is 3.4. The Modern rows above are left on the printed means, where the rounding is 0.2% of the figure.

Every run of the unaltered fallback in Retro with a multisampled canvas that has a log behind it, in the order taken, with r128 from the line before it in the same log:

| log and line | frames | mean ms | against the limit of 1.0815 | against the baseline's 19444 frames | r128 beside it: frames, mean ms | against r128 beside it |
|---|---|---|---|---|---|---|
| `bench.log` 4, formal run 1 | 18474 | 1.0826 | outside | 5.25% slower | 19590, 1.0209 | 6.0% slower |
| `bench-retro.log` 2 | 17390 | 1.1501 | outside | 11.81% slower | 17524, 1.1413 | 0.8% slower |
| `bench-retro.log` 6 | 18388 | 1.0877 | outside | 5.74% slower | 19542, 1.0234 | 6.3% slower |
| `bench-retro.log` 10 | 18280 | 1.0941 | outside | 6.37% slower | 19597, 1.0206 | 7.2% slower |
| `bench-rt8.log` 2 | 18498 | 1.0812 | inside, by 0.0003 | 5.11% slower | 20269, 0.9867 | 9.6% slower |
| `bench-rt8.log` 5 | 18759 | 1.0662 | inside | 3.65% slower | 20307, 0.9849 | 8.3% slower |
| `bench-rt8.log` 8 | 18480 | 1.0823 | outside | 5.22% slower | 20230, 0.9886 | 9.5% slower |
| `bench2.log` 6, formal run 2 | 18679 | 1.0707 | inside | 4.10% slower | 20263, 0.9870 | 8.5% slower |

Twelve runs of this row were listed when the spike was written up, as printed: 1.08, 1.15, 1.09, 1.09, 1.09, 1.09, 1.09, 1.10, 1.08, 1.07, 1.08, 1.07, with r128 beside them at 1.02, 1.14, 1.02, 1.02, 1.02, 1.01, 1.02, 1.01, 0.99, 0.98, 0.99, 0.99. The eight in the table are the first four and the last four of that list. The fifth to the eighth (1.09, 1.09, 1.09 and 1.10, with r128 at 1.02, 1.01, 1.02 and 1.01) have no log behind them: no file in the evidence folder holds those lines, so they stand only as the two decimals noted at the time. A figure printed as 1.09 or 1.10 is 1.085 or more, so all four are outside the limit on any reading.

The count, on the unrounded figures: three of the twelve are inside the limit of 1.0815 and nine are outside it. The first form of this record said five and seven. One of the two formal runs is outside. Held against the baseline's own frame count instead of its rounded mean (5% slower than 19444 frames is 18518 frames, or 1.0800 ms), two of the eight logged runs pass. The eight logged runs average 1.0893 ms, which is 5.9% over the baseline's 1.0286. The 1.1501 came in a spell when r128 itself measured 1.1413; without it the other seven average 1.0807 ms, 5.1% over the baseline.

Against r128 beside it the fallback is 6.0% to 9.6% slower in seven of the eight logged pairs, which is 0.06 to 0.09 ms a frame, and 0.8% slower in the pair from the slow spell. The four pairs with no log give 7% to 9% on their printed figures. The baseline itself moves from day to day: recorded at 1.0286 ms, r128 read 0.9849 to 1.0234 ms beside these runs, and 1.1413 in the slow spell.

The real WebGPU backend in Retro, from the five logged lines, against r128 in the same group of lines: 0.9975 ms against 0.9870 (run 2, 1.1% slower), 1.0299 against 1.0234 and 1.0225 against 1.0206 (`bench-retro.log`, under 1% slower), 1.0600 against 1.1413 in the slow spell (faster), and 1.1024 against 1.0209 in run 1 (8.0% slower, but run 1's two halves were taken a few minutes apart, and r128 was in the other half). So it is level with r128 in four of five and not in run 1.

Where the Retro difference is: the page's own script spends no more time in a frame on the fallback than on r128 (0.56 ms against 0.58 ms inside `render()`), and with the scene hidden the two are level (0.86 against 0.84 ms a frame). Drawing the 167 meshes costs about 0.05 ms more a frame outside the page's script. An 8 bit Retro target does not close it (1.0697, 1.0738 and 1.0681 ms against 1.0812, 1.0662 and 1.0823 for half float in the same series, `bench-rt8.log`), and neither does leaving the canvas without samples (1.0668, 1.0990, 1.0813 and 1.0905 ms in the four logged runs beside those above, and the outlier named below). At this level the bench also measures the browser's own pacing as much as the game: with the HUD switched off, both engines got slower (r128 1.42 ms, the fallback 1.53 ms), which no cost of drawing explains. The figures in this paragraph for `render()`, the hidden scene, the meshes and the HUD were read off the screen and have no saved log; the script that made them is kept (`prof.js`).

The Retro row's p95 is also a little higher on the new engine, on both backends and with or without samples: 3.1 to 3.4 ms in the two formal runs (3.9 in the outlier) against 2.6 and 2.7 on r128.

All four rows on each engine, both runs, mean ms (frames in 20 s):

| circuit | tier | r128 today, run 1 | r128 today, run 2 | fallback, multisampled canvas, run 1 | run 2 | fallback as the arguments give it, run 1 | run 2 | WebGPU, run 1 | run 2 |
|---|---|---|---|---|---|---|---|---|---|
| silverstone-v1 | modern | 5.03 (3963) | 4.93 (4059) | 4.58 (4368) | 4.34 (4607) | 3.08 (6490) | 2.35 (8527) | 3.16 (6295) | 1.69 (11857) |
| silverstone-v1 | retro | 1.0209 (19590) | 0.9870 (20263) | 1.0826 (18474) | 1.0707 (18679) | 1.2791 (15636) | 1.0668 (18748) | 1.1024 (18143) | 0.9975 (20051) |
| indianapolis-v1 | modern | 5.14 (3876) | 5.67 (3506) | 4.62 (4324) | 5.13 (3901) | 3.36 (5962) | 2.60 (7692) | 2.87 (6973) | 2.23 (8958) |
| monaco-gp-v1 | modern | 5.82 (3438) | 5.96 (3353) | 5.49 (3640) | 5.12 (3908) | 3.51 (5701) | 2.76 (7240) | 2.91 (6871) | 2.30 (8689) |

The Retro row of this table is 20000 / frames, to four decimals; the Modern rows are the printed means.

p95, run 2, in the same order of engines: Silverstone Modern 13.9, 12.7, 7.3, 4.6; Silverstone Retro 2.6, 3.3, 3.3, 3.1; Indianapolis Modern 16.1, 15.5, 7.5, 6.2; Monaco Modern 11.1, 15.4, 8.1, 5.9. p95, run 1, the same way: Silverstone Modern 14.2, 13.2, 9.2, 9.2; Silverstone Retro 2.7, 3.4, 3.9, 3.4; Indianapolis Modern 14.4, 14.0, 10.3, 8.1; Monaco Modern 11.1, 16.4, 9.3, 8.0. Run 1 was taken under more load than run 2, and its two halves a few minutes apart, so its columns compare less well with each other than run 2's do. The 1.2791 in run 1 is an outlier: three later runs of that row gave 1.0990, 1.0813 and 1.0905 (`bench-retro.log`).

What the table says beyond the criterion: on the fallback the multisampled canvas is about half the cost of a Modern frame (2.0 to 2.5 ms of 4.3 to 5.1 in run 2), and it draws nothing that needs it. That fits the picture log's guess about why main got slower, though r128 itself was not run without it. Without it the fallback runs Modern in 2.4 to 3.5 ms and the WebGPU backend in 1.7 to 3.2 ms.

## Criterion 6: under node

The test's vendor file was pointed at the bundle and nothing else changed (`new Function(source)()` with `window` and `self` set, as the test loads r128):

- `vendor/three.bundle.js` (the WebGPU flavour as task 4 built it), with `v2-upgrade`'s source: `4 passed, 0 failed`. Monaco 13682 ticks, Silverstone 19749, Indianapolis 22607, Brands Hatch 18849, each matching its golden hash.
- The rebuilt flavour (with `ColorManagement`), with the spike's source: `4 passed, 0 failed`.
- In the browser, the player's speed after 900 ticks at Monaco is the same number to the last digit on r128 and on the spike (37.257246074702756).

So the playability plan's tasks 2, 4 and 5 (the sim without THREE) do not have to come before task 6.

## Not one of the six: what Ultra will lean on

Task 4 only constructed the Ultra addons, and only on the fallback. Here they were put to use on the real WebGPU backend and on the forced fallback, in headed Chrome under the shipped CSP header, from `vendor/three.bundle.js` as it stands: a `RenderPipeline` with `TSL.pass` and `bloom`, a `SkyMesh` in the scene, and a `CSMShadowNode` with three cascades set as the sun's `shadow.shadowNode`, over a ground plane and twelve boxes. Both backends ran it with no page error and no CSP violation, and three sample pixels read the same on both. The picture is washed out because nothing was tuned. It is a smoke test and no more. It also ran with colour management on, the engine's default, where the spike's game ran with it off: see the note at the head of the next section.

## What the engine move will need

Everything the spike had to change, for task 6 to build on. The spike took the shortest route each time; task 6 may choose better, except where a ruling here fixes the route.

One route here goes against the plan, and it is the largest choice in the move. The spike ran with `THREE.ColorManagement.enabled = false` (item 3). The plan's task 6 (steps 2 to 4) assumed management on: step 3 removes `convertSRGBToLinear()` "because colour management now converts hex input itself", and step 4 corrects the raw hexes that then shift. Criteria 1 and 2 were measured only with management off; no picture was taken with it on. The Ultra smoke test is the other way round. It ran from the bundle as it stands, which has no `ColorManagement` export, and its script never touched the setting, so it ran with management ON. The two sets of evidence are on different routes.

Ruled by the controller: task 6 takes the spike's route. Management is off, the game's own `srgb()` conversions are kept, and the post pass encodes. Every piece of picture evidence was measured that way, and it changes least. The plan's task 6 is rewritten to match. Ultra's addons must be shown to work with management off in task 7 or 8, before anything is built on them.

1. **Renderer construction and the asynchronous start.** `new THREE.WebGPURenderer({ canvas, antialias, alpha: false, powerPreference, stencil: false, forceWebGL })`, then `renderer.init()`, which returns a promise. `Game` builds its world in its constructor and needs the renderer ready, so boot makes the renderer, waits for `init()`, and only then makes the game and assigns `window.MCL64`. A rejected `init()` has to reach the fallback message. The WebGL probe at the top of boot stays valid: the fallback needs it.
2. **Which backend ran.** `renderer.backend.isWebGPUBackend` or `isWebGLBackend`. On WebGPU, `renderer.getContext()` is a `GPUCanvasContext`, so nothing may call GL methods on it. The GL context on the fallback is `renderer.backend.gl`; the device on WebGPU is `renderer.backend.device`.
3. **Colour management.** The game makes some colours with `srgb(hex)` (converted by the game) and hands others over as bare hexes that r128 read as linear. With management on, 0.187 converts every hex itself, so the `srgb()` ones were converted twice and every lit surface came out about a third as bright. The spike sets `THREE.ColorManagement.enabled = false`, and it has to be the first statement of the game, before `src/10-core.js` makes anything: tables further down call `srgb()` as the files load. Setting it in boot was too late. With it off, every colour is what r128 took it for. The cost: the engine's own colour space node does nothing when management is off, so the output encode is written by hand in the post pass.
4. **Textures.** `texture.encoding = THREE.sRGBEncoding` becomes `texture.colorSpace = THREE.SRGBColorSpace`, in two places (`texFromCanvas` and the environment canvas). The third use, on the render target, goes with the next item.
5. **The render target.** `THREE.RenderTarget` in place of `WebGLRenderTarget`. This renderer tone maps and converts colour only when it draws to the canvas, so the scene arrives in the target linear and not tone mapped. Modern therefore needs a half float target, or highlights clip before the tone mapping. Retro can have what r128 had: 8 bits with `colorSpace: THREE.SRGBColorSpace` (the GPU encodes on write and decodes on read, so the pass still reads linear values). That matches r128 more closely (criterion 2) and costs the same.
6. **Tone mapping.** `renderer.toneMapping` stays `NoToneMapping` and `renderer.outputColorSpace` is set to `LinearSRGBColorSpace`, so the renderer adds no pass of its own. The post node calls `TSL.renderOutput(colour, THREE.ACESFilmicToneMapping, THREE.LinearSRGBColorSpace)`, which reads the exposure from `renderer.toneMappingExposure`. The sweep in `applyQuality` that sets `needsUpdate` on every material is no longer needed for tone mapping.
7. **The post pass.** `ShaderMaterial`, its `Mesh`, `postScene` and `postCam` become one `THREE.NodeMaterial` with a `fragmentNode`, drawn with `new THREE.QuadMesh(material).render(renderer)`. Uniforms are `TSL.uniform(value)` objects whose `.value` is set as before. One material serves both tiers, switched by the `uRetro` uniform. `uv()` has its origin at the top (see criterion 2). A change of target means building the node again and setting `needsUpdate`. The material keeps `depthTest` and `depthWrite` off, as the old one had them, and the node rounds the encoded colour to 8 bits before the Retro maths (see criterion 2).
8. **Lights.** The hemisphere, directional and ambient intensities are each multiplied by pi (1.05, 1.35 and 0.4 become those times `Math.PI`). r128 did that inside its shaders unless `physicallyCorrectLights` was set. Checked: see "Lighting itself matches" above.
9. **Fog.** See the differences above. The spike calls `scene.fog.color.convertSRGBToLinear()`. Matching r128's haze in Modern needs a choice in task 6, because the fog is now tone mapped with everything else.
10. **The environment.** `scene.environment` is given the equirectangular canvas texture directly and the renderer prefilters it by itself. `PMREMGenerator` was not used; in this build it is another class and was not tried.
11. **Shadows.** `renderer.shadowMap.type = THREE.PCFShadowMap`. `PCFSoftShadowMap` only warns and falls back to it. Switching `shadowMap.enabled` and `sun.castShadow` with the tier works at run time.
12. **Clearing.** The explicit `renderer.clear()` before each scene draw was dropped; the renderer clears the target by itself.
13. **The canvas and samples.** As under criterion 5. With main's arguments the canvas is not multisampled on either backend. If a multisampled fallback canvas is wanted, `toneMapping` and `outputColorSpace` have to be set before `init()`. It is not worth wanting for a full screen pass.

    Ruled by the controller: task 6 passes main's renderer arguments unchanged and does NOT force a multisampled fallback canvas. The samples drew nothing on r128 (one full screen triangle), so leaving them out changes no pixel and makes Modern faster than the baseline. The bench in task 6 is judged as "no worse than the baseline" on the figures the plain arguments give, and the log says the canvas has no samples.
14. **The hooks.** `photo` and `bench` needed no change beyond the two draws moving into one function. A WebGPU canvas has to be read back in the task that drew it, as a WebGL canvas without `preserveDrawingBuffer` does.
15. **The tools.** `tools/bench.js` asked `renderer.getContext()` for GL parameters; it has to ask the backend, and should print which backend ran. `tools/stills.js` ran unchanged, and can only ever show the fallback. `test/csp.js`: see criterion 4. `build.js` reads the vendor file by name, its notice text still says r131, and its check for `Three.js Authors` passes on the bundle. `test/sim-parity.test.js` and `test/physics.test.js` read `vendor/three.min.js` by name as well.
16. **Not exercised by the spike:** a lost device or context, a whole race driven by hand, touch devices, the HUD (untouched), a slow GPU, and `tools/stills-pin-check.js`.

## Names the entry needs

The spike's source uses two names the bundle lacks. The first form of this record gave one. Checked for this correction: `vendor/three.bundle.js` was evaluated under node (58 names on `THREE`, 16 on `THREE.TSL`) and held against every `THREE.<Name>` and every `THREE.TSL.<name>` (written `T.<name>`) on the lines the saved patch adds under `src/`: 19 names and 12 names. Two are missing:

- `ColorManagement`, from `three/webgpu`. Added to `tools/three-entry.webgpu.js` on the spike branch only; it adds 23 bytes. Task 6 needs it, because it keeps management off (see the ruling above).
- `UnsignedByteType`. The spike names it for the 8 bit Retro target (`rt8=1`) and never added it to the entry, so it was `undefined` in the spike's rebuilt bundle too. The 8 bit measurements still ran on an 8 bit target, because `RenderTarget` leaves an undefined type alone and the texture's default type is unsigned byte. Task 6 adds the name if it gives Retro the 8 bit target of item 5.

Neither change is on `v2-upgrade`. Task 6 adds them and builds the bundle again.

Names already in the bundle that the spike used: `WebGPURenderer`, `RenderTarget`, `NodeMaterial`, `QuadMesh`, `HalfFloatType`, `SRGBColorSpace`, `LinearSRGBColorSpace`, `PCFShadowMap`, `REVISION`, and under `THREE.TSL`: `Fn`, `uv`, `texture`, `renderOutput`, `uniform`, `vec2`, `vec3`, `vec4`, `float`, `clamp`, `mix`, `dot`. The rest of the pass is written with methods on nodes (`mul`, `add`, `sub`, `div`, `mod`, `floor`, `pow`, `oneMinus`, `lessThanEqual`, `rgb`), which need no name. `mix` with a vector of booleans as its third argument worked on both backends.

## Where the evidence is

There are two copies, and neither is committed.

- The durable copy, and the one to use: `.superpowers/sdd/2026-11-23-mcl64-v2-picture-part1/spike-evidence/` in the repo. Git ignores it, so it survives a restart but not a fresh clone. It was copied from the scratchpad on 24 Nov 2026, after the review.
- The original: `/private/tmp/claude-501/-Users-jamieeasterman-Downloads-Appdir-f1game/dfd9fdc1-a860-4922-86a7-35e0c55c9e79/scratchpad/spike`, in the session scratchpad, which a restart or a cleanup can clear. When this correction was written the two held the same files (`diff -rq` found no difference).

What is in the folder:

- `spike.patch`: the whole diff of `spike/renderer` (tip `14d8a86`) against `v2-upgrade`, the rebuilt bundle included. `spike-source.patch` is the same without the bundle, and is the one to read.
- `shots/`: a screenshot of the stage for every shot: `chrome-<shot>-<tier>-gpu.png`, `-gl.png` and `-r128.png` at the bench viewport, and the `chromeS-` and `chromeS2-` sets at Safari's stage size.
- `reports/`: for every shot in every browser, a JSON file (backend, sizes, build, console log, the 32 x 18 grid) and a small JPEG of the canvas. `safari-*` is the second Safari run, `safariD2-*` the first.
- `stills-fallback/`: the 28 stills on the fallback.
- `retro-exact/`: the pictures for criterion 2.
- `bench.log` (formal run 1), `bench2.log` (formal run 2), `bench-retro.log`, `bench-rt8.log`: every bench line that was saved. Four of the twelve Retro repeats, and the profile figures under criterion 5, were not.
- `csp-headless.log`, `csp-headed.log`, `boot-time.log`, `ultra-smoke.log`, and `ultra/`.
- `dist-r128/`, `dist-spike/` (spike B), `dist-spike113/` (spike C): the built pages.
- `orig/`: both bundles as task 4 built them.
