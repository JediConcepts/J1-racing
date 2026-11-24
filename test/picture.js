/* Checks that the picture either draws or fails politely, and that every
 * canvas texture in the scene is turned into light by its shader.
 *
 *   node test/picture.js            headless Chromium, the WebGL 2 fallback
 *   node test/picture.js --webgpu   the system Chrome, headed, on WebGPU
 *
 * NOT WIRED INTO CI, for the reason test/csp.js gives: it needs Playwright
 * and a browser, and a check that passes on a runner where it could not run
 * is worse than no check. It exits 2 when it cannot run. Playwright is found
 * through NODE_PATH (see tools/browser.js). Builds nothing: run
 * `node build.js` first.
 *
 * WHAT IT IS FOR. The game draws through three.js's WebGPURenderer, which
 * uses WebGPU where the browser has it and WebGL 2 where it does not. That
 * gives the picture three ways to fail that r128 did not have, and each of
 * them fails quietly:
 *
 *   1. The start is asynchronous. A renderer that cannot start rejects a
 *      promise, and a rejection nobody handles is a black canvas with a
 *      loading panel in front of it for ever.
 *   2. A GPU device or a WebGL context can be taken away mid race. The
 *      engine then stops drawing and writes one line on the console.
 *   3. A canvas texture is turned into light by a node that a sweep puts on
 *      its material (texFromCanvas and decodeCanvasMaps in src/10-core.js).
 *      A material the sweep misses is drawn far too bright, and a node of
 *      the wrong kind draws the wrong texture. Neither reports an error.
 *
 * So the checks are: the fallback draws; a browser with no WebGPU still gets
 * a picture; a browser that can run neither, a renderer that will not start
 * and a lost context each end at the #fallback panel with a message and no
 * uncaught error; and on all four circuits, loaded in each tier and again
 * after a change of tier at run time, no material carries a canvas texture
 * without its node.
 *
 * Headless Chromium has no WebGPU adapter, so the default run only ever sees
 * the fallback. --webgpu runs the checks that mean something on the real
 * backend: the default path draws, a destroyed device is reported, and the
 * texture sweep. The checks that take WebGPU or WebGL 2 away are about the
 * fallback and are left to the default run.
 *
 * HOW "NOT BLANK" IS DECIDED. Not by a screenshot: the HUD and the page's
 * own layers lie over the game canvas, so a screenshot of a dead renderer
 * still has things in it. The page is asked to draw one frame (Game's own
 * drawFrame) and to copy the game canvas to a small 2D canvas in the same
 * task, which is the only moment either kind of canvas can be read back.
 * A frame that drew has a sky, a ground and a track in it: many colours and
 * a wide range of brightness. A canvas nothing drew to has one colour. */
'use strict';

const { CHROMIUM_ARGS, requirePlaywright, serveDist, localOnly } = require('../tools/browser');

const WEBGPU = process.argv.includes('--webgpu');
const VIEWPORT = { width: 1280, height: 720 };

let pass = 0, fail = 0;
function check(ok, name, detail) {
  if (ok) { console.log('  PASS  ' + name + (detail ? '  (' + detail + ')' : '')); pass++; }
  else { console.log('  FAIL  ' + name + (detail ? '\n        ' + detail : '')); fail++; }
}

/* Runs in the page before any of its scripts, once for each thing the boot
   is to be denied. */
function tamper(o) {
  if (o.noWebGPU) {
    /* navigator.gpu is a getter on the prototype; an own getter that answers
       undefined is what a browser with no WebGPU looks like to the page */
    Object.defineProperty(Navigator.prototype, 'gpu', { get() { return undefined; }, configurable: true });
  }
  if (o.noWebGL2) {
    const deny = (proto) => {
      const getContext = proto.getContext;
      proto.getContext = function (type) {
        if (type === 'webgl2') return null;
        return getContext.apply(this, arguments);
      };
    };
    deny(HTMLCanvasElement.prototype);
    if (typeof OffscreenCanvas !== 'undefined') deny(OffscreenCanvas.prototype);
  }
  if (o.failInit) {
    /* The bundle is `var THREE = ...` in a classic script, so it lands on a
       property of window that is already there, through this setter. That
       is the one moment the engine exists and the game has not yet made a
       renderer. */
    let real;
    Object.defineProperty(window, 'THREE', {
      configurable: true, enumerable: true,
      get() { return real; },
      set(v) {
        real = v;
        if (v && v.WebGPURenderer) {
          v.WebGPURenderer.prototype.init = function () {
            return Promise.reject(new Error('test/picture.js made init() reject'));
          };
        }
      }
    });
  }
}

(async () => {
  const { chromium } = requirePlaywright();
  const server = await serveDist();
  const browser = WEBGPU
    ? await chromium.launch({ channel: 'chrome', headless: false })
    : await chromium.launch({ headless: true, args: CHROMIUM_ARGS });

  let context = null, page = null;
  let consoleErrors = [], uncaught = [];

  /* A fresh context for every boot, so nothing a boot was denied, and no
     setting it saved, reaches the next one. Waits until the page has either
     a game or the fallback panel: one of the two is how every boot ends. */
  async function bootWith(opts, query, saved, scale) {
    if (context) await context.close();
    context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: scale || 1, reducedMotion: 'no-preference' });
    await context.addInitScript(tamper, opts || {});
    /* `saved` is what a player's browser would hold from an earlier visit:
       it is in storage before the page's first script reads it */
    if (saved) await context.addInitScript((s) => { localStorage.setItem('mcl64.settings.v1', JSON.stringify(s)); }, saved);
    page = await context.newPage();
    consoleErrors = [];
    uncaught = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().split('\n')[0].slice(0, 200)); });
    page.on('pageerror', (e) => uncaught.push(e.message));
    await localOnly(page, server.url);
    await page.goto(server.url + (query || ''), { waitUntil: 'load', timeout: 60000 });
    await settled();
  }
  const boot = (query) => bootWith({}, query);
  /* a boot with settings already saved, at a device pixel ratio of `scale` */
  const bootWithSettings = (saved, scale) => bootWith({}, WEBGPU ? '' : '?renderer=webgl', saved, scale);
  const setting = (key) => page.evaluate((k) => window.MCL64.settings[k], key);

  async function settled(circuit) {
    await page.waitForFunction((id) => {
      const f = document.getElementById('fallback');
      if (f && getComputedStyle(f).display !== 'none') return true;
      return !!(window.MCL64 && window.MCL64.track && (!id || window.MCL64.track.def.id === id));
    }, circuit || null, { timeout: 60000 });
  }

  const backend = () => page.evaluate(() => {
    const b = window.MCL64 && window.MCL64.renderer && window.MCL64.renderer.backend;
    if (!b) return 'none';
    if (b.isWebGPUBackend) return (typeof GPUDevice !== 'undefined' && b.device instanceof GPUDevice) ? 'webgpu' : 'webgpu without a device';
    if (b.isWebGLBackend) return b.gl instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl without a webgl2 context';
    return 'unknown';
  });

  const isVisible = (selector) => page.evaluate((sel) => {
    const e = document.querySelector(sel);
    if (!e) return false;
    const r = e.getBoundingClientRect();
    return getComputedStyle(e).display !== 'none' && r.width > 0 && r.height > 0;
  }, selector);

  const fallbackText = () => page.evaluate(() => {
    const d = document.getElementById('fallback-detail');
    return d ? d.textContent : '';
  });

  /* See the header. Returns what it measured, so a failure can say why. */
  const canvasLook = () => page.evaluate(() => {
    const g = window.MCL64;
    if (!g) return { colours: 0, range: 0, why: 'no game' };
    g.drawFrame(1);
    const c = document.createElement('canvas');
    c.width = 64; c.height = 36;
    const x = c.getContext('2d');
    x.drawImage(g.glCanvas, 0, 0, 64, 36);
    const d = x.getImageData(0, 0, 64, 36).data;
    const seen = new Set();
    let lo = 255, hi = 0;
    for (let i = 0; i < d.length; i += 4) {
      const y = (d[i] * 2 + d[i + 1] * 5 + d[i + 2]) / 8;
      if (y < lo) lo = y;
      if (y > hi) hi = y;
      seen.add((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3));
    }
    return { colours: seen.size, range: Math.round(hi - lo) };
  });
  const notBlank = (look) => look.colours >= 8 && look.range >= 32;
  const canvasIsNotBlank = async () => notBlank(await canvasLook());
  const lookText = (look) => look.colours + ' colours over a range of ' + look.range + (look.why ? ', ' + look.why : '');

  /* The fallback loses its context through the extension made for testing
     exactly that. On WebGPU the device is destroyed, which stops the picture
     the same way and is the one loss the engine does not report by itself. */
  async function loseContext() {
    const how = await page.evaluate(() => {
      const b = window.MCL64.renderer.backend;
      if (b.isWebGPUBackend) { b.device.destroy(); return 'device.destroy()'; }
      const ext = b.gl.getExtension('WEBGL_lose_context');
      if (!ext) return null;
      ext.loseContext();
      return 'WEBGL_lose_context';
    });
    if (!how) throw new Error('this browser has no WEBGL_lose_context, so a lost context cannot be made');
    /* the browser tells the page a moment later; a recovery, if there ever
       is one, would need about as long */
    await page.waitForTimeout(1500);
    return how;
  }

  /* The texture sweep, looked at from outside. One frame is drawn first so
     that every shader the tier needs has been built, and a build that failed
     has had its chance to say so on the console.

     A canvas texture that needs its node is known by the mark texFromCanvas
     puts on it. Any other canvas texture used as a map is listed too, so one
     made by hand and put on a material cannot slip past: today there is
     exactly one, the 32 x 32 blob under each car, which is black, was never
     flagged on r128 and needs no conversion. */
  const canvasMaps = () => page.evaluate(() => {
    const g = window.MCL64;
    g.drawFrame(1);
    const withMap = new Set(), missing = new Set(), nodes = new Set(), others = new Set();
    g.scene.traverse((o) => {
      const list = !o.material ? [] : (Array.isArray(o.material) ? o.material : [o.material]);
      for (const m of list) {
        const t = m && m.map;
        if (!t) continue;
        if (t.userData && t.userData.decodeInShader) {
          withMap.add(m);
          if (m.colorNode && m.opacityNode) nodes.add(m.colorNode);
          else missing.add(m);
        } else if (t.isCanvasTexture) {
          others.add(t.image.width + ' x ' + t.image.height);
        }
      }
    });
    return {
      circuit: g.track.def.id, quality: g.settings.quality,
      materials: withMap.size, missing: missing.size, nodes: nodes.size, others: Array.from(others)
    };
  });

  function checkMaps(r, circuit, quality, how) {
    const name = circuit + ', ' + how + ': every canvas texture has its node';
    const othersOk = r.others.length === 0 || (r.others.length === 1 && r.others[0] === '32 x 32');
    const ok = r.circuit === circuit && r.quality === quality && r.materials > 0 && r.missing === 0 && r.nodes === 1 && othersOk;
    check(ok, name, ok
      ? r.materials + ' materials'
      : 'on ' + r.circuit + ' in ' + r.quality + ': ' + r.materials + ' materials carry a canvas texture, ' + r.missing +
        ' of them without a node, ' + r.nodes + ' distinct colour nodes (must be 1), other canvas textures used as a map: ' +
        (r.others.join(', ') || 'none') + ' (only the 32 x 32 blob is expected)');
  }

  let code = 0;
  try {
    console.log(WEBGPU
      ? 'system Chrome ' + browser.version() + ', headed: the real WebGPU backend'
      : 'headless Chromium ' + browser.version() + ': the WebGL 2 fallback');

    /* Review Focus 1: a picture, on the path this run is about */
    if (WEBGPU) {
      await boot('');
      const b = await backend(), look = await canvasLook();
      check(b === 'webgpu' && notBlank(look) && consoleErrors.length === 0 && uncaught.length === 0,
        'the WebGPU path draws with no errors',
        'backend ' + b + ', ' + lookText(look) + ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));
    } else {
      await boot('?renderer=webgl');
      let b = await backend(), look = await canvasLook();
      check(b === 'webgl2' && notBlank(look) && consoleErrors.length === 0 && uncaught.length === 0,
        'the fallback path draws with no errors',
        'backend ' + b + ', ' + lookText(look) + ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));

      await bootWith({ noWebGPU: true });   /* navigator.gpu is gone before load */
      b = await backend(); look = await canvasLook();
      check(b === 'webgl2' && notBlank(look) && uncaught.length === 0,
        'a browser with no WebGPU still gets a picture',
        'backend ' + b + ', ' + lookText(look) + ', uncaught ' + JSON.stringify(uncaught));

      /* Review Focus 2: no picture, and a panel that says so */
      await bootWith({ noWebGPU: true, noWebGL2: true });   /* getContext('webgl2') answers null before load */
      let said = await fallbackText();
      check(await isVisible('#fallback') && /WebGL 2/.test(said) && uncaught.length === 0,
        'a browser that can run neither shows the fallback panel, and it says what is missing',
        'panel says: ' + JSON.stringify(said) + ', uncaught ' + JSON.stringify(uncaught));

      /* The same browser, but one that says it has WebGPU and then hands
         out no adapter, which is what headless Chromium does by itself. The
         boot probe cannot know, so this is the engine's own fallback
         failing inside init(). */
      await bootWith({ noWebGL2: true });
      said = await fallbackText();
      check(await isVisible('#fallback') && /WebGL 2/.test(said) && uncaught.length === 0,
        'WebGPU with no adapter and no WebGL 2 shows the fallback panel, and it says what is missing',
        'panel says: ' + JSON.stringify(said) + ', uncaught ' + JSON.stringify(uncaught));

      await bootWith({ failInit: true });   /* renderer.init() rejects */
      said = await fallbackText();
      check(await isVisible('#fallback') && /made init\(\) reject/.test(said) && uncaught.length === 0,
        'a renderer that cannot start shows the fallback panel',
        'panel says: ' + JSON.stringify(said) + ', uncaught ' + JSON.stringify(uncaught));
    }

    /* Review Focus 2, the last of it: the GPU goes away under a race */
    await boot(WEBGPU ? '' : '?renderer=webgl');
    await page.keyboard.press('Enter');   /* the title's own key for a race */
    /* Game's STATE: 1 is the countdown, 2 is the race */
    const racing = await page.evaluate(() => (window.MCL64.state === 1 || window.MCL64.state === 2) && !window.MCL64.paused);
    const how = await loseContext();
    const panel = await isVisible('#fallback');
    const after = await canvasLook();
    const paused = await page.evaluate(() => window.MCL64.paused);
    check(racing && uncaught.length === 0 && (panel || notBlank(after)),
      'a lost ' + (WEBGPU ? 'device' : 'context') + ' is reported or recovered, never a frozen black canvas',
      how + ' in a race: ' + (racing ? '' : 'THE RACE DID NOT START, ') + (panel ? 'panel shown, saying ' + JSON.stringify(await fallbackText()) : 'no panel') +
      ', race paused: ' + paused + ', canvas ' + lookText(after) + ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));

    /* Review Focus 3: what storage holds is checked, field by field */
    await bootWithSettings({ quality: 'hyper', timeOfDay: 'midnight' });
    check(await setting('quality') === 'modern' && await setting('timeOfDay') === 'midday' && uncaught.length === 0,
      'an unknown tier or time of day falls back to the defaults',
      'quality ' + await setting('quality') + ', timeOfDay ' + await setting('timeOfDay') + ', uncaught ' + JSON.stringify(uncaught));

    /* The canvas rule, on a display with two device pixels to the CSS pixel.
       Ultra's canvas is its render target and no larger; Modern's is the
       render target times the device pixel ratio each way, as on main. The
       tier is loaded for Ultra and switched at run time for Modern, and then
       switched back, so the rule is seen to follow the tier both ways. */
    const sizes = () => page.evaluate(() => {
      const g = window.MCL64;
      return { quality: g.settings.quality, dpr: window.devicePixelRatio, cw: g.glCanvas.width, ch: g.glCanvas.height, gw: g.gw, gh: g.gh };
    });
    await bootWithSettings({ quality: 'ultra' }, 2);
    const ultra = await sizes(), ultraLook = await canvasLook();
    check(ultra.quality === 'ultra' && ultra.dpr === 2 && ultra.cw * ultra.ch === ultra.gw * ultra.gh &&
      notBlank(ultraLook) && consoleErrors.length === 0 && uncaught.length === 0,
      'Ultra draws, and at a device pixel ratio of 2 its canvas is the size of its render target',
      JSON.stringify(ultra) + ', ' + lookText(ultraLook) + ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));
    await page.evaluate(() => window.MCL64.hookSelect(null, 'modern'));
    const modern = await sizes();
    check(modern.quality === 'modern' && modern.cw === modern.gw * 2 && modern.ch === modern.gh * 2 &&
      modern.gw === ultra.gw && modern.gh === ultra.gh,
      'Modern at a device pixel ratio of 2 has a canvas twice its render target each way, as on main, and the same render target as Ultra',
      JSON.stringify(modern));
    await page.evaluate(() => window.MCL64.hookSelect(null, 'ultra'));
    const back = await sizes();
    check(back.quality === 'ultra' && back.cw === back.gw && back.ch === back.gh && uncaught.length === 0,
      'switched back to Ultra at run time, the canvas is the render target again',
      JSON.stringify(back) + ', uncaught ' + JSON.stringify(uncaught));

    /* A saved time of day is in force from the first frame, with nobody
       pressing the TIME OF DAY button: a player who chose ULTRA and GOLDEN
       and then loads the page again (choosing a circuit does that) must come
       back at golden hour. The sky is asked which hour it drew, the sun
       light how high it stands, and the shadows which way they take the sun
       to be. Golden hour's sun is 11 degrees up (TIME_OF_DAY in 32-sky.js),
       where the dome's is 48. Then the same through a change of tier at run
       time, both ways. */
    const hour = () => page.evaluate(() => {
      const g = window.MCL64, sun = g.sun, rig = g.shadowRig;
      const up = (v) => Math.round(Math.asin(v.y / v.length()) * 180 / Math.PI * 10) / 10;
      return {
        quality: g.settings.quality, saved: g.settings.timeOfDay, sky: g.skyRig.mode, drew: g.skyRig.drawn,
        sunUp: up(sun.position.clone().sub(sun.target.position)), shadowsUp: up(rig.offset), shadows: rig.mode
      };
    });
    await bootWithSettings({ quality: 'ultra', timeOfDay: 'golden' });
    const loaded = await hour();
    check(loaded.quality === 'ultra' && loaded.sky === 'physical' && loaded.drew === 'golden' &&
      loaded.sunUp === 11 && loaded.shadowsUp === 11 && loaded.shadows === 'cascades' &&
      consoleErrors.length === 0 && uncaught.length === 0,
      'loaded with ULTRA and GOLDEN saved, the sky, the sun and the shadows are at golden hour',
      JSON.stringify(loaded) + ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));
    await page.evaluate(() => window.MCL64.hookSelect(null, 'modern'));
    const left = await hour();
    await page.evaluate(() => window.MCL64.hookSelect(null, 'ultra'));
    const again = await hour();
    check(left.sky === 'dome' && left.sunUp === 47.7 && left.shadowsUp === 47.7 && left.shadows === 'single' &&
      again.sky === 'physical' && again.drew === 'golden' && again.sunUp === 11 && again.shadowsUp === 11 &&
      again.shadows === 'cascades' && consoleErrors.length === 0 && uncaught.length === 0,
      'switched to Modern the sun is the dome\'s, and switched back to Ultra it is golden hour again',
      'Modern ' + JSON.stringify(left) + ', Ultra ' + JSON.stringify(again) + ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));

    /* The texture sweep: four circuits, each loaded in each tier and then
       switched at run time. Console errors count here, over all of it,
       because a node that fails to build says so there and only there. */
    await boot(WEBGPU ? '' : '?renderer=webgl');
    const circuits = await page.evaluate(() => window.MCL64.tracks.map((t) => t.id));
    check(circuits.length === 4, 'the game lists four circuits', circuits.join(', '));
    const want = WEBGPU ? 'webgpu' : 'webgl2';
    let wrongBackend = 0;
    for (const circuit of circuits) {
      for (const first of ['retro', 'modern']) {
        /* loaded in the tier: saved as the settings panel saves it, then a
           real page load */
        await page.evaluate(([id, q]) => {
          const g = window.MCL64;
          g.settings.trackId = id;
          g.settings.quality = q;
          g.saveSettings();
        }, [circuit, first]);
        await page.reload({ waitUntil: 'load', timeout: 60000 });
        await settled(circuit);
        if (await backend() !== want) wrongBackend++;
        checkMaps(await canvasMaps(), circuit, first, 'loaded in ' + first);

        const other = first === 'retro' ? 'modern' : 'retro';
        await page.evaluate((q) => window.MCL64.hookSelect(null, q), other);
        checkMaps(await canvasMaps(), circuit, other, 'switched to ' + other + ' at run time');
      }
    }
    check(wrongBackend === 0 && consoleErrors.length === 0 && uncaught.length === 0,
      'all of that on ' + want + ', with no console error and nothing uncaught',
      wrongBackend + ' loads on another backend, console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));
  } catch (e) {
    console.error('FAIL: ' + (e && e.message ? e.message : e));
    code = 1;
  } finally {
    await browser.close();
    await server.close();
  }

  console.log('');
  console.log('assertions: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(code || (fail === 0 ? 0 : 1));
})();
