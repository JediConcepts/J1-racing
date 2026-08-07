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

**The first playable build landed 58 minutes and 34 seconds into the project.**
Car, Silverstone, a six-car AI field, race rules, and a working Supabase
leaderboard — written with Claude Code, in one sitting.

```bash
git log --format='%h  %ad  %s' --date=format:'%H:%M:%S' 42080d9 e804a8e
# 42080d9  18:07:05  MCL-64: N64-style F1 racer with Supabase leaderboard
# e804a8e  17:08:31  Initial commit
```

Then 68 more commits over the following five days, most of them fixing what that
hour got wrong. **The hour is not the interesting part. What the five days had to
correct is** — and the rest of this README, the migrations, and the three test
suites are that argument, at length.

Exactly what git does and does not prove about the timing is set out in
[Provenance, in detail](#provenance-in-detail) at the foot of this file. The
short version: it proves the timestamps and the contents, not my account of how
they came about.

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

Verified bit-identical across V8 (node) and JavaScriptCore (bun) over **144,400
samples**, with the built-in `Math.*` as a control that does diverge:

```
                 node (V8)          bun (JavaScriptCore)
dsin/dcos/...    799de904cbcc58d7 = 799de904cbcc58d7    ← the claim
Math.sin/cos/... 6887ae715a325b9a ≠ 554d93314274393c    ← the control
```

```bash
node test/fpmath.test.js
```

That figure used to read 190,290, from a measurement whose harness was never
kept — so the number could not be reproduced, defended, or corrected. It is now
whatever `test/fpmath.test.js` sweeps, and the sweep is defined in that file:
24,000 angles across ±8π for `dsin`/`dcos`/`dtan`, 24,000 ratios for `datan`, and
a 220×220 grid for `datan2`. The digest is committed, so a change in behaviour of
`05-fpmath.js` fails the test on a single engine — which matters, because such a
change invalidates every replay trace recorded under the old build and is a
`SIM_VERSION` bump, not a test edit.

The control is not decoration. Without asserting that the two engines *disagree*
on the built-ins, the test would pass just as happily on two identical engines
and prove nothing about engine independence.

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
7. A signed-out visitor can read the `leaderboard` view and nothing else. The
   base tables are not reachable at all: `scores` is revoked from every client
   role, and `profiles` is revoked from `anon` and scoped to your own row for
   `authenticated`. The view is the boundary, not a suggestion.

That last one was not always true, and the way it failed is worth keeping. The
view was written to project nine columns and deliberately not `user_id` — but
`select` on the base tables was also granted to `anon`, so anyone with the
publishable key could skip the view and read every player's auth id straight out
of `scores`. The projection looked like a boundary and was decoration. Fixing it
needed both halves at once: the view had to stop borrowing the caller's
privileges (`security_invoker = false`) *before* those privileges could be taken
away, or revoking them would simply have emptied the public board.

Display names accept letters in any script — José, Мария, 田中 — and no
character that matters for HTML injection: `< > & " / \` and the rest are
stripped before insert and rejected by a `CHECK` constraint after it. The
constraint is an allowlist, `^[[:alpha:][:digit:] '._-]+$`, deliberately, so
widening it for one alphabet cannot quietly admit a script tag.

Migrations are numbered and must be applied in order. **None of the above is
asserted on trust** — `./test/migrations.sh` applies all fourteen to a throwaway
PostgreSQL 15+ cluster and checks every claim in this section, 41 assertions,
including that `anon` is refused on `profiles`, `scores`, `runs` and
`player_pii`, that a player can rename only themselves, and that the board still
returns rows once all of that is locked down. It needs 15 or later: the view uses
`security_invoker`, which does not exist before it.

That harness paid for itself on its first run by finding that `0010` had never
applied. Indianapolis starts 33 cars, its seed ended on P33, and
`finish_position` was constrained to 32 — so the seed aborted and rolled back,
taking Brands Hatch with it. Two circuits sat at one entry each for days and
nothing reported it, because a migration that was *run* is not a migration that
*worked*. `0014` widened the constraint and rewrote the field.

**What this does not yet do.** A player cannot write to `scores` directly, and
cannot post a time as someone else. A player *can* still call `submit_score()`
with a time they did not drive, because the validator that re-simulates a
submitted trace does not exist yet — the track has to be baked to engine-stable
data first (see the maths section above). Every row therefore lands
`validated = false`, so unvalidated runs can be re-checked and purged once the
validator lands. **The board is not cheat-resistant, and now says so**: it shows
unvalidated runs rather than hiding them — a board that hides everything until a
validator exists is indistinguishable from a broken one — and prints a line
stating that no time on it has been replay-verified.

That line is new, and the reason is worth keeping. This paragraph previously
claimed the board showed unvalidated runs "flagged". It did not: the client
never selected `validated` at all, and nothing drew a marker. The claim stood
until an external audit read it against the code. A per-row flag would still be
the wrong fix while no validator exists, because every row is unvalidated and
fifty identical asterisks carry no information — so the board states the
position once, in one line, driven by the data rather than hard-coded.

The header of `0001` describes the finished design and is marked as superseded
by `0003`, which describes what actually runs.

When that validator is built, the trace it reads must be located from the
authenticated user — never from a key the submitter supplied. `submit_score()`
used to accept one, which would have let a player point an invented time at
somebody else's honest run and have the validator bless it. `0012` closed that
by ignoring the parameter; the note matters because the hole reopens the moment
an upload path is added carelessly.

## Tests

Three suites, 73 assertions, no dependencies to install beyond a PostgreSQL
server. Each exists because this README makes a claim in prose, and a claim
nobody can re-run is not evidence.

```bash
node test/fpmath.test.js    #  3 — cross-engine determinism, and the control
node test/physics.test.js   # 29 — sign conventions, geometry, elevation
./test/migrations.sh        # 41 — 14 migrations applied, security model asserted
```

All three run in CI on every push ([`test.yml`](./.github/workflows/test.yml)).
`migrations.sh` needs **PostgreSQL 15 or later** — the leaderboard view uses
`security_invoker`, which does not exist before it — and refuses to run on 14
rather than let the resulting failures be misread as defects.

What they do not cover: anything that renders. `40-game.js` has 98 references to
`document`, and a browser harness would cost more than it verifies. So the car's
*mesh* leaning correctly is still unverified; the geometry and the roll term
underneath it are not.

Two of these were written after an audit pointed out that the repository asserted
things it could not reproduce, and both earned their place immediately.
`migrations.sh` found that `0010` had never applied and two circuits had been
sitting at one entry each. `fpmath.test.js` replaced a sample count that had been
carried in prose from a harness nobody kept.

Worth saying plainly, since the point of all this is that claims should be
checkable: the first drafts of both files reported failures that were their own
bugs, not the code's — a `set_config` call whose return value contaminated every
comparison, a jitter check that measured Brands Hatch's real gradient, and an
outside-of-corner test whose centroid heuristic only holds for an oval. Each is
described in the file that had it.

## Provenance, in detail

For anyone checking the 58:34 rather than taking it.

**Two root commits, not one lineage.** `e804a8e` (the two-line initial README)
and `42080d9` (the first playable build) are *independent* roots. The game
snapshot is not descended from the README commit; I merged the two unrelated
histories at 18:37.

```bash
git rev-list --max-parents=0 HEAD     # both of these are roots
git merge-base --is-ancestor e804a8e 42080d9 && echo descended || echo unrelated
# unrelated
```

So 58:34 is the interval between two recorded timestamps, not a stopwatch on a
single continuous history. An earlier version of this file quoted
`git log --reverse | head -2`, which lists them in time order and quietly implies
descent. An external audit caught that; the wording above is the correction.

**What git actually proves here:** the contents of each commit, the shape of the
graph, and the timestamps recorded in them. **What it cannot prove:** that no
prototype existed off-repository, that the work was continuous, or which model
and session produced it. Those are my account, and I'd rather label them than
let the word "verified" cover them by association. For the record: no earlier
prototype, no scratch directory, one Claude Code sitting.

**Commit accounting**, since the categories overlap and are easy to double-count:

```
69 reachable commits = 6 merges + 63 non-merge
                       63 non-merge = 54 human + 9 CI rebuilds
```

An earlier version of this README said "63 human, 6 merges, 9 CI rebuilds" —
three figures summing to 78 against a total of 69.

## Licence

The code is **MIT** — see [`LICENSE`](./LICENSE). Take the migrations in
particular: the row-level security in there is a pattern worth reusing, and it
is more useful to you than it is to me.

Two things that licence does **not** cover, stated plainly because a copyright
licence cannot grant either and pretending otherwise would be worse than saying
nothing:

- **Trade marks.** This is an unofficial fan project. The names, liveries,
  colour schemes and circuit names it evokes belong to their owners, and nothing
  here is endorsed by or affiliated with any team, series, circuit or sponsor.
  MIT covers the code that draws a papaya car; it conveys no right to the livery
  it is imitating.
- **The bundled libraries.** three.js and supabase-js are MIT and stay under
  their own notices, reproduced in [`THIRD-PARTY.md`](./THIRD-PARTY.md).
  supabase-js ships minified with no licence header at all, so `dist/index.html`
  carried it unattributed until the build started emitting the notice and
  asserting it — a small licence breach, found by reviewing this repository
  before publishing it, and now a build failure rather than a matter of trust.

There is no third-party media to license: every sound is synthesised at runtime
with Web Audio oscillators rather than sampled, and the only bundled image is a
screenshot of the game.
