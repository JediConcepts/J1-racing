# J1-racing — MCL-64

A 3D racing game: an N64-era Formula 1 racer on a stylised Silverstone, built
with Three.js and rendered at 240p with a 5-bit dither.

Unofficial fan project by Jamie Easterman of Jedi Concepts. Not endorsed or
sponsored by any racing team or their sponsors.

Live at <https://jediconcepts.com/mcl64/>

## Build

No bundler, no dependencies, no install step.

```bash
node build.js
```

That produces two files, and the difference between them matters:

| Output | What it is |
|---|---|
| `dist/index.html` | Complete standalone document, for normal web hosting |
| `dist/artifact.html` | Bare **fragment**, for a host that supplies its own `<head>`/`<body>` |

Shipping the fragment to a real web server is a real bug that has happened:
with no doctype the browser falls into quirks mode, and with no viewport meta
every phone lays the page out ~980px wide and scales it down, which breaks the
game on mobile before touch input is even reached. `build.js` asserts both
invariants and refuses to build if they are violated.

The standalone build also carries the Supabase SDK and leaderboard config; the
artifact build deliberately does not, because that host's CSP blocks every
external origin, so 51 KB of SDK there would power a feature that cannot work.

## Layout

```
src/05-fpmath.js       deterministic sin/cos/tan/atan2 (see below)
src/10-core.js         maths, pixel font, HUD drawing, audio
src/20-track.js        circuit geometry, racing line, scenery
src/30-cars.js         vehicle physics, AI drivers, collisions
src/35-mobile.js       touch thumbstick, tilt steering, fullscreen
src/36-cloud.js        Supabase auth and leaderboard
src/40-game.js         game loop, HUD, race rules, settings
src/index.template.html  markup and CSS shell
supabase/migrations/   schema, RLS, and the score write path
```

Files are concatenated in numeric order into one IIFE. **Order matters**:
prototype assignments do not hoist the way function declarations do, so a
module used during `boot()` has to be listed before `40-game.js`.

## Why the maths is hand-rolled

`src/05-fpmath.js` replaces `Math.sin/cos/tan/atan2` in the simulation with
implementations built only from operations IEEE 754 requires to be correctly
rounded.

ECMAScript does not require the transcendentals to be correctly rounded, so V8
and JavaScriptCore disagree by up to 1 ULP. Measured on this simulation, a
1e-9 difference in one steering value grows to roughly **5 km** of positional
divergence by step 15,000 of a race — the off-track, on-kerb, DRS-zone and
contact branches turn a last-bit difference into a completely different race.

That matters because every race records a replay trace (4 bytes per tick, ~79
KB raw and under 10 KB gzipped) which reproduces the race bit-for-bit. That is
the basis for server-side validation of submitted lap times. Without engine
independence a Safari player's run could never be verified by a V8 validator.

Verified bit-identical across V8 (node) and JavaScriptCore (bun) over 190,290
samples, with the built-in `Math.*` as a control that does diverge.

Known remaining gap: Three.js's `CatmullRomCurve3` is **not** engine-stable, so
the track must be baked to data before a headless validator can be trusted.
That work is outstanding.

## Leaderboard

Supabase for auth (Google, email magic link) and Postgres for scores. The
security model, in order of evaluation:

1. PII lives in a `private` schema that PostgREST does not expose.
2. GRANTs are revoked — checked *before* RLS, and not bypassed by `BYPASSRLS`.
3. RLS is enabled **and forced**; without `FORCE`, the table owner silently
   bypasses every policy.
4. Restrictive policies that no later permissive policy can re-open.
5. No client-reachable write path. Scores are written only through
   `submit_score()`, which takes no `user_id` parameter — attribution is
   derived from the verified JWT, never accepted from the caller.

Migrations are numbered and must be applied in order.

## Licence

No licence granted. All rights reserved.
