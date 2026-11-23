/* Shared by tools/stills.js, tools/stills-pin-check.js and tools/bench.js:
   find Playwright, serve dist/, the one set of Chromium launch arguments
   every still is taken with, and the pinned Math.random the stills page runs
   on (pinRandom, stills only).

   Nothing is installed into this repo; Playwright is found through
   NODE_PATH. Point it at a node_modules that has it:

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

/* Serves dist/index.html of this repo, or of the dist folder given (the pin
   check serves a build made somewhere else). */
function serveDist(dir) {
  const file = dir ? path.join(path.resolve(dir), 'index.html') : DIST;
  if (!fs.existsSync(file)) {
    console.error('FATAL: ' + (dir ? file : 'dist/index.html') + ' missing. Run `node build.js` first.');
    process.exit(2);
  }
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(file));
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

/* Pins Math.random in every page of the context, for tools that take
   pictures. It is installed before any page script runs and again on every
   load, a reload for a change of circuit included.

   What is pinned. Math.random becomes one fixed generator (mulberry32 from a
   constant seed), and the generator is started again from that seed every
   time a canvas is asked for a 2D context: getContext is wrapped on
   HTMLCanvasElement and on OffscreenCanvas, for the '2d' type only, and a
   call counts whether it is the first on that canvas or a later one. The
   game's own code only draws on HTMLCanvasElement; the vendored three.js
   makes an OffscreenCanvas of its own, so both are wrapped and there is one
   rule.

   Why pin at all. makeBuildingTex in src/10-core.js draws the three Monaco
   building textures with Math.random (the noise specks, and which windows
   are left out), so in the live game Monaco's buildings are different on
   every page load and two stills of the same frame did not match. The game
   is left as it is, because what is live is the reference picture; the
   tools pin it instead. Nothing in the simulation reads Math.random, and
   the only other use in src/ is audio noise, so the other circuits' stills
   do not move.

   Why start again at every 2D context. The vendored three.js draws four
   values from Math.random for every UUID it makes, and it makes one for
   every geometry, material, texture and object. With a single stream for
   the whole page the building textures started at a point that depended on
   how many of those the engine had built before them. One more object early
   in boot, or a newer three.js, and Monaco rolled different buildings
   although their code had not changed. A canvas texture asks for its 2D
   context just before it draws, so starting the stream there gives it the
   same values whatever was built first. tools/stills-pin-check.js is the
   proof, and can be run again.

   The cost, accepted. Canvas textures that used to differ only by their
   random draws now share one pattern: the three Monaco building textures
   have the same specks and the same missing windows, and differ only in
   their two colours. So a Monaco still shows one fixed set of buildings,
   and not a set a player can be dealt. The UUIDs three.js makes also repeat
   in a pinned page (the first one made after each 2D context gets the same
   four values). The vendored three.js reads them only for JSON export,
   loading and animation bindings, none of which the game uses; a newer
   three.js has to be checked for that again.

   tools/bench.js must not call this: it measures the game as players get
   it.

   CHANGING THE SEED, THE GENERATOR OR THE RULE FOR STARTING AGAIN
   INVALIDATES EVERY EARLIER STILL, the same as the launch arguments above.
   Today the Monaco stills are the ones that would move. */
async function pinRandom(context) {
  await context.addInitScript(() => {
    const SEED = 0x4d434c36;
    let s = SEED;
    Math.random = function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const startAgainOn2d = (proto) => {
      const getContext = proto.getContext;
      proto.getContext = function (type) {
        const ctx = getContext.apply(this, arguments);
        if (type === '2d' && ctx) s = SEED;
        return ctx;
      };
    };
    startAgainOn2d(HTMLCanvasElement.prototype);
    if (typeof OffscreenCanvas !== 'undefined') startAgainOn2d(OffscreenCanvas.prototype);
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

module.exports = { ROOT, CHROMIUM_ARGS, STILL_VIEWPORT, requirePlaywright, serveDist, localOnly, pinRandom, callHook };
