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
 * Every still is taken headless in a 1280 x 720 viewport with a device pixel
 * ratio of 1 and the launch arguments in tools/browser.js. The image is the
 * game screen (the #screen stage: the viewport less the page's control bar,
 * so shorter than 720; the size is printed for each still) and the game
 * picture only: the hook hides the HUD and the page's scanline and glow
 * layers for the photo frame, so a still measures the renderer and nothing
 * the page lays over it.
 *
 * Math.random is pinned in the page (pinRandom in tools/browser.js): one
 * fixed stream, started again every time a canvas is asked for a 2D context.
 * Monaco's building textures are drawn with Math.random, so in the live game
 * they differ on every page load; a still shows one fixed set of them, the
 * same one every time, in which the three textures share one pattern.
 *
 * The run fails (exit 1) on a page error, on a console error and on any
 * console warning the tool does not know by its exact text: a material that
 * fails to build is reported on the console and the picture is drawn all the
 * same, so a quiet run is part of what makes a still worth comparing. The
 * warnings it knows, and why each is harmless, are in tools/browser.js.
 *
 * A camera that a circuit cannot place (stands at Monaco, which has no main
 * grandstand) is skipped there, with a line saying so. A run that takes no
 * still at all is an error; a circuit left with none in a run that took
 * others is not.
 *
 * Needs Playwright on NODE_PATH; see tools/browser.js. */
'use strict';

const fs = require('fs');
const path = require('path');
const { CHROMIUM_ARGS, STILL_CONTEXT, stillClip, watchPage, requirePlaywright, serveDist, localOnly, pinRandom, callHook } = require('./browser');

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
    const context = await browser.newContext(STILL_CONTEXT);
    /* before the page exists, so it is in place for the very first script */
    await pinRandom(context);
    const page = await context.newPage();
    /* A page error, a console error or an unknown console warning fails the
       run: the engine reports a material that would not build on the
       console and draws the frame anyway (watchPage in tools/browser.js).
       The stills already written stay on disk; the exit code says not to
       trust them. */
    watchPage(page, (line) => { console.error(line); failed = true; });
    await localOnly(page, server.url);
    await page.goto(server.url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => window.MCL64 && window.MCL64.track, null, { timeout: 60000 });

    const allCircuits = await page.evaluate(() => window.MCL64.tracks.map((t) => t.id));
    const allCams = await page.evaluate(() => window.MCL64.photoCams.slice());
    const circuits = args.circuit ? list(args.circuit) : allCircuits;
    const cams = args.cam ? list(args.cam) : allCams;

    let count = 0, skipped = 0;
    for (const circuit of circuits) {
      for (const quality of qualities) {
        for (const tod of tods) {
          for (const cam of cams) {
            try {
              await callHook(page, 'photo', { circuit, tick, cam, quality, timeOfDay: tod });
            } catch (e) {
              /* The hook's own words for a camera this circuit cannot place
                 (Game.prototype.photoCamMissing). Anything else is a failure. */
              const why = /MCL64\.photo: ([^\n]* is not available at [^\n]*)/.exec(e && e.message ? e.message : '');
              if (!why) throw e;
              skipped++;
              console.log('skipped ' + [circuit, quality, tod, cam].join('.') + '  (' + why[1] + ')');
              continue;
            }
            const rect = await stillClip(page);
            const file = path.join(out, [circuit, quality, tod, cam, 'png'].join('.'));
            await page.screenshot({ path: file, clip: rect });
            count++;
            console.log('wrote ' + path.relative(process.cwd(), file) + '  (' + rect.width + ' x ' + rect.height + ')');
          }
        }
      }
    }
    console.log(count + ' stills in ' + path.relative(process.cwd(), out) + (skipped ? ', ' + skipped + ' skipped' : ''));
    if (!count) throw new Error('no still was taken');
  } catch (e) {
    console.error('FAIL: ' + (e && e.message ? e.message : e));
    failed = true;
  } finally {
    await browser.close();
    await server.close();
  }
  process.exit(failed ? 1 : 0);
})();
