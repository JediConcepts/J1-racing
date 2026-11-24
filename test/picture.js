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
 * And, since the Ultra tier: a browser that cannot read the engine's script
 * ends at the panel while a start that is only slow does not; the page's own
 * two layers lie over Retro and Modern and not over Ultra; the Graphics
 * button builds only the tier the clicks end on, and a heavy tier is on
 * trial until it has drawn; the cascades hold still round a field of view
 * step; a race too slow for Ultra steps down to Modern, and a touch device
 * is not offered Ultra; and a change of tier or of hour leaves nothing
 * behind in the renderer. Each check says what it is for where it stands.
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
const TRIAL_KEY = 'mcl64.tierTrial.v1';

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
  if (o.slowInit) {
    /* the renderer takes this many milliseconds longer to start */
    let slow;
    Object.defineProperty(window, 'THREE', {
      configurable: true, enumerable: true,
      get() { return slow; },
      set(v) {
        slow = v;
        if (v && v.WebGPURenderer) {
          const init = v.WebGPURenderer.prototype.init;
          v.WebGPURenderer.prototype.init = function () {
            return new Promise((r) => setTimeout(r, o.slowInit)).then(() => init.apply(this, arguments));
          };
        }
      }
    });
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
  let consoleErrors = [], uncaught = [], engineBroken = false;

  /* A fresh context for every boot, so nothing a boot was denied, and no
     setting it saved, reaches the next one. Waits until the page has either
     a game or the fallback panel: one of the two is how every boot ends. */
  async function bootWith(opts, query, saved, scale, more) {
    if (context) await context.close();
    context = await browser.newContext({
      viewport: VIEWPORT, deviceScaleFactor: scale || 1, reducedMotion: 'no-preference', hasTouch: !!(more && more.touch)
    });
    await context.addInitScript(tamper, opts || {});
    /* `saved` is what a player's browser would hold from an earlier visit:
       it is in storage before the page's first script reads it. It is put
       there once, on the first load of the context, so that a reload later
       in the same context finds what the game itself left. `more.trial` is
       the same for the key a tier on trial leaves (TIER_TRIAL_KEY in
       src/40-game.js). `more.touch` makes the browser one with a touch
       screen, which is what the game's touchLikely() asks about. */
    const held = { 'mcl64.settings.v1': saved ? JSON.stringify(saved) : null, [TRIAL_KEY]: (more && more.trial) || null };
    await context.addInitScript((h) => {
      if (sessionStorage.getItem('picture.seeded')) return;
      sessionStorage.setItem('picture.seeded', '1');
      for (const k in h) if (h[k] != null) localStorage.setItem(k, h[k]);
    }, held);
    page = await context.newPage();
    engineBroken = false;
    consoleErrors = [];
    uncaught = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().split('\n')[0].slice(0, 200)); });
    page.on('pageerror', (e) => uncaught.push(e.message));
    await localOnly(page, server.url);
    /* `more.breakEngine` hands the page an engine script no browser can
       read: the page as built, with a syntax error put at the start of the
       engine. That is what a browser too old for the engine's syntax sees.
       Registered after localOnly, so it is asked first. */
    if (more && more.breakEngine) {
      await page.route((u) => u.href.split('?')[0] === server.url, async (route) => {
        const response = await route.fetch();
        const html = await response.text();
        const broken = html.replace('var THREE=', () => 'var THREE=@ a browser too old for this script @;');
        engineBroken = broken !== html;
        await route.fulfill({ response, body: broken });
      });
    }
    await page.goto(server.url + (query || ''), { waitUntil: 'load', timeout: 60000 });
    await settled();
  }
  const boot = (query) => bootWith({}, query);
  /* a boot with settings already saved, at a device pixel ratio of `scale` */
  const bootWithSettings = (saved, scale, more) => bootWith({}, WEBGPU ? '' : '?renderer=webgl', saved, scale, more);
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
      check(b === 'webgpu' && notBlank(look) && !(await isVisible('#fallback')) && consoleErrors.length === 0 && uncaught.length === 0,
        'the WebGPU path draws with no errors, and no fallback panel',
        'backend ' + b + ', ' + lookText(look) + ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));
    } else {
      await boot('?renderer=webgl');
      let b = await backend(), look = await canvasLook();
      check(b === 'webgl2' && notBlank(look) && !(await isVisible('#fallback')) && consoleErrors.length === 0 && uncaught.length === 0,
        'the fallback path draws with no errors, and no fallback panel',
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

      /* A BROWSER TOO OLD TO READ THE ENGINE. The engine's script is refused
         whole, the game's script dies at its first use of the engine, and
         boot, which shows the panel for every other failure, is never
         reached. The guard script at the head of the page must show it. The
         two uncaught errors are the fault itself, so here they are wanted. */
      await bootWith({}, '?renderer=webgl', null, 1, { breakEngine: true });
      said = await fallbackText();
      const stuck = await isVisible('#loading') && !(await isVisible('#fallback'));
      check(engineBroken && await isVisible('#fallback') && /too old to read/.test(said) && /SyntaxError/.test(said) &&
        uncaught.length >= 1 && !(await page.evaluate(() => !!window.MCL64)),
        'a browser that cannot read the engine script ends at the fallback panel, and it says why',
        (engineBroken ? '' : 'THE ENGINE SCRIPT WAS NOT BROKEN, ') + (stuck ? 'THE LOADING PANEL IS STILL UP AND THERE IS NO FALLBACK PANEL, ' : '') +
        'panel says: ' + JSON.stringify(said) + ', uncaught ' + JSON.stringify(uncaught));

      /* And the guard must not take a slow start for a dead one: a renderer
         that needs four more seconds to start. Two seconds after the page
         has loaded the loading panel is up and the fallback panel is not;
         then the game arrives. */
      await context.close();
      context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
      await context.addInitScript(tamper, { slowInit: 4000 });
      page = await context.newPage();
      uncaught = [];
      page.on('pageerror', (e) => uncaught.push(e.message));
      await localOnly(page, server.url);
      await page.goto(server.url + '?renderer=webgl', { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(2000);
      const waiting = { game: await page.evaluate(() => !!window.MCL64), loading: await isVisible('#loading'), fallback: await isVisible('#fallback') };
      await settled();
      const arrived = { game: await page.evaluate(() => !!window.MCL64), loading: await isVisible('#loading'), fallback: await isVisible('#fallback') };
      check(!waiting.game && waiting.loading && !waiting.fallback && arrived.game && !arrived.loading && !arrived.fallback && uncaught.length === 0,
        'a start that is only slow is left alone: no fallback panel while it waits, and the game arrives',
        'two seconds after load ' + JSON.stringify(waiting) + ', in the end ' + JSON.stringify(arrived) + ', uncaught ' + JSON.stringify(uncaught));

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

    /* The page's own two layers over the game, the scanlines and the glow.
       main lays them over Retro and Modern alike, so both must have them,
       at the opacity the page's stylesheet gives; Ultra has neither. No
       still shows this: the stills tool hides both layers. */
    const layers = () => page.evaluate(() => {
      const of = (sel) => { const c = getComputedStyle(document.querySelector('#screen ' + sel)); return c.display + ' ' + c.opacity; };
      return window.MCL64.settings.quality + ': scanlines ' + of('.scanlines') + ', glow ' + of('.glow');
    });
    await bootWithSettings({ quality: 'modern' });
    const layersSeen = [await layers()];
    for (const q of ['retro', 'ultra', 'modern']) {
      await page.evaluate((name) => window.MCL64.hookSelect(null, name), q);
      layersSeen.push(await layers());
    }
    check(layersSeen.join('; ') === 'modern: scanlines block 0.34, glow block 1; retro: scanlines block 0.34, glow block 1; ' +
      'ultra: scanlines none 0.34, glow none 1; modern: scanlines block 0.34, glow block 1',
      'Modern and Retro have the scanline and glow layers main lays over them, and Ultra has neither',
      layersSeen.join('; '));

    /* THE GRAPHICS BUTTON. It steps through the tiers one way, so Modern to
       Retro passes Ultra. The button says the new tier at once and the tier
       is built only when the clicks have stopped, so two quick clicks must
       end in Retro with Ultra never built. Every call of applyQuality is
       written down with the tier it was called for. */
    const tierState = () => page.evaluate((key) => {
      const g = window.MCL64;
      let stored = null;
      try { stored = JSON.parse(localStorage.getItem('mcl64.settings.v1')).quality; } catch (e) {}
      return {
        quality: g.settings.quality, on: g.tierOn, shadows: g.shadowRig.mode, built: g.__built || null,
        label: document.getElementById('set-quality').textContent, stored, trial: localStorage.getItem(key), notice: g.notice
      };
    }, TRIAL_KEY);
    const watchBuilds = () => page.evaluate(() => {
      const g = window.MCL64, real = g.applyQuality;
      g.__built = [];
      g.applyQuality = function () { g.__built.push(this.settings.quality); return real.apply(this, arguments); };
    });
    const clickGraphics = () => page.evaluate(() => {
      const b = document.getElementById('set-quality');
      b.click();
      return b.textContent;
    });
    await bootWithSettings({ quality: 'modern' });
    await watchBuilds();
    const said1 = await clickGraphics(), said2 = await clickGraphics();
    const atOnce = await tierState();
    await page.waitForTimeout(1200);
    const landed = await tierState();
    check(said1 === 'ULTRA' && said2 === 'RETRO 240p' && atOnce.built.length === 0 && atOnce.on === 'modern' &&
      landed.built.join() === 'retro' && landed.quality === 'retro' && landed.on === 'retro' && landed.shadows === 'blob' &&
      landed.stored === 'retro' && landed.trial === null && consoleErrors.length === 0 && uncaught.length === 0,
      'two quick clicks on Graphics go from Modern to Retro, and Ultra is never built',
      'the button said ' + said1 + ' then ' + said2 + '; straight after ' + JSON.stringify(atOnce) + '; once settled ' + JSON.stringify(landed) +
      ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));

    /* One click, left alone: Ultra is built after the wait, it is on trial
       while it draws its first frames, and the key goes once it has drawn
       them. */
    await bootWithSettings({ quality: 'modern' });
    await watchBuilds();
    await clickGraphics();
    await page.waitForFunction(() => window.MCL64.tierOn === 'ultra', null, { timeout: 10000 });
    const onTrial = await tierState();
    await page.waitForFunction((key) => localStorage.getItem(key) === null, TRIAL_KEY, { timeout: 60000 });
    const trusted = await tierState();
    check(onTrial.built.join() === 'ultra' && onTrial.shadows === 'cascades' && onTrial.trial === 'ultra' && onTrial.stored === 'ultra' &&
      trusted.trial === null && trusted.on === 'ultra' && consoleErrors.length === 0 && uncaught.length === 0,
      'one click from Modern builds Ultra after the wait, on trial until it has drawn its frames',
      'when built ' + JSON.stringify(onTrial) + '; later ' + JSON.stringify(trusted) +
      ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));

    /* A load that finds the key: the tier never got through its trial. */
    await bootWithSettings({ quality: 'ultra' }, 1, { trial: 'ultra' });
    const fell = await tierState();
    check(fell.quality === 'modern' && fell.on === 'modern' && fell.shadows === 'single' && fell.trial === null &&
      fell.stored === 'modern' && /ULTRA OFF/.test(fell.notice) && /DID NOT START/.test(fell.notice) &&
      consoleErrors.length === 0 && uncaught.length === 0,
      'loaded with ULTRA saved and the trial key still set, the page comes up in Modern, clears the key and says why',
      JSON.stringify(fell) + ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));

    /* The graphics device goes while Ultra is on: the load after it must not
       walk straight back into Ultra. */
    await bootWithSettings({ quality: 'ultra' });
    const beforeLoss = await tierState();
    await loseContext();
    const lostKey = await page.evaluate((key) => localStorage.getItem(key), TRIAL_KEY);
    const lostPanel = await isVisible('#fallback');
    await page.reload({ waitUntil: 'load', timeout: 60000 });
    await settled();
    const afterLoss = await tierState();
    check(beforeLoss.on === 'ultra' && lostKey === 'ultra lost' && lostPanel && afterLoss.quality === 'modern' && afterLoss.on === 'modern' &&
      afterLoss.trial === null && afterLoss.stored === 'modern' && /DEVICE WAS LOST/.test(afterLoss.notice) && uncaught.length === 0,
      'a ' + (WEBGPU ? 'device' : 'context') + ' lost in Ultra leaves the key, and the reload comes up in Modern and says why',
      'key after the loss ' + JSON.stringify(lostKey) + ', panel ' + lostPanel + ', after the reload ' + JSON.stringify(afterLoss) +
      ', uncaught ' + JSON.stringify(uncaught));

    /* The game's own reload is not a failure. Ultra is clicked to and a
       circuit picked before the clicks have settled: the page reloads with
       Ultra saved and never yet built, and must come up in it, on trial. */
    await bootWithSettings({ quality: 'modern', trackId: 'silverstone-v1' });
    await clickGraphics();
    await Promise.all([
      page.waitForEvent('load', { timeout: 60000 }),
      page.evaluate(() => window.MCL64.selectTrack('brands-hatch-v1'))
    ]);
    await settled('brands-hatch-v1');
    const carried = await tierState();
    await page.waitForFunction((key) => localStorage.getItem(key) === null, TRIAL_KEY, { timeout: 60000 });
    check(carried.quality === 'ultra' && carried.on === 'ultra' && carried.shadows === 'cascades' && !carried.notice &&
      uncaught.length === 0,
      'Ultra clicked to and a circuit picked at once: the reload comes up in Ultra, with no word of a failure',
      JSON.stringify(carried) + ', uncaught ' + JSON.stringify(uncaught));

    /* THE CASCADES HOLD STILL ROUND A STEP. They are laid out for the field
       of view rounded up to 8 degrees, and the chase camera's stands at the
       56 degree step at an ordinary corner speed. Hovering there must lay
       them out once, on the way up, and not at every crossing; well under
       the step they come back down; and a still lays them out afresh,
       whatever was held. The engine's updateFrustums is counted: it is what
       a new layout calls. */
    await bootWithSettings({ quality: 'ultra' });
    const hover = await page.evaluate(() => {
      const g = window.MCL64, rig = g.shadowRig, cam = g.camera;
      g.photoHold = true;
      g.drawFrame(1);
      const csm = rig.csm, real = csm.updateFrustums;
      let laid = 0;
      csm.updateFrustums = function () { laid++; return real.apply(this, arguments); };
      const at = (fov, afresh) => { cam.fov = fov; cam.updateProjectionMatrix(); rig.update(afresh); return rig.view.fov; };
      const r = { start: at(50, true) };
      laid = 0;
      for (let i = 0; i < 20; i++) { at(56.2); at(55.8); }
      r.hoverLaid = laid; r.hoverAt = rig.view.fov;
      r.justInside = at(54.6); r.under = at(54.4); r.laid = laid;
      at(57);
      r.heldAgain = at(55.8); r.still = at(55.8, true);
      csm.updateFrustums = real;
      g.photoHold = false;
      return r;
    });
    check(hover.start === 56 && hover.hoverLaid === 1 && hover.hoverAt === 64 && hover.justInside === 64 && hover.under === 56 &&
      hover.laid === 2 && hover.heldAgain === 64 && hover.still === 56 && consoleErrors.length === 0 && uncaught.length === 0,
      'a field of view hovering at a step lays the cascades out once, and a still lays them out afresh',
      JSON.stringify(hover) + ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));

    /* THE GUARD ON A SLOW DEVICE. In a race in Ultra the frame loop hands
       every frame gap to watchPace, and a mean over 25 ms for 3 seconds of
       racing gives Ultra up for Modern. The loop is held here and the gaps
       are handed over by hand, so the figures are the test's and not this
       machine's. What must NOT trip it comes first: gaps too long to be
       frames, gaps of a healthy 60 a second, one long frame among those,
       and slow frames while the race is paused. Then 74 gaps of 40 ms, a
       shade under 3 seconds, and it must still be Ultra; six more and it
       must be Modern, saved, with the player told. Last, Ultra picked again
       in the same load is left alone. */
    await bootWithSettings({ quality: 'ultra' });
    await page.keyboard.press('Enter');
    const pace = await page.evaluate(() => {
      const g = window.MCL64;
      const feed = (ms, n) => { for (let i = 0; i < n; i++) g.watchPace(ms); return g.tierOn; };
      const stored = () => { try { return JSON.parse(localStorage.getItem('mcl64.settings.v1')).quality; } catch (e) { return null; } };
      g.photoHold = true;
      const r = { racing: (g.state === 1 || g.state === 2) && !g.paused, start: g.tierOn };
      r.longGaps = feed(300, 200);
      r.healthy = feed(16.7, 400);
      g.watchPace(200);
      r.oneLongFrame = feed(16.7, 400);
      g.paused = true;
      r.paused = feed(40, 200);
      g.paused = false;
      r.justUnder = feed(40, 74);
      r.over = feed(40, 6);
      r.settings = g.settings.quality; r.stored = stored(); r.shadows = g.shadowRig.mode; r.notice = g.notice;
      r.label = document.getElementById('set-quality').textContent;
      g.hookSelect(null, 'ultra');
      r.again = feed(40, 200);
      g.photoHold = false;
      return r;
    });
    check(pace.racing && pace.start === 'ultra' && pace.longGaps === 'ultra' && pace.healthy === 'ultra' && pace.oneLongFrame === 'ultra' &&
      pace.paused === 'ultra' && pace.justUnder === 'ultra' && pace.over === 'modern' && pace.settings === 'modern' &&
      pace.stored === 'modern' && pace.shadows === 'single' && pace.label === 'MODERN' && /TOO SLOW/.test(pace.notice) &&
      pace.again === 'ultra' && consoleErrors.length === 0 && uncaught.length === 0,
      'a race in Ultra with frames 40 ms apart for 3 seconds steps down to Modern, saves it and says so, and nothing else trips it',
      JSON.stringify(pace) + ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));

    /* A touch device is not offered Ultra: the button steps past it, and a
       saved Ultra loads as Modern. */
    await bootWithSettings({ quality: 'ultra' }, 1, { touch: true });
    const touchLoad = await tierState();
    const touchSaid = [await clickGraphics(), await clickGraphics(), await clickGraphics()];
    const touchPoints = await page.evaluate(() => navigator.maxTouchPoints);
    check(touchPoints > 0 && touchLoad.quality === 'modern' && touchLoad.on === 'modern' && touchLoad.shadows === 'single' &&
      touchSaid.join() === 'RETRO 240p,MODERN,RETRO 240p' && uncaught.length === 0,
      'a touch device is not offered Ultra: a saved Ultra loads as Modern and the Graphics button steps past it',
      'touch points ' + touchPoints + ', loaded ' + JSON.stringify(touchLoad) + ', the button said ' + touchSaid.join(', ') +
      ', uncaught ' + JSON.stringify(uncaught));

    /* NOTHING IS LEFT BEHIND by a change of tier or of hour. The renderer is
       asked what it holds: its textures and geometries, its uniform buffers,
       and the render objects it keeps (one for each mesh drawn with each
       material in each pass, each with a uniform buffer of its own; the set
       is the engine's private renderer._objects._renderObjects, and a
       missing one fails the check and does not pass it). The last two are
       where a cascade's depth material that is never disposed shows: every
       caster it drew stays in that set for good.

       The frame loop is held and the frames are drawn by hand, so the camera
       stands still and the same things are in view every time: the counts
       must then come back to the figure exactly, not nearly. One trip round
       the tiers comes first, because the first visit to a tier builds things
       that are kept on purpose.

       This is the slow one: about three minutes of the default run, nearly
       all of it the fallback building its shaders again at each change. A
       smaller page does not shorten it (tried at 480 x 270). */
    await boot(WEBGPU ? '' : '?renderer=webgl');
    const kept = await page.evaluate(([trips, hours]) => {
      const g = window.MCL64;
      const read = () => {
        const m = g.renderer.info.memory, set = g.renderer._objects && g.renderer._objects._renderObjects;
        return { textures: m.textures, geometries: m.geometries, uniformBuffers: m.uniformBuffers, renderObjects: set ? set.size : -1 };
      };
      const go = (q) => { g.hookSelect(null, q); g.drawFrame(1); };
      const round = () => { go('ultra'); go('retro'); go('modern'); };
      g.photoHold = true;
      round();
      const tiersBase = read();
      for (let i = 0; i < trips; i++) round();
      const tiersAfter = read();
      const names = ['morning', 'midday', 'golden', 'dusk'];
      go('ultra');
      for (let i = 0; i < 4; i++) { g.setTimeOfDay(names[i]); g.drawFrame(1); }
      const hoursBase = read();
      for (let i = 0; i < hours; i++) { g.setTimeOfDay(names[i % 4]); g.drawFrame(1); }
      const hoursAfter = read();
      g.setTimeOfDay('midday');
      go('modern');
      /* Wait for the GPU. Those were some 140 frames drawn back to back,
         and the software rasteriser the default run uses is the best part
         of a minute behind by now: reading a pixel back makes the page wait
         for it here, where nothing has a time limit, and not in the load of
         the next page, which has one. */
      const c = document.createElement('canvas');
      c.width = 8; c.height = 8;
      const x = c.getContext('2d');
      x.drawImage(g.glCanvas, 0, 0, 8, 8);
      x.getImageData(0, 0, 1, 1);
      g.photoHold = false;
      return { tiersBase, tiersAfter, hoursBase, hoursAfter };
    }, [30, 40]);
    const same = (a, b) => a.renderObjects > 0 && a.textures === b.textures && a.geometries === b.geometries &&
      a.uniformBuffers === b.uniformBuffers && a.renderObjects === b.renderObjects;
    check(same(kept.tiersBase, kept.tiersAfter) && consoleErrors.length === 0 && uncaught.length === 0,
      'thirty trips round the tiers (ultra, retro, modern) leave the renderer holding what it held after one',
      'after one ' + JSON.stringify(kept.tiersBase) + ', after thirty more ' + JSON.stringify(kept.tiersAfter) +
      ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));
    check(same(kept.hoursBase, kept.hoursAfter) && consoleErrors.length === 0 && uncaught.length === 0,
      'forty changes of hour in Ultra leave the renderer holding what it held after the first four',
      'after four ' + JSON.stringify(kept.hoursBase) + ', after forty more ' + JSON.stringify(kept.hoursAfter) +
      ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));

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
