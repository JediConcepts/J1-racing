/* Measures frame times through MCL64.bench, the same way every time.
 *
 *   node tools/bench.js --quality <q> --circuit <id> --seconds <n>
 *                       [--tod <name>] [--renderer webgl] [--headless]
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
 * --tod sets the hour first: morning, midday, golden or dusk, handed to the
 * page as the stills tool hands it. It changes the picture in Ultra only.
 * The line carries the hour the page was at as `timeOfDay`, given or not.
 *
 * A FIGURE FROM A BROKEN FRAME IS NOT PRINTED. The run prints what went
 * wrong and exits 1 with no JSON line if, at any point, the page throws,
 * the page writes an error on its console, or the game ends at its fallback
 * panel. Each of those gives a figure otherwise, and a better one than a
 * build that works. A frame loop that throws part way through each frame
 * still asks for the next frame. A node material that fails to build is
 * reported on the console and the frame is drawn all the same, without it.
 * And a lost graphics device stops the game's own loop while the hook's
 * timer runs on, counting the frames of a canvas nothing draws to. The
 * watch on the console is the one the stills tool uses (watchPage in
 * tools/browser.js), except that a warning it does not know is printed and
 * does not fail the run.
 *
 * --headless uses Playwright's own Chromium instead, with the stills launch
 * arguments. That figure is a SwiftShader frame time, not a GPU one; it is
 * labelled as such in the output and is only a fallback.
 *
 * Needs Playwright on NODE_PATH; see tools/browser.js. */
'use strict';

const { CHROMIUM_ARGS, requirePlaywright, serveDist, localOnly, callHook, watchPage } = require('./browser');

const VIEWPORT = { width: 1728, height: 1028 };
const BENCH_CHROME_ARGS = ['--disable-gpu-vsync', '--disable-frame-rate-limit'];

const TIMES_OF_DAY = ['morning', 'midday', 'golden', 'dusk'];

const argv = process.argv.slice(2);
const args = {};
let badArgs = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--headless') args.headless = true;
  else if (argv[i].startsWith('--')) {
    /* a switch with nothing after it is a mistake, not a switch left out */
    if (argv[i + 1] === undefined) badArgs = true;
    args[argv[i].slice(2)] = argv[++i];
  }
}
const seconds = Number(args.seconds);
if (badArgs || !args.quality || !args.circuit || !(seconds > 0) || (args.renderer !== undefined && args.renderer !== 'webgl') ||
    (args.tod !== undefined && TIMES_OF_DAY.indexOf(args.tod) < 0)) {
  console.error('usage: node tools/bench.js --quality <retro|modern|ultra> --circuit <id> --seconds <n> [--tod <' + TIMES_OF_DAY.join('|') + '>] [--renderer webgl] [--headless]');
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
    /* see the header: every line here is a frame that cannot be trusted */
    const broken = [];
    watchPage(page,
      (line) => { console.error(line); broken.push(line); },
      (line) => console.error(line + '  (a warning this tool does not know: printed, not a failure)'));
    await localOnly(page, server.url);
    /* the switch stays in the address when a change of circuit reloads the page */
    await page.goto(server.url + (args.renderer === 'webgl' ? '?renderer=webgl' : ''), { waitUntil: 'load', timeout: 60000 });
    const hook = { circuit: args.circuit, quality: args.quality, seconds };
    if (args.tod !== undefined) hook.timeOfDay = args.tod;
    const r = await callHook(page, 'bench', hook);
    /* The panel is where the game ends when its picture has stopped: a lost
       device, most of all. The engine says that on the console as well, so
       this is the second lock on the same door, and it is asked before
       anything below touches a device that may be gone. */
    const panel = await page.evaluate(() => {
      const f = document.getElementById('fallback');
      if (!f || getComputedStyle(f).display === 'none') return '';
      return 'the game ended at its fallback panel: ' + f.textContent.replace(/\s+/g, ' ').trim();
    });
    if (panel) broken.push(panel);
    if (broken.length) {
      throw new Error('NO FIGURE. The frames of this run cannot be trusted, so its frame times mean nothing and none are printed:\n  ' +
        broken.join('\n  '));
    }
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    const timeOfDay = await page.evaluate(() => window.MCL64.settings.timeOfDay);
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
      circuit: args.circuit, quality: args.quality, timeOfDay, seconds,
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
