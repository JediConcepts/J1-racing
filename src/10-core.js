/* =========================================================================
   MCL-64  —  core: math, bitmap font, texture forge, audio synth
   ========================================================================= */

/* COLOUR MANAGEMENT IS OFF, and switching it off is the first thing the game
   does with the engine.

   The game decides for itself what each colour means, as it did for r128: a
   hex passed through srgb() below is converted to linear by the game, and a
   bare hex is taken as linear already (the sky dome, the lights, the fog).
   three.js 0.187 would otherwise convert every hex it is handed, so the
   srgb() ones would be converted twice and every lit surface would come out
   about a third as bright. With management off a colour is exactly what r128
   took it for. The price is that the engine's own output conversion does
   nothing either, so the post pass in 40-game.js encodes by hand.

   WHY HERE. It has to happen before the first Color is made, and colours are
   made as the files load (the tables further down the chain call srgb() at
   load, long before boot runs), so boot is too late. This file is the first
   in the build order that touches THREE at all, which makes its first line
   the first thing the game runs with the engine present. It also means a
   test that evaluates the source files with THREE gets the engine in the
   state the game runs it in, which a line in build.js's wrapper would not.

   WHY GUARDED, and why it can throw. The guard says nothing in exactly two
   cases, and each is silent because there is nothing to switch off:

     no THREE at all   test/music.test.js evaluates this file with no engine,
                       so the file must load without one. Nothing else at
                       load needs it. Nothing is done.
     r128              tools/bake-tracks.js (and test/track-bake.test.js
                       through it) evaluates this file with the r128 it
                       samples the circuits with. r128 has no colour
                       management at all: a colour is what it is handed.
                       Nothing is done. It is known by THREE.REVISION being
                       '128' and by nothing looser, so no other engine can
                       pass for it.

   Every other case is an engine that manages colour, and it has to have
   THREE.ColorManagement. The bundle only carries the name because
   tools/three-entry.webgpu.js lists it, and a bundle rebuilt without it
   reports another revision, or none, and would run with management ON and
   no error, every lit surface about a third as bright. So that is an error
   here, at load, where it cannot be missed. */
if (typeof THREE !== 'undefined') {
  if (THREE.ColorManagement) {
    THREE.ColorManagement.enabled = false;
  } else if (THREE.REVISION !== '128') {
    throw new Error('MCL-64: this three.js bundle has no THREE.ColorManagement, so colour management ' +
      'cannot be switched off and the game would draw about a third as bright. Put ColorManagement ' +
      'back in tools/three-entry.webgpu.js and rebuild vendor/three.bundle.js with tools/vendor-three.js.');
  }
}

var TAU = Math.PI * 2;

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function damp(a, b, lambda, dt) { return lerp(a, b, 1 - Math.exp(-lambda * dt)); }
function smoothstep(e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
function sign(v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); }
function angleDelta(a, b) { var d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 0:00.000 — leading zero minutes dropped, ms padded */
function fmtTime(ms) {
  if (ms == null || !isFinite(ms) || ms <= 0) return '--.---';
  var total = Math.floor(ms);
  var m = Math.floor(total / 60000);
  var s = Math.floor((total % 60000) / 1000);
  var f = total % 1000;
  var ss = (s < 10 ? '0' : '') + s;
  var ff = (f < 100 ? (f < 10 ? '00' : '0') : '') + f;
  return m > 0 ? m + ':' + ss + '.' + ff : ss + '.' + ff;
}

function fmtDelta(ms) {
  if (ms == null || !isFinite(ms)) return '';
  var a = Math.abs(ms);
  return (ms >= 0 ? '+' : '-') + (a / 1000).toFixed(3);
}

/* =========================================================================
   5x7 BITMAP FONT
   Drawn by hand so every viewer sees identical glyphs — no font loading,
   no fallback, and the right texel density for a 240p screen.
   ========================================================================= */

var FONT = {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..##.', '....#', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  'A': ['..#..', '.#.#.', '#...#', '#...#', '#####', '#...#', '#...#'],
  'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  'C': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  'D': ['###..', '#..#.', '#...#', '#...#', '#...#', '#..#.', '###..'],
  'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  'G': ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'I': ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  'J': ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  'K': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  'N': ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  'Q': ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  'W': ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  'X': ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
  '"': ['.#.#.', '.#.#.', '.....', '.....', '.....', '.....', '.....'],
  '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
  '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
  '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...']
};

var GLYPH_W = 5, GLYPH_H = 7;

function textWidth(str, scale, tracking) {
  scale = scale || 1;
  tracking = tracking == null ? 1 : tracking;
  return str.length > 0 ? (str.length * (GLYPH_W + tracking) - tracking) * scale : 0;
}

/* Draws crisp pixel text. Every lit texel is one fillRect at the internal
   resolution, so it upscales with the framebuffer instead of fighting it. */
function drawText(ctx, str, x, y, scale, color, shadow, tracking) {
  scale = scale || 1;
  tracking = tracking == null ? 1 : tracking;
  str = String(str).toUpperCase();
  var cx = Math.round(x), cy = Math.round(y);
  var pass, rows, r, c, ch, i, px, py;
  for (pass = shadow ? 0 : 1; pass < 2; pass++) {
    ctx.fillStyle = pass === 0 ? shadow : color;
    var ox = pass === 0 ? scale : 0;
    var oy = pass === 0 ? scale : 0;
    for (i = 0; i < str.length; i++) {
      ch = str.charAt(i);
      rows = FONT[ch];
      if (!rows) continue;
      px = cx + i * (GLYPH_W + tracking) * scale + ox;
      for (r = 0; r < GLYPH_H; r++) {
        py = cy + r * scale + oy;
        var row = rows[r];
        var runStart = -1;
        for (c = 0; c <= GLYPH_W; c++) {
          var lit = c < GLYPH_W && row.charAt(c) === '#';
          if (lit && runStart < 0) runStart = c;
          else if (!lit && runStart >= 0) {
            ctx.fillRect(px + runStart * scale, py, (c - runStart) * scale, scale);
            runStart = -1;
          }
        }
      }
    }
  }
}

function drawTextRight(ctx, str, x, y, scale, color, shadow, tracking) {
  drawText(ctx, str, x - textWidth(String(str).toUpperCase(), scale, tracking), y, scale, color, shadow, tracking);
}

function drawTextCenter(ctx, str, cx, y, scale, color, shadow, tracking) {
  drawText(ctx, str, cx - textWidth(String(str).toUpperCase(), scale, tracking) / 2, y, scale, color, shadow, tracking);
}

/* =========================================================================
   TEXTURE FORGE
   Everything is generated at 32-64px: the N64's texture cache was 4KB, and
   working inside that budget is what produces the era's soft mipmap haze.
   ========================================================================= */

function makeCanvas(w, h) {
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/* Hex literals in this file are sRGB — that is how anyone reads or picks a
   colour. The renderer now works in linear light, and a value handed over
   unconverted is interpreted as linear, which lifts every midtone on the way
   back out: papaya turns into pale apricot and the whole scene washes. This
   is the other half of colour management, and it applies to material colours
   and vertex colours exactly as it does to textures. */
function srgb(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }

function texFromCanvas(cv, repX, repY, nearest) {
  var t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX || 1, repY || 1);
  if (nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter; }
  else { t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; }
  t.generateMipmaps = true;
  t.anisotropy = 1;
  /* NO COLOUR SPACE ON THE TEXTURE, ON PURPOSE.

     These canvases are painted in sRGB, which is what a 2D context gives,
     and the painted values have to be turned into light before the lighting
     uses them. What matters is WHERE that happens. r128 stored the painted
     values as they were (RGBA8), let the GPU build the mip chain from them
     and smooth between texels and between mip levels on them, and turned
     the smoothed sample into light in the shader. three.js 0.187, handed a
     texture flagged sRGB, stores it in an sRGB format (SRGB8_ALPHA8 on the
     fallback, rgba8unorm-srgb on WebGPU), and the GPU then turns every
     texel into light BEFORE it smooths. The mean of the light is brighter
     than the light of the mean, so every texture of strong contrast came
     out lighter wherever its pattern ran together: the crowd in the far
     stands by up to 42 levels, Monaco's buildings by up to 33.

     So the texture is left with no colour space. That stores it as r128
     stored it, and the GPU smooths the painted values as r128's did. The
     mark below asks decodeCanvasMaps for the other half: the shader turns
     the smoothed sample into light, where r128's shader did. A texture
     made here and put on a material that decodeCanvasMaps never sees would
     be lit as if its painted values were light, and read far too bright. */
  t.userData.decodeInShader = true;
  return t;
}

/* THE OTHER HALF OF texFromCanvas: the shader turns the sample into light.

   Every material under `root` whose map came from texFromCanvas is given
   two nodes. Its colour becomes the material's colour times the smoothed
   sample turned into light (the engine's own sRGBTransferEOTF, which is the
   curve r128's shader used, constant for constant). Its opacity becomes the
   material's opacity times the sample's alpha. That is what r128 computed,
   in the order r128 computed it; the vertex colours, the alpha test and the
   lighting follow as they did.

   The renderer turns a MeshStandardMaterial or a MeshBasicMaterial into a
   node material each time it builds a shader, by copying every property
   across, which is how a node set on one of them comes to apply.

   ONE PAIR OF NODES SERVES EVERY MATERIAL, and reads the map, the colour and
   the opacity through the mesh that is being drawn (`material.map` of the
   mesh, and so on). Both halves of that matter:

   - The renderer shares one compiled shader between materials that look
     alike to it, and it does not look inside a node. A node that held one
     texture was tried: Monaco's quay was drawn with the road's texture,
     and nothing on the console said so.
   - The shadow pass draws every mesh with the renderer's own shadow
     material and asks the mesh's material for the alpha of its colour node.
     A reference that went through the material being drawn would find the
     shadow material there, which has no map, and the shader would not
     build. Through the mesh it finds the same material in every pass.

   The sample's alpha goes on the opacity and the colour node's own alpha is
   1, because the shadow pass multiplies the map's alpha in by itself. Left
   on the colour it would be counted twice there, and a tree, which is cut
   out by an alpha test, would cast a thinner outline than it shows.

   Not served: a mesh that carries a list of materials, where `material.map`
   cannot be read through the mesh. The game has none. One that turned up
   with a canvas texture is an error here, not a pale texture later.

   This lives beside texFromCanvas so the two halves are read together. It
   needs THREE only when it is called. */
var _canvasMapNodes = null;
function decodeCanvasMaps(root) {
  function marked(m) { return !!(m && m.map && m.map.userData.decodeInShader); }
  if (!_canvasMapNodes) {
    var T = THREE.TSL, texel = T.reference('material.map', 'texture');
    _canvasMapNodes = {
      color: T.vec4(T.sRGBTransferEOTF(texel.rgb).mul(T.reference('material.color', 'color')), 1),
      opacity: T.reference('material.opacity', 'float').mul(texel.a)
    };
  }
  root.traverse(function (o) {
    var m = o.material;
    if (!m) return;
    if (m.length) {
      for (var i = 0; i < m.length; i++) {
        if (marked(m[i])) throw new Error('MCL-64: a mesh with a list of materials carries a canvas texture, which decodeCanvasMaps cannot serve.');
      }
      return;
    }
    if (marked(m) && !m.colorNode) {
      m.colorNode = _canvasMapNodes.color;
      m.opacityNode = _canvasMapNodes.opacity;
    }
  });
}

function noiseFill(ctx, w, h, base, amp, rnd, density) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  var n = Math.floor(w * h * (density == null ? 0.5 : density));
  for (var i = 0; i < n; i++) {
    var x = Math.floor(rnd() * w), y = Math.floor(rnd() * h);
    var d = Math.floor((rnd() - 0.5) * amp);
    ctx.fillStyle = 'rgba(' + (d > 0 ? 255 : 0) + ',' + (d > 0 ? 255 : 0) + ',' + (d > 0 ? 255 : 0) + ',' + (Math.abs(d) / 255).toFixed(3) + ')';
    ctx.fillRect(x, y, 1, 1);
  }
}

function makeCityGroundTex() {
  var s = 64, cv = makeCanvas(s, s), ctx = cv.getContext('2d'), rnd = mulberry32(8);
  noiseFill(ctx, s, s, '#bdaea3', 80, rnd, 0.45);
  return cv;
}

function makeAsphaltTex() {
  var s = 64, cv = makeCanvas(s, s), ctx = cv.getContext('2d'), rnd = mulberry32(7);
  noiseFill(ctx, s, s, '#6f6f7d', 150, rnd, 0.55);
  /* faint longitudinal seams — reads as a resurfaced racing groove at speed */
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  ctx.fillRect(0, 0, s, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, 30, s, 1);
  return cv;
}

function makeRunoffTex() {
  var s = 64, cv = makeCanvas(s, s), ctx = cv.getContext('2d'), rnd = mulberry32(11);
  noiseFill(ctx, s, s, '#8d8a92', 120, rnd, 0.6);
  return cv;
}

function makeGrassTex() {
  var s = 64, cv = makeCanvas(s, s), ctx = cv.getContext('2d'), rnd = mulberry32(23);
  noiseFill(ctx, s, s, '#5f8f47', 90, rnd, 0.7);
  for (var i = 0; i < 26; i++) {
    ctx.fillStyle = 'rgba(40,70,30,' + (0.10 + rnd() * 0.18).toFixed(2) + ')';
    var x = rnd() * s, y = rnd() * s, r = 3 + rnd() * 9;
    ctx.fillRect(x, y, r, r * 0.6);
  }
  return cv;
}

function makeKerbTex() {
  var w = 16, h = 64, cv = makeCanvas(w, h), ctx = cv.getContext('2d');
  for (var i = 0; i < 8; i++) {
    ctx.fillStyle = (i % 2 === 0) ? '#e8e8ea' : '#d2352f';
    ctx.fillRect(0, i * 8, w, 8);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, 2, h);
  return cv;
}

function makeWallTex() {
  var w = 64, h = 32, cv = makeCanvas(w, h), ctx = cv.getContext('2d');
  ctx.fillStyle = '#e9e9ec'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ff8000'; ctx.fillRect(0, 0, w, 11);
  ctx.fillStyle = '#22232a'; ctx.fillRect(0, h - 7, w, 7);
  for (var i = 0; i < 4; i++) { ctx.fillStyle = '#ff8000'; ctx.fillRect(i * 16 + 2, 14, 6, 12); }
  return cv;
}

function makePitwallTex() {
  var w = 64, h = 32, cv = makeCanvas(w, h), ctx = cv.getContext('2d');
  ctx.fillStyle = '#1d1e24'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ff8000'; ctx.fillRect(0, 4, w, 3);
  drawText(ctx, 'MCL 64', 8, 12, 1, '#ffffff', null, 1);
  ctx.fillStyle = '#ff8000'; ctx.fillRect(0, 25, w, 3);
  return cv;
}

function makeCrowdTex() {
  var s = 64, cv = makeCanvas(s, s), ctx = cv.getContext('2d'), rnd = mulberry32(91);
  ctx.fillStyle = '#2a2b33'; ctx.fillRect(0, 0, s, s);
  var pal = ['#ff8000', '#ffb166', '#e8e8ea', '#4fe3e0', '#d2352f', '#f2d16b', '#7a7d8c'];
  for (var y = 2; y < s; y += 4) {
    for (var x = 1; x < s; x += 3) {
      if (rnd() < 0.82) {
        ctx.fillStyle = pal[Math.floor(rnd() * pal.length)];
        ctx.fillRect(x, y + (rnd() < 0.5 ? 0 : 1), 2, 2);
      }
    }
  }
  return cv;
}

/* RGBA billboard foliage — the crossed-quad tree is the period-correct
   solution and still the cheapest good-looking one. */
function makeTreeTex() {
  var s = 64, cv = makeCanvas(s, s), ctx = cv.getContext('2d'), rnd = mulberry32(1337);
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = '#4b3524';
  ctx.fillRect(29, 34, 6, 30);
  var blobs = [[32, 20, 17], [22, 27, 12], [42, 27, 12], [32, 32, 14], [26, 15, 9], [40, 16, 9]];
  for (var i = 0; i < blobs.length; i++) {
    var b = blobs[i];
    ctx.fillStyle = i % 2 ? '#3f6b2e' : '#4f8438';
    ctx.beginPath(); ctx.arc(b[0], b[1], b[2], 0, TAU); ctx.fill();
  }
  ctx.fillStyle = 'rgba(120,180,90,0.55)';
  for (var j = 0; j < 40; j++) { ctx.fillRect(18 + rnd() * 28, 8 + rnd() * 22, 2, 2); }
  return cv;
}

function makeCloudTex() {
  var w = 64, h = 32, cv = makeCanvas(w, h), ctx = cv.getContext('2d'), rnd = mulberry32(555);
  ctx.clearRect(0, 0, w, h);
  for (var i = 0; i < 16; i++) {
    ctx.fillStyle = 'rgba(255,252,246,' + (0.5 + rnd() * 0.5).toFixed(2) + ')';
    var x = 8 + rnd() * 48, y = 10 + rnd() * 14, r = 4 + rnd() * 9;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  return cv;
}

/* Trackside signage uses the same 5x7 font as the HUD — one voice on screen
   and in the world. */
function makeSignTex(text, bg, fg, accent, minW) {
  var textW = text.length * 12;
  var w = Math.max(minW || 128, textW + 32);
  var h = 32, cv = makeCanvas(w, h), ctx = cv.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  if (accent) { ctx.fillStyle = accent; ctx.fillRect(0, 0, w, 3); ctx.fillRect(0, h - 3, w, 3); }
  drawTextCenter(ctx, text, w / 2, (h - GLYPH_H * 2) / 2, 2, fg, null, 1);
  return cv;
}

function makeStartLineTex() {
  var s = 256, cv = makeCanvas(s, s), ctx = cv.getContext('2d');
  ctx.fillStyle = '#f9f9fc'; ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = '#111115';
  for (var y = 0; y < 16; y++) {
    for (var x = 0; x < 16; x++) {
      if ((x + y) % 2 === 0) ctx.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  return cv;
}

/* =========================================================================
   AUDIO — synthesized, no samples. Engine note is two detuned saws through a
   throttle-driven lowpass; everything is created lazily on first input so we
   never trip autoplay policy.
   ========================================================================= */

/* Three buses under one master:
     engineBus — the continuous drone (engine, wind, tyre scrub). Loud by
                 nature and off by default; the music is the better default.
     fxBus     — short cues (start lights, lap chime, contact). Always on.
     musicBus  — the score.
   Each is toggled independently so turning the engine off does not also kill
   the music. */
function EngineAudio() {
  this.ctx = null;
  this.ready = false;
  this.engineMuted = true;
  this.musicMuted = false;
  this.failed = false;
  /* 0..1 trims sitting under the mutes, so turning a bus down and turning it
     off stay separate controls. */
  this.engineVol = 1;
  this.musicVol = 1;
  this.theme = MUSIC_THEMES.papaya;
}

/* A circuit's theme. Resets the step counter so a switch starts the loop at
   bar one rather than dropping into the middle of the new pattern. */
EngineAudio.prototype.setMusicTheme = function (id) {
  var th = MUSIC_THEMES[id] || MUSIC_THEMES.papaya;
  if (this.theme === th) return;
  this.theme = th;
  this.musicStep = 0;
};

EngineAudio.prototype.setLevels = function (engineVol, musicVol) {
  this.engineVol = clamp(engineVol, 0, 1);
  this.musicVol = clamp(musicVol, 0, 1);
  /* Music level is applied in tickMusic, which already ramps the bus every
     frame; setting it here too would fight that ramp. */
  if (this.engineBus) this.engineBus.gain.value = this.engineMuted ? 0 : this.engineVol;
};

EngineAudio.prototype.init = function () {
  if (this.ctx || this.failed) return;
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.failed = true; return; }
    var ctx = this.ctx = new AC();

    this.master = ctx.createGain();
    this.master.gain.value = 0.0;
    this.master.connect(ctx.destination);

    this.engineBus = ctx.createGain();
    this.engineBus.gain.value = this.engineMuted ? 0 : this.engineVol;
    this.engineBus.connect(this.master);

    this.fxBus = ctx.createGain();
    this.fxBus.gain.value = 0.85;
    this.fxBus.connect(this.master);

    /* engine */
    this.eGain = ctx.createGain(); this.eGain.gain.value = 0.0;
    this.eFilter = ctx.createBiquadFilter();
    this.eFilter.type = 'lowpass'; this.eFilter.frequency.value = 900; this.eFilter.Q.value = 3;
    this.eGain.connect(this.eFilter); this.eFilter.connect(this.engineBus);

    this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth'; this.osc1.frequency.value = 80;
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'square'; this.osc2.frequency.value = 120;
    this.osc3 = ctx.createOscillator(); this.osc3.type = 'sawtooth'; this.osc3.frequency.value = 161;
    this.g2 = ctx.createGain(); this.g2.gain.value = 0.35;
    this.g3 = ctx.createGain(); this.g3.gain.value = 0.22;
    this.osc1.connect(this.eGain);
    this.osc2.connect(this.g2); this.g2.connect(this.eGain);
    this.osc3.connect(this.g3); this.g3.connect(this.eGain);
    this.osc1.start(); this.osc2.start(); this.osc3.start();

    /* noise bed: reused for tyre scrub and wind */
    var len = Math.floor(ctx.sampleRate * 2);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.noiseBuf = buf;
    this.noise = ctx.createBufferSource();
    this.noise.buffer = buf; this.noise.loop = true;

    this.scrubFilter = ctx.createBiquadFilter();
    this.scrubFilter.type = 'bandpass'; this.scrubFilter.frequency.value = 2100; this.scrubFilter.Q.value = 1.4;
    this.scrubGain = ctx.createGain(); this.scrubGain.gain.value = 0;
    this.noise.connect(this.scrubFilter); this.scrubFilter.connect(this.scrubGain); this.scrubGain.connect(this.engineBus);

    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass'; this.windFilter.frequency.value = 500;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    this.noise.connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(this.engineBus);

    this.noise.start();
    this.ready = true;
  } catch (e) { this.failed = true; }
};

EngineAudio.prototype.resume = function () {
  if (!this.ctx) return;
  if (this.ctx.state === 'suspended' && this.ctx.resume) this.ctx.resume();
};

EngineAudio.prototype.setEngineMuted = function (m) {
  this.engineMuted = m;
  if (this.ready) this.engineBus.gain.setTargetAtTime(m ? 0 : this.engineVol, this.ctx.currentTime, 0.08);
};

EngineAudio.prototype.wake = function () {
  this.init();
  this.resume();
  if (this.ready) this.master.gain.setTargetAtTime(0.55, this.ctx.currentTime, 0.2);
};

/* rpm01 0..1, load 0..1 (throttle), speed01 0..1, scrub 0..1.
   Levels are held well down: this drone runs continuously, and anything
   comfortable for a two-second listen is punishing over three laps. */
EngineAudio.prototype.update = function (rpm01, load, speed01, scrub, alive) {
  if (!this.ready || this.engineMuted) return;
  var t = this.ctx.currentTime, tc = 0.045;
  var base = 52 + rpm01 * 300;
  if (!alive) { base = 42; load = 0; }
  this.osc1.frequency.setTargetAtTime(base, t, tc);
  this.osc2.frequency.setTargetAtTime(base * 1.5 + 2, t, tc);
  this.osc3.frequency.setTargetAtTime(base * 2.01, t, tc);
  this.eFilter.frequency.setTargetAtTime(500 + rpm01 * 2600 + load * 1400, t, tc);
  this.eGain.gain.setTargetAtTime(alive ? (0.045 + load * 0.070 + rpm01 * 0.028) : 0.022, t, tc);
  this.scrubGain.gain.setTargetAtTime(scrub * 0.075, t, 0.06);
  this.windGain.gain.setTargetAtTime(speed01 * speed01 * 0.045, t, 0.12);
};

EngineAudio.prototype.blip = function (freq, dur, type, vol) {
  if (!this.ready) return;
  try {
    var t = this.ctx.currentTime;
    var o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol == null ? 0.28 : vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.fxBus);
    o.start(t); o.stop(t + dur + 0.03);
  } catch (e) { /* audio is decorative — never break the frame for it */ }
};

/* =========================================================================
   MUSIC — an original race theme, synthesised live.

   Deliberately NOT a cover of anyone's F1 title music: this is a new riff
   written to sit in the same territory — driving minor-key bass, four to the
   floor, backbeat snare. Am - Am - F - G over four bars.
   ========================================================================= */

var MUSIC_BPM = 134;

/* NOTE ON THE NEW THEMES BELOW — these are ORIGINAL pieces written in the
   idiom of mid-80s driving rock: four-on-the-floor kick, backbeat snare,
   octave-jumping bass, i-VI-III-VII changes, an anthemic lead sitting high
   over the top. That progression and that drum pattern are the common stock
   of the entire genre and belong to nobody. No existing melody is quoted,
   transposed or paraphrased in any of them. */

/* MIDI note numbers; null = rest. 32 eighth-notes = four bars. */
var BASS_LINE = [
  45, null, 45, 48, 50, null, 48, 45,
  45, null, 45, 48, 50, 52, 53, null,
  41, null, 41, 45, 48, null, 45, 41,
  43, null, 43, 47, 50, 52, 53, null
];

var LEAD_LINE = [
  null, null, null, null, null, null, null, null,
  69, null, 72, null, 71, 69, 67, 69,
  null, null, null, null, null, null, null, null,
  67, null, 69, null, 72, 71, 69, 67
];

/* root, third, fifth per bar */
var CHORDS = [[57, 60, 64], [57, 60, 64], [53, 57, 60], [55, 59, 62]];

var KICK = [1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 1, 0,
            1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 1, 0];
var SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0,
             0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1];

/* SPEEDWAY — Indianapolis. D minor, i-VI-III-VII (Dm-Bb-F-C), four on the
   floor, bass jumping the octave on the off-beat, hook entering every second
   bar. Faster and flatter than the road-circuit theme because the oval never
   asks you to lift. */
var SPEEDWAY_BASS = [
  38, 38, 50, 38, 38, 38, 45, 48,
  34, 34, 46, 34, 34, 34, 41, 43,
  41, 41, 53, 41, 41, 41, 48, 50,
  36, 36, 48, 36, 36, 36, 43, 45
];
var SPEEDWAY_LEAD = [
  null, null, null, null, null, null, null, null,
  69, null, 70, null, 69, 65, 62, null,
  null, null, null, null, null, null, null, null,
  72, null, 70, null, 69, 67, 65, null
];
var SPEEDWAY_CHORDS = [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]];
var SPEEDWAY_KICK = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
                     1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
var SPEEDWAY_SNARE = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0,
                      0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1];

/* DOWNLAND — Brands Hatch. E minor, Em-C-G-D, a syncopated kick rather than a
   straight four, and a bass that breathes on the off-beat. Darker and rollier
   to match a circuit that spends its lap going up and down. */
var DOWNLAND_BASS = [
  40, null, 40, 47, 40, null, 43, 45,
  36, null, 36, 43, 36, null, 40, 42,
  43, null, 43, 50, 43, null, 47, 48,
  38, null, 38, 45, 38, null, 42, 43
];
var DOWNLAND_LEAD = [
  null, null, null, null, null, null, null, null,
  71, null, 72, 71, 69, null, 67, null,
  null, null, null, null, null, null, null, null,
  67, null, 69, 71, 72, null, 71, null
];
var DOWNLAND_CHORDS = [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]];
var DOWNLAND_KICK = [1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0,
                     1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0];
var DOWNLAND_SNARE = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0,
                      0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0];

/* VALSE DE MONACO — Monte Carlo. The odd one out, and deliberately so: the
   other three are 4/4 driving rock and this is a 3/4 musette, the accordion
   waltz of a Paris street rather than a grid.

   G harmonic minor, i - iv - V7 - i. The F# is the point — the raised seventh
   of the harmonic minor is what makes the ear hear Europe rather than a
   generic minor-key game tune, and it is the note the whole idiom turns on.

   Written as an oom-pah-pah, which is a rhythm the engine could not previously
   express: the bass takes beat one alone, and the chord answers on two and
   three, staccato. Voicings move by a step or less between bars, which is how
   the accompaniment stays out of the melody's way — see `comp` in tickMusic.

   Original, in the idiom, like the other three. Nothing is quoted, transposed
   or paraphrased. i-iv-V7-i and oom-pah-pah are the common stock of every
   waltz written since the 1800s and belong to nobody. */
var MONACO_BASS = [
  43, null, null, null, null, 46,
  48, null, null, null, null, 50,
  50, null, null, null, null, 42,
  43, null, null, null, null, 45
];
/* The tune. Arches up through the Gm triad, turns at the top on Eb, then walks
   back down to the F# that pulls the loop round again. */
var MONACO_LEAD = [
  67, 70, 74, 75, 74, 72,
  70, null, 72, 70, 67, null,
  69, null, 66, 69, 72, null,
  74, 72, 70, 69, 67, 66
];
/* Gm - Cm - D7 - Gm, voiced for minimum movement: G-Bb-D, G-C-Eb, F#-A-C,
   G-Bb-D. The D7 is rootless — the bass is already playing the D. */
var MONACO_CHORDS = [[55, 58, 62], [55, 60, 63], [54, 57, 60], [55, 58, 62]];
/* Kick on the downbeat only, doubling the oom. */
var MONACO_KICK = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0,
                   1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0];
/* A backbeat on two and three, at less than half a hit. A full snare here
   turns a waltz into a rock song in 3/4; at 0.45 it sits under the reeds and
   keeps some of the drive the other three circuits have. */
var MONACO_SNARE = [0, 0, 0.45, 0, 0.45, 0, 0, 0, 0.45, 0, 0.45, 0,
                    0, 0, 0.45, 0, 0.45, 0, 0, 0, 0.45, 0, 0.45, 0];

/* NEON CHANT: Las Vegas, the Strip at night. A crowd chant over the simplest
   support a pop record has. It replaced Neon Mile, which the owner asked to
   be more catchy, with more of a pop hook.

   A major, 128 bpm, eight bars, the chords A, E, F#m, D played twice. Eight
   bars rather than four because the chant is four two bar phrases, and each
   needs its second bar nearly empty to leave the hook room.

   The hook is a rhythm first: X . X X . X . . | X, five hits that end on the
   next downbeat. It sounds four times a loop:

     call     C# C# D B  | E    bars 1 and 2, a leap up a fourth to land
     again    C# C# D B  | F#   bars 3 and 4, the leap stretches to a fifth
     answer   A  C# B A  | B    bars 5 and 6, no leap; it turns round home
                                and stops on the second, which asks for more
     higher   F# F# G# E | A    bars 7 and 8, the call a fourth up; the top
                                A is the high point, heard once a loop

   The first two landings are echoed late in their bar (B to E, B to F#), so
   the leap, the part that sticks, is heard six times a loop; the answer and
   the high call keep their bars empty. The head turns up a step before it
   falls (3 3 4 2) rather than running down 3 2 1, which is the nursery rhyme
   shape every chant falls back on.

   The lead is doubled by a second voice about ten cents sharp, like more
   than one throat singing. The bass sits on the off beats between the kicks,
   on the upper root where a phone speaker can carry it, dropping an octave
   on the last eighth of each bar. The chord is a short stab on two and four
   voiced below the tune, so the only thing in the tune's register is the
   tune.

   Original. Nothing is quoted, transposed or paraphrased. I V vi IV, four on
   the floor and an off beat bass are common stock and belong to nobody. */
var VEGAS_BASS = [
  null, 45, null, 45, null, 45, null, 33,
  null, 52, null, 52, null, 52, null, 40,
  null, 54, null, 54, null, 54, null, 42,
  null, 50, null, 50, null, 50, null, 38,
  null, 45, null, 45, null, 45, null, 33,
  null, 52, null, 52, null, 52, null, 40,
  null, 54, null, 54, null, 54, null, 42,
  null, 50, null, 50, null, 50, null, 38
];
var VEGAS_LEAD = [
  73, null, 73, 74, null, 71, null, null,
  76, null, null, null, null, 71, 76, null,
  73, null, 73, 74, null, 71, null, null,
  78, null, null, null, null, 71, 78, null,
  69, null, 73, 71, null, 69, null, null,
  71, null, null, null, null, null, null, null,
  78, null, 78, 80, null, 76, null, null,
  81, null, null, null, null, null, null, null
];
/* A, E, F#m, D, twice, voiced A3 to F#4 where they sound. */
var VEGAS_CHORDS = [[45, 49, 52], [44, 47, 52], [45, 49, 54], [45, 50, 54],
                    [45, 49, 52], [44, 47, 52], [45, 49, 54], [45, 50, 54]];
/* Four on the floor all the way through. */
var VEGAS_KICK = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
                  1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
                  1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
                  1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
/* Backbeat on two and four, and a short pickup in the last bar back to the
   top. */
var VEGAS_SNARE = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0,
                   0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0,
                   0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0,
                   0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0.4, 1, 0.6];

/* The theme below is the runner up for Las Vegas, kept so the owner can
   hear it in the game with ?music=vegas3 (see Game.buildWorld). No circuit
   names it. It can go once a theme is chosen. A third candidate (it was to
   be vegas2) was left out: a judge found the second half of its riff too
   close to a well known song. */

/* LOW NEON: Las Vegas, the Strip at night. The bass is the tune.

   C# minor, 128 bpm, eight bars:  C#m, A, C#m, B, C#m, A, C#m, G#

   Two bar call and answer, four times round. In the odd bars the bass plays
   the riff and the lead is silent; in the even bars the bass drops to three
   notes and the lead answers in the gaps it leaves. Bass and lead share
   only one step, the C# that opens the loop, so each is heard whole on a
   phone speaker.

   The riff, one bar:  C#3 . C#3 G#3 . F#3 G#3 .   (1 . 1 5 . 4 5 .)
   Its one leap is the fifth up on the and of two; the rest is a step down
   and back. It is stated four times, each repeat changing one thing: an
   F# echo on the last eighth (bar 3), a third C# on the and of one
   (bar 5), and a fall to E instead of the return to G# (bar 7), which
   closes the phrase before the G# bar. It sits at C#3 to G#3, the top of
   the bass range, so a small speaker carries it.

   The answer, one rhythm all four times:  . x x x . x x .
   An x y x turn (the bass riff's G# F# G#, a step lower and two octaves
   up), then two notes that settle on beat four: up to A, up again to B
   (the high point of the loop, bar 4), down to C#, and in bar 8 down to
   B#, which resolves to the C# at the top of the loop.

   The chord is a short stab on beats two and four with the snare, doubling
   the riff where it lands. Every lead and bass note under a stab is a note
   of that chord. Voiced from B#3 to B4, below every lead note.

   Original. Nothing is quoted, transposed or paraphrased; a minor vamp, four
   on the floor and a backbeat stab are common stock and belong to nobody. */
var VEGAS3_BASS = [
  49, null, 49, 56, null, 54, 56, null,
  45, null, null, null, 52, null, null, 47,
  49, null, 49, 56, null, 54, 56, 54,
  47, null, null, null, 54, null, null, 48,
  49, 49, 49, 56, null, 54, 56, null,
  45, null, null, null, 52, null, null, 47,
  49, null, 49, 56, null, 54, 52, null,
  44, null, null, null, 51, null, null, 48
];
var VEGAS3_LEAD = [
  73, null, null, null, null, null, null, null,
  null, 78, 76, 78, null, 80, 81, null,
  null, null, null, null, null, null, null, null,
  null, 80, 78, 80, null, 81, 83, null,
  null, null, null, null, null, null, null, null,
  null, 78, 76, 78, null, 76, 73, null,
  null, null, null, null, null, null, null, null,
  null, 76, 75, 76, null, 75, 72, null
];
/* C#m, A, C#m, B, C#m, A, C#m, G# (B# D# G#, the raised seventh for the
   pull home). */
var VEGAS3_CHORDS = [[49, 52, 56], [49, 52, 57], [49, 52, 56], [51, 54, 59],
                     [49, 52, 56], [49, 52, 57], [49, 52, 56], [48, 51, 56]];
/* Four on the floor all the way through. */
var VEGAS3_KICK = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
                   1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
                   1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
                   1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
/* Backbeat on two and four, a ghost on the last eighth of each riff bar,
   and a short fill into the top of the loop. */
var VEGAS3_SNARE = [0, 0, 1, 0, 0, 0, 1, 0.3, 0, 0, 1, 0, 0, 0, 1, 0,
                    0, 0, 1, 0, 0, 0, 1, 0.3, 0, 0, 1, 0, 0, 0, 1, 0,
                    0, 0, 1, 0, 0, 0, 1, 0.3, 0, 0, 1, 0, 0, 0, 1, 0,
                    0, 0, 1, 0, 0, 0, 1, 0.3, 0, 0, 1, 0, 0, 0.5, 1, 0.7];

/* Chord on the downbeat: what every 4/4 theme here does, and the default. */
var COMP_DOWNBEAT = [0];

/* A circuit names one of these; unknown or absent falls back to `papaya`. */
var MUSIC_THEMES = {
  papaya:   { bpm: 134, bass: BASS_LINE,     lead: LEAD_LINE,     chords: CHORDS,          kick: KICK,          snare: SNARE },
  speedway: { bpm: 142, bass: SPEEDWAY_BASS, lead: SPEEDWAY_LEAD, chords: SPEEDWAY_CHORDS, kick: SPEEDWAY_KICK, snare: SPEEDWAY_SNARE },
  downland: { bpm: 126, bass: DOWNLAND_BASS, lead: DOWNLAND_LEAD, chords: DOWNLAND_CHORDS, kick: DOWNLAND_KICK, snare: DOWNLAND_SNARE },
  /* comp/compDur/detune/leadWave are the waltz-only fields; every one of them
     defaults to the 4/4 behaviour above when a theme omits it. */
  monaco:   { bpm: 168, bass: MONACO_BASS,   lead: MONACO_LEAD,   chords: MONACO_CHORDS,   kick: MONACO_KICK,   snare: MONACO_SNARE,
              comp: [2, 4], compDur: 0.16, detune: 1.007, leadWave: 'sawtooth' },
  vegas:    { bpm: 128, bass: VEGAS_BASS,    lead: VEGAS_LEAD,    chords: VEGAS_CHORDS,    kick: VEGAS_KICK,    snare: VEGAS_SNARE,
              comp: [2, 6], compDur: 0.2, detune: 1.006 },
  /* The runner up, for auditioning only: no circuit names it. */
  vegas3:   { bpm: 128, bass: VEGAS3_BASS,   lead: VEGAS3_LEAD,   chords: VEGAS3_CHORDS,   kick: VEGAS3_KICK,   snare: VEGAS3_SNARE,
              comp: [2, 6], compDur: 0.12 }
};

function midiFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

EngineAudio.prototype.initMusic = function () {
  if (!this.ready || this.musicBus) return;
  var ctx = this.ctx;
  this.musicBus = ctx.createGain();
  this.musicBus.gain.value = 0;
  this.musicBus.connect(this.master);
  this.musicStep = 0;
  this.musicNext = 0;
  /* Does NOT touch musicMuted. Building the bus is lazy and happens on the
     first gesture, long after the saved preference has been applied — forcing
     it false here would silently turn the music back on for anyone who had
     switched it off, which is precisely the setting we are trying to keep. */
};

EngineAudio.prototype.tone = function (t, freq, dur, type, vol, cutoff) {
  var ctx = this.ctx;
  var o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
  if (cutoff) {
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t); f.Q.value = 6;
    o.connect(f); f.connect(g);
  } else {
    o.connect(g);
  }
  g.connect(this.musicBus);
  o.start(t); o.stop(t + dur + 0.05);
};

/* vel scales the hit, defaulting to a full one. It exists because Monaco wants
   a backbeat soft enough to sit under an accordion rather than in front of it,
   and a theme carries its dynamics in its own pattern arrays — a 1 is a full
   hit, so every pattern written before this behaves exactly as it did. */
EngineAudio.prototype.drum = function (t, kind, vel) {
  var ctx = this.ctx;
  var v = (vel === undefined || vel === null) ? 1 : vel;
  if (kind === 'kick') {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(132, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.62 * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.20);
    o.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + 0.22);
    return;
  }
  /* snare / hat share the noise bed through different filters */
  var src = ctx.createBufferSource();
  src.buffer = this.noiseBuf;
  var f = ctx.createBiquadFilter();
  var g2 = ctx.createGain();
  if (kind === 'snare') {
    f.type = 'bandpass'; f.frequency.value = 1750; f.Q.value = 0.8;
    g2.gain.setValueAtTime(0.34 * v, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.start(t); src.stop(t + 0.18);
  } else {
    f.type = 'highpass'; f.frequency.value = 7200;
    g2.gain.setValueAtTime(0.10, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    src.start(t); src.stop(t + 0.06);
  }
  src.connect(f); f.connect(g2); g2.connect(this.musicBus);
};

/* Scheduled against the audio clock with a lookahead, so the groove does not
   wobble with the frame rate. */
EngineAudio.prototype.tickMusic = function (level) {
  if (!this.ready) return;
  this.initMusic();
  if (!this.musicBus) return;

  var target = this.musicMuted ? 0 : level * this.musicVol;
  this.musicBus.gain.setTargetAtTime(target, this.ctx.currentTime, 0.35);
  if (target <= 0.001 && this.musicBus.gain.value < 0.005) return;

  var th = this.theme || MUSIC_THEMES.papaya;
  var stepDur = 30 / (th.bpm || MUSIC_BPM);   /* an eighth note */
  var now = this.ctx.currentTime;
  if (this.musicNext < now) this.musicNext = now + 0.06;

  /* DERIVED, not declared. Both used to be the constants 32 and 8, which made
     4/4 an assumption of the engine rather than a property of a theme. Monaco
     is a waltz: 24 eighth-notes, six to the bar. Taking the pattern length from
     the arrays themselves and the bar length from the chord count means a theme
     cannot disagree with itself — a `steps: 24` field beside a 24-long array is
     the same fact written twice, and the second copy is the one that goes
     stale. The three 4/4 themes give 32 and 8 exactly as before. */
  var n = th.bass.length;
  var barSteps = n / th.chords.length;

  /* Which beats of the bar the chord sounds on. The default is the downbeat,
     which is what every theme did when this was `i % 8 === 0`. A musette
     inverts it: the bass takes the downbeat and the chord answers on two and
     three — that displacement IS the oom-pah-pah, and it cannot be written as
     note data because the chord track had no rhythm of its own. */
  var comp = th.comp || COMP_DOWNBEAT;
  var compDur = th.compDur || 0.62;
  var leadWave = th.leadWave || 'square';

  var guard = 0;
  while (this.musicNext < now + 0.25 && guard++ < 16) {
    var i = this.musicStep, t = this.musicNext;

    if (th.bass[i] != null) this.tone(t, midiFreq(th.bass[i]), 0.23, 'sawtooth', 0.30, 620);
    if (th.lead[i] != null) {
      var lf = midiFreq(th.lead[i]);
      this.tone(t, lf, 0.26, leadWave, 0.11, 2600);
      /* Musette tuning is two reeds a few cents apart, beating against each
         other. The beating is not an effect applied to an accordion — it is
         what makes the sound one, so the second voice belongs here in the
         instrument and not in an effects chain the engine does not have. */
      if (th.detune) this.tone(t, lf * th.detune, 0.26, leadWave, 0.095, 2600);
    }
    /* The pattern value is the velocity, so a 1 is the full hit every theme
       written before this used. */
    if (th.kick[i]) this.drum(t, 'kick', th.kick[i]);
    if (th.snare[i]) this.drum(t, 'snare', th.snare[i]);
    this.drum(t, 'hat');

    if (comp.indexOf(i % barSteps) >= 0) {
      var ch = th.chords[(i / barSteps) | 0];
      for (var c = 0; c < ch.length; c++) {
        this.tone(t, midiFreq(ch[c] + 12), compDur, 'triangle', 0.055, 1800);
      }
    }

    this.musicStep = (i + 1) % n;
    this.musicNext += stepDur;
  }
};

EngineAudio.prototype.thud = function (power) {
  if (!this.ready) return;
  try {
    var t = this.ctx.currentTime;
    var o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 320;
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.22);
    g.gain.setValueAtTime(clamp(power, 0, 1) * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(f); f.connect(g); g.connect(this.fxBus);
    o.start(t); o.stop(t + 0.34);
  } catch (e) { /* see above */ }
};

function makeBuildingTex(baseColor, winColor) {
  var w = 256, h = 256, cv = makeCanvas(w, h), ctx = cv.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, w, h);
  
  // draw some noise for texture
  for (var i = 0; i < 2000; i++) {
    ctx.fillStyle = (Math.random() > 0.5) ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)';
    ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 8, 2 + Math.random() * 8);
  }

  // Windows
  var padding = 8;
  var winW = 24;
  var winH = 32;
  for (var y = padding; y < h; y += winH + padding) {
    for (var x = padding; x < w; x += winW + padding) {
      if (Math.random() > 0.1) {
        // window frame
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(x - 2, y - 2, winW + 4, winH + 4);
        // glass
        ctx.fillStyle = winColor;
        ctx.fillRect(x, y, winW, winH);
        // reflection
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.moveTo(x, y + winH);
        ctx.lineTo(x + winW, y);
        ctx.lineTo(x + winW, y + winH);
        ctx.fill();
        // mullions
        ctx.fillStyle = '#111';
        ctx.fillRect(x + winW/2 - 1, y, 2, winH);
        ctx.fillRect(x, y + winH/2 - 1, winW, 2);
      }
    }
  }
  return cv;
}

function makeCheckeredBannerTex(text, bg, fg, accent) {
  var w = 512, h = 64, cv = makeCanvas(w, h), ctx = cv.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  
  ctx.fillStyle = '#111';
  for (var y = 0; y < 4; y++) {
    for (var x = 0; x < 8; x++) {
      if ((x+y)%2 === 0) {
        ctx.fillRect(x*16, y*16, 16, 16);
        ctx.fillRect(w - 128 + x*16, y*16, 16, 16);
      }
    }
  }
  ctx.fillStyle = '#fff';
  for (var y = 0; y < 4; y++) {
    for (var x = 0; x < 8; x++) {
      if ((x+y)%2 !== 0) {
        ctx.fillRect(x*16, y*16, 16, 16);
        ctx.fillRect(w - 128 + x*16, y*16, 16, 16);
      }
    }
  }

  if (accent) { ctx.fillStyle = accent; ctx.fillRect(0, 0, w, 4); ctx.fillRect(0, h - 4, w, 4); }
  drawTextCenter(ctx, text, w / 2, (h - GLYPH_H * 3) / 2, 3, fg, null, 1);
  return cv;
}
