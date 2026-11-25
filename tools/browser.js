/* Shared by tools/stills.js, tools/stills-pin-check.js, tools/bench.js and
   test/picture.js: find Playwright, serve dist/, the one set of Chromium
   launch arguments every still is taken with, and what a still is: the
   context it is taken in (STILL_CONTEXT), the part of the page it shows
   (stillClip), the pinned Math.random its page runs on (pinRandom) and the
   watch on its console (watchPage). The first three of those four are for
   stills only; the bench watches its console too. And the page a tool
   starts from (startFrom), which the stills and the bench share.

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

/* The browser context every still is taken in, whole, so that the stills
   tool and the pin check cannot come to differ in it: the viewport above, a
   device pixel ratio of 1, and motion left on (the page reads the reduced
   motion setting, and a still must not depend on the machine's). The same
   contract again: a change here invalidates every earlier still. */
const STILL_CONTEXT = { viewport: STILL_VIEWPORT, deviceScaleFactor: 1, reducedMotion: 'no-preference' };

/* The part of the page a still is: the game screen (#screen), in whole
   pixels. The stage is 607.5 px tall at 1280 x 720, so a still is 607. */
function stillClip(page) {
  return page.evaluate(() => {
    const r = document.getElementById('screen').getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), width: Math.floor(r.width), height: Math.floor(r.height) };
  });
}

function requirePlaywright() {
  try {
    return require('playwright');
  } catch (e) {
    console.error('FATAL: playwright not found. Set NODE_PATH to a folder holding playwright (the node_modules it was installed into), then run this again: node ' + path.relative(ROOT, process.argv[1]));
    process.exit(2);
  }
}

/* The index.html a dist folder holds: this repo's, or the folder given. */
function distFile(dir) {
  return dir ? path.join(path.resolve(dir), 'index.html') : DIST;
}

/* Serves dist/index.html of this repo, or of the dist folder given (the pin
   check serves a build made somewhere else). */
function serveDist(dir) {
  const file = distFile(dir);
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
   four values). r128 read them only for JSON export, loading and animation
   bindings, none of which the game uses. three.js 0.187 does more with
   them: a node's UUID is made the first time it is asked for, and it is
   what a shader build tells its nodes apart by, so two nodes of one shader
   can be dealt the same UUID if a 2D context is made between two shader
   builds. A page that only takes stills makes no 2D context after boot and
   is not affected: stills of the three older circuits, pinned and not
   pinned, are the same byte for byte on both backends, shown again after
   the game gained nodes of its own (docs/v2-picture-log.md, "B3"). A tool
   that pins AND makes a 2D context in its page after boot is at risk, and
   the console is where it would show (watchPage, below). A newer three.js
   has to be checked for all of this again.

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

/* THE PAGE A TOOL STARTS FROM. A tool's browser has nothing saved, so the
   first page it loads is the one a new player is given, built and thrown
   away before the first hook is called. Until 24 Nov 2026 that was Modern at
   Silverstone at midday. Since then it is Ultra at dusk at Monaco: the
   heaviest page the game has, which the software rasteriser takes many
   seconds over, and whose console would fail a run of Retro stills that
   never asked for it. A tool must not lean on what a new player is given.

   So a tool saves settings of its own before the first load, as a player
   who had picked them would have: the same Modern at Silverstone at midday
   it always started from, so nothing a tool measured before has moved.
   Every hook still names its own circuit, tier and hour.

   Saved once for the context, and not again on a reload: a hook changes
   circuit by saving its choice and reloading the page, and has to find what
   it saved. The key is the one this build keeps its settings under
   (SETTINGS_KEY in src/38-tiers.js), and `defaults` and `tierChosen` are
   what it writes for settings saved since the defaults changed and a tier
   the player picked. */
const TOOL_START = { quality: 'modern', tierChosen: true, timeOfDay: 'midday', trackId: 'silverstone-v1', defaults: 2 };
async function startFrom(context) {
  await context.addInitScript((saved) => {
    if (sessionStorage.getItem('tool.started')) return;
    sessionStorage.setItem('tool.started', '1');
    localStorage.setItem('mcl64.settings.v2', saved);
  }, JSON.stringify(TOOL_START));
}

/* The warnings a healthy stills page prints, by exact text. Every other
   warning fails the run (see watchPage), so each one here says why it is
   not a fault. Two things are taken off a message before it is compared,
   because the browser adds them and they differ from run to run: the
   address of the context at the front of a driver message, and the note at
   the end that the message will not be repeated.

   The first three come on every run, because of where a still is taken. */
const KNOWN_WARNINGS = [
  /* Chromium's own answer when the page asks for a WebGPU adapter and the
     headless SwiftShader browser has none. It is the reason every still
     shows the WebGL 2 fallback. */
  'No available adapters.',
  /* The engine saying it has taken that fallback by itself. */
  'THREE.WebGPURenderer: WebGPU is not available, running under WebGL2 backend.',
  /* The driver, each time a screenshot reads the canvas back. It is the
     still being taken, not the game. */
  'GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels',
  /* The next two come now and then as a page goes away, at the end of a run
     or when a change of circuit reloads the page: the browser is taking the
     old page's WebGL context down and says so. They were there on r128 as
     well (the first is in an r128 capture of the engine move's fix round 1),
     and the stills of a run that printed them are the same files, byte for
     byte, as those of a run that did not. A context lost while the game is
     running is another matter: the engine reports that as an error, and an
     error always fails the run. */
  'WebGL: CONTEXT_LOST_WEBGL: loseContext: context lost',
  'A valid external Instance reference no longer exists.'
];

/* Watches a page for anything that says the picture may be wrong, and hands
   each one to `report` as a line of text: a page error, a console error, or
   a console warning that is not in KNOWN_WARNINGS.

   The stills tool gives `report` alone, and all three fail its run. The
   bench gives `note` as well, and an unknown warning then goes there and
   not to `report`: KNOWN_WARNINGS is the list of a headless stills page,
   and the bench runs headed on a real GPU, whose driver has warnings of its
   own that say nothing about the frame. An error is an error on either.

   WHY THE CONSOLE AND NOT ONLY PAGE ERRORS. A node material that fails to
   build does not throw. The engine writes the failure on the console and
   goes on drawing, with that material missing or wrong, so a tool that
   listened for page errors alone would write the still and exit 0. That is
   exactly the fault a still exists to catch. An unknown warning fails too,
   because the engine reports some of its problems at that level and a new
   one should be read by a person once, and then either fixed or added
   above with its reason. */
function watchPage(page, report, note) {
  page.on('pageerror', (e) => report('PAGEERROR: ' + e.message));
  page.on('console', (m) => {
    const type = m.type();
    if (type !== 'error' && type !== 'warning') return;
    const text = m.text();
    const plain = text.replace(/^\[\.WebGL-0x[0-9a-f]+\]\s*/, '').replace(/ \(this message will no longer repeat\)$/, '');
    if (type === 'warning' && KNOWN_WARNINGS.indexOf(plain) >= 0) return;
    (type === 'warning' && note ? note : report)('CONSOLE ' + type.toUpperCase() + ': ' + text.split('\n')[0]);
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

module.exports = { ROOT, CHROMIUM_ARGS, STILL_VIEWPORT, STILL_CONTEXT, TOOL_START, stillClip, watchPage, requirePlaywright, distFile, serveDist, localOnly, pinRandom, startFrom, callHook };
