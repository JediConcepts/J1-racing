# MCL-64 v2 picture log

Started 23 Nov 2026, on branch v2-upgrade, before the engine move (three.js r128).

- Machine: Mac14,6 (Apple M2 Max), built-in display at a device pixel ratio of 2 and 120 Hz.
- Bench browser: Google Chrome 158.0.8127.36, headed, through Playwright `channel: 'chrome'`. WebGL renderer reported: ANGLE Metal on the Apple M2 Max.
- Stills browser: Playwright Chromium 159.0.8154.6, headless, SwiftShader (`--use-gl=swiftshader --enable-unsafe-swiftshader`), 1280 x 720, device pixel ratio 1.

Stills are taken with `node tools/stills.js` and compared with `node tools/stills-compare.js`. Frame times are taken with `node tools/bench.js`. The stills themselves are not committed; the numbers are recorded here.

## Baseline

`node tools/bench.js --quality <q> --circuit <id> --seconds 20`: the attract demo for 20 s after a 1 s warm up, in a 1728 x 1028 viewport at device pixel ratio 2. Frame time is the gap between animation frames.

| circuit | tier | frames | mean ms | p95 ms |
|---|---|---|---|---|
| silverstone-v1 | modern | 2395 | 8.35 | 9.1 |
| silverstone-v1 | retro | 2400 | 8.33 | 9.2 |
| indianapolis-v1 | modern | 2400 | 8.34 | 9.2 |

All three hold the display's 120 Hz refresh (8.33 ms), so today's engine has headroom on this machine that these figures cannot show. A later figure above 8.33 ms is a real loss; one at 8.33 ms only says the frame still fits.

## Repeatability

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
