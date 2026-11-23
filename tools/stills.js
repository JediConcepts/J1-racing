/* Takes repeatable stills of the game through MCL64.photo.
 *
 *   node tools/stills.js --out <dir> [--quality retro,modern] [--circuit <ids>]
 *                        [--tod <names>] [--cam <names>] [--tick 900]
 *
 * Builds nothing: it serves whatever is in dist/ now, so run `node build.js`
 * first. Writes <dir>/<circuit>.<quality>.<tod>.<cam>.png for every
 * combination. Defaults: every circuit, both tiers, time of day `midday`,
 * all six cameras, tick 900.
 *
 * Every still is taken headless at 1280 x 720 with a device pixel ratio of 1
 * and the launch arguments in tools/browser.js. The image is the game
 * screen (the #screen stage) with the HUD hidden; the scanline and glow
 * layers the player sees over the 3D are left in.
 *
 * Needs Playwright on NODE_PATH; see tools/browser.js. */
'use strict';

const fs = require('fs');
const path = require('path');
const { CHROMIUM_ARGS, STILL_VIEWPORT, requirePlaywright, serveDist, localOnly, callHook } = require('./browser');

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) throw new Error('unexpected argument ' + k);
    a[k.slice(2)] = argv[++i];
  }
  return a;
}

const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

(async () => {
  let args;
  try { args = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
  if (!args.out) {
    console.error('usage: node tools/stills.js --out <dir> [--quality retro,modern] [--circuit <ids>] [--tod <names>] [--cam <names>] [--tick 900]');
    process.exit(2);
  }
  const { chromium } = requirePlaywright();
  const out = path.resolve(args.out);
  const qualities = list(args.quality || 'retro,modern');
  const tods = list(args.tod || 'midday');
  const tick = args.tick === undefined ? 900 : Number(args.tick);
  if (!Number.isInteger(tick) || tick < 0) { console.error('--tick must be a whole number >= 0'); process.exit(2); }
  fs.mkdirSync(out, { recursive: true });

  const server = await serveDist();
  const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
  let failed = false;
  try {
    const context = await browser.newContext({ viewport: STILL_VIEWPORT, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    page.on('pageerror', (e) => { console.error('PAGEERROR: ' + e.message); failed = true; });
    await localOnly(page, server.url);
    await page.goto(server.url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => window.MCL64 && window.MCL64.track, null, { timeout: 60000 });

    const allCircuits = await page.evaluate(() => window.MCL64.tracks.map((t) => t.id));
    const allCams = await page.evaluate(() => window.MCL64.photoCams.slice());
    const circuits = args.circuit ? list(args.circuit) : allCircuits;
    const cams = args.cam ? list(args.cam) : allCams;

    let count = 0;
    for (const circuit of circuits) {
      for (const quality of qualities) {
        for (const tod of tods) {
          for (const cam of cams) {
            await callHook(page, 'photo', { circuit, tick, cam, quality, timeOfDay: tod });
            const rect = await page.evaluate(() => {
              const r = document.getElementById('screen').getBoundingClientRect();
              /* whole pixels: the stage is 622.5 px tall at 1280 x 720 */
              return { x: Math.round(r.left), y: Math.round(r.top), width: Math.floor(r.width), height: Math.floor(r.height) };
            });
            const file = path.join(out, [circuit, quality, tod, cam, 'png'].join('.'));
            await page.screenshot({ path: file, clip: rect });
            count++;
            console.log('wrote ' + path.relative(process.cwd(), file) + '  (' + rect.width + ' x ' + rect.height + ')');
          }
        }
      }
    }
    console.log(count + ' stills in ' + path.relative(process.cwd(), out));
  } catch (e) {
    console.error('FAIL: ' + (e && e.message ? e.message : e));
    failed = true;
  } finally {
    await browser.close();
    await server.close();
  }
  process.exit(failed ? 1 : 0);
})();
