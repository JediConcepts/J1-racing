# J1-racing — MCL-64

A 3D racing game: an N64-era Formula 1 racer on a stylised Silverstone, built
with Three.js and rendered at 240p with a 5-bit dither. Accounts, a global
leaderboard, six-car races, three circuits, three onboard cameras, touch and
tilt controls on mobile.

![MCL-64 at Silverstone](deploy/share.png)

**Play it: <https://jediconcepts.com/mcl64/>**

Unofficial fan project by Jamie Easterman of Jedi Concepts. Not endorsed or
sponsored by any racing team or their sponsors.

## Provenance

The first playable build — car, track, six-car AI field, race rules and a
working Supabase leaderboard — landed **58 minutes and 34 seconds** after the
repository was created. Written with Claude Code, in one sitting.

```bash
git log --reverse --format='%h %ad %s' --date=iso | head -2
# e804a8e 2026-08-02 17:08:31 +0100  Initial commit
# 42080d9 2026-08-02 18:07:05 +0100  MCL-64: N64-style F1 racer with Supabase leaderboard
```

Nothing existed before `e804a8e` — no local branch, no scratch directory, no
prior prototype. The clock starts at an empty repository.

Everything after that first hour is the honest part: 40 more commits over the
following two days, many of them fixing what the first hour got wrong. The
interesting artifact is not the hour. It is what the two days had to correct.

## What the agent got wrong

**It could not keep a sign straight in three dimensions.** Eight commits fix an
inverted orientation: upside-down trees, inverted banking, inverted camber, body
roll leaning out of corners, a steering wheel turning the wrong way, a gyro
camera banking away from the corner. The worst of them is a cancelling pair
worth reading in order. `b58a5af` flipped the sign where roll is *applied*
(`-roll + lean` → `roll + lean`) and left a comment asserting the result was
"correct now". Fifty-four minutes later `1fac796` had to flip the sign where
roll is *computed* (`datan2(hR - hL, …)` → `datan2(hL - hR, …)`), because both
terms had been backwards and fixing one had simply moved the error. On Indy's
9.2-degree banking the car rolled the wrong way by twice the bank angle. Two
wrong signs can multiply into a right-looking result on flat track and only
separate where the geometry gets interesting — so the rule the repo now follows
is to change one sign per commit and measure the outcome in the running game,
never to reason about two at once. `503462f` is what stopping to audit rather
than patch looks like: five orientation bugs, found and fixed together.

**It made a failure quiet in order to make a migration pass.** `0003` needed
`grant usage on schema auth`, which Supabase does not reliably permit from the
SQL editor. Rather than remove the dependency, the agent wrapped the grant so a
failure only raised a notice. The migration then applied cleanly and the bug
moved: `submit_score` runs `SECURITY DEFINER` as a role with no access to
`auth`, so posting a score failed at runtime instead — and only at the chequered
flag, after a full three-lap race, which is the most expensive place in the
program to discover anything. `0005` fixes it by reading the JWT claim through
`current_setting` and deleting the grant requirement entirely. Related, and the
reason `0001` now carries a correction header: the agent documented the security
model it intended, including a re-simulating validator that does not exist, in
the present tense as though it had been built.

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

`dist/` is committed, which is normally a smell. Here it is the deploy contract:
`.github/workflows/deploy.yml` asks a Worker to publish files **out of a git
commit**, and there is no build step in that pipeline, so an untracked
`dist/index.html` is a deploy that silently ships nothing. Run `node build.js`
and commit the output alongside the source change, or the published page and the
source drift apart.

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
5. No client-reachable `INSERT` or `UPDATE` grant on `scores`, ever. Writes go
   only through `submit_score()`, which takes no `user_id` parameter —
   attribution is derived from the verified JWT, never accepted from the caller.
6. Nothing the caller passes selects a board or names a file. `track_version`
   must exist in `track_versions`, so a player cannot invent a circuit and top
   a board of one, and `trace_key` is ignored on the way in — it is the
   validator's to write, never the submitter's.

Display names accept letters in any script — José, Мария, 田中 — and no
character that matters for HTML injection: `< > & " / \` and the rest are
stripped before insert and rejected by a `CHECK` constraint after it. The
constraint is an allowlist, `^[[:alpha:][:digit:] '._-]+$`, deliberately, so
widening it for one alphabet cannot quietly admit a script tag.

Migrations are numbered and must be applied in order.

**What this does not yet do.** A player cannot write to `scores` directly, and
cannot post a time as someone else. A player *can* still call `submit_score()`
with a time they did not drive, because the validator that re-simulates a
submitted trace does not exist yet — the track has to be baked to engine-stable
data first (see the maths section above). Every row therefore lands
`validated = false`, so unvalidated runs can be re-checked and purged once the
validator lands, and the board shows them flagged rather than hiding them. The
header of `0001` describes the finished design and is marked as superseded by
`0003`, which describes what actually runs.

When that validator is built, the trace it reads must be located from the
authenticated user — never from a key the submitter supplied. `submit_score()`
used to accept one, which would have let a player point an invented time at
somebody else's honest run and have the validator bless it. `0012` closed that
by ignoring the parameter; the note matters because the hole reopens the moment
an upload path is added carelessly.

## Licence

No licence granted. All rights reserved.
