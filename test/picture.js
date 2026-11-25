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
 * step; frames too slow for Ultra step down to Modern, and a touch device
 * is offered Ultra like any other; and a change of tier or of hour leaves
 * nothing behind in the renderer. Each check says what it is for where it
 * stands.
 *
 * And, since 24 Nov 2026, when Ultra at dusk at Monaco became what a new
 * player is given: a browser with nothing saved comes up there, on trial;
 * what a player saved before that day is kept where it was picked and moved
 * where it was only the old default, once; and a tier nobody picked is
 * given up without a word, at load and on the title screen.
 *
 * WHERE A CHECK STARTS. A check that is not about the defaults starts from
 * settings a player saved (PLAIN below): Modern at Silverstone at midday,
 * which is what a browser with nothing saved came up in before that day.
 * Ultra at Monaco is several times the work on the software rasteriser this
 * run draws with, and most checks are about something else. A check that is
 * about a browser with nothing saved asks for one by name (`null`).
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
/* How long a page may take to load and to build its world, in milliseconds.
   Generous on purpose: the default page is Ultra at Monaco, which the
   software rasteriser of the default run takes many seconds to build on a
   quiet machine and far longer on a busy one, and a limit that is too short
   fails a build that works. Every wait is on the game's own signal (a game,
   or the fallback panel), so a quick machine never waits this long. */
const LOAD_MS = 240000;
const TRIAL_KEY = 'mcl64.tierTrial.v1';
/* This build's own settings key, and the one it shares with the live game
   and only ever reads (SETTINGS_KEY and SETTINGS_KEY_OLD in src/38-tiers.js). */
const SETTINGS_KEY = 'mcl64.settings.v2';
const OLD_KEY = 'mcl64.settings.v1';

/* See WHERE A CHECK STARTS in the header. `defaults: 2` marks the settings
   as saved since the defaults changed (SETTINGS_DEFAULTS in src/38-tiers.js),
   so the game reads them as they stand, and `tierChosen` says the player
   picked the tier on the Graphics button. */
const PLAIN_REST = { trackId: 'silverstone-v1', timeOfDay: 'midday', tierChosen: true, defaults: 2 };
const PLAIN = Object.assign({ quality: 'modern' }, PLAIN_REST);

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
  if (o.blockStorage) {
    /* a browser that keeps nothing: every write to localStorage throws, as
       it does with storage full or switched off */
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      if (this === window.localStorage) throw new DOMException('test/picture.js blocked this write', 'QuotaExceededError');
      return setItem.apply(this, arguments);
    };
  }
  if (o.holdAfter) {
    /* The game is held (its own photoHold, which stops the frame loop
       before it draws or counts) once it has drawn this many frames, so a
       check can find a page a known number of frames into its trial on any
       machine. boot assigns window.MCL64 before the first frame is drawn,
       and that is where the count is hung on it. */
    let game;
    Object.defineProperty(window, 'MCL64', {
      configurable: true, enumerable: true,
      get() { return game; },
      set(v) {
        game = v;
        if (!v || !v.countFrame) return;
        const count = v.countFrame;
        let drawn = 0;
        v.countFrame = function () {
          count.apply(this, arguments);
          if (++drawn >= o.holdAfter) this.photoHold = true;
        };
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
     a game or the fallback panel: one of the two is how every boot ends.
     `saved` left out is PLAIN; `null` is a browser with nothing saved. */
  async function bootWith(opts, query, saved, scale, more) {
    if (saved === undefined) saved = PLAIN;
    if (context) await context.close();
    context = await browser.newContext({
      viewport: VIEWPORT, deviceScaleFactor: scale || 1, reducedMotion: 'no-preference', hasTouch: !!(more && more.touch)
    });
    await context.addInitScript(tamper, Object.assign({}, opts, more && more.holdAfter ? { holdAfter: more.holdAfter } : null));
    /* `saved` is what a player's browser would hold from an earlier visit:
       it is in storage before the page's first script reads it. It is put
       there once, on the first load of the context, so that a reload later
       in the same context finds what the game itself left. `more.trial` is
       the same for the key a tier on trial leaves (TIER_TRIAL_KEY in
       src/38-tiers.js). `more.raw` is an object from before the defaults
       changed, which is under the old key and nowhere else. `more.touch` makes the browser one with a touch
       screen, which is what the game's touchLikely() asks about.
       `more.holdAfter` holds every load of the context once it has drawn
       that many frames (see tamper). */
    const held = { [more && more.raw ? OLD_KEY : SETTINGS_KEY]: saved ? JSON.stringify(saved) : null, [TRIAL_KEY]: (more && more.trial) || null };
    await context.addInitScript((h) => {
      if (!sessionStorage.getItem('picture.seeded')) {
        sessionStorage.setItem('picture.seeded', '1');
        for (const k in h) if (h[k] != null) localStorage.setItem(k, h[k]);
      }
      /* Every write the page makes to storage, in order, with whether the
         game existed yet: MCL64 is assigned only once the world is built, so
         a write with `game` false was made before it. */
      window.__writes = [];
      const setItem = window.__setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (this === window.localStorage) window.__writes.push({ key: k, value: String(v), game: !!window.MCL64 });
        return setItem.apply(this, arguments);
      };
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
    await page.goto(server.url + (query || ''), { waitUntil: 'load', timeout: LOAD_MS });
    await settled();
    /* THE STEP DOWN GUARD IS HELD, unless the check is about it
       (`more.pace`). Since Ultra became the default it watches every frame
       of a heavy tier, the title screen's included, and what it would make
       of this machine's frames is not what any other check is asking. The
       flag is the game's own for "has already stepped down once in this
       load". It is set within a frame or two of the game arriving, and the
       guard needs seconds of frames; a reload inside a check starts the
       guard again. With the guard held a trial is passed by its frames
       alone, with no pace to wait for. */
    if (!(more && more.pace)) await page.evaluate(() => { if (window.MCL64) window.MCL64.paceDone = true; });
  }
  const QUERY = WEBGPU ? '' : '?renderer=webgl';
  const boot = (query) => bootWith({}, query);
  /* A boot with settings already saved, at a device pixel ratio of `scale`.
     What `saved` does not name is as PLAIN has it, so a check that names a
     tier stays at Silverstone as a player's own pick. `more.raw` saves the
     object exactly as given: what a browser held from before the defaults
     changed has no `defaults` field, and that is the thing under test. */
  const bootWithSettings = (saved, scale, more) =>
    bootWith({}, QUERY, more && more.raw ? saved : Object.assign({}, PLAIN_REST, saved), scale, more);
  /* a browser with nothing saved at all */
  const bootFresh = (more) => bootWith({}, QUERY, null, 1, more);
  const setting = (key) => page.evaluate((k) => window.MCL64.settings[k], key);
  /* what storage holds of the settings, and the page's writes to storage */
  const storedSettings = () => page.evaluate((key) => { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }, SETTINGS_KEY);
  const writes = () => page.evaluate(() => window.__writes.slice());

  async function settled(circuit) {
    await page.waitForFunction((id) => {
      const f = document.getElementById('fallback');
      if (f && getComputedStyle(f).display !== 'none') return true;
      return !!(window.MCL64 && window.MCL64.track && (!id || window.MCL64.track.def.id === id));
    }, circuit || null, { timeout: LOAD_MS });
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
      await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [SETTINGS_KEY, JSON.stringify(PLAIN)]);
      page = await context.newPage();
      uncaught = [];
      page.on('pageerror', (e) => uncaught.push(e.message));
      await localOnly(page, server.url);
      await page.goto(server.url + '?renderer=webgl', { waitUntil: 'load', timeout: LOAD_MS });
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
    check(await setting('quality') === 'ultra' && await setting('timeOfDay') === 'dusk' && uncaught.length === 0,
      'an unknown tier or time of day falls back to the defaults',
      'quality ' + await setting('quality') + ', timeOfDay ' + await setting('timeOfDay') + ', uncaught ' + JSON.stringify(uncaught));

    /* THE WEATHER (34-weather.js) is a look in Ultra only. A word it does
       not know is clear; and a rain saved beside Retro or Modern is kept in
       the settings and draws nothing at all: no rain built or shown, no wet
       road, the dome's sky with no weather on it, and the shadows the tier
       has always had. */
    await bootWithSettings({ quality: 'ultra', weather: 'snow' });
    check(await setting('weather') === 'clear' && uncaught.length === 0,
      'an unknown weather falls back to clear',
      'weather ' + await setting('weather') + ', uncaught ' + JSON.stringify(uncaught));
    const weatherState = () => page.evaluate(() => {
      const g = window.MCL64;
      return {
        saved: g.settings.weather, now: g.weatherNow(), sky: g.skyRig.weather, shadows: g.shadowRig.mode,
        rain: g.rain ? g.rain.mesh.visible : null, wet: g.wetLook ? g.wetLook.on : null, post: !!g.rtWet,
        row: !document.getElementById('row-weather').hidden
      };
    });
    await bootWithSettings({ quality: 'retro', weather: 'rain' });
    const retroRain = await weatherState();
    await page.evaluate(() => window.MCL64.hookSelect(null, 'modern'));
    const modernRain = await weatherState();
    const ignored = (w, shadows) => w.saved === 'rain' && w.now === 'clear' && w.sky === 'clear' && w.shadows === shadows &&
      w.rain === null && w.wet === null && !w.post && !w.row;
    check(ignored(retroRain, 'blob') && ignored(modernRain, 'single') && consoleErrors.length === 0 && uncaught.length === 0,
      'Retro and Modern ignore a saved rain: nothing of it is built, drawn or shown',
      'Retro ' + JSON.stringify(retroRain) + ', Modern ' + JSON.stringify(modernRain) +
      ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));

    /* --- what a player starts in, and who keeps what ------------------- */

    /* asked of the page by most of the checks from here on */
    const hour = () => page.evaluate(() => {
      /* the sky is asked which hour it drew, the sun light how high it
         stands, and the shadows which way they take the sun to be */
      const g = window.MCL64, sun = g.sun, rig = g.shadowRig;
      const up = (v) => Math.round(Math.asin(v.y / v.length()) * 180 / Math.PI * 10) / 10;
      return {
        quality: g.settings.quality, saved: g.settings.timeOfDay, sky: g.skyRig.mode, drew: g.skyRig.drawn,
        sunUp: up(sun.position.clone().sub(sun.target.position)), shadowsUp: up(rig.offset), shadows: rig.mode
      };
    });
    const tierState = () => page.evaluate((key) => {
      const g = window.MCL64;
      let stored = null;
      try { stored = JSON.parse(localStorage.getItem('mcl64.settings.v2')).quality; } catch (e) {}
      return {
        quality: g.settings.quality, on: g.tierOn, shadows: g.shadowRig.mode, built: g.__built || null,
        label: document.getElementById('set-quality').textContent, stored, trial: localStorage.getItem(key), notice: g.notice
      };
    }, TRIAL_KEY);
    const clickGraphics = () => page.evaluate(() => {
      const b = document.getElementById('set-quality');
      b.click();
      return b.textContent;
    });

    /* A BROWSER WITH NOTHING SAVED comes up in Ultra, at dusk, at Monaco.
       Monaco has a dusk sun of its own, 7.5 degrees up (TIME_OF_DAY_AT in
       32-sky.js), where the table every other circuit reads has 4.5: a new
       player's page that drew the sun at 4.5 would be drawing the general
       dusk, and that is the fault this figure is here to catch. And the tier
       is on trial although nobody picked it: the key and the settings were
       both written before the world was built, which is what leaves them
       behind for the next load if this one dies while it builds. */
    await bootFresh();
    const firstLook = await canvasLook(), first = await hour(), firstTier = await tierState();
    const firstTrack = await page.evaluate(() => window.MCL64.track.def.id);
    const firstWrites = (await writes()).filter((w) => !w.game);
    const keyEarly = firstWrites.some((w) => w.key === TRIAL_KEY && w.value === 'ultra');
    const savedEarly = firstWrites.filter((w) => w.key === SETTINGS_KEY).map((w) => JSON.parse(w.value))
      .some((v) => v.quality === 'ultra' && v.defaults === 2 && v.tierChosen === false && v.userConfigured === false);
    check(firstTrack === 'monaco-gp-v1' && first.quality === 'ultra' && first.saved === 'dusk' && first.sky === 'physical' &&
      first.drew === 'dusk' && first.sunUp === 7.5 && first.shadowsUp === 7.5 && first.shadows === 'cascades' &&
      firstTier.on === 'ultra' && firstTier.label === 'ULTRA' && !firstTier.notice && notBlank(firstLook) &&
      !(await isVisible('#fallback')) && consoleErrors.length === 0 && uncaught.length === 0,
      'a browser with nothing saved comes up at Monaco, in Ultra, at dusk, and draws with no errors',
      'circuit ' + firstTrack + ', ' + JSON.stringify(first) + ', ' + JSON.stringify(firstTier) + ', ' + lookText(firstLook) +
      ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));
    check(keyEarly && savedEarly,
      'and its Ultra is on trial: the key and the settings are written before the world is built',
      'written before the game existed: ' + JSON.stringify(firstWrites));

    /* THE FIRST LOAD DIED before it had drawn its frames: a browser with the
       key and nothing else that a player ever chose. The next load comes up
       in Modern, saved, and says nothing: nobody asked for Ultra. The same
       for a load that got as far as saving the default tier. */
    await bootFresh({ trial: 'ultra' });
    const died = await tierState(), diedSaved = await storedSettings();
    await bootWithSettings({ quality: 'ultra', tierChosen: false, trackId: 'monaco-gp-v1', timeOfDay: 'dusk' }, 1, { trial: 'ultra' });
    const died2 = await tierState(), died2Saved = await storedSettings();
    check(died.quality === 'modern' && died.on === 'modern' && died.shadows === 'single' && died.trial === null && !died.notice &&
      diedSaved && diedSaved.quality === 'modern' && diedSaved.tierChosen === false && diedSaved.defaults === 2 &&
      died2.quality === 'modern' && died2.on === 'modern' && died2.trial === null && !died2.notice &&
      died2Saved && died2Saved.quality === 'modern' && consoleErrors.length === 0 && uncaught.length === 0,
      'a first load that died in the default Ultra is followed by one in Modern, saved, with nothing said',
      'nothing saved: ' + JSON.stringify(died) + ', storage ' + JSON.stringify(diedSaved) + '; the default saved: ' + JSON.stringify(died2) +
      ', storage ' + JSON.stringify(died2Saved) + ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));

    /* LEAVING EARLY IS NOT A FAILURE. A new player's page is reloaded
       when it has drawn 3 of the 60 frames of its trial. The key is still
       there, and until 24 Nov 2026 the next load took it for an Ultra that
       had died: Modern, saved, for every first visit that was cut short.
       The page being left now marks the tier untried (Game.leaveTier, on
       pagehide), so the load that follows is in Ultra again, as the game's
       pick, with its trial started afresh.

       BUT ONLY A PAGE NOTHING WENT WRONG ON may say that. The same again
       with the context lost inside the trial, and again with an error
       nobody caught: each of those pages is reloaded just the same, and the
       load that follows must NOT be in Ultra. Nobody picked the tier, so
       nothing is said. */
    const trialLeft = () => page.evaluate(() => window.MCL64.trialLeft);
    const reloaded = async () => {
      await page.reload({ waitUntil: 'load', timeout: LOAD_MS });
      await settled();
      await page.evaluate(() => { window.MCL64.paceDone = true; });
    };
    await bootFresh({ holdAfter: 3 });
    await page.waitForFunction(() => window.MCL64.photoHold, null, { timeout: LOAD_MS });
    const early = await tierState(), earlyLeft = await trialLeft();
    await reloaded();
    await page.waitForFunction(() => window.MCL64.photoHold, null, { timeout: LOAD_MS });
    const cameBack = await tierState(), cameBackLeft = await trialLeft(), cameBackSaved = await storedSettings();
    check(early.on === 'ultra' && early.trial === 'ultra' && earlyLeft === 57 && cameBack.quality === 'ultra' && cameBack.on === 'ultra' &&
      cameBack.shadows === 'cascades' && cameBack.trial === 'ultra' && cameBackLeft === 57 && !cameBack.notice &&
      cameBackSaved.quality === 'ultra' && cameBackSaved.tierChosen === false && consoleErrors.length === 0 && uncaught.length === 0,
      'a new player\'s page left 3 frames into its trial is not an Ultra that failed: the next load is in Ultra again, on trial',
      'left with ' + earlyLeft + ' frames to draw, ' + JSON.stringify(early) + '; the load after, with ' + cameBackLeft + ' to draw, ' +
      JSON.stringify(cameBack) + ', storage ' + JSON.stringify(cameBackSaved) + ', console errors ' + JSON.stringify(consoleErrors) +
      ', uncaught ' + JSON.stringify(uncaught));

    await loseContext();
    const lostEarlyKey = await page.evaluate((key) => localStorage.getItem(key), TRIAL_KEY);
    await reloaded();
    const lostEarly = await tierState();
    await bootFresh({ holdAfter: 3 });
    await page.waitForFunction(() => window.MCL64.photoHold, null, { timeout: LOAD_MS });
    await page.evaluate(() => { setTimeout(() => { throw new Error('test/picture.js threw this inside the trial'); }, 0); });
    await page.waitForTimeout(200);
    const threw = uncaught.slice(), threwLeft = await trialLeft();
    await reloaded();
    const threwEarly = await tierState();
    check(/^ultra lost/.test(lostEarlyKey) && lostEarly.quality === 'modern' && lostEarly.on === 'modern' && !lostEarly.notice &&
      threw.length === 1 && /inside the trial/.test(threw[0]) && threwLeft === 57 && threwEarly.quality === 'modern' &&
      threwEarly.on === 'modern' && threwEarly.stored === 'ultra' && threwEarly.trial === 'ultra again' && !threwEarly.notice,
      'but a page that lost its ' + (WEBGPU ? 'device' : 'context') + ' inside the trial, or had an error nobody caught, is one: the next load is not in Ultra',
      'key after the loss ' + JSON.stringify(lostEarlyKey) + ', the load after ' + JSON.stringify(lostEarly) + '; uncaught on the other page ' +
      JSON.stringify(threw) + ' with ' + threwLeft + ' frames to draw, the load after ' + JSON.stringify(threwEarly));

    /* SAVED BEFORE THE DEFAULTS CHANGED, and picked: Retro was never the
       default, so a saved Retro is the player's own. It stays, and so does a
       circuit that was not the old default. */
    await bootWithSettings({ quality: 'retro', trackId: 'brands-hatch-v1', musicVol: 4, userConfigured: true }, 1, { raw: true });
    const keptTier = await tierState(), keptSaved = await storedSettings();
    const keptTrack = await page.evaluate(() => window.MCL64.track.def.id);
    check(keptTier.quality === 'retro' && keptTier.on === 'retro' && keptTier.shadows === 'blob' && keptTier.trial === null &&
      keptTrack === 'brands-hatch-v1' && keptSaved.quality === 'retro' && keptSaved.tierChosen === true && keptSaved.defaults === 2 &&
      keptSaved.trackId === 'brands-hatch-v1' && keptSaved.musicVol === 4 && uncaught.length === 0,
      'a Retro and a circuit saved before the defaults changed are the player\'s own, and stay',
      JSON.stringify(keptTier) + ', circuit ' + keptTrack + ', storage ' + JSON.stringify(keptSaved) + ', uncaught ' + JSON.stringify(uncaught));

    /* SAVED BEFORE THE DEFAULTS CHANGED, and never picked: the old default
       tier and circuit, written out whole when the player turned the music
       down. They become Ultra at Monaco at dusk, on trial, and the music
       stays where it was put. ONCE: the player then picks Modern on the
       button and Silverstone in the list, and the load after that keeps
       both. */
    await bootWithSettings({ quality: 'modern', trackId: 'silverstone-v1', musicVol: 4, userConfigured: true }, 1, { raw: true });
    const movedLook = await canvasLook(), moved = await hour(), movedSaved = await storedSettings();
    const movedTrack = await page.evaluate(() => window.MCL64.track.def.id);
    const movedKey = (await writes()).some((w) => !w.game && w.key === TRIAL_KEY && w.value === 'ultra');
    const movedSaid = [await clickGraphics()];
    await page.waitForFunction(() => window.MCL64.tierOn === 'modern', null, { timeout: LOAD_MS });
    /* THE LIVE GAME SAVES BETWEEN THE TWO LOADS: its whole object, in its
       own shape, under the key the two builds share. Nothing here may
       change for it, and this build must never have written that key. */
    const LIVE = JSON.stringify({ quality: 'modern', trackId: 'silverstone-v1', camMode: 1, musicVol: 9, userConfigured: true });
    const oldWrites = (await writes()).filter((w) => w.key === OLD_KEY).length;
    await page.evaluate(([key, value]) => { window.__setItem.call(localStorage, key, value); }, [OLD_KEY, LIVE]);
    await Promise.all([
      page.waitForEvent('load', { timeout: LOAD_MS }),
      page.evaluate(() => window.MCL64.selectTrack('silverstone-v1'))
    ]);
    await settled('silverstone-v1');
    const second = await tierState(), secondSaved = await storedSettings();
    const secondTrack = await page.evaluate(() => window.MCL64.track.def.id);
    const oldNow = await page.evaluate((key) => localStorage.getItem(key), OLD_KEY);
    const oldWritesAfter = (await writes()).filter((w) => w.key === OLD_KEY).length;
    check(moved.quality === 'ultra' && moved.saved === 'dusk' && moved.drew === 'dusk' && moved.shadows === 'cascades' &&
      movedTrack === 'monaco-gp-v1' && notBlank(movedLook) && movedKey && movedSaved.quality === 'ultra' && movedSaved.tierChosen === false &&
      movedSaved.defaults === 2 && movedSaved.trackId === 'monaco-gp-v1' && movedSaved.timeOfDay === 'dusk' && movedSaved.musicVol === 4 &&
      movedSaid.join() === 'MODERN' && second.quality === 'modern' && second.on === 'modern' && secondTrack === 'silverstone-v1' &&
      secondSaved.quality === 'modern' && secondSaved.tierChosen === true && secondSaved.trackId === 'silverstone-v1' &&
      secondSaved.musicVol === 4 && oldNow === LIVE && oldWrites === 0 && oldWritesAfter === 0 &&
      consoleErrors.length === 0 && uncaught.length === 0,
      'the old default tier and circuit under the old key become Ultra at Monaco at dusk, once: Modern and Silverstone picked afterwards are kept, a save by the live game changes nothing, and the old key is never written',
      'first load ' + JSON.stringify(moved) + ', circuit ' + movedTrack + ', key written before the world ' + movedKey + ', storage ' +
      JSON.stringify(movedSaved) + '; the button said ' + movedSaid.join(', ') + '; the load after ' + JSON.stringify(second) + ', circuit ' +
      secondTrack + ', storage ' + JSON.stringify(secondSaved) + ', the old key holds ' + oldNow + ', writes to it ' + (oldWrites + oldWritesAfter) + ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));

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
       back at golden hour (see `hour` above for what is asked). Golden
       hour's sun is 11 degrees up (TIME_OF_DAY in 32-sky.js), where the
       dome's is 48. Then the same through a change of tier at run time, both
       ways. */
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

    /* THE GRAPHICS BUTTON. It steps Ultra, Modern, Retro and round again, so
       the step from Modern is Retro and nobody passes Ultra on the way
       there. From Retro the way to Modern does pass it. The button says the
       new tier at once and the tier is built only when the clicks have
       stopped, so two quick clicks from Retro must end in Modern with Ultra
       never built. Every call of applyQuality is written down with the tier
       it was called for. (tierState and clickGraphics are above, with the
       checks on the defaults.) */
    const watchBuilds = () => page.evaluate(() => {
      const g = window.MCL64, real = g.applyQuality;
      g.__built = [];
      g.applyQuality = function () { g.__built.push(this.settings.quality); return real.apply(this, arguments); };
    });
    await bootWithSettings({ quality: 'modern' });
    await watchBuilds();
    const fromModern = await clickGraphics();
    await page.waitForTimeout(1200);
    const toRetro = await tierState();
    check(fromModern === 'RETRO 240p' && toRetro.built.join() === 'retro' && toRetro.on === 'retro' && toRetro.shadows === 'blob' &&
      toRetro.stored === 'retro' && toRetro.trial === null && consoleErrors.length === 0 && uncaught.length === 0,
      'one click on Graphics goes from Modern to Retro: Ultra is not on the way',
      'the button said ' + fromModern + '; once settled ' + JSON.stringify(toRetro) +
      ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));

    await bootWithSettings({ quality: 'retro' });
    await watchBuilds();
    const said1 = await clickGraphics(), said2 = await clickGraphics();
    const atOnce = await tierState();
    await page.waitForTimeout(1200);
    const landed = await tierState();
    check(said1 === 'ULTRA' && said2 === 'MODERN' && atOnce.built.length === 0 && atOnce.on === 'retro' &&
      landed.built.join() === 'modern' && landed.quality === 'modern' && landed.on === 'modern' && landed.shadows === 'single' &&
      landed.stored === 'modern' && landed.trial === null && consoleErrors.length === 0 && uncaught.length === 0,
      'two quick clicks on Graphics go from Retro to Modern, and Ultra is never built',
      'the button said ' + said1 + ' then ' + said2 + '; straight after ' + JSON.stringify(atOnce) + '; once settled ' + JSON.stringify(landed) +
      ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));

    /* One click, left alone: Ultra is built after the wait, it is on trial
       while it draws its first frames, and once it has drawn them the key
       says it is running on a page in view.

       THEN THE PAGE IS HIDDEN AND SHOWN. A browser under test keeps every
       page in view, so the page is told it is hidden (document.hidden, and
       the event the browser would send). Hidden, a tier that is trusted
       leaves no mark, so a tab thrown away in the background is blamed for
       nothing; shown again, the mark is back. */
    const setHidden = (hidden) => page.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get() { return h; } });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
    await bootWithSettings({ quality: 'retro' });
    await watchBuilds();
    await clickGraphics();
    await page.waitForFunction(() => window.MCL64.tierOn === 'ultra', null, { timeout: LOAD_MS });
    const onTrial = await tierState();
    await page.waitForFunction((key) => localStorage.getItem(key) === 'ultra running', TRIAL_KEY, { timeout: LOAD_MS });
    const trusted = await tierState();
    await setHidden(true);
    const hiddenTier = await tierState();
    await setHidden(false);
    const shownTier = await tierState();
    check(onTrial.built.join() === 'ultra' && onTrial.shadows === 'cascades' && onTrial.trial === 'ultra' && onTrial.stored === 'ultra' &&
      trusted.trial === 'ultra running' && trusted.on === 'ultra' && consoleErrors.length === 0 && uncaught.length === 0,
      'one click from Retro builds Ultra after the wait, on trial until it has drawn its frames, and marked as running after',
      'when built ' + JSON.stringify(onTrial) + '; later ' + JSON.stringify(trusted) +
      ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));
    check(hiddenTier.trial === null && hiddenTier.on === 'ultra' && shownTier.trial === 'ultra running' && uncaught.length === 0,
      'a trusted Ultra leaves no mark while its page is hidden, and the mark is back when the page is shown',
      'hidden ' + JSON.stringify(hiddenTier) + '; shown ' + JSON.stringify(shownTier) + ', uncaught ' + JSON.stringify(uncaught));

    /* A PAGE LOADED OUT OF VIEW (a link opened in a background tab) is not
       trying its tier, and says so before the world is built. The game is
       held before its first frame, so no frame is drawn while the page is
       "hidden". Shown, it is on trial like any other. */
    await context.close();
    context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
    await context.addInitScript(tamper, { holdAfter: 1 });
    await context.addInitScript(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get() { return true; } });
      window.__early = [];
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (this === window.localStorage && !window.MCL64) window.__early.push(k + '=' + v);
        return setItem.apply(this, arguments);
      };
    });
    page = await context.newPage();
    consoleErrors = [];
    uncaught = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().split('\n')[0].slice(0, 200)); });
    page.on('pageerror', (e) => uncaught.push(e.message));
    await localOnly(page, server.url);
    await page.goto(server.url + QUERY, { waitUntil: 'load', timeout: LOAD_MS });
    await settled();
    await page.evaluate(() => { window.MCL64.paceDone = true; });
    const behind = await tierState();
    const behindEarly = await page.evaluate(() => window.__early.slice());
    await setHidden(false);
    const inFront = await tierState();
    check(behind.on === 'ultra' && /^ultra untried/.test(behind.trial) && behindEarly.some((w) => w.indexOf(TRIAL_KEY + '=ultra untried') === 0) &&
      !behindEarly.some((w) => w === TRIAL_KEY + '=ultra') && inFront.trial === 'ultra' && uncaught.length === 0,
      'a new player\'s page loaded out of view marks its Ultra untried before the world is built, and is on trial once it is shown',
      'out of view ' + JSON.stringify(behind) + ', written before the game existed ' + JSON.stringify(behindEarly) + '; shown ' +
      JSON.stringify(inFront) + ', uncaught ' + JSON.stringify(uncaught));

    /* STORAGE THAT KEEPS NOTHING: every write throws. The game starts all
       the same, in Modern, because no trial could be kept; nothing is said,
       and Ultra is still on the button for the visit. */
    const graphicsHint = () => page.evaluate(() => document.getElementById('set-quality-hint').textContent);
    await bootWith({ blockStorage: true }, QUERY, null);
    const blocked = await tierState();
    const blockedTaps = await page.evaluate(() => window.MCL64.tierCycle().join());
    check(blocked.on === 'modern' && blocked.label === 'MODERN' && !blocked.notice && blocked.trial === null && blocked.stored === null &&
      blockedTaps === 'ultra,modern,retro' && !(await isVisible('#fallback')) && !/turned off/.test(await graphicsHint()) && uncaught.length === 0,
      'a browser whose storage cannot be written starts in Modern with nothing said, and the button still offers Ultra',
      JSON.stringify(blocked) + ', the button steps through ' + blockedTaps + ', uncaught ' + JSON.stringify(uncaught));

    /* A TAB THE SYSTEM KILLED IN VIEW, after the trial: the mark of a
       running Ultra is all it left. That is a loss, the first: Modern for
       this load, the player told, nothing saved, a second chance owed, and
       the Graphics button leaves Ultra out meanwhile, with the hint under
       it saying so. */
    await bootWithSettings({ quality: 'ultra' }, 1, { trial: 'ultra running' });
    const killed = await tierState(), killedSaved = await storedSettings();
    const killedTaps = await page.evaluate(() => window.MCL64.tierCycle().join()), killedHint = await graphicsHint();
    check(killed.on === 'modern' && /PAGE STOPPED/.test(killed.notice) && killed.trial === 'ultra again chosen' && killedSaved.quality === 'ultra' &&
      killedSaved.tierChosen === true && killedTaps === 'modern,retro' && /turned off on this device/.test(killedHint) && uncaught.length === 0,
      'loaded with the mark of an Ultra that was running in view, the page comes up in Modern for one load, says why, and owes a second chance',
      JSON.stringify(killed) + ', storage ' + JSON.stringify(killedSaved) + ', the button steps through ' + killedTaps + ', the hint says ' + JSON.stringify(killedHint) +
      ', uncaught ' + JSON.stringify(uncaught));

    /* A load that finds the key: the tier never got through its trial. */
    await bootWithSettings({ quality: 'ultra' }, 1, { trial: 'ultra' });
    const fell = await tierState();
    check(fell.quality === 'modern' && fell.on === 'modern' && fell.shadows === 'single' && fell.trial === null &&
      fell.stored === 'modern' && /ULTRA OFF/.test(fell.notice) && /DID NOT START/.test(fell.notice) &&
      consoleErrors.length === 0 && uncaught.length === 0,
      'loaded with ULTRA saved and the trial key still set, the page comes up in Modern, clears the key and says why',
      JSON.stringify(fell) + ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));

    /* The graphics device goes while Ultra is on: the load after it must not
       walk straight back into Ultra. It comes up in Modern and says why.
       BUT ONE LOSS DOES NOT TURN ULTRA OFF FOR GOOD: devices are lost for
       reasons that have nothing to do with the tier. What storage holds is
       left alone, an Ultra the player picked, and the key says a second
       chance is owed. The player then changes a setting, which writes the
       settings out whole with Modern in them; that must not cost the
       chance. The load after is in Ultra again, the player's own, on trial,
       with nothing said.

       LOST AGAIN IN THAT LOAD, it is lost twice running, and Ultra is off:
       Modern, saved as the game's pick, the player told why, and the load
       after that is Modern still with nothing left to say. */
    await bootWithSettings({ quality: 'ultra' });
    const beforeLoss = await tierState();
    await loseContext();
    const lostKey = await page.evaluate((key) => localStorage.getItem(key), TRIAL_KEY);
    const lostPanel = await isVisible('#fallback');
    await reloaded();
    const afterLoss = await tierState(), afterLossSaved = await storedSettings();
    await page.evaluate(() => { const g = window.MCL64; g.settings.musicVol = 3; g.saveSettings(); });
    const resaved = await storedSettings();
    await reloaded();
    const chance = await tierState(), chanceSaved = await storedSettings();
    const chanceTried = (await writes()).some((w) => !w.game && w.key === TRIAL_KEY && w.value === 'ultra');
    check(beforeLoss.on === 'ultra' && lostKey === 'ultra lost' && lostPanel && afterLoss.quality === 'modern' && afterLoss.on === 'modern' &&
      afterLoss.trial === 'ultra again chosen' && afterLossSaved.quality === 'ultra' && afterLossSaved.tierChosen === true &&
      /DEVICE WAS LOST/.test(afterLoss.notice) && resaved.quality === 'modern' && resaved.musicVol === 3 &&
      chance.quality === 'ultra' && chance.on === 'ultra' && chance.shadows === 'cascades' && chanceTried &&
      !chance.notice && chanceSaved.quality === 'ultra' && chanceSaved.tierChosen === true && chanceSaved.musicVol === 3 && uncaught.length === 0,
      'a ' + (WEBGPU ? 'device' : 'context') + ' lost in Ultra: the reload comes up in Modern and says why, and the load after it tries Ultra again, on trial',
      'key after the loss ' + JSON.stringify(lostKey) + ', panel ' + lostPanel + ', after the reload ' + JSON.stringify(afterLoss) +
      ', storage ' + JSON.stringify(afterLossSaved) + ', after a setting was saved ' + JSON.stringify(resaved) + '; the load after ' +
      JSON.stringify(chance) + ', put on trial before the world was built ' + chanceTried + ', storage ' + JSON.stringify(chanceSaved) +
      ', uncaught ' + JSON.stringify(uncaught));

    await loseContext();
    const lostTwiceKey = await page.evaluate((key) => localStorage.getItem(key), TRIAL_KEY);
    await reloaded();
    const off = await tierState(), offSaved = await storedSettings();
    await reloaded();
    const offStill = await tierState();
    check(lostTwiceKey === 'ultra lost twice' && off.quality === 'modern' && off.on === 'modern' && off.trial === null &&
      offSaved.quality === 'modern' && offSaved.tierChosen === false && /DEVICE WAS LOST/.test(off.notice) &&
      offStill.quality === 'modern' && offStill.on === 'modern' && offStill.trial === null && !offStill.notice && uncaught.length === 0,
      'lost again in the load that was its second chance, Ultra is off: Modern, saved, the player told why, and it stays off',
      'key after the second loss ' + JSON.stringify(lostTwiceKey) + ', after the reload ' + JSON.stringify(off) + ', storage ' +
      JSON.stringify(offSaved) + '; the load after ' + JSON.stringify(offStill) + ', uncaught ' + JSON.stringify(uncaught));

    /* LOST WHILE THE PAGE IS HIDDEN is not a loss of the tier: phones take
       the graphics device from a tab in the background as a matter of
       course. The page is told it is hidden, the device goes, and the load
       after it is in Ultra, on trial, with nothing said and nothing owed. */
    await bootWithSettings({ quality: 'ultra' });
    await setHidden(true);
    await loseContext();
    const hiddenLossKey = await page.evaluate((key) => localStorage.getItem(key), TRIAL_KEY);
    await reloaded();
    const afterHiddenLoss = await tierState(), afterHiddenLossSaved = await storedSettings();
    check(!/lost/.test(hiddenLossKey || '') && afterHiddenLoss.on === 'ultra' && /^ultra( running)?$/.test(afterHiddenLoss.trial) && !afterHiddenLoss.notice &&
      afterHiddenLossSaved.quality === 'ultra' && afterHiddenLossSaved.tierChosen === true && uncaught.length === 0,
      'a ' + (WEBGPU ? 'device' : 'context') + ' lost while the page is hidden does not count against Ultra: the reload is in Ultra, on trial',
      'key after the loss ' + JSON.stringify(hiddenLossKey) + ', after the reload ' + JSON.stringify(afterHiddenLoss) + ', storage ' +
      JSON.stringify(afterHiddenLossSaved) + ', uncaught ' + JSON.stringify(uncaught));

    /* The game's own reload is not a failure. Ultra is clicked to and a
       circuit picked before the clicks have settled: the page reloads with
       Ultra saved and never yet built, and must come up in it, on trial.

       THE ANSWER TO THE RELOAD IS HELD BACK 600 ms, because the page being
       left lives until it arrives, and the tier that was clicked to is
       built 400 ms after the click. On a quiet machine the answer comes
       first and the old page never gets that far; on a busy one it did,
       built Ultra there, left the plain key, and the new page called it a
       failure (this check failed two runs in eight for that reason, and
       passed the rest by luck). Held back, the old page always outlives the
       wait, so the tier's timer has to have been stopped. Every tier the
       old page builds is reported here as well: it must build none. */
    await bootWithSettings({ quality: 'retro', trackId: 'silverstone-v1' });
    const builtBehind = [];
    let heldBack = 0;
    await page.exposeFunction('__builtBehind', (tier) => { builtBehind.push(tier); });
    await page.evaluate(() => {
      const g = window.MCL64, real = g.applyQuality;
      g.applyQuality = function () { window.__builtBehind(this.settings.quality); return real.apply(this, arguments); };
    });
    await page.route((u) => u.href.split('?')[0] === server.url, async (route) => {
      heldBack++;
      await new Promise((r) => setTimeout(r, 600));
      await route.continue();
    });
    await clickGraphics();
    await Promise.all([
      page.waitForEvent('load', { timeout: LOAD_MS }),
      page.evaluate(() => window.MCL64.selectTrack('brands-hatch-v1'))
    ]);
    await settled('brands-hatch-v1');
    /* the page that follows is a load of its own, with the guard on again,
       and the software rasteriser is far too slow for it (see bootWith):
       held, the trial is passed by its frames alone */
    await page.evaluate(() => { window.MCL64.paceDone = true; });
    const carried = await tierState();
    await page.waitForFunction((key) => localStorage.getItem(key) === 'ultra running', TRIAL_KEY, { timeout: LOAD_MS });
    check(carried.quality === 'ultra' && carried.on === 'ultra' && carried.shadows === 'cascades' && !carried.notice &&
      carried.stored === 'ultra' && heldBack === 1 && builtBehind.length === 0 && uncaught.length === 0,
      'Ultra clicked to and a circuit picked at once, with the reload slow to answer: the page being left builds nothing, and the reload comes up in Ultra with no word of a failure',
      JSON.stringify(carried) + ', answers held back ' + heldBack + ', built on the page being left ' + JSON.stringify(builtBehind) +
      ', uncaught ' + JSON.stringify(uncaught));

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

    /* THE GUARD ON A SLOW DEVICE. In Ultra the frame loop counts every frame
       it draws (countFrame) and hands the gap to watchPace, and windows of
       a second whose mean gap is over 40 ms, three on end, give Ultra up
       for Modern (PACE in src/38-tiers.js; test/tiers.test.js has the
       arithmetic). The loop is held here and the frames are handed over by
       hand, so the figures are the test's and not this machine's; the time
       this machine's own first frames took is wiped for the same reason.
       First in a race, in an Ultra the player picked, on the slowest device
       there is: every gap 300 ms. What must NOT trip it comes first: frames
       at a healthy 60 a second, which pass the trial; one slow frame among
       those; one, two and three gaps of 300 ms among those (a hitch spoils
       one window and no more); and slow frames while the race is paused.
       Then the run of them. Four gaps of 300 ms fill a window, so 11 leave
       two windows slow and a third unfinished and it must still be Ultra;
       one more and it must be Modern, saved, with the player told why, the
       Graphics button leaving Ultra out and the hint under it saying how
       to have it back. Last, Ultra picked again in the same load is left
       alone. */
    await bootWithSettings({ quality: 'ultra' }, 1, { pace: true });
    await page.evaluate(() => { window.MCL64.photoHold = true; });
    await page.keyboard.press('Enter');
    const pace = await page.evaluate(() => {
      const g = window.MCL64;
      const feed = (ms, n) => { for (let i = 0; i < n; i++) { g.countFrame(); g.watchPace(ms); } return g.tierOn; };
      const stored = () => { try { return JSON.parse(localStorage.getItem('mcl64.settings.v2')); } catch (e) { return null; } };
      const r = { racing: (g.state === 1 || g.state === 2) && !g.paused, start: g.tierOn };
      g.trialMs = 0;
      r.healthy = feed(16.7, 400);
      r.passed = localStorage.getItem('mcl64.tierTrial.v1');
      g.watchPace(200);
      r.oneSlowFrame = feed(16.7, 400);
      r.longAlone = [1, 2, 3].map((n) => { feed(300, n); return feed(16.7, 400); }).join();
      g.paused = true;
      r.paused = feed(300, 200);
      g.paused = false;
      r.justUnder = feed(300, 11);
      r.over = feed(300, 1);
      r.settings = g.settings.quality; r.stored = stored().quality; r.barred = stored().tierBarred; r.shadows = g.shadowRig.mode; r.notice = g.notice;
      r.label = document.getElementById('set-quality').textContent;
      r.taps = g.tierCycle().join();
      r.hint = document.getElementById('set-quality-hint').textContent;
      g.hookSelect(null, 'ultra');
      r.again = feed(300, 200);
      g.photoHold = false;
      return r;
    });
    check(pace.racing && pace.start === 'ultra' && pace.healthy === 'ultra' && pace.passed === 'ultra running' && pace.oneSlowFrame === 'ultra' &&
      pace.longAlone === 'ultra,ultra,ultra' && pace.paused === 'ultra' && pace.justUnder === 'ultra' && pace.over === 'modern' &&
      pace.settings === 'modern' && pace.stored === 'modern' && pace.shadows === 'single' && pace.label === 'MODERN' &&
      /TOO SLOW/.test(pace.notice) && pace.again === 'ultra' && consoleErrors.length === 0 && uncaught.length === 0,
      'a race in an Ultra the player picked, on a device under 4 frames a second, steps down to Modern after 3 seconds, saves it and says why, and a long gap that stands alone does not trip it',
      JSON.stringify(pace) + ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));
    check(pace.barred === true && pace.taps === 'modern,retro' && /turned off on this device/.test(pace.hint) && /all the way round once/.test(pace.hint),
      'and from then on the Graphics button steps between Modern and Retro, with the hint saying Ultra was turned off and how to have it back',
      JSON.stringify(pace));

    /* HELD TO 30 FRAMES A SECOND IS NOT SLOW. Low Power Mode on a phone, a
       laptop saving energy and a 30 Hz screen all give gaps of 33 ms on a
       device that may run Ultra with time to spare, and Modern would run at
       the same 30 there. So 400 such gaps, 13 seconds of them, leave Ultra
       on (the limit was a mean over 25 ms once, and took Ultra away from
       every such device on every load). Gaps of 45 ms, 22 frames a second,
       are a slow device: 55 of them cannot fill three windows wherever the
       window stood when they began, and it must still be Ultra; by 45 more
       it must be Modern, saved, with the player who picked it told why. */
    await bootWithSettings({ quality: 'ultra' }, 1, { pace: true });
    const capped = await page.evaluate(() => {
      const g = window.MCL64;
      const feed = (ms, n) => { for (let i = 0; i < n; i++) { g.countFrame(); g.watchPace(ms); } return g.tierOn; };
      g.photoHold = true;
      g.trialMs = 0;
      const r = { start: g.tierOn };
      r.thirty = feed(33.4, 400);
      r.justUnder = feed(45, 55);
      r.over = feed(45, 45);
      r.settings = g.settings.quality; r.shadows = g.shadowRig.mode; r.notice = g.notice;
      try { r.stored = JSON.parse(localStorage.getItem('mcl64.settings.v2')).quality; } catch (e) { r.stored = null; }
      g.photoHold = false;
      return r;
    });
    check(capped.start === 'ultra' && capped.thirty === 'ultra' && capped.justUnder === 'ultra' && capped.over === 'modern' &&
      capped.settings === 'modern' && capped.stored === 'modern' && capped.shadows === 'single' && /TOO SLOW/.test(capped.notice) &&
      consoleErrors.length === 0 && uncaught.length === 0,
      'a browser held to 30 frames a second keeps its Ultra, and frames 45 ms apart for 3 seconds step it down',
      JSON.stringify(capped) + ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));

    /* THE SAME GUARD ON THE TITLE SCREEN, for the Ultra nobody picked: a
       browser with nothing saved, which never leaves the title. Healthy
       frames, then 55 gaps of 45 ms and it is still Ultra, by 45 more it
       is Modern. QUIETLY: no notice, and nothing with the words of a fault in
       it. Saved as the game's pick, so the load after it is Modern too, and
       says nothing either. A tap on Graphics there says Retro, not Ultra,
       and so do the next two: Modern, Retro. Only the fourth, with the
       player all the way round once, says Ultra. The four are quick, so
       Ultra is the one tier built; it is the player's own, and the guard,
       which runs afresh in every load, says why when it takes it away
       again, and the button leaves Ultra out once more. */
    await bootFresh({ pace: true });
    const quietly = await page.evaluate(() => {
      const g = window.MCL64;
      const feed = (ms, n) => { for (let i = 0; i < n; i++) { g.countFrame(); g.watchPace(ms); } return g.tierOn; };
      g.photoHold = true;
      g.trialMs = 0;
      /* Game's STATE: 0 is the title */
      const r = { title: g.state === 0, start: g.tierOn, chosen: g.settings.tierChosen };
      r.healthy = feed(16.7, 400);
      r.justUnder = feed(45, 55);
      r.over = feed(45, 45);
      r.settings = g.settings.quality; r.shadows = g.shadowRig.mode; r.notice = g.notice; r.message = g.message;
      r.label = document.getElementById('set-quality').textContent;
      r.trial = localStorage.getItem('mcl64.tierTrial.v1');
      g.photoHold = false;
      return r;
    });
    const quietSaved = await storedSettings();
    await page.reload({ waitUntil: 'load', timeout: LOAD_MS });
    await settled();
    const stayed = await tierState(), stayedTrack = await page.evaluate(() => window.MCL64.track.def.id);
    await page.evaluate(() => { window.MCL64.photoHold = true; });
    await watchBuilds();
    const round = await page.evaluate(() => {
      const b = document.getElementById('set-quality'), hint = document.getElementById('set-quality-hint');
      const r = { said: [], hints: [hint.textContent] };
      for (let i = 0; i < 4; i++) { b.click(); r.said.push(b.textContent); r.hints.push(hint.textContent); }
      return r;
    });
    await page.waitForFunction(() => window.MCL64.tierOn === 'ultra', null, { timeout: LOAD_MS });
    const byHand = await tierState(), byHandSaved = await storedSettings();
    const loudly = await page.evaluate(() => {
      const g = window.MCL64;
      for (let i = 0; i < 400; i++) { g.countFrame(); g.watchPace(16.7); }
      for (let i = 0; i < 100; i++) { g.countFrame(); g.watchPace(45); }
      return { on: g.tierOn, notice: g.notice, taps: g.tierCycle().join(), hint: document.getElementById('set-quality-hint').textContent };
    });
    const loudSaved = await storedSettings();
    check(quietly.title && quietly.start === 'ultra' && quietly.chosen === false && quietly.healthy === 'ultra' && quietly.justUnder === 'ultra' &&
      quietly.over === 'modern' && quietly.settings === 'modern' && quietly.shadows === 'single' && quietly.label === 'MODERN' &&
      quietly.notice === '' && !/SLOW|OFF|FAIL|LOST/.test(quietly.message) && quietly.trial === null &&
      quietSaved.quality === 'modern' && quietSaved.tierChosen === false && quietSaved.userConfigured === false && quietSaved.defaults === 2 &&
      stayed.quality === 'modern' && stayed.on === 'modern' && !stayed.notice && stayedTrack === 'monaco-gp-v1' &&
      consoleErrors.length === 0 && uncaught.length === 0,
      'slow frames on the title screen step a default Ultra down to Modern without a word, saved, and the next load stays there',
      JSON.stringify(quietly) + ', storage ' + JSON.stringify(quietSaved) + '; the load after ' + JSON.stringify(stayed) + ' at ' + stayedTrack +
      ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));
    check(round.said.join() === 'RETRO 240p,MODERN,RETRO 240p,ULTRA' && /all the way round once/.test(round.hints[0]) && /all the way round once/.test(round.hints[1]) &&
      /offered again, after Retro/.test(round.hints[2]) && /offered again, after Retro/.test(round.hints[3]) && !/turned off/.test(round.hints[4]) &&
      byHand.built.join() === 'ultra' && byHand.on === 'ultra' && byHand.shadows === 'cascades' && byHandSaved.quality === 'ultra' &&
      byHandSaved.tierChosen === true && byHandSaved.tierBarred === false && loudly.on === 'modern' && /TOO SLOW/.test(loudly.notice) &&
      loudly.taps === 'modern,retro' && /all the way round once/.test(loudly.hint) &&
      loudSaved.quality === 'modern' && loudSaved.tierChosen === false && loudSaved.tierBarred === true && consoleErrors.length === 0 && uncaught.length === 0,
      'the stepped down player\'s taps say Retro, Modern, Retro and only then Ultra, with the hint saying how; Ultra is theirs by hand, and when the guard takes that away it says why',
      'the button said ' + round.said.join(', ') + ', the hints ' + JSON.stringify(round.hints) + ', then ' + JSON.stringify(byHand) + ', storage ' + JSON.stringify(byHandSaved) + '; slow frames again: ' +
      JSON.stringify(loudly) + ', storage ' + JSON.stringify(loudSaved) + ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));

    /* A TOUCH DEVICE IS OFFERED ULTRA like any other (the ruling that kept
       it off phones was lifted on 24 Nov 2026): a saved Ultra loads as
       Ultra, and the Graphics button steps through all three tiers. The
       three clicks are quick and end where they began, so nothing is built.
       And with nothing saved, the tier a touch device is given is Ultra. */
    await bootWithSettings({ quality: 'ultra' }, 1, { touch: true });
    const touchLoad = await tierState();
    const touchSaid = [await clickGraphics(), await clickGraphics(), await clickGraphics()];
    const touchPoints = await page.evaluate(() => navigator.maxTouchPoints);
    await page.waitForTimeout(1200);
    const touchAfter = await tierState();
    await bootWith({}, QUERY, null, 1, { touch: true });
    const touchFresh = await tierState();
    check(touchPoints > 0 && touchLoad.quality === 'ultra' && touchLoad.on === 'ultra' && touchLoad.shadows === 'cascades' &&
      touchSaid.join() === 'MODERN,RETRO 240p,ULTRA' && touchAfter.on === 'ultra' &&
      touchFresh.quality === 'ultra' && touchFresh.on === 'ultra' && touchFresh.shadows === 'cascades' &&
      consoleErrors.length === 0 && uncaught.length === 0,
      'a touch device is offered Ultra: a saved Ultra loads as Ultra, the Graphics button steps through it, and it is the default there too',
      'touch points ' + touchPoints + ', loaded ' + JSON.stringify(touchLoad) + ', the button said ' + touchSaid.join(', ') +
      ', after the clicks ' + JSON.stringify(touchAfter) + ', with nothing saved ' + JSON.stringify(touchFresh) +
      ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));

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
      /* the weather, the same way: one round first, which builds the rain
         and the wet road that are kept from then on, then thirty changes */
      const weathers = ['cloudy', 'rain', 'clear'];
      for (let i = 0; i < 3; i++) { g.setWeather(weathers[i]); g.drawFrame(1); }
      const weatherBase = read();
      for (let i = 0; i < 30; i++) { g.setWeather(weathers[i % 3]); g.drawFrame(1); }
      const weatherAfter = read();
      /* and back in clear, nothing of the weather is drawn */
      const clearAgain = { weather: g.settings.weather, rain: g.rain ? g.rain.mesh.visible : null, wet: g.wetLook ? g.wetLook.on : null,
        post: !!g.rtWet, shadows: g.shadowRig.mode, sky: g.skyRig.weather };
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
      return { tiersBase, tiersAfter, hoursBase, hoursAfter, weatherBase, weatherAfter, clearAgain };
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
    check(same(kept.weatherBase, kept.weatherAfter) && consoleErrors.length === 0 && uncaught.length === 0,
      'thirty changes of weather in Ultra leave the renderer holding what it held after the first three',
      'after three ' + JSON.stringify(kept.weatherBase) + ', after thirty more ' + JSON.stringify(kept.weatherAfter) +
      ', console errors ' + JSON.stringify(consoleErrors) + ', uncaught ' + JSON.stringify(uncaught));
    const ca = kept.clearAgain;
    check(ca.weather === 'clear' && ca.rain === false && ca.wet === false && !ca.post && ca.shadows === 'cascades' && ca.sky === 'clear',
      'with weather clear in Ultra the rain is not drawn, the road is dry, the post pass has no wet road and the cascades are back',
      JSON.stringify(ca));

    /* The texture sweep: five circuits, each loaded in each tier and then
       switched at run time. Console errors count here, over all of it,
       because a node that fails to build says so there and only there. */
    await boot(WEBGPU ? '' : '?renderer=webgl');
    const circuits = await page.evaluate(() => window.MCL64.tracks.map((t) => t.id));
    check(circuits.length === 5, 'the game lists five circuits', circuits.join(', '));
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
        await page.reload({ waitUntil: 'load', timeout: LOAD_MS });
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
