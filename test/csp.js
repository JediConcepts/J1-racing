/* Serves dist/index.html with the exact header set from deploy/.htaccess and
   loads it in Chromium, asserting that the CSP blocks what it should and
   nothing else.
 *
 *   node test/csp.js
 *
 * NOT WIRED INTO CI, deliberately: it needs Playwright and a Chromium, and a
 * security check that silently passes on a runner where it could not actually
 * run is worse than no check. It exits 2 when it cannot run, like
 * test/migrations.sh does for a missing PostgreSQL.
 *
 *   npm i -D playwright && npx playwright install chromium
 *
 * WHY IT EXISTS: a too-strict CSP is a worse outcome than no CSP. It fails in
 * the player's browser, at runtime, and nothing server-side goes red — and
 * 36-cloud.js swallows network failures by design, so a connect-src that
 * blocks Supabase shows up as a permanently empty leaderboard and no error.
 * The header is only safe to ship because this asserts both halves:
 *
 *   1. the game boots with zero unexpected violations, and
 *   2. connect-src ALLOWS the Supabase origin and BLOCKS everything else.
 *
 * Point 2 is a differential test rather than a live fetch, on purpose — see
 * the comment at the probe. It gives a real verdict on a sandboxed or offline
 * machine, where "the request succeeded" is not available to be observed. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error('FATAL: playwright not installed. npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const DIST = path.join(ROOT, 'dist/index.html');
if (!fs.existsSync(DIST)) {
  console.error('FATAL: dist/index.html missing. Run `node build.js` first.');
  process.exit(2);
}

const HTACCESS = fs.readFileSync(path.join(ROOT, 'deploy/.htaccess'), 'utf8');

/* Parse the headers straight out of .htaccess rather than retyping them, so
   this cannot drift from what actually ships. */
const HEADERS = {};
for (const m of HTACCESS.matchAll(/^\s*Header always set (\S+) "([^"]*)"/gm)) {
  HEADERS[m[1]] = m[2];
}
console.log('headers parsed from deploy/.htaccess:');
for (const k of Object.keys(HEADERS)) console.log('  ' + k);
if (!HEADERS['Content-Security-Policy']) { console.error('FATAL: no CSP parsed'); process.exit(2); }

/* The allowed origin comes out of the CSP being tested, not a literal — a
   hardcoded project ref here would keep passing after the real one changed. */
const SUPA = (HEADERS['Content-Security-Policy'].match(/https:\/\/[a-z0-9]+\.supabase\.co/) || [])[0];
if (!SUPA) { console.error('FATAL: no supabase origin in connect-src'); process.exit(2); }
console.log('  connect-src allows: ' + SUPA);

const html = fs.readFileSync(DIST);
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/share.png')) {
    res.writeHead(200, { 'Content-Type': 'image/png', ...HEADERS });
    return res.end(fs.readFileSync(path.join(ROOT, 'deploy/share.png')));
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...HEADERS });
  res.end(html);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  console.log('\nserving ' + url + '\n');

  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();

  const violations = [];
  const errors = [];
  const failedReq = [];

  /* securitypolicyviolation is the authoritative signal — console text is
     localised and format-unstable, so it is a bad thing to assert on. */
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => {
      window.__csp.push({
        directive: e.violatedDirective,
        blocked: e.blockedURI,
        line: e.lineNumber
      });
    });
  });

  const supabaseCalls = [];
  page.on('response', async r => {
    if (r.url().includes('supabase.co')) {
      supabaseCalls.push(r.status() + ' ' + r.url().replace(/^https:\/\/[^/]+/, '').slice(0, 110));
    }
  });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', r => failedReq.push(r.url().slice(0, 90) + ' — ' + (r.failure() || {}).errorText));

  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  /* The game boots on rAF and the board fetch is async; give both a moment. */
  await page.waitForTimeout(9000);

  /* Did the thing actually start? "No errors" is not evidence — a game that
     never booted also throws nothing.
   *
   * NOT BY SAMPLING PIXELS. The obvious check is to drawImage the canvas and
   * count lit ones, and it is wrong: three.js does not set
   * preserveDrawingBuffer, so reading a WebGL canvas back outside its frame
   * yields a blank image. That reported "0 lit samples" on a run whose
   * screenshot showed the game rendering perfectly, which is a false alarm on
   * exactly the check meant to catch a silent failure.
   *
   * rAF COUNTING DOES NOT WORK EITHER, for the same class of reason: headless
   * Chromium has no compositor driving vsync and throttles requestAnimationFrame
   * to a few callbacks a second no matter how healthy the game is. Measured at
   * 3-4/s on a run whose screenshot was a perfectly rendered grid.
   *
   * What does work is two screenshots a second apart. Playwright's capture
   * forces a real frame, so if the bytes differ the render loop is genuinely
   * turning — no instrumentation the headless environment can throttle. */
  const probe = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return {
      canvas: !!c,
      size: c ? c.width + 'x' + c.height : null,
      webglContext: !!(c && (c.getContext('webgl2') || c.getContext('webgl'))),
      build: (window.MCL64_BUILD || {}).version || null,
      cloudConfigured: !!(window.MCL64_CLOUD && window.MCL64_CLOUD.url)
    };
  });

  const shotA = await page.screenshot({ path: '/tmp/mcl64-csp-boot.png' });
  await page.waitForTimeout(1200);
  const shotB = await page.screenshot();
  probe.framesAdvancing = !shotA.equals(shotB);

  /* Open the board, which is the one screen that makes the client talk to
     Supabase at all — nothing else in a cold boot touches the network.
     On a machine with real egress the rows below should be non-empty; in a
     sandbox they will not be, which is why the verdict rests on the
     differential probe further down and not on this.

     #btn-board, not text=LEADERBOARD: the hidden <h2 id="board-title"> also
     reads "GLOBAL LEADERBOARD", a text locator matches that first, and the
     click then silently no-ops on a hidden node. That is exactly how this
     check first reported a connect-src failure that was not happening. */
  const btn = page.locator('#btn-board');
  const boardOpened = await btn.count() > 0;
  if (!boardOpened) console.log('  !! #btn-board absent — cloud UI never enabled, board untested');
  else {
    await btn.click({ timeout: 10000 });
    await page.waitForTimeout(7000);
  }
  await page.screenshot({ path: '/tmp/mcl64-csp-board.png' });

  const board = await page.evaluate(() => ({
    rows: document.querySelectorAll('.brow').length,
    names: Array.from(document.querySelectorAll('.brow .bname')).slice(0, 4).map(n => n.textContent)
  }));

  /* DIFFERENTIAL PROOF for connect-src, which does not need real egress and is
     the stronger test anyway. This sandbox has no direct route to supabase.co
     (the real fetch above dies ERR_CONNECTION_RESET at the proxy), so "it
     worked" is unavailable here. But the security claim is not "the network is
     up" — it is "the allowed origin is allowed and every other origin is not".
     That is decidable purely from whether a CSP violation fires: a blocked
     fetch never reaches the network stack at all.

     Expected: the Supabase origin produces a network error and NO violation.
     The attacker origin produces a violation and never leaves the browser. */
  const differential = await page.evaluate(async (supa) => {
    const seen = [];
    const onV = e => seen.push({ blocked: e.blockedURI, directive: e.violatedDirective });
    document.addEventListener('securitypolicyviolation', onV);
    const probe = async (url) => {
      const before = seen.length;
      let netErr = null;
      try { await fetch(url, { mode: 'cors' }); } catch (e) { netErr = e.name; }
      await new Promise(r => setTimeout(r, 250));
      return { url, cspBlocked: seen.length > before, netErr };
    };
    const out = [];
    out.push(await probe(supa + '/rest/v1/track_versions?select=id'));
    out.push(await probe('https://exfil.example.com/steal'));
    out.push(await probe('https://accounts.google.com/'));
    document.removeEventListener('securitypolicyviolation', onV);
    return out;
  }, SUPA);

  violations.push(...await page.evaluate(() => window.__csp || []));
  /* The differential test deliberately triggers violations; they are the
     expected result, not a defect, so keep them out of the pass/fail count. */
  const realViolations = violations.filter(v =>
    !/exfil\.example\.com|accounts\.google\.com/.test(v.blocked || ''));


  console.log('--- runtime probe ---');
  console.log(JSON.stringify(probe, null, 2));
  console.log('--- leaderboard under CSP (connect-src) ---');
  console.log(JSON.stringify(board));
  if (boardOpened && board.rows === 0) {
    console.log('  !! board opened but returned no rows — connect-src is likely blocking Supabase');
  }
  console.log('--- Supabase requests that completed under the CSP: ' + supabaseCalls.length + ' ---');
  supabaseCalls.forEach(c => console.log('  ' + c));
  console.log('--- connect-src differential ---');
  differential.forEach(d => console.log(
    '  ' + (d.cspBlocked ? 'CSP-BLOCKED ' : 'CSP-ALLOWED ') + d.url.slice(0, 70) +
    (d.netErr ? '  (network: ' + d.netErr + ')' : '')));
  console.log('\n--- unexpected CSP violations: ' + realViolations.length + ' ---');
  realViolations.forEach(v => console.log('  ' + v.directive + ' blocked ' + v.blocked + ' (line ' + v.line + ')'));
  console.log('\n--- console errors: ' + errors.length + ' ---');
  errors.slice(0, 15).forEach(e => console.log('  ' + e.slice(0, 200)));
  console.log('\n--- failed requests: ' + failedReq.length + ' ---');
  failedReq.slice(0, 10).forEach(e => console.log('  ' + e));

  await browser.close();
  server.close();
  const booted = probe.canvas && probe.webglContext && probe.framesAdvancing;
  const supaOk = differential[0] && !differential[0].cspBlocked;
  const exfilBlocked = differential[1] && differential[1].cspBlocked;
  const ok = realViolations.length === 0 && supaOk && exfilBlocked && booted;
  console.log('\n  booted (canvas + webgl + motion): ' + (booted ? 'yes' : 'NO'));
  console.log('  Supabase origin reachable      : ' + (supaOk ? 'yes' : 'NO — connect-src too tight'));
  console.log('  off-origin exfil blocked       : ' + (exfilBlocked ? 'yes' : 'NO — connect-src too loose'));
  console.log('  unexpected violations          : ' + realViolations.length);
  console.log('\nRESULT: ' + (ok
    ? 'PASS — game boots clean, Supabase origin allowed, off-origin exfil blocked'
    : 'FAIL — see above'));
  console.log('screenshots: /tmp/mcl64-csp-boot.png /tmp/mcl64-csp-board.png');
  process.exit(ok ? 0 : 1);
})();
