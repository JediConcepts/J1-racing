/* Measures frame times through MCL64.bench, the same way every time.
 *
 *   node tools/bench.js --quality <q> --circuit <id> --seconds <n>
 *                       [--renderer webgl] [--headless]
 *
 * Opens the system Chrome (Playwright channel 'chrome'), headed, so the real
 * GPU does the drawing, in a 1728 x 1028 viewport at whatever device pixel
 * ratio the display gives it. Runs the attract demo for the given number of
 * seconds and prints one JSON line: { frames, avgMs, p95Ms } plus what was
 * measured and on which browser. Builds nothing: run `node build.js` first.
 *
 * WHICH BACKEND RAN is on the line as `backend`, asked of the renderer after
 * the run: `webgpu`, or `webgl2` for the fallback. Left alone, the game
 * takes WebGPU where the browser has it. --renderer webgl loads the page
 * with ?renderer=webgl, which forces the fallback; if the renderer then
 * reports anything else the run fails, because a figure filed under the
 * wrong backend is worse than no figure. `gpu` is what that backend says it
 * is drawing with: the GL renderer string on the fallback, the adapter's
 * vendor and architecture on WebGPU.
 *
 * The line also carries three sizes, because they can all differ and a frame
 * time means little without them: renderTarget is what the 3D scene is drawn
 * into (game.gw x game.gh), canvas is the game canvas (the render target
 * times the device pixel ratio the renderer was given), and drawingBuffer is
 * what the browser actually allocated for it: the GL drawing buffer on the
 * fallback, the canvas's current texture on WebGPU. Nothing here asks a
 * WebGPU canvas for a GL context, which it cannot give.
 *
 * If the page throws at any point the run prints the error and exits 1 with
 * no JSON line. A frame loop that throws part way through each frame still
 * asks for the next frame, so it would otherwise report a figure, and a
 * better one than a build that works.
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
if (!args.quality || !args.circuit || !(seconds > 0) || (args.renderer !== undefined && args.renderer !== 'webgl')) {
  console.error('usage: node tools/bench.js --quality <retro|modern> --circuit <id> --seconds <n> [--renderer webgl] [--headless]');
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
    const pageErrors = [];
    page.on('pageerror', (e) => { console.error('PAGEERROR: ' + e.message); pageErrors.push(e.message); });
    await localOnly(page, server.url);
    /* the switch stays in the address when a change of circuit reloads the page */
    await page.goto(server.url + (args.renderer === 'webgl' ? '?renderer=webgl' : ''), { waitUntil: 'load', timeout: 60000 });
    const r = await callHook(page, 'bench', { circuit: args.circuit, quality: args.quality, seconds });
    if (pageErrors.length) {
      throw new Error('the page threw ' + pageErrors.length + ' error' + (pageErrors.length === 1 ? '' : 's') + ' during the run, so its frame times mean nothing and none are printed');
    }
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    const drawn = await page.evaluate(async () => {
      const game = window.MCL64, canvas = game.glCanvas, b = game.renderer.backend;
      const out = { renderTarget: game.gw + 'x' + game.gh, canvas: canvas.width + 'x' + canvas.height };
      if (b.isWebGPUBackend) {
        out.backend = 'webgpu';
        /* the device knows its adapter in current browsers; older ones only
           tell through a fresh adapter */
        let info = b.device.adapterInfo;
        if (!info) { const adapter = await navigator.gpu.requestAdapter(); info = adapter ? adapter.info : null; }
        out.gpu = info ? [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(' ') : 'unknown';
        /* asking the canvas again for the kind of context it already holds
           returns that context */
        const t = canvas.getContext('webgpu').getCurrentTexture();
        out.drawingBuffer = t.width + 'x' + t.height;
      } else if (b.isWebGLBackend) {
        out.backend = 'webgl2';
        const g = b.gl, ext = g.getExtension('WEBGL_debug_renderer_info');
        out.gpu = ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER);
        out.drawingBuffer = g.drawingBufferWidth + 'x' + g.drawingBufferHeight;
      } else {
        out.backend = 'unknown';
      }
      return out;
    });
    if (drawn.backend !== 'webgpu' && drawn.backend !== 'webgl2') {
      throw new Error('the renderer names neither of its two backends, so the figure cannot be filed under one');
    }
    if (args.renderer === 'webgl' && drawn.backend !== 'webgl2') {
      throw new Error('--renderer webgl was asked for and the game drew on ' + drawn.backend);
    }
    console.log(JSON.stringify(Object.assign({}, r, {
      /* frames per second actually delivered. A run pinned to the display
         comes out at its refresh rate (60 or 120) with avgMs at 16.67 or
         8.33; an uncapped run lands wherever the cost puts it. */
      fps: Math.round(r.frames / seconds * 10) / 10,
      circuit: args.circuit, quality: args.quality, seconds,
      chromeArgs: args.headless ? CHROMIUM_ARGS : BENCH_CHROME_ARGS,
      browser: (args.headless ? 'headless chromium (swiftshader) ' : 'chrome ') + browser.version(),
      viewport: VIEWPORT.width + 'x' + VIEWPORT.height, dpr,
      backend: drawn.backend,
      renderTarget: drawn.renderTarget, canvas: drawn.canvas, drawingBuffer: drawn.drawingBuffer, gpu: drawn.gpu
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
