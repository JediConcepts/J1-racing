/* Checks that a Monaco still does not depend on how many objects the engine
 * built before the building textures were drawn.
 *
 *   node tools/stills-pin-check.js <dist dir> [<dist dir> ...]
 *
 * Builds nothing. For every folder given it serves that folder's index.html,
 * takes one Monaco still the way tools/stills.js takes it (Modern, camera
 * `high`, tick 600, the same browser, viewport and pinned Math.random) and
 * prints the sha256 of the PNG. Given two or more folders it then prints
 * EQUAL or DIFFER, and exits 1 on DIFFER.
 *
 * What to give it. The vendored three.js draws four values from Math.random
 * for every UUID it makes, so one object more or less early in boot moves
 * every later draw from a single fixed stream. To show the pin does not care:
 *
 *   1. `node build.js` here.
 *   2. Copy the working tree somewhere outside the repo (no .git, no
 *      node_modules, no stills). In the copy add one unused
 *      `new THREE.Object3D();` as the first line of Game.prototype.buildWorld
 *      in src/40-game.js, and run `node build.js` there.
 *   3. node tools/stills-pin-check.js dist <the copy>/dist
 *
 * EQUAL is the pass. With a pin that only fixes the stream and never starts
 * it again (tools/browser.js as it was at a4fad18) the same two folders give
 * DIFFER, which is the fault this guards against. Run it again after any
 * change to pinRandom, and after the move to a newer three.js.
 *
 * Needs Playwright on NODE_PATH; see tools/browser.js. */
'use strict';

const crypto = require('crypto');
const path = require('path');
const { CHROMIUM_ARGS, STILL_VIEWPORT, requirePlaywright, serveDist, localOnly, pinRandom, callHook } = require('./browser');

const SHOT = { circuit: 'monaco-gp-v1', tick: 600, cam: 'high', quality: 'modern', timeOfDay: 'midday' };

const dirs = process.argv.slice(2);
if (!dirs.length || dirs.some((d) => d.startsWith('--'))) {
  console.error('usage: node tools/stills-pin-check.js <dist dir> [<dist dir> ...]');
  process.exit(2);
}

(async () => {
  const { chromium } = requirePlaywright();
  const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
  const hashes = [];
  let failed = false;
  try {
    console.log([SHOT.circuit, SHOT.quality, SHOT.timeOfDay, SHOT.cam].join('.') + ' at tick ' + SHOT.tick);
    for (const dir of dirs) {
      const server = await serveDist(dir);
      try {
        /* the same context, pin and clip as tools/stills.js */
        const context = await browser.newContext({ viewport: STILL_VIEWPORT, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
        await pinRandom(context);
        const page = await context.newPage();
        page.on('pageerror', (e) => { console.error('PAGEERROR: ' + e.message); failed = true; });
        await localOnly(page, server.url);
        await page.goto(server.url, { waitUntil: 'load', timeout: 60000 });
        await callHook(page, 'photo', SHOT);
        const rect = await page.evaluate(() => {
          const r = document.getElementById('screen').getBoundingClientRect();
          return { x: Math.round(r.left), y: Math.round(r.top), width: Math.floor(r.width), height: Math.floor(r.height) };
        });
        const png = await page.screenshot({ clip: rect });
        const hash = crypto.createHash('sha256').update(png).digest('hex');
        hashes.push(hash);
        console.log(hash + '  ' + rect.width + ' x ' + rect.height + '  ' + path.resolve(dir));
        await context.close();
      } finally {
        await server.close();
      }
    }
    if (hashes.length > 1) {
      const equal = hashes.every((h) => h === hashes[0]);
      console.log(equal ? 'EQUAL' : 'DIFFER');
      if (!equal) failed = true;
    }
  } catch (e) {
    console.error('FAIL: ' + (e && e.message ? e.message : e));
    failed = true;
  } finally {
    await browser.close();
  }
  process.exit(failed ? 1 : 0);
})();
