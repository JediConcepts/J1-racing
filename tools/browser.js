/* Shared by tools/stills.js and tools/bench.js: find Playwright, serve dist/,
   and the one set of Chromium launch arguments every still is taken with.

   Playwright is never installed in this repo (it has no package.json and
   must not gain one). Point NODE_PATH at a node_modules that has it:

     NODE_PATH=/path/to/node_modules node tools/stills.js ...

   The server is the same idea as test/csp.js: a plain http server over
   dist/index.html on 127.0.0.1 and a random port. It reads the file on every
   request, so a rebuild is picked up without restarting anything. */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist/index.html');

/* CHANGING ANY OF THESE INVALIDATES EVERY EARLIER STILL. The rasteriser is
   pinned to SwiftShader so a still does not depend on whichever GPU the
   machine happens to have; a different flag here is a different renderer,
   and a comparison across the change measures the flag, not the game. */
const CHROMIUM_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'];

/* The viewport every still is taken at. Also part of the contract above. */
const STILL_VIEWPORT = { width: 1280, height: 720 };

function requirePlaywright() {
  try {
    return require('playwright');
  } catch (e) {
    console.error('FATAL: playwright not found. Set NODE_PATH to a folder holding playwright (the node_modules it was installed into), then run this again: node ' + path.relative(ROOT, process.argv[1]));
    process.exit(2);
  }
}

function serveDist() {
  if (!fs.existsSync(DIST)) {
    console.error('FATAL: dist/index.html missing. Run `node build.js` first.');
    process.exit(2);
  }
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(DIST));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const url = 'http://127.0.0.1:' + server.address().port + '/';
      resolve({ url, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

/* Only the local server is reachable. The page's leaderboard calls would
   otherwise go out to the network and come back at a time that depends on
   the network, which is the opposite of what a repeatable picture needs. */
async function localOnly(page, url) {
  await page.route('**/*', (route) => {
    if (route.request().url().startsWith(url)) return route.continue();
    return route.abort();
  });
}

/* Calls MCL64[method](opts) and returns its result. A hook asked for a
   circuit that is not loaded saves the choice and reloads the page, and its
   promise rejects (or the page goes away under it); in either case wait for
   the circuit to come up and call it once more. */
async function callHook(page, method, opts) {
  const run = () => page.evaluate(([m, o]) => window.MCL64[m](o), [method, opts]);
  await waitForGame(page, null);
  try {
    return await run();
  } catch (e) {
    if (!opts.circuit) throw e;
    await waitForGame(page, opts.circuit);
    return await run();
  }
}

/* Polls rather than using waitForFunction, because the page may be torn down
   by a reload in the middle of the wait, and a poll simply tries again. */
async function waitForGame(page, circuit) {
  const until = Date.now() + 60000;
  for (;;) {
    try {
      const ok = await page.evaluate((id) => !!(window.MCL64 && window.MCL64.track &&
        (!id || window.MCL64.track.def.id === id)), circuit);
      if (ok) return;
    } catch (e) { /* the page is navigating; try again */ }
    if (Date.now() > until) throw new Error('the game did not come up' + (circuit ? ' on ' + circuit : ''));
    await new Promise((r) => setTimeout(r, 200));
  }
}

module.exports = { ROOT, CHROMIUM_ARGS, STILL_VIEWPORT, requirePlaywright, serveDist, localOnly, callHook };
