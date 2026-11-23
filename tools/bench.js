/* Measures frame times through MCL64.bench, the same way every time.
 *
 *   node tools/bench.js --quality <q> --circuit <id> --seconds <n> [--headless]
 *
 * Opens the system Chrome (Playwright channel 'chrome'), headed, so the real
 * GPU does the drawing, in a 1728 x 1028 viewport at whatever device pixel
 * ratio the display gives it. Runs the attract demo for the given number of
 * seconds and prints one JSON line: { frames, avgMs, p95Ms } plus what was
 * measured and on which browser. Builds nothing: run `node build.js` first.
 *
 * --headless uses Playwright's own Chromium instead, with the stills launch
 * arguments. That figure is a SwiftShader frame time, not a GPU one; it is
 * labelled as such in the output and is only a fallback.
 *
 * Needs Playwright on NODE_PATH; see tools/browser.js. */
'use strict';

const { CHROMIUM_ARGS, requirePlaywright, serveDist, localOnly, callHook } = require('./browser');

const VIEWPORT = { width: 1728, height: 1028 };
const BENCH_CHROME_ARGS = ['--disable-gpu-vsync', '--disable-frame-rate-limit'];

const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--headless') args.headless = true;
  else if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[++i];
}
const seconds = Number(args.seconds);
if (!args.quality || !args.circuit || !(seconds > 0)) {
  console.error('usage: node tools/bench.js --quality <retro|modern> --circuit <id> --seconds <n> [--headless]');
  process.exit(2);
}

(async () => {
  const { chromium } = requirePlaywright();
  const server = await serveDist();
  const browser = args.headless
    ? await chromium.launch({ headless: true, args: CHROMIUM_ARGS })
    /* Uncapped: without these the frame time is the display's refresh
       interval, which says nothing about cost. */
    : await chromium.launch({ channel: 'chrome', headless: false, args: BENCH_CHROME_ARGS });
  let code = 0;
  try {
    /* The display's own pixel ratio is part of what is being measured, and
       Playwright would otherwise pin it to 1. Ask an unemulated page for it
       first, then fix only the viewport size. */
    const probe = await browser.newContext({ viewport: null });
    const displayDpr = await (await probe.newPage()).evaluate(() => window.devicePixelRatio);
    await probe.close();
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: args.headless ? 1 : displayDpr });
    const page = await context.newPage();
    await localOnly(page, server.url);
    await page.goto(server.url, { waitUntil: 'load', timeout: 60000 });
    const r = await callHook(page, 'bench', { circuit: args.circuit, quality: args.quality, seconds });
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    const gl = await page.evaluate(() => {
      const g = window.MCL64.renderer.getContext();
      const ext = g.getExtension('WEBGL_debug_renderer_info');
      return ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER);
    });
    console.log(JSON.stringify(Object.assign({}, r, {
      /* frames per second actually delivered. A run pinned to the display
         comes out at its refresh rate (60 or 120) with avgMs at 16.67 or
         8.33; an uncapped run lands wherever the cost puts it. */
      fps: Math.round(r.frames / seconds * 10) / 10,
      circuit: args.circuit, quality: args.quality, seconds,
      chromeArgs: args.headless ? CHROMIUM_ARGS : BENCH_CHROME_ARGS,
      browser: (args.headless ? 'headless chromium (swiftshader) ' : 'chrome ') + browser.version(),
      viewport: VIEWPORT.width + 'x' + VIEWPORT.height, dpr, gl
    })));
  } catch (e) {
    console.error('FAIL: ' + (e && e.message ? e.message : e));
    code = 1;
  } finally {
    await browser.close();
    await server.close();
  }
  process.exit(code);
})();
