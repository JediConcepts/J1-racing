# MCL-64 — security audit

**Date:** 2026-08-07  **Target:** `https://jediconcepts.com/mcl64/` (build `v0.72`, `59d4f81`, channel `release`)
**Backend:** Supabase project `goqhiuxpinzltzxbjgug`
**Scope:** the live application and everything reachable from it — client, public API, auth, deploy pipeline.

Written to be handed to another developer. Every claim below is either reproduced
with the command that produced it, or explicitly flagged as unverified. Where a
finding is fixed, the fix is named by file. Where it is not, it says so.

---

## 1. How this was tested, and what was NOT done

Testing used only what an attacker already has: the publishable key that ships in
the page. No credentials were used, and no service-role key was obtained or sought.

**Reads only, with two deliberate exceptions**, both in §3.1:

- One anonymous account was created against the live project, to prove
  finding **A1**. It is inert and named below for deletion.
- No score was ever submitted. Authorisation was proven by sending payloads that
  fail *after* the auth gates, so nothing was written to `scores` and the public
  board is unpolluted.

**Not covered by this audit:**

- The fleet-manager Worker itself (`webmgmt-fleet.jamie3640.workers.dev`) — out of
  repository, not reviewed. §3.5 reasons about it only as a trust dependency.
- GitHub repository settings: branch protection, required checks, and the
  membership of anyone who can push. These are the highest-impact controls in the
  whole system (§3.5) and none of them are visible from here.
- Supabase dashboard settings other than what `/auth/v1/settings` discloses —
  in particular the **redirect allow-list**, which matters a great deal (§3.6).
- Email deliverability, mailer rate limits, and Supabase's own OTP throttling.
- The physics/replay code, except where it bears on score forgery.

---

## 2. Summary

> **Update, 2026-08-07, after remediation.** A1 is **closed and re-verified live**
> — see the box at the end of §3.1. Anonymous sign-ins are off at the project and
> `0015` is applied, and both layers are confirmed in the deployed database. The
> only follow-up left on it is deleting the audit's leftover user.
> A2 is merged but **not yet deployed**.
> A3, A4, A6, A7, A8 are unchanged.

| # | Finding | Severity | Status |
|---|---|---|---|
| **A1** | Anonymous sign-ins enabled — free `authenticated` JWTs, board forgeable at zero cost | **High** | **CLOSED** — toggle off + `0015` applied, both re-verified |
| **A2** | No security headers on the live response (no CSP, HSTS, nosniff, frame-ancestors) | **Medium** | Fixed — `deploy/.htaccess` |
| **A3** | Deploy chain is the highest-impact target and its controls are unverified | **Medium–High** | **Open — needs owner action** |
| **A4** | Supabase redirect allow-list unverified, and the auth flow is `implicit` | **Medium** | **Open — needs owner action** |
| **A5** | `handle_new_user` collision loop is O(N) per signup, up to 999 queries | **Low** (availability) | Fixed — `0015` |
| **A6** | `driver_name_available` is an unauthenticated name-enumeration oracle | **Low** | **Accepted** — see §3.7 |
| **A7** | Homograph impersonation on the board | **Low** | **Accepted** — pre-existing, documented in `0011` |
| **A8** | GitHub Actions pinned by tag, not commit SHA | **Low** | **Open** — could not resolve SHAs from here |
| — | Score forgery generally (no replay validator) | Known | Pre-existing and documented in `0003`; A1 is what made it *free* |

**The single most important line in this document:** A1's primary fix was a
dashboard toggle, not code — the migration is only the second layer. That is worth
remembering rather than filing away, because it means **this finding can be
reopened from a web console by anyone with project access, without a commit, a
review, or a CI run.** Nothing in this repository would go red. `0015` exists so
that if it is reopened the board still does not fall over; re-check
`/auth/v1/settings` if the leaderboard ever starts behaving oddly.

---

## 3. Findings

### A1 — Anonymous sign-ins make the leaderboard free to forge · High

`/auth/v1/settings` is public and reports `"anonymous_users": true`.

**Reproduction.** No credentials, no email, no mailer:

```
$ curl -sX POST https://goqhiuxpinzltzxbjgug.supabase.co/auth/v1/signup \
    -H "apikey: sb_publishable_MD1h-WEKI5xqWtLEk_OIOA_T-i77YHW" \
    -H 'Content-Type: application/json' -d '{}'
200
```

Decoded JWT payload:

```json
{ "sub": "e0b8451b-1a07-411a-ba07-4be2d7eac0fe",
  "role": "authenticated", "is_anonymous": true, "email": "" }
```

`authenticated` is exactly the role `0012` grants `EXECUTE` on `submit_score`.

**That the token reaches the write path**, proven without writing a score by
sending payloads that trip checks *after* both authorisation gates:

```
p_track_version = "__audit_probe_not_a_real_track__"
  -> 23514  unknown track_version: __audit_probe_not_a_real_track__
p_race_ms = 1  (on a real circuit)
  -> 22003  implausible race time
```

Neither is `28000 not signed in` nor `23503 no profile for this account`, so the
caller was authenticated *and* already had a profile row. A valid payload inserts.

**That signup auto-provisions a profile:**

```
$ curl "…/rest/v1/profiles?select=user_id,display_name" -H "Authorization: Bearer $ANON_JWT"
[{"user_id":"e0b8451b-…","display_name":"Driver"}]
```

**Impact.** `0003` is honest that an invented time can be posted until the replay
validator exists, and accepts that because an account is needed first. Anonymous
sign-in removes the account. `scores_personal_best` is unique per
`(user_id, track_version)`, so N identities are N *separate* rows, not
replacements — one script takes every visible place on all three boards. It also
grows `auth.users`, `public.profiles` and `private.player_pii` without limit.

Nothing in this repository calls `signInAnonymously` (`git grep -i anonymous -- src`
is empty). It is a setting with no feature behind it.

**A useful detail:** the profile came back as `Driver`, not `Driver1`. The
collision loop would have suffixed it if any anonymous identity had ever existed
before — so **this had not been exploited** as of the audit.

**Fix.**
1. **Do this first — it is the actual fix.** Supabase dashboard →
   Authentication → Sign In / Providers → **Anonymous sign-ins → off**.
2. Shipped: `supabase/migrations/0015_reject_anonymous_identities.sql` rejects any
   JWT carrying `is_anonymous: true` inside `submit_score`, so re-enabling the
   toggle later cannot silently reopen the board. It reads the claim (not
   `auth.users`) to stay consistent with how the function already derives `sub`,
   and **fails open on a missing claim** on purpose — older GoTrue omits
   `is_anonymous`, and treating absent as anonymous would lock out every real
   player on an auth upgrade.

**Residue to clean up.** One inert anonymous user was created to prove this.
Delete with the service role once you have looked at it:

```sql
select u.id, p.display_name, u.created_at
  from auth.users u left join public.profiles p on p.user_id = u.id
 where u.is_anonymous order by u.created_at;
-- expected: exactly one row, e0b8451b-1a07-411a-ba07-4be2d7eac0fe, 'Driver'

delete from auth.users where is_anonymous;   -- cascades to profiles and player_pii
```

If that first query returns **more than one** row, something other than this audit
created them — investigate before deleting.

#### Remediation verified — 2026-08-07

**1. The toggle is off.** `/auth/v1/settings` now reports
`"anonymous_users": false`, and the exact request from the reproduction above is
refused:

```
$ curl -sX POST …/auth/v1/signup -H "apikey: <publishable>" -d '{}'
422 {"error_code":"anonymous_provider_disabled","msg":"Anonymous sign-ins are disabled"}
```

**2. `0015` is applied.** Its ownership confirm query returns:

| proname | owner | proconfig |
|---|---|---|
| `handle_new_user` | `postgres` | `{"search_path=\"\""}` |
| `submit_score` | `score_writer` | `{"search_path=\"\""}` |

Both are correct. `submit_score` kept `score_writer` through the rewrite — that
was the specific risk of redefining the function whole, since `create or replace`
does not re-apply ownership. `handle_new_user` staying on `postgres` is right: it
is the only thing that writes `private.player_pii`, so it has to be privileged,
and `create or replace` preserved its existing owner. Both pin `search_path`.

**3. The guard is in the deployed body.** The other confirm query returns:

| proname | rejects_anonymous |
|---|---|
| `submit_score` | `true` |

So the installed function is the `0015` definition, not a surviving older one —
which matters because `create or replace` would silently leave an earlier body in
place if the migration had half-applied.

**A NOTE FOR WHOEVER VERIFIES THIS NEXT.** The `0015` guard can no longer be
exercised end-to-end against production, because there is now no way to obtain an
anonymous JWT to throw at it — which is the intended outcome, not a gap. Its
evidence is therefore:

- the `prosrc` confirm query in `0015` returning `rejects_anonymous = t` (it
  did — see point 3 above), and
- four assertions in `test/migrations.sh` covering reject-on-true, allow-on-false,
  allow-on-absent, and no-row-written.

Do not conclude the guard is untested because the live probe is unavailable. If
you need a live test, the only honest way is to re-enable the toggle briefly on a
**branch database**, never on production.

---

### A2 — No security headers on the live response · Medium · FIXED

Before: no CSP, no HSTS, no `X-Content-Type-Options`, no frame-ancestors.
`referrer-policy` was Cloudflare's `no-referrer-when-downgrade` default.

This matters more here than on a typical page. The Supabase session lives in
`localStorage`, and the auth flow is `implicit`, which returns the access token in
the URL fragment (`36-cloud.js` explains why, and the reasoning is sound). Both are
readable by any script on the origin, so **script execution on this page is
equivalent to taking over every signed-in account.**

**The XSS sinks themselves are clean** — re-verified for this audit, do not "fix"
them:

- the only `innerHTML` in `src/` is `host.innerHTML = ''` with a constant literal — `src/40-game.js:2396`
- display names render via `textContent` — `src/40-game.js:1507`
- the database rejects `< > & " / \` at `display_name_chars`, in `handle_new_user`,
  and in `driver_name_available` (`0011`)

Headers are depth behind that, not a replacement.

**Fix:** `deploy/.htaccess` now sets CSP, HSTS, nosniff, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy` and COOP.

**The weak part, stated plainly:** `script-src` carries `'unsafe-inline'`. The
build inlines three `<script>` blocks into one self-contained document, so there is
no URL to allowlist. **This CSP does not stop script injection.** What it stops is
what injected script wants to do next — `connect-src` means a stolen token cannot
be POSTed anywhere but Supabase. Removing `'unsafe-inline'` needs per-block sha256
hashes emitted by `build.js` into the header; that is the right follow-up and was
deliberately not bundled into this change.

Two deliberate scope decisions:

- **HSTS has no `includeSubDomains` and no `preload`.** Set from this directory it
  still applies to all of `jediconcepts.com`; either flag would extend a
  hard-to-reverse commitment across sites this repository knows nothing about.
  `max-age` is six months.
- **`Permissions-Policy` does not restrict `accelerometer`, `gyroscope` or
  `fullscreen`.** `35-mobile.js` uses deviceorientation for tilt steering and
  `requestFullscreen` for the cabinet. Disabling those breaks the game on a phone.

**Verified, not assumed.** `test/csp.js` (new) serves `dist/index.html` with the
headers parsed straight out of `deploy/.htaccess` and drives it in Chromium:

```
booted (canvas + webgl + motion): yes
Supabase origin reachable      : yes
off-origin exfil blocked       : yes
unexpected violations          : 0
RESULT: PASS
```

The `connect-src` result is a differential test — the allowed origin produces no
violation, `https://exfil.example.com/steal` produces one and never leaves the
browser. That gives a real verdict without needing live egress.

Note `accounts.google.com` is blocked for `fetch` and this is **correct**:
`signInWithOAuth` is a top-level navigation, not an XHR, and navigation is not
governed by `connect-src`.

**Before trusting this in production**, deploy to `mcl64-test` first and re-check:

```bash
curl -sSI https://jediconcepts.com/mcl64/ | grep -iE 'content-security|strict-transport|x-content-type|referrer|permissions'
```

If anything breaks, rename the directive to `Content-Security-Policy-Report-Only`
rather than deleting the line. That `.htaccess` reaches the live site is already
proven — the `cache-control: public, max-age=0, must-revalidate` rule in it is
visible in the live response.

---

### A3 — The deploy chain is the real crown jewel · Medium–High · OPEN

The highest-impact target is not the database. `private.player_pii` is genuinely
unreachable (§4), so an attacker after data goes looking for the `service_role`
key — and the place that yields far more is the ability to put JavaScript on the
live page, which is every signed-in session plus the ability to rewrite the game.

Trust chain: **push access to `main`** → `deploy.yml` → `FLEET_DEPLOY_TOKEN` →
fleet Worker → cPanel/WHM + Cloudflare credentials.

Keeping hosting secrets in the Worker instead of GitHub is a good decision and
this is not a criticism of it. But it means `FLEET_DEPLOY_TOKEN` and repo write
access are equivalent to the hosting credentials in practice.

**Verify (not visible from here):**

- Is `main` branch-protected at all? `CLAUDE.md` notes `no-ai-attribution` is not
  yet a required status check, which suggests protection may be thin or absent.
- Who can push to `main` and who can run `workflow_dispatch`?
- Is `FLEET_DEPLOY_TOKEN` scoped to publishing only, and is it rotatable?
- Does the Worker authenticate the *commit* as well as the caller?

**Correct as-is, do not change:** the `build` job pushes with `GITHUB_TOKEN`
specifically because GitHub will not start new workflow runs from it. Swapping in
a PAT creates an infinite deploy loop. `deploy.yml` already says this; it is
repeated here because it is exactly the kind of thing a later change breaks.

---

### A4 — Redirect allow-list unverified, with an implicit-flow auth · Medium · OPEN

`36-cloud.js` uses `flowType: 'implicit'` and the reasoning is good — PKCE
routinely fails when a mail app opens the link in its own in-app browser, and the
comment documents that properly.

The consequence is that access tokens arrive in the URL fragment. The control that
contains this is the Supabase **redirect allow-list**, which is not visible from
here. If it is loose — `https://jediconcepts.com/**`, or any wildcard — then any
other page on that host, or any open redirect anywhere on it, becomes a token
exfiltration path.

**Action:** confirm it is pinned to `https://jediconcepts.com/mcl64/` exactly, and
that no wildcard entry remains from development (a `localhost` entry left over from
setup is the usual one).

Also worth noting from `/auth/v1/settings`: `"mailer_autoconfirm": false` — correct.
`"disable_signup": false` — expected, since public signup is the product.

---

### A5 — Unbounded display-name collision loop · Low (availability) · FIXED

`handle_new_user` resolved name collisions by incrementing `1..999`, re-querying
`profiles` each step. The Nth holder of a popular base name cost N sequential
lookups inside the signup trigger, capped at 999.

**This is not anonymous-specific and does not go away with A1's toggle.**
Magic-link signup sends no `given_name`, so every magic-link player who does not
choose a driver name also derives `Driver` and enters the same loop. Anonymous
sign-ins simply made it trivial to drive.

**Fix** (`0015`): five sequential tries — so the pleasant behaviour is kept and the
second `Jamie E.` still becomes `Jamie E.1` — then a jump to an md5-of-user-id
suffix. Bounded at 7 lookups. md5 rather than random so retries differ from each
other but stay stable for a given signup; hex is alphanumeric so it satisfies
`display_name_chars` by construction.

Asserted in `test/migrations.sh` — 40 bulk signups all land, all names unique, all
satisfy the constraint and the length limits, and no runaway numbering.

---

### A6 — Unauthenticated name-enumeration oracle · Low · ACCEPTED

`driver_name_available` is granted to `anon` and answers cleanly:

```
JediJamie          -> false
ZzQqNotARealName1  -> true
```

So anyone can confirm and enumerate driver names without an account, and squat
them. There is no rate limit in front of it.

**Accepted, not fixed, and deliberately so.** The signup form checks name
availability *before* the account exists, so revoking it from `anon` breaks
signup. An availability check is inherently an oracle — the only real mitigations
are rate limiting at the edge (Cloudflare) or dropping live availability feedback,
which is a genuine UX loss for a small gain. Flagged so the next reader knows it
was considered rather than missed.

---

### A7 — Homograph impersonation · Low · ACCEPTED (pre-existing)

The uniqueness index is on `lower(display_name)`, and Cyrillic `е` is not Latin
`e`, so visually identical names coexist and one player can imitate another on the
board. Already documented as a known trade-off in `0011`; repeated here because
combined with A6 it is the cheapest available attack — the oracle tells an
attacker exactly which name to target.

Fixing it properly needs confusable-skeleton normalisation. Not worth it for a
leaderboard, and `0011`'s judgement on that stands.

---

### A8 — Actions pinned by tag, not SHA · Low · OPEN

`actions/checkout@v4`, `actions/setup-node@v4`, `oven-sh/setup-bun@v2`. A repointed
tag executes in your runner. `deploy.yml` limits the blast radius by keeping
`FLEET_DEPLOY_TOKEN` in a job that uses no third-party action, which is good.

**Not fixed here, and honestly:** this session could not reach the GitHub API to
resolve those tags to commit SHAs, and writing unverified SHAs into a workflow
breaks CI. Resolve and pin locally:

```bash
gh api repos/actions/checkout/git/ref/tags/v4   --jq .object.sha
gh api repos/actions/setup-node/git/ref/tags/v4 --jq .object.sha
gh api repos/oven-sh/setup-bun/git/ref/tags/v2  --jq .object.sha
# then:  uses: actions/checkout@<sha>  # v4
```

---

## 4. What is already solid — do not "fix" these

This system is better hardened than most of its size. Verified live, against the
running project:

| Probe | Result |
|---|---|
| `GET /rest/v1/scores` | `401` permission denied |
| `GET /rest/v1/profiles` | `401` permission denied |
| `GET /rest/v1/runs` | `401` permission denied |
| `GET /rest/v1/` (OpenAPI dump) | `401` — schema not disclosed |
| `POST /rest/v1/rpc/submit_score` as `anon` | `401` permission denied |
| `GET /rest/v1/leaderboard` | `200` — public by design, no `user_id` |
| `GET /rest/v1/track_versions` | `200` — public by design |

So `0013` is genuinely applied in production, not merely present in the repository.

- **PII is unreachable.** `private.player_pii` is in a schema PostgREST does not
  expose, with all grants revoked and RLS forced with zero policies. There is no
  API path to it at any privilege below `service_role`.
- **Attribution is derived, never accepted.** `submit_score` takes no `user_id`;
  it reads `sub` from the verified JWT claims. A client cannot post under another
  identity.
- **`score_writer` is minimal** — `NOLOGIN`, not superuser, no `BYPASSRLS`, and its
  visibility is exactly two SELECT policies.
- **Rename is column-scoped** — `grant update (display_name)`, so `user_id` cannot
  be repointed at someone else's scores.
- **Every `SECURITY DEFINER` function pins `search_path`.**
- **`0012` closed the caller-supplied `trace_key` hole** before a validator existed
  to be fooled by it. That was the right call and the reasoning in that file is
  worth reading.

`test/migrations.sh` asserts all of the above against a throwaway cluster.
**51 assertions, 0 failures** after this change — 41 pre-existing plus 10 new.

---

## 5. Changes made in this audit

| File | Change |
|---|---|
| `supabase/migrations/0015_reject_anonymous_identities.sql` | **new** — rejects anonymous JWTs in `submit_score` (A1); bounds the collision loop (A5) |
| `deploy/.htaccess` | CSP, HSTS, nosniff, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP (A2) |
| `test/csp.js` | **new** — drives `dist/` under the real headers in Chromium; asserts the CSP blocks what it should and nothing else |
| `test/migrations.sh` | 10 new assertions covering `0015` |
| `SECURITY-AUDIT.md` | this document |

`src/` is untouched, so `dist/` needs no rebuild for content — only the version
stamp moves, and `deploy.yml` handles that on push.

**Running the checks:**

```bash
./test/migrations.sh          # needs PostgreSQL 15+; must not run as root
node test/csp.js              # needs playwright + chromium; exits 2 if absent
```

`test/csp.js` is deliberately **not** wired into CI: it needs a browser, and a
security check that silently passes on a runner where it could not actually run is
worse than no check.

---

## 6. What to do next, in order

1. ~~**Turn off anonymous sign-ins** in the Supabase dashboard.~~ **DONE** and
   re-verified — `422 anonymous_provider_disabled`. (A1)
2. ~~**Apply `0015`** to the live project.~~ **DONE** — ownership and
   `search_path` confirmed. (A1, A5)
3. ~~**Run the other `0015` confirm query.**~~ **DONE** — returned `true`, so the
   deployed `submit_score` really is the `0015` definition. (A1)
4. **Delete the audit's anonymous user** with the SQL in §3.1, after confirming
   there is exactly one. Still outstanding.
5. **Deploy the headers to `mcl64-test` first**, confirm with the `curl` in §3.2,
   then promote. (A2)
6. **Check the Supabase redirect allow-list** is pinned and carries no wildcard or
   leftover `localhost`. (A4)
7. **Check branch protection on `main`** and who can push. (A3)
8. SHA-pin the actions. (A8)

Longer term, and out of scope here: the replay validator that `0003` and `0012`
are both written in anticipation of. Until it exists a signed-in player can still
post an invented time — A1 restores the cost of getting an identity, but it does
not make the times true. When it lands, `scores.trace_key` must be derived
server-side from the authenticated user and never accepted from a client, for the
reasons `0012` sets out.
