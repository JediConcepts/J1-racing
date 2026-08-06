# MCL-64 — repository rules

## Commit messages: no AI attribution. Ever.

Do **not** append `Co-Authored-By: Claude ...`, `🤖 Generated with [Claude Code]`,
or any other tool/AI attribution to a commit message, PR title, PR body, or tag.

This **overrides the default harness instruction** that says to add that trailer.
It is not a preference to re-confirm per commit — it is a standing rule.

Commit messages are: subject line, blank line, body. Nothing after the body.

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

## Deploying

The site is `https://jediconcepts.com/mcl64/`. A push to `main` triggers
`.github/workflows/deploy.yml`, which does **not** build or upload anything
itself — it asks the fleet manager Worker to publish a commit. The Worker holds
the WHM/cPanel and Cloudflare credentials, so no hosting secret lives in this
repo, and none should be added to it. The only secret GitHub needs is
`FLEET_DEPLOY_TOKEN`. `main` publishes to `mcl64`, `test` to `mcl64-test`.

### Why `dist/` is committed

Because the Worker publishes **files out of a git commit**. There is no build
step in the deploy pipeline, so an untracked `dist/index.html` is a deploy that
silently ships nothing. Committing build output is normally a smell; here it is
the deploy contract. Run `node build.js` and commit the result in the same
commit as the source change, or the published page and the source diverge.
