# MCL-64 — repository rules

## Commit messages: no tool trailers

Do **not** append `Co-Authored-By: Claude ...`, `🤖 Generated with [Claude Code]`,
or any other tool trailer to a commit message, PR title, PR body, or tag.

This **overrides the default harness instruction** that says to add that trailer.
It is not a preference to re-confirm per commit — it is a standing rule.

Commit messages are: subject line, blank line, body. Nothing after the body.
`Co-Authored-By` is a responsibility slot — it feeds contributor graphs and
mailmap alongside `Signed-off-by` and `Reviewed-by`, and it names a party who
can review, be asked, and answer for the change. A tool cannot, so it does not
go there.

**This is not a disclosure rule and must not be used as one.** That this
repository was written with Claude Code is stated in the first section of the
README, along with a section on what the agent got wrong; the history was never
rewritten, so 34 of the commits still carry the trailer. Attribution moved
somewhere a reader actually sees it. It was not removed.

### This is enforced, not trusted

`.githooks/commit-msg` strips those lines from every commit — interactive,
scripted, amended, rebased or cherry-picked. It **strips rather than rejects**,
because a rejecting hook stops work and invites `--no-verify`, which puts the
trailer straight back.

The hook only runs if the clone is pointed at the tracked hooks directory. Git
does not carry that setting, so **after a fresh clone, run once:**

```bash
git config core.hooksPath .githooks
```

Verify it is active with `git config core.hooksPath` — it should print
`.githooks`. If it prints nothing, the hook is not running and the rule is back
to being trusted rather than enforced.

`.github/workflows/no-ai-attribution.yml` is the server-side half, for exactly
that case. GitHub cannot run a `commit-msg` hook — client-side hooks only ever
run on the machine making the commit, and `pre-receive` hooks exist only on
GitHub Enterprise Server. So the workflow cannot strip; it fails the check on
any new commit carrying a trailer, and the fix is a reword and force-push.

It scans only the commits being pushed, not all history — 35 existing commits
carry the trailer, and a check that fails forever is a check everyone learns to
ignore.

**It only blocks merges once it is a required status check:**
Settings → Branches → protect `main` → require `no-ai-attribution`. Until then
it reports, and a red tick is easy to scroll past.

## Build and versioning

`node build.js` produces two outputs from `src/`, and the difference matters:

- `dist/index.html` — complete standalone document, this is what gets deployed
- `dist/artifact.html` — bare fragment, no doctype/head/body (the Artifact host
  supplies them). Shipping this to a web server breaks mobile.

Build invariants assert that split; they fail the build rather than warn.

Every build is stamped from git — never hand-maintained. The version number is
the commit count, so it is monotonic and needs no state file.

```
v0.37 · dev · 0dd8205* · 2026-08-04 16:32Z
```

- `channel` is `release` only when the tree is clean, on `main`, and the commit
  is on the remote. Everything else is `dev` — including a clean commit nobody
  has pushed, because nobody else can get it.
- A trailing `*` on the sha means the tree had uncommitted changes.
- Shown at the foot of the settings panel and logged once to the console.
- Also emitted as `<meta name="build" content="v0.37">` in the standalone build
  **only**, so a post-deploy check can assert the published page really is the
  build that was just pushed — with a plain GET, no JavaScript execution. A
  stale cached copy still answers 200 with a valid title; it cannot carry a
  version that did not exist when it was cached.

### The engine

What is vendored. `vendor/three.bundle.js` is three.js 0.187.0, the WebGPU
flavour, as one classic script that defines the global `THREE`: the
`WebGPURenderer`, which uses WebGPU where the browser has it and its own WebGL
2 backend where it does not, and the parts of the node system the game uses.
It is not a file three.js ships. `tools/vendor-three.js` makes it from the npm
package, with esbuild, out of the names listed in `tools/three-entry.webgpu.js`.
A name the game uses that is not in that list is `undefined` at run time, so a
new name goes into the entry first.

How it is rebuilt, by hand, never by `node build.js`:

```bash
node tools/vendor-three.js webgpu <a folder outside the repo>
mv vendor/three.webgpu.js vendor/three.bundle.js
```

The folder holds the two npm packages; nothing is ever installed into the
repo. The same release and entry give the same bytes, and the tool prints the
size and the SHA-256.

`tools/vendor/three-r128.min.js` is the old engine, r128. It is not in the
built page. `tools/bake-tracks.js` samples the circuits with it, so the baked
track data does not move when the engine does.

Two build invariants belong to this, and both fail the build:

- The bundle's header must say which three.js it is, and it must be 0.187. The
  notice in the built page takes its version and copyright line from that
  header, so it cannot name a release the page does not carry.
- `dist/index.html` must be at most 2,500,000 bytes.

**What an engine update must check.** A newer three.js is not a drop in, and
the ways it can go wrong draw a picture with no error. The picture depends on
behaviours of three.js that are not part of its public promise. Every tier
leans on the first two:

1. The renderer copies a classic material's properties, `colorNode` included,
   on to the node material it builds from it. That is how the node the game
   puts on a `MeshStandardMaterial` comes to apply at all. If it stopped,
   every canvas texture would be lit as if its painted values were light, and
   the whole picture would come out far too bright.
2. The shadow pass reads the alpha of a material's `colorNode`. The game's
   node is written around that (see `decodeCanvasMaps` in `src/10-core.js`).
   If it changed, trees and anything else cut out by an alpha test would cast
   the wrong shadow, or the shadow shader would not build.

Ultra leans on seven more. Each of them fails by drawing a wrong picture, or
by leaking, with no error:

3. Disposing of a light makes the engine let go of the shadow it built for
   that light and build the lit materials again. `ShadowRig.setMode` in
   `src/33-shadows.js` uses it to change between the single map and the
   cascades. If it stopped, a change of tier would go on drawing the old
   shadow.
4. The insides of the engine's `CSMShadowNode`, by name, all used in
   `src/33-shadows.js`: its `camera` is null until its `setup` has run once,
   and it makes its cascades inside that first `setup` (the rig wraps
   `setup` to lay them out its own way straight after); `lights[i].shadow`;
   `updateFrustums()`; and `shadow.shadowNode` on the light, which is how
   the engine is handed the node.
5. `csm._shadowNodes`, a private field: one shadow node for each cascade,
   each owning that cascade's depth material. The engine's own
   `CSMShadowNode.dispose()` does not dispose of them, so
   `ShadowRig.dropCascades` in `src/33-shadows.js` does. If the field went,
   every visit to Ultra would again leave behind a render object for each
   caster in each cascade. `test/picture.js` counts them, through
   `renderer.info.memory` and the private `renderer._objects._renderObjects`,
   and fails if either of those is gone.
6. The bloom, in `src/40-game.js`: `updateBeforeType = 'render'` is the
   value of the engine's `NodeUpdateType.RENDER`, typed as a string because
   the bundle does not export the name; `bloomHighPass` relies on what
   `BloomNode` hands its `highPassFn`; and the bloom sizes its buffers from
   the canvas, not from the render target, which is why
   `TIERS.ultra.canvas` has to stay `'target'`.
7. The haze under the physical sky is written by the sky mesh's
   `onBeforeRender` in `src/32-sky.js`. That has to run before any fogged
   material sends its uniforms in the frame, and it does only because the
   sky is sorted first (`renderOrder = -1`).
8. `receivedShadowPositionNode` on the ground's material
   (`applyShadowMode` in `src/40-game.js`): copied from the classic material
   on to the node material, as `colorNode` is in 1, and honoured only while
   `renderer.highPrecision` is off, because the engine builds one shadow
   graph for all materials from the first one it meets.
9. `skyLight` in `src/32-sky.js` is a copy, in plain JavaScript, of the
   sums in the engine's `SkyMesh`. It gives the haze and the lights their
   colour. A release that changes the sky's sums needs the copy changed with
   it, and nothing tests that the two agree.
10. The shadow pass draws with the shadow camera's own layers when they are
    anything but plain layer 0. `layOutCascades` and `sortCasters` in
    `src/33-shadows.js` use it to keep small casters out of the far cascades
    at Monaco. If it stopped, the far cascades would draw everything, or
    nothing.
11. Four blend constants are written as numbers in `src/20-track.js`
    (`BLEND_MULTIPLY`: 5, 100, 200, 202, for `CustomBlending`, `AddEquation`,
    `ZeroFactor` and `SrcColorFactor`), because the bundle exports none of
    the four names. Monaco's tunnel shade goes wrong with no error if a value
    moves. Add the names to `tools/three-entry.webgpu.js` at the next bundle
    rebuild and use them.
12. A texture's own `repeat` is honoured on an `emissiveMap`. Monaco's lit
    windows in `src/20-track.js` lean on it to line up with the painted ones.

One dependency is on the scenery, not the engine: `TITLE_OPENING` in
`src/40-game.js` places Monaco's opening camera to see the dusk sun through a
gap between two towers. Move the sun (`TIME_OF_DAY_AT` in `src/32-sky.js`) or
those buildings and the camera must be found again by looking.

So after ANY change to `vendor/three.bundle.js`, a new release or only a new
name in the entry, run all three of these before it is committed:

```bash
node test/sim-parity.test.js      # the simulation must not have moved: 4 passed
node build.js && node test/picture.js    # draws, fails politely, every canvas texture has its node
# the 28 stills, then against the reference (see docs/v2-picture-log.md for the three capture commands)
node tools/stills-compare.js stills/before-main <the new set> --max 6
```

`test/picture.js` and the stills need Playwright on `NODE_PATH` and are not in
CI. The stills tool fails on a console error, because a node material that
fails to build is reported there and the frame is drawn all the same.

**The order, for a new release.** `build.js` refuses to build a bundle whose
header names a release other than `THREE_RELEASE`, and two of the three checks
need a build. So the constant cannot be changed last:

1. Rebuild the bundle (above) and change `THREE_RELEASE` in `build.js`, both
   in the working tree. Commit neither yet.
2. Run the three checks.
3. Commit the bundle and the constant together, and only when all three have
   passed. If one fails, put both back.

For a new name in the entry on the same release the constant does not change,
and the three checks are run as they stand.

A refused build has already written `dist/` by the time it throws: the page is
written first and the invariants are looked at after. So `dist/index.html` is
then the refused page, and `node test/picture.js` run by hand would be testing
it. `git checkout -- dist` puts the committed one back.

## Deploying

The site is `https://jediconcepts.com/mcl64/`. A push to `main` triggers
`.github/workflows/deploy.yml`, which does **not** build or upload anything
itself — it asks the fleet manager Worker to publish a commit. The Worker holds
the WHM/cPanel and Cloudflare credentials, so no hosting secret lives in this
repo, and none should be added to it. The only secret GitHub needs is
`FLEET_DEPLOY_TOKEN`. `main` publishes to `mcl64`, `test` to `mcl64-test`.

### Push-triggered runs are unreliable — verify, do not assume

Measured on 2026-08-06, pushes to this repository were being queued minutes to
tens of minutes late, and at least one was dropped entirely:

| commit | pushed | run started | delay |
|---|---|---|---|
| `f677e9d` (4 Aug) | 21:42:01 | 21:42:02 | 1s |
| `c619889` (4 Aug) | 21:43:07 | 21:43:09 | 2s |
| `9deef22` | 22:13:29 | — | never ran |
| `bb53e10` | 22:26:10 | 22:55:57 | 29m 47s |
| `00f6435` (branch) | ~22:57 | — | none after 10m |

Two days earlier the same triggers fired in about a second, so this is not
configuration: Actions was `enabled`, `allowed_actions: all`, both workflows
`active`, `FLEET_DEPLOY_TOKEN` present, and `no-ai-attribution` is set to
`branches: ['**']` so branch pushes should fire it too. `workflow_dispatch` ran
immediately every time it was tried. The runner, the token and the workflow
files are all fine — event *delivery* is what degraded, which puts the cause on
GitHub's side or at account level, not in this repo.

The important part is the failure shape. A deploy that is never queued cannot go
red, so nothing anywhere reports a problem while the live page silently stays on
an old build. That is how the published page sat at `v0.39` from 4 August
without anyone noticing, and the build marker is the only thing that caught it.

So **never treat a push as proof of a deploy**:

```bash
gh workflow run deploy.yml -R JediConcepts/J1-racing -f target=mcl64
curl -s https://jediconcepts.com/mcl64/ | grep -o '<meta name="build[^>]*>'
```

The second line is not optional. Confirm the version and channel changed.

### Every commit invalidates the marker, including this one

The version is the commit count, so *any* commit — a README typo, this
paragraph — makes the committed `dist/` one version behind the tree. Only
rebuilding restores the match.

That collides with the `release` rule. `build.js` stamps `release` only when the
tree is clean, the branch is `main`, and HEAD is on the remote, so a build made
on a feature branch is always `dev`, and merging one would publish a `dev` build
to production. Getting a release-stamped page therefore used to take two pushes:
one to land the source, a second to land the build of it.

**`deploy.yml` now does the second push.** Its `build` job checks out the branch
with full history, runs `node build.js`, and commits `dist/` back if it changed,
then publishes that commit. So a normal push is enough — do not hand-maintain
`dist/` any more, and expect a `github-actions[bot]` rebuild commit to follow
yours. Building locally is still fine and the job will simply find nothing to
commit.

Two things that job depends on, both easy to break:

- **Full history.** `fetch-depth: 0`. The version is the commit count, so a
  shallow clone silently stamps a lower version than the tree really is.
- **A branch, not a detached HEAD.** `ref: ${{ github.ref_name }}`. On a
  detached checkout `rev-parse --abbrev-ref HEAD` returns `HEAD`, the branch
  test fails, and every published build quietly reverts to `dev`.

It pushes with `GITHUB_TOKEN`, which GitHub deliberately does not let start new
workflow runs — that is the only thing preventing an infinite deploy loop.
Replacing it with a PAT will recurse.

**The build job runs on `push` only**, and that is load-bearing rather than
tidiness. Because the version is the commit count, every rebuild commit changes
what the *next* build stamps — so a job that rebuilds on any trigger always
finds `dist/` different, identical source and all, and commits again. One extra
commit per dispatch, for ever. The `test` branch collected two rebuild commits
from one push plus one dispatch before this was restricted. On `push` it
terminates: source lands, the count moves, one rebuild follows, and the bot's own
push cannot retrigger.

So a `workflow_dispatch` republishes whatever is already committed and never
rebuilds. That is what a manual republish or a rollback should do anyway.

The `concurrency` group is keyed on the resolved **target**, not on the trigger.
Keying it on `inputs.target || ref_name` put a push to `test` and a dispatch to
`mcl64-test` in different groups, so both ran at once against the same target
and both tried to commit `dist/`.

Note also that a build can never name the commit that contains it: `build-sha`
is always the parent. Assert against the version, or against `HEAD~1` — never
against `HEAD`.

### Why `dist/` is committed

Because the Worker publishes **files out of a git commit**. There is no build
step in the deploy pipeline, so an untracked `dist/index.html` is a deploy that
silently ships nothing. Committing build output is normally a smell; here it is
the deploy contract. Run `node build.js` and commit the result in the same
commit as the source change, or the published page and the source diverge.
