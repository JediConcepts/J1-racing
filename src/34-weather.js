/* =========================================================================
   MCL-64: the weather, as a look (Ultra only)
   =========================================================================
   Cloud and rain are a picture and nothing else. The design's ruling: "Rain
   in the picture stage is a look, not a condition. It is an Ultra setting,
   clearly labelled as visual only, with dry grip and the normal board."
   Nothing in this file is read by the simulation, and nothing here reads a
   clock: the rain falls by a time the frame loop hands it (Game.render).

   The names are WEATHER_NAMES in 38-tiers.js. Clear is the picture as it
   was before any of this, and nothing here is built, drawn or set for it. */

/* WHAT EACH WEATHER DOES TO AN HOUR. Laid over the hour's row (TIME_OF_DAY
   and TIME_OF_DAY_AT in 32-sky.js) by weatherRow, so every hour and every
   circuit has its own cloudy and its own rain, and a dusk under cloud is
   still a dusk.

     sunK, skyK, fillK   what the hour's three light strengths are
                         multiplied by. Cloud cuts the direct sun hard and
                         spreads it into the sky light and the fill, so the
                         picture is lit soft and flat with faint shadows.
     grey, greyMix       how far the colour of the sky light and the fill go
                         over to a neutral grey: an overcast sky is not blue
     land                the colour the light from below goes over to
     cloud, cloudDensity the model's own clouds: cover and how solid
     overcast            how far the drawn sky goes over to one flat colour
                         (see makeSky in 32-sky.js)
     overBright          that colour's brightness, as a share of the clear
                         horizon's brightness away from the sun at the hour
     overTint            its colour
     overKeep            how much of the model's own sky is kept on top, for
                         the cloud's texture and the smudge where the sun is
     haze                what the hour's fog start and end are multiplied
                         by: the air is greyer and nearer
     windows             what the lit windows of an hour that has them are
                         multiplied by (setHour in 20-track.js): with the sun
                         gone they carry the picture
     cloudSpeed          how fast the model's clouds move in play (never in
                         a photo)
     grade               multiplied into the hour's grade (GRADES in
                         40-game.js): a cooler, greyer finish */
var WEATHER_LOOK = {
  cloudy: {
    sunK: 0.16, skyK: 1.20, fillK: 1.25,
    grey: [0.84, 0.85, 0.88], greyMix: 0.65, land: [0.40, 0.38, 0.34],
    cloud: 0.85, cloudDensity: 0.7,
    overcast: 0.85, overBright: 0.58, overTint: [0.93, 0.97, 1.05], overKeep: 0.20,
    haze: [0.55, 0.90],
    windows: 1.3,
    cloudSpeed: 0.00004,
    grade: { gain: [0.98, 0.99, 1.03], saturation: 0.84 }
  },
  rain: {
    sunK: 0.03, skyK: 0.55, fillK: 0.60,
    grey: [0.74, 0.79, 0.88], greyMix: 0.80, land: [0.30, 0.30, 0.30],
    cloud: 0.95, cloudDensity: 1.0,
    overcast: 0.95, overBright: 0.30, overTint: [0.88, 0.94, 1.08], overKeep: 0.10,
    haze: [0.30, 0.70],
    windows: 2.6,
    cloudSpeed: 0.00008,
    grade: { gain: [0.96, 0.98, 1.04], saturation: 0.74 }
  }
};

function mix3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/* An hour's row with a weather over it: a new object, the row is not
   touched. */
function weatherRow(row, look) {
  var r = {}, k;
  for (k in row) if (row.hasOwnProperty(k)) r[k] = row[k];
  r.sunK = row.sunK * look.sunK;
  r.skyK = row.skyK * look.skyK;
  r.fillK = row.fillK * look.fillK;
  r.sky = mix3(row.sky, look.grey, look.greyMix);
  r.fill = mix3(row.fill, look.grey, look.greyMix * 0.6);
  r.land = mix3(row.land, look.land, look.greyMix);
  r.cloud = look.cloud;
  r.cloudDensity = look.cloudDensity;
  r.overcast = look.overcast;
  r.overBright = look.overBright;
  r.overTint = look.overTint;
  r.overKeep = look.overKeep;
  r.haze = [row.haze[0] * look.haze[0], row.haze[1] * look.haze[1]];
  if (row.windows) r.windows = row.windows * look.windows;
  return r;
}

/* --- the rain that falls ---------------------------------------------------

   ONE DRAW. A single mesh of RAIN_STREAKS thin quads, each a streak of rain,
   placed in the vertex stage and never touched by the CPU after it is made.
   Every streak has a fixed point in the world, given by the two uv sets it
   carries, that falls with time at RAIN.fall metres a second; the stage
   wraps it into a box round the camera, so the rain is always round the
   player and stands still in the world as the car drives through it. The
   quad is turned to face the camera about the line the streak falls along.

   Two layers in the one mesh: the near rain, in a box RAIN.box across, and
   a soft far veil of longer, fainter streaks, in a box RAIN.far times as
   big. The near ones fade in from RAIN.near metres, so nothing is drawn
   across the lens, and both fade out towards the walls of their box, so no
   streak is seen to jump from one side to the other.

   The positions come from uv sets and not from the position attribute,
   because the engine's bundle exports uv() and not the node for the
   position attribute (tools/three-entry.webgpu.js). The position attribute
   is there only to give the draw its vertex count. */
var RAIN_STREAKS = 6400;
var RAIN = {
  near_share: 0.72,              /* the share of the streaks in the near box */
  box: [24, 16, 24],             /* the near box, metres: x, y, z */
  far: 3.5,                      /* the far box is this many times bigger */
  fall: [1.6, -12.5, 0.9],       /* metres a second: a little slanted */
  length: 0.85,                  /* metres: what the eye sees in a frame */
  farLength: 2.6,
  width: 0.006,                  /* metres, and at least this share of the
                                    distance, so a far streak is a pixel */
  widthPerMetre: 0.0016,
  near: 0.8,                     /* metres from the camera where a streak
                                    has faded in */
  alpha: 0.24,                   /* the near streaks */
  farAlpha: 0.20                 /* the far veil */
};

function RainRig(scene) {
  var T = THREE.TSL;
  this.uTime = T.uniform(0);
  this.uCam = T.uniform(new THREE.Vector3());
  this.uColour = T.uniform(new THREE.Vector3(0.5, 0.5, 0.5));
  this.uAlpha = T.uniform(1);

  var n = RAIN_STREAKS, rnd = mulberry32(31);
  var pos = new Float32Array(n * 12);
  var corner = new Float32Array(n * 8), seed = new Float32Array(n * 8), more = new Float32Array(n * 8);
  var index = [];
  var cx = [-1, 1, 1, -1], cy = [0, 0, 1, 1];
  for (var i = 0; i < n; i++) {
    var sx = rnd(), sy = rnd(), sz = rnd(), layer = i < n * RAIN.near_share ? 0 : 1;
    for (var v = 0; v < 4; v++) {
      var o = (i * 4 + v) * 2;
      corner[o] = cx[v]; corner[o + 1] = cy[v];
      seed[o] = sx; seed[o + 1] = sz;
      more[o] = sy; more[o + 1] = layer;
    }
    var b = i * 4;
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  var g = this.geometry = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(corner, 2));
  g.setAttribute('uv1', new THREE.BufferAttribute(seed, 2));
  g.setAttribute('uv2', new THREE.BufferAttribute(more, 2));
  g.setIndex(index);

  var at = T.uv(), s = T.uv(1), m = T.uv(2);
  var layer = m.y;
  var scale = T.mix(T.float(1.0), T.float(RAIN.far), layer);
  var box = T.vec3(RAIN.box[0], RAIN.box[1], RAIN.box[2]).mul(scale);
  var fall = T.vec3(RAIN.fall[0], RAIN.fall[1], RAIN.fall[2]);
  /* the streak's own point, falling, then wrapped into the box round the
     camera: fract and not mod, which is the same on both backends for a
     number below zero */
  var p = T.vec3(s.x, m.x, s.y).mul(box).add(fall.mul(this.uTime));
  var rel = p.sub(this.uCam).div(box).fract().sub(0.5).mul(box);
  /* the box sits a little high: rain is seen falling from above the car */
  rel = rel.add(T.vec3(0, box.y.mul(0.2), 0));
  var dir = fall.normalize();
  var len = T.mix(T.float(RAIN.length), T.float(RAIN.farLength), layer);
  var dist = rel.length();
  var width = dist.mul(RAIN.widthPerMetre).max(RAIN.width);
  var side = dir.cross(rel).normalize();
  var head = this.uCam.add(rel);
  /* both sides: which face of a streak is towards the camera depends on
     which way it is turned, and a streak has no back to hide */
  /* forceSinglePass: a transparent material drawn on both sides is otherwise
     drawn twice, back faces then front, and the rain is meant to be one draw */
  this.material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, forceSinglePass: true });
  this.material.positionNode = head.add(dir.mul(len.mul(at.y.sub(1.0)))).add(side.mul(width.mul(at.x)));

  /* how strongly each streak is drawn: faded in near the lens, out towards
     the walls of its box (on the ground, by its distance across; in the
     air, by its height), brightest at its head, and a third as strong across
     its width at the edges so it is a soft line */
  var across = T.vec2(rel.x, rel.z).length().div(box.x.mul(0.5));
  var edge = T.float(1.0).sub(across.smoothstep(0.55, 1.0));
  var up = rel.y.div(box.y.mul(0.5));
  var high = T.float(1.0).sub(up.abs().smoothstep(0.6, 0.95));
  var inFront = dist.smoothstep(RAIN.near * 0.4, RAIN.near);
  var shape = at.y.mul(0.7).add(0.3).mul(T.float(1.0).sub(at.x.abs().mul(0.6)));
  var strength = T.mix(T.float(RAIN.alpha), T.float(RAIN.farAlpha), layer);
  /* smoothstep and the rest are methods on a node: the bundle's THREE.TSL
     carries only the few functions listed in tools/three-entry.webgpu.js */
  this.material.colorNode = T.vec4(this.uColour, 1.0);
  this.material.opacityNode = strength.mul(edge).mul(high).mul(inFront).mul(shape).mul(this.uAlpha);

  this.mesh = new THREE.Mesh(g, this.material);
  this.mesh.frustumCulled = false;
  /* after everything else that is see through, and never in a shadow */
  this.mesh.renderOrder = 5;
  this.mesh.castShadow = false;
  this.mesh.receiveShadow = false;
  this.mesh.visible = false;
  this.mesh.name = 'rain';
  scene.add(this.mesh);
}

/* The rain for this frame: where the camera is, how long it has been
   falling (seconds, from the frame loop), the colour it takes from the light
   it falls through, and how much of it there is (0 in Monaco's tunnel). */
RainRig.prototype.place = function (cam, t, colour, amount) {
  this.uCam.value.copy(cam);
  this.uTime.value = t;
  this.uColour.value.copy(colour);
  this.uAlpha.value = amount;
};

RainRig.prototype.dispose = function () {
  if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
  this.geometry.dispose();
  this.material.dispose();
};

/* --- the wet road ----------------------------------------------------------

   The road, the kerbs, the lines and the runoff (and Monaco's pavements) are
   marked `wet` where they are built (buildTrackMeshes in 20-track.js). In
   rain each goes darker and far smoother, and the smooth surface takes the
   grey sky from the environment as a sheen. Puddles are a map of roughness:
   a soft pattern of patches where the surface is smoother still, and nothing
   in the geometry. Each wet value is the dry one times the figure here, or
   the figure itself for roughness; leaving rain puts the dry values back.

     colour      what the surface's colour is multiplied by: wet is darker
     roughness   the roughness where there is no puddle. The puddle map
                 takes it down to a fifth of this at the wettest. */
var WET = {
  road:     { colour: 0.50, roughness: 0.30 },
  runoff:   { colour: 0.55, roughness: 0.34 },
  kerb:     { colour: 0.70, roughness: 0.26 },
  line:     { colour: 0.75, roughness: 0.28 },
  pavement: { colour: 0.45, roughness: 0.40 }
};

/* The puddles: a grey canvas, white for dry and dark where the water lies,
   which scales the roughness (see WetLook.set). Soft blobs in loose chains
   along the road, as water stands in the low line of a surface. */
function makePuddleTex() {
  var w = 128, h = 256, cv = makeCanvas(w, h), ctx = cv.getContext('2d'), rnd = mulberry32(47);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  for (var i = 0; i < 46; i++) {
    var x = rnd() * w, y = rnd() * h, r = 6 + rnd() * 22;
    var deep = 0.35 + rnd() * 0.45;
    for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
      /* drawn nine times over, so a blob at an edge carries on at the
         opposite edge and the map tiles with no seam */
      var gx = x + dx * w, gy = y + dy * h;
      var g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
      g.addColorStop(0, 'rgba(40,40,40,' + deep.toFixed(3) + ')');
      g.addColorStop(0.6, 'rgba(60,60,60,' + (deep * 0.6).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(60,60,60,0)');
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(gx, gy);
      ctx.scale(0.7, 1.6);
      ctx.translate(-gx, -gy);
      ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
      ctx.restore();
    }
  }
  var t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function WetLook(root) {
  var list = this.list = [];
  root.traverse(function (o) {
    var kind = o.userData && o.userData.wet;
    if (!kind || !o.material || o.material.length) return;
    var m = o.material;
    list.push({ m: m, kind: kind, wet: WET[kind], color: m.color.clone() });
  });
  this.on = false;
  this.puddles = null;
  this.nodes = null;
}

WetLook.prototype.set = function (on) {
  if (on === this.on) return;
  this.on = on;
  if (on && !this.puddles) {
    /* The puddles are a roughness node read at the mesh's own uv, one for
       each kind of surface and kept: across the road once, and along it
       once every 32 m (the road's v runs one for every 8 m:
       buildTrackMeshes). Put on only once the page has drawn a frame (see
       Game.applyWeather). */
    var T = THREE.TSL;
    this.puddles = makePuddleTex();
    var water = T.texture(this.puddles, T.uv().mul(T.vec2(1.0, 0.25))).g;
    this.nodes = {};
    for (var kind in WET) if (WET.hasOwnProperty(kind)) this.nodes[kind] = water.mul(WET[kind].roughness);
  }
  for (var i = 0; i < this.list.length; i++) {
    var e = this.list[i], m = e.m;
    if (on) {
      m.color.copy(e.color).multiplyScalar(e.wet.colour);
      m.roughnessNode = this.nodes[e.kind];
    } else {
      m.color.copy(e.color);
      m.roughnessNode = null;
    }
    /* a node put on or taken off builds the material again: on a change of
       weather only */
    m.needsUpdate = true;
  }
};

WetLook.prototype.dispose = function () {
  this.set(false);
  if (this.puddles) this.puddles.dispose();
  this.puddles = null;
};

/* --- the lights on the wet road ---------------------------------------------

   What makes a wet road look wet is the lights in it: every lamp and lit
   window seen again in the road, smeared down it towards the camera. There
   is no reflection of the scene to draw that from, so it is made in the
   post pass, out of what the bloom has already found bright.

   A pixel below the horizon looks up the bloom at the pixel mirrored about
   the horizon, which is where a flat wet road shows a thing that is far
   away, and at WET_SMEAR.taps pixels running from there towards the
   horizon, less and less of each: so a lamp is drawn again under itself,
   upside down, and drawn out towards the camera. It is right for anything
   well away from the camera, and the bloom's blur hides how far it is out
   for anything near. It fades in over a short way below the horizon, out
   again towards the foot of the frame, and is given nothing above it.

   The horizon's height in the frame is wetHorizon(), a uniform the frame
   loop sets from the camera (Game.drawFrame); `bloomTex` is the bloom's
   texture node, `at` the pixel's uv (origin at the top on this renderer). */
var WET_SMEAR = { taps: 8, step: 0.014, strength: 0.9 };
var _wetHorizon = null;
function wetHorizon() {
  if (!_wetHorizon) _wetHorizon = THREE.TSL.uniform(0.5);
  return _wetHorizon;
}

function wetSmear(bloomTex, at) {
  var T = THREE.TSL, h = wetHorizon();
  var below = at.y.sub(h);
  var mirror = h.sub(below);
  var sum = T.vec3(0, 0, 0), total = 0;
  for (var k = 0; k < WET_SMEAR.taps; k++) {
    var f = k / WET_SMEAR.taps;
    var w = (1 - f) * (1 - f);
    total += w;
    var y = T.clamp(mirror.add(k * WET_SMEAR.step), 0.0, h);
    sum = sum.add(bloomTex.sample(T.vec2(at.x, y)).rgb.mul(w));
  }
  /* in below the horizon, and out again towards the foot of the frame,
     where the road is under the camera, the mirror is furthest out and the
     player's own car is drawn */
  var low = below.smoothstep(0.01, 0.08).mul(T.float(1.0).sub(below.smoothstep(0.22, 0.48)));
  return sum.mul(WET_SMEAR.strength / total).mul(low);
}
