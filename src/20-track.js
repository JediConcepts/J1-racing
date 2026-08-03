/* =========================================================================
   MCL-64  —  circuit: spline, road ribbon, furniture, racing line
   Layout is hand-authored: a 900m pit straight, a fast downhill esse
   complex, a stop-and-go hairpin, then a blind uphill left onto the line.
   ========================================================================= */

/* SILVERSTONE — a stylised take on the Grand Prix layout: the corner
   sequence, rhythm and proportions of the real circuit, not a survey of it.
   Runs clockwise, as the real one does.

   [x, z, y] with z pointing south, so the array reads like the map. Height is
   flat throughout — crests hide the road behind their own horizon, and this
   camera needs the corner ahead legible at all times. */
var TRACK_CONTROL = [
  [405, 756, 0],    /* pit straight, past the timing line */
  [0, 749, 0],
  [-473, 736, 0],
  [-648, 702, 0],   /* Abbey */
  [-756, 594, 0],
  [-810, 486, 0],   /* Farm Curve */
  [-891, 405, 0],   /* Village */
  [-837, 317, 0],
  [-729, 290, 0],   /* The Loop */
  [-668, 371, 0],
  [-635, 446, 0],   /* Aintree */
  [-338, 479, 0],   /* Wellington Straight */
  [14, 486, 0],
  [149, 473, 0],    /* Brooklands */
  [216, 392, 0],
  [230, 284, 0],    /* Luffield */
  [149, 216, 0],
  [41, 243, 0],
  [-68, 196, 0],    /* Woodcote */
  [-128, 81, 0],
  [-108, -61, 0],   /* Copse */
  [0, -149, 0],
  [122, -257, 0],   /* Maggotts */
  [257, -290, 0],   /* Becketts */
  [365, -236, 0],
  [446, -257, 0],
  [554, -203, 0],   /* Chapel */
  [716, -101, 0],   /* Hangar Straight */
  [797, 88, 0],
  [837, 250, 0],    /* Stowe */
  [797, 385, 0],
  [702, 493, 0],    /* Vale */
  [581, 601, 0],    /* Club */
  [446, 689, 0]
];

/* [name, index into TRACK_CONTROL] */
var CORNER_NAMES = [
  ['ABBEY', 3], ['FARM', 5], ['VILLAGE', 6], ['THE LOOP', 8], ['AINTREE', 10],
  ['BROOKLANDS', 13], ['LUFFIELD', 15], ['WOODCOTE', 18], ['COPSE', 20],
  ['MAGGOTTS', 22], ['BECKETTS', 23], ['CHAPEL', 26], ['STOWE', 29],
  ['VALE', 31], ['CLUB', 32]
];

/* =====================================================================
   CIRCUIT REGISTRY
   Everything a circuit needs is data: control points, corner names, road
   width and how many laps. Curvature, the racing line, the speed profile,
   the straights and the DRS zones are all derived from the geometry, so a
   new circuit is a new entry here and nothing else.

   `id` is what the leaderboard partitions on. Change a circuit's shape and
   you must bump its id, or old times get ranked against a track that no
   longer exists.
   ===================================================================== */


/* Indianapolis Motor Speedway. 2.5 miles of rectangle with rounded corners:
   two 5/8-mile straights, two short chutes, four identical quarter-circle
   turns banked at 9 degrees 12 minutes. Flat throughout — no elevation.

   The point order is REVERSED relative to how it was authored, so the lap runs
   anti-clockwise on left-hand turns as the real 500 does. Checked by summing
   signed curvature over the lap: Silverstone (clockwise in reality) comes to
   -2pi, so anti-clockwise must come to +2pi. Authored, it matched Silverstone
   and therefore ran the wrong way. */
var INDY_CONTROL = [
  [    0, -357,  0],
  [ -126, -357,  0],
  [ -252, -357,  0],
  [ -377, -357,  0],
  [ -503, -357,  0],
  [ -601, -337,  0],
  [ -684, -282,  0],
  [ -740, -199,  0],
  [ -759, -101,  0],
  [ -759,    0,  0],
  [ -759,  101,  0],
  [ -740,  199,  0],
  [ -684,  282,  0],
  [ -601,  337,  0],
  [ -503,  357,  0],
  [ -377,  357,  0],
  [ -252,  357,  0],
  [ -126,  357,  0],
  [    0,  357,  0],
  [  126,  357,  0],
  [  252,  357,  0],
  [  377,  357,  0],
  [  503,  357,  0],
  [  601,  337,  0],
  [  684,  282,  0],
  [  740,  199,  0],
  [  759,  101,  0],
  [  759,    0,  0],
  [  759, -101,  0],
  [  740, -199,  0],
  [  684, -282,  0],
  [  601, -337,  0],
  [  503, -357,  0],
  [  377, -357,  0],
  [  252, -357,  0],
  [  126, -357,  0]
];

var INDY_CORNERS = [['FRONT STRETCH', 0], ['TURN 1', 6], ['TURN 2', 12], ['BACK STRETCH', 18], ['TURN 3', 24], ['TURN 4', 30]];

var TRACKS = [
  {
    id: 'silverstone-v1',
    name: 'SILVERSTONE',
    blurb: 'FAST AND OPEN',
    laps: 3,
    halfW: 7.2,          /* 14.4m racing surface */
    runoff: 7.0,         /* sealed runoff before the wall */
    control: TRACK_CONTROL,
    corners: CORNER_NAMES
  },
  {
    id: 'indianapolis-v1',
    name: 'INDIANAPOLIS',
    blurb: 'BANKED OVAL',
    laps: 5,
    halfW: 9,
    runoff: 9.0,
    /* The real 9 deg 12 min = 0.1606 rad, kept because it is purely visual.
       BANKING DOES NOT AFFECT GRIP in this model — `bank` never appears in
       30-cars.js; it only tilts the road surface geometry, and latCapacity()
       depends on speed alone. Measured: every value from 0 to 9.2 degrees
       produces an identical lap, to the hundredth of a second. So there is no
       point trading away the look for handling that will not change.

       This corner is flat regardless: a 256 m radius at 216 km/h demands
       14.1 m/s2 and the car has 46, a 3.3x margin. Forcing a lift would need
       a 78 m radius, which is a short oval rather than Indianapolis. */
    bankGain: 90,
    bankMax: 0.1606,
    control: INDY_CONTROL,
    corners: INDY_CORNERS
  }
];

function trackById(id) {
  for (var i = 0; i < TRACKS.length; i++) if (TRACKS[i].id === id) return TRACKS[i];
  return TRACKS[0];
}

/* Set from the active circuit when a Track is built. Kept as module globals
   rather than threaded through every call site because exactly one circuit is
   ever live at a time, and the physics reads these on the hot path. */
var HALF_W = 7.2;
var RUNOFF = 7.0;
var WALL_HALF = HALF_W + RUNOFF;
var VERGE = 46;          /* grass skirt */
var SAMPLES = 900;       /* ~6m per sample over a 5.5km lap */

var COL = {
  asphalt: new THREE.Color(0x9c9caa),
  asphaltDark: new THREE.Color(0x8a8a95),
  runoff: new THREE.Color(0xa8a4ae),
  grass: new THREE.Color(0x6f9b52),
  grassDark: new THREE.Color(0x5c8544),
  papaya: 0xff8000,
  anthracite: 0x1b1c22,
  cyan: 0x4fe3e0
};

function Track(def) {
  var i;
  def = def || TRACKS[0];
  this.def = def;
  this.id = def.id;
  this.name = def.name;
  this.laps = def.laps || 3;

  /* The physics reads these globally, so they must be set before anything
     below samples the circuit. */
  HALF_W = def.halfW || 7.2;
  RUNOFF = def.runoff || 7.0;
  /* Derived, so it has to be recomputed here too — left at its module-level
     value it would keep Silverstone's barrier line on a wider circuit, and the
     walls would sit inside the runoff. */
  WALL_HALF = HALF_W + RUNOFF;

  var control = def.control;

  /* Control rows are [x, z, y] so the array reads like a map; Vector3 wants
     (x, y, z), and y is the height. Swapping these is what sends the circuit
     climbing into the sky. */
  var pts = [];
  for (i = 0; i < control.length; i++) {
    pts.push(new THREE.Vector3(control[i][0], control[i][2], control[i][1]));
  }
  /* centripetal parameterisation: the control points are unevenly spaced and
     this is the variant that will not cusp or self-intersect between them */
  this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);

  var raw = this.curve.getSpacedPoints(SAMPLES);   /* returns SAMPLES+1, last == first */
  this.n = SAMPLES;
  this.p = [];
  for (i = 0; i < this.n; i++) this.p.push(raw[i].clone());

  /* tangents, lateral normals, arc length */
  this.fwd = [];
  this.lat = [];
  this.cum = new Float32Array(this.n + 1);
  var up = new THREE.Vector3(0, 1, 0);
  for (i = 0; i < this.n; i++) {
    var a = this.p[i], b = this.p[(i + 1) % this.n];
    var t = new THREE.Vector3().subVectors(b, a);
    this.cum[i + 1] = this.cum[i] + t.length();
    t.normalize();
    this.fwd.push(t);
    this.lat.push(new THREE.Vector3().crossVectors(up, t).normalize());
  }
  this.length = this.cum[this.n];
  this.ds = this.length / this.n;

  /* signed curvature per sample, then smoothed */
  var curvRaw = new Float32Array(this.n);
  for (i = 0; i < this.n; i++) {
    var f0 = this.fwd[(i - 1 + this.n) % this.n], f1 = this.fwd[i];
    var cross = f0.z * f1.x - f0.x * f1.z;
    var dot = clamp(f0.x * f1.x + f0.z * f1.z, -1, 1);
    var ang = datan2(cross, dot);
    curvRaw[i] = ang / this.ds;
  }
  this.curv = smoothLoop(curvRaw, 7, 2);

  /* Banking, capped at ~5.5 degrees. Sign convention used throughout:
     curv > 0 means the circuit turns toward +lat, so the inside of the
     corner is at positive lateral offset and the outside must ride higher. */
  /* Banking follows curvature, capped. A road circuit gets a token 2.6 degrees
     of camber; a speedway needs its real figure, and because an oval's turns
     hold constant radius a high gain saturates at the cap through the whole
     turn and smoothLoop blends it out onto the straights — which is exactly
     the real banking profile. */
  var bankGain = def.bankGain || 14;
  var bankMax = def.bankMax || 0.046;
  var bankRaw = new Float32Array(this.n);
  /* SIGN: lateral is positive to the car's right, and height is
     `lateral * tan(bank)`, so raising the OUTSIDE of a corner needs bank to
     take the same sign as curvature. It was negated, which banked every
     corner the wrong way — the car leaned out of the turn instead of into it.
     Invisible at Silverstone's 2.6 degrees; unmistakable at Indy's 9.2. */
  for (i = 0; i < this.n; i++) bankRaw[i] = clamp(this.curv[i] * bankGain, -bankMax, bankMax);
  this.bank = smoothLoop(bankRaw, 11, 2);

  this.buildRacingLine();
  this.buildSpeedProfile();

  this.findStraights();
  this.mapCorners(pts);

  /* Timing line sits well down the longest straight, so the grid behind it is
     still on the straight rather than stacked up in the last corner. */
  var main = this.straights[0];
  this.startIndex = (main.start + Math.round(main.count * 0.62)) % this.n;
  this.startS = this.cum[this.startIndex];

  /* DRS on the two longest straights, trimmed clear of the corners */
  this.drsZones = [];
  for (i = 0; i < Math.min(2, this.straights.length); i++) {
    var st = this.straights[i];
    this.drsZones.push([
      (st.start + Math.round(st.count * 0.18)) % this.n,
      (st.start + Math.round(st.count * 0.92)) % this.n
    ]);
  }
}

function smoothLoop(src, window, passes) {
  var n = src.length;
  var cur = src, out = null, p, i, k, sum, cnt;
  for (p = 0; p < passes; p++) {
    out = new Float32Array(n);
    for (i = 0; i < n; i++) {
      sum = 0; cnt = 0;
      for (k = -window; k <= window; k++) { sum += cur[(i + k + n * 4) % n]; cnt++; }
      out[i] = sum / cnt;
    }
    cur = out;
  }
  return cur;
}

/* Offset toward the apex, proportional to curvature, then smoothed so the
   line flows through linked corners instead of snapping side to side. */
Track.prototype.buildRacingLine = function () {
  var i, n = this.n;
  var off = new Float32Array(n);
  var maxOff = HALF_W - 2.0;
  for (i = 0; i < n; i++) {
    off[i] = clamp(this.curv[i] * 700, -maxOff, maxOff);
  }
  this.lineOff = smoothLoop(off, 14, 3);
};

/* Grip model, shared with the vehicle so the racing line is a speed the car
   can actually hold. Lateral capacity is a constant plus a downforce term
   that rises with the square of speed:
       aLat_max = GRIP_BASE + GRIP_DF * v^2
   Setting that equal to the demand v^2 * curvature and solving for v gives
   the cornering limit below. Let these two drift apart and the AI drives to
   a target it cannot reach, and quietly ploughs into the runoff.

   GRIP_MAX caps the whole thing at roughly 4.7g. Without a ceiling the
   downforce term outruns the demand and every corner solves as flat out. */
var GRIP_BASE = 26.0;
var GRIP_DF = 0.009;
var GRIP_MAX = 46.0;
var GRIP_SAFETY = 0.90;

function latCapacity(v) {
  var c = GRIP_BASE + v * v * GRIP_DF;
  return c < GRIP_MAX ? c : GRIP_MAX;
}

/* Cornering limit, then a backward pass so braking starts early enough,
   then a forward pass to cap acceleration. */
Track.prototype.buildSpeedProfile = function () {
  var n = this.n, i, pass;
  var A_BRK = 24.0, A_ACC = 14.0, VMAX = 92;
  var v = new Float32Array(n);
  for (i = 0; i < n; i++) {
    var k = Math.abs(this.curv[i]) + 1e-6;
    /* capacity is never above GRIP_MAX, so neither is the cornering speed */
    var lim = Math.sqrt(GRIP_MAX / k);
    var denom = k - GRIP_DF;
    if (denom > 1e-4) lim = Math.min(lim, Math.sqrt(GRIP_BASE / denom));
    v[i] = clamp(lim * GRIP_SAFETY, 20, VMAX);
  }
  for (pass = 0; pass < 3; pass++) {
    for (i = n - 1; i >= 0; i--) {
      var nx = v[(i + 1) % n];
      v[i] = Math.min(v[i], Math.sqrt(nx * nx + 2 * A_BRK * this.ds));
    }
    for (i = 0; i < n; i++) {
      var pv = v[(i - 1 + n) % n];
      v[i] = Math.min(v[i], Math.sqrt(pv * pv + 2 * A_ACC * this.ds));
    }
  }
  this.vTarget = v;
};

/* Longest runs of near-zero curvature, longest first. The start line, the
   grid and the DRS zones all place themselves off this, so the layout can
   change without hand-editing indices. */
Track.prototype.findStraights = function () {
  var n = this.n, i, THRESH = 0.0016;
  var seed = 0;
  for (i = 0; i < n; i++) { if (Math.abs(this.curv[i]) >= THRESH) { seed = i; break; } }

  var runs = [], start = -1, count = 0;
  for (i = 0; i < n; i++) {
    var idx = (seed + i) % n;
    if (Math.abs(this.curv[idx]) < THRESH) {
      if (start < 0) { start = idx; count = 0; }
      count++;
    } else if (start >= 0) {
      runs.push({ start: start, count: count, len: count * this.ds });
      start = -1;
    }
  }
  if (start >= 0) runs.push({ start: start, count: count, len: count * this.ds });

  runs.sort(function (a, b) { return b.len - a.len; });
  if (!runs.length) runs.push({ start: 0, count: Math.round(n * 0.1), len: n * 0.1 * this.ds });
  this.straights = runs;
};

/* Attach corner names to sample indices, and build a per-sample lookup so the
   HUD can name the corner you are in without searching. */
Track.prototype.mapCorners = function (controlPts) {
  var n = this.n, i, c;
  this.corners = [];
  this.cornerLabel = new Array(n);

  /* From the active circuit, not the module-level Silverstone list. */
  var names = (this.def && this.def.corners) || CORNER_NAMES;
  for (c = 0; c < names.length; c++) {
    var name = names[c][0];
    var cp = controlPts[names[c][1]];
    if (!cp) continue;                    /* index past the end of this circuit */
    var best = 0, bestD = Infinity;
    for (i = 0; i < n; i++) {
      var dx = this.p[i].x - cp.x, dz = this.p[i].z - cp.z;
      var d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    this.corners.push({ name: name, index: best });
    for (i = -26; i <= 14; i++) this.cornerLabel[(best + i + n * 2) % n] = name;
  }
};

/* --- queries ------------------------------------------------------------ */

Track.prototype.nearestIndex = function (x, z, hint) {
  var n = this.n, best = -1, bestD = Infinity, i, idx, dx, dz, d;
  if (hint == null) {
    for (i = 0; i < n; i += 4) {
      dx = x - this.p[i].x; dz = z - this.p[i].z;
      d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    hint = best;
    bestD = Infinity; best = -1;
  }
  for (i = -8; i <= 8; i++) {
    idx = (hint + i + n * 2) % n;
    dx = x - this.p[idx].x; dz = z - this.p[idx].z;
    d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = idx; }
  }
  return best;
};

/* Frame at a point: index, signed lateral offset, arc position, road height */
Track.prototype.frame = function (x, z, hint, out) {
  var i = this.nearestIndex(x, z, hint);
  var n = this.n;
  var p = this.p[i], f = this.fwd[i], l = this.lat[i];
  var dx = x - p.x, dz = z - p.z;
  var along = dx * f.x + dz * f.z;
  var lateral = dx * l.x + dz * l.z;
  /* refine to the neighbouring segment when we've run past this sample */
  if (along > this.ds) { i = (i + 1) % n; p = this.p[i]; f = this.fwd[i]; l = this.lat[i]; dx = x - p.x; dz = z - p.z; along = dx * f.x + dz * f.z; lateral = dx * l.x + dz * l.z; }
  else if (along < -this.ds) { i = (i - 1 + n) % n; p = this.p[i]; f = this.fwd[i]; l = this.lat[i]; dx = x - p.x; dz = z - p.z; along = dx * f.x + dz * f.z; lateral = dx * l.x + dz * l.z; }

  var t = clamp(along / this.ds, 0, 1);
  var nextY = this.p[(i + 1) % n].y;
  var y = lerp(p.y, nextY, t) + lateral * dtan(this.bank[i]);

  out.i = i;
  out.lateral = lateral;
  out.s = this.cum[i] + clamp(along, 0, this.ds);
  out.y = y;
  out.fwd = f;
  out.lat = l;
  return out;
};

Track.prototype.heightAt = function (x, z, hint) {
  var tmp = TMP_FRAME_B;
  this.frame(x, z, hint, tmp);
  var off = Math.abs(tmp.lateral);
  var h = tmp.y;
  if (off > HALF_W) h -= Math.min((off - HALF_W) * 0.05, 0.5);   /* runoff/grass dips away */
  return h;
};

Track.prototype.pointAt = function (i, off, out) {
  var p = this.p[i], l = this.lat[i];
  out.set(p.x + l.x * off, p.y + off * dtan(this.bank[i]), p.z + l.z * off);
  return out;
};

var TMP_FRAME_B = { i: 0, lateral: 0, s: 0, y: 0, fwd: null, lat: null };

/* =========================================================================
   GEOMETRY
   Built straight into typed arrays. r128 ships no BufferGeometryUtils in the
   core build, and hand-rolling the ribbon is cheaper than merging anyway.
   ========================================================================= */

function RibbonBuilder() {
  this.pos = []; this.norm = []; this.uv = []; this.col = [];
}

RibbonBuilder.prototype.quad = function (a, b, c, d, uvs, color, colorB) {
  /* a,b,c,d counter-clockwise viewed from above */
  var n1 = triNormal(a, b, c), n2 = triNormal(a, c, d);
  this.tri(a, b, c, n1, uvs[0], uvs[1], uvs[2], color, colorB, colorB);
  this.tri(a, c, d, n2, uvs[0], uvs[2], uvs[3], color, colorB, color);
};

RibbonBuilder.prototype.tri = function (a, b, c, n, ua, ub, uc, ca, cb, cc) {
  var P = this.pos, N = this.norm, U = this.uv, C = this.col;
  P.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  N.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z);
  U.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
  cb = cb || ca; cc = cc || ca;
  C.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
};

RibbonBuilder.prototype.geometry = function () {
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(this.norm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
  g.computeBoundingSphere();
  return g;
};

var _tn1 = new THREE.Vector3(), _tn2 = new THREE.Vector3(), _tn3 = new THREE.Vector3();
function triNormal(a, b, c) {
  _tn1.subVectors(b, a); _tn2.subVectors(c, a);
  _tn3.crossVectors(_tn1, _tn2).normalize();
  if (_tn3.lengthSq() < 0.5) _tn3.set(0, 1, 0);
  return _tn3.clone();
}

var _v = [];
function vec(x, y, z) { return new THREE.Vector3(x, y, z); }

function buildTrackMeshes(track, scene) {
  var n = track.n, i, j;
  var road = new RibbonBuilder();
  var runoff = new RibbonBuilder();
  var kerb = new RibbonBuilder();
  var grass = new RibbonBuilder();
  var wall = new RibbonBuilder();
  var line = new RibbonBuilder();

  var vAccum = 0;

  for (i = 0; i < n; i++) {
    var i2 = (i + 1) % n;
    var segLen = track.ds;
    var v0 = vAccum / 8, v1 = (vAccum + segLen) / 8;
    vAccum += segLen;

    var a0 = edge(track, i, -HALF_W), b0 = edge(track, i, HALF_W);
    var a1 = edge(track, i2, -HALF_W), b1 = edge(track, i2, HALF_W);

    /* racing surface — slight per-segment value shift keeps the flat shading
       from reading as one dead sheet at distance */
    var shade = (i % 7 === 0) ? COL.asphaltDark : COL.asphalt;
    road.quad(a0, a1, b1, b0, [[0, v0], [0, v1], [1, v1], [1, v0]], shade);

    /* white track-limit lines, inset from the kerb */
    var wl = 0.28;
    pushStrip(line, track, i, i2, HALF_W - 0.55, HALF_W - 0.55 + wl, 0.012, v0, v1, WHITE_C);
    pushStrip(line, track, i, i2, -HALF_W + 0.55 - wl, -HALF_W + 0.55, 0.012, v0, v1, WHITE_C);

    /* kerbs only where the corner actually is */
    var k = track.curv[i];
    if (Math.abs(k) > 0.0026) {
      var innerSide = k > 0 ? 1 : -1;
      var kA = innerSide * HALF_W, kB = innerSide * (HALF_W + 1.6);
      pushStrip(kerb, track, i, i2, Math.min(kA, kB), Math.max(kA, kB), 0.055, vAccum / 3, (vAccum + segLen) / 3, WHITE_C);
    }

    /* sealed runoff both sides */
    pushStrip(runoff, track, i, i2, HALF_W, WALL_HALF, -0.05, v0, v1, COL.runoff);
    pushStrip(runoff, track, i, i2, -WALL_HALF, -HALF_W, -0.05, v0, v1, COL.runoff);

    /* grass skirt */
    var gShade = (i % 5 === 0) ? COL.grassDark : COL.grass;
    pushStrip(grass, track, i, i2, WALL_HALF, WALL_HALF + VERGE, -0.55, v0 * 0.35, v1 * 0.35, gShade);
    pushStrip(grass, track, i, i2, -(WALL_HALF + VERGE), -WALL_HALF, -0.55, v0 * 0.35, v1 * 0.35, gShade);

    /* barrier walls */
    pushWall(wall, track, i, i2, WALL_HALF, 1.25, vAccum);
    pushWall(wall, track, i, i2, -WALL_HALF, 1.25, vAccum);
  }

  var group = new THREE.Group();

  group.add(new THREE.Mesh(road.geometry(), new THREE.MeshLambertMaterial({
    map: texFromCanvas(makeAsphaltTex(), 1, 1), vertexColors: true  })));
  group.add(new THREE.Mesh(runoff.geometry(), new THREE.MeshLambertMaterial({
    map: texFromCanvas(makeRunoffTex(), 1, 1), vertexColors: true  })));
  group.add(new THREE.Mesh(grass.geometry(), new THREE.MeshLambertMaterial({
    map: texFromCanvas(makeGrassTex(), 6, 1), vertexColors: true  })));
  group.add(new THREE.Mesh(kerb.geometry(), new THREE.MeshLambertMaterial({
    map: texFromCanvas(makeKerbTex(), 1, 1, true), vertexColors: true  })));
  group.add(new THREE.Mesh(wall.geometry(), new THREE.MeshLambertMaterial({
    map: texFromCanvas(makeWallTex(), 1, 1), vertexColors: true  })));
  var lineMesh = new THREE.Mesh(line.geometry(), new THREE.MeshLambertMaterial({
    vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
  }));
  group.add(lineMesh);

  scene.add(group);
  return group;
}

var WHITE_C = new THREE.Color(0xffffff);

function edge(track, i, off) {
  var p = track.p[i], l = track.lat[i];
  return vec(p.x + l.x * off, p.y + off * dtan(track.bank[i]), p.z + l.z * off);
}

function edgeY(track, i, off, dy) {
  var p = track.p[i], l = track.lat[i];
  return vec(p.x + l.x * off, p.y + off * dtan(track.bank[i]) + dy, p.z + l.z * off);
}

function pushStrip(rb, track, i, i2, offA, offB, dy, v0, v1, color) {
  var a0 = edgeY(track, i, offA, dy), b0 = edgeY(track, i, offB, dy);
  var a1 = edgeY(track, i2, offA, dy), b1 = edgeY(track, i2, offB, dy);
  rb.quad(a0, a1, b1, b0, [[0, v0], [0, v1], [1, v1], [1, v0]], color);
}

function pushWall(rb, track, i, i2, off, h, vAcc) {
  var inward = off > 0 ? -1 : 1;
  var base0 = edgeY(track, i, off, -0.05), base1 = edgeY(track, i2, off, -0.05);
  var top0 = edgeY(track, i, off, h), top1 = edgeY(track, i2, off, h);
  var u0 = vAcc / 12, u1 = (vAcc + track.ds) / 12;
  if (inward > 0) rb.quad(base0, base1, top1, top0, [[u0, 1], [u1, 1], [u1, 0], [u0, 0]], WHITE_C);
  else rb.quad(base1, base0, top0, top1, [[u1, 1], [u0, 1], [u0, 0], [u1, 0]], WHITE_C);
  /* capping strip so the wall reads as solid from a chase camera */
  var capIn0 = edgeY(track, i, off + inward * 0.35, h), capIn1 = edgeY(track, i2, off + inward * 0.35, h);
  if (inward > 0) rb.quad(top0, top1, capIn1, capIn0, [[u0, 0], [u1, 0], [u1, 0.2], [u0, 0.2]], WHITE_C);
  else rb.quad(capIn0, capIn1, top1, top0, [[u0, 0.2], [u1, 0.2], [u1, 0], [u0, 0]], WHITE_C);
}

/* =========================================================================
   FURNITURE — gantry, grandstands, trees, boards, sky
   ========================================================================= */

function buildStartGantry(track, scene) {
  var idx = track.startIndex;
  var g = new THREE.Group();
  var mid = track.p[idx], lat = track.lat[idx], fwd = track.fwd[idx];
  var yaw = datan2(fwd.x, fwd.z);

  var darkMat = new THREE.MeshLambertMaterial({ color: 0x24252c });
  var papMat = new THREE.MeshLambertMaterial({ color: COL.papaya });

  var pillarGeo = new THREE.BoxGeometry(1.1, 8.4, 1.1);
  for (var s = -1; s <= 1; s += 2) {
    var pillar = new THREE.Mesh(pillarGeo, darkMat);
    pillar.position.set(mid.x + lat.x * s * (WALL_HALF + 1.2), mid.y + 4.2, mid.z + lat.z * s * (WALL_HALF + 1.2));
    g.add(pillar);
  }

  var beam = new THREE.Mesh(new THREE.BoxGeometry((WALL_HALF + 1.8) * 2, 1.9, 1.3), darkMat);
  beam.position.set(mid.x, mid.y + 8.0, mid.z);
  beam.rotation.y = yaw;
  g.add(beam);

  var bannerTex = texFromCanvas(makeSignTex('PAPAYA GP', '#ff8000', '#1b1c22', '#ffffff'), 1, 1, true);
  var banner = new THREE.Mesh(new THREE.PlaneGeometry((WALL_HALF + 1.5) * 2, 2.6),
    new THREE.MeshBasicMaterial({ map: bannerTex, side: THREE.DoubleSide, fog: false }));
  banner.position.set(mid.x, mid.y + 6.4, mid.z);
  /* spans the track, lettered face turned back toward the approach */
  banner.rotation.y = yaw + Math.PI;
  g.add(banner);

  /* five-light start gantry — the actual F1 ritual, and the game's clock */
  var lights = [];
  var offGeo = new THREE.BoxGeometry(1.5, 1.5, 0.6);
  for (var i = 0; i < 5; i++) {
    var t = (i - 2) * 3.2;
    var m = new THREE.Mesh(offGeo, new THREE.MeshBasicMaterial({ color: 0x2a1a18, fog: false }));
    m.position.set(mid.x + lat.x * t, mid.y + 7.2, mid.z + lat.z * t);
    m.rotation.y = yaw + Math.PI / 2;
    g.add(m);
    lights.push(m);
  }

  /* start line */
  var lineTex = texFromCanvas(makeStartLineTex(), 8, 1, true);
  var startLine = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, 2.2),
    new THREE.MeshLambertMaterial({ map: lineTex, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  startLine.rotation.x = -Math.PI / 2;
  startLine.rotation.z = -yaw;
  startLine.position.set(mid.x, mid.y + 0.02, mid.z);
  g.add(startLine);

  scene.add(g);
  return { group: g, lights: lights, papMat: papMat };
}

function buildScenery(track, scene) {
  var rnd = mulberry32(20240);
  var n = track.n;
  var i;

  /* grandstands and pit buildings clustered around the start line */
  var crowdTex = texFromCanvas(makeCrowdTex(), 3, 1);
  var standMat = new THREE.MeshLambertMaterial({ color: 0x33353f });
  var crowdMat = new THREE.MeshLambertMaterial({ map: crowdTex, side: THREE.DoubleSide });
  var roofMat = new THREE.MeshLambertMaterial({ color: COL.papaya });
  var pitMat = new THREE.MeshLambertMaterial({ map: texFromCanvas(makePitwallTex(), 4, 1, true) });

  /* Stands stand back far enough to frame the straight instead of walling it
     in, and the terracing is dark so the crowd is what actually reads. */
  for (var s = 0; s < 5; s++) {
    var idx = (track.startIndex - 12 + s * 9 + n) % n;
    var side = s % 2 === 0 ? 1 : -1;
    var p = track.p[idx], l = track.lat[idx], f = track.fwd[idx];
    var yaw = datan2(f.x, f.z);
    var dist = WALL_HALF + 20;
    var facing = yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2);

    var base = new THREE.Mesh(new THREE.BoxGeometry(46, 8, 15), standMat);
    base.position.set(p.x + l.x * side * dist, p.y + 3.2, p.z + l.z * side * dist);
    base.rotation.y = yaw;
    scene.add(base);

    var cd = dist - 8.2;
    var crowd = new THREE.Mesh(new THREE.PlaneGeometry(44, 10.5), crowdMat);
    crowd.position.set(p.x + l.x * side * cd, p.y + 5.4, p.z + l.z * side * cd);
    crowd.rotation.order = 'YXZ';
    crowd.rotation.y = facing;
    crowd.rotation.x = 0.42;
    scene.add(crowd);

    var roof = new THREE.Mesh(new THREE.BoxGeometry(48, 0.7, 17), roofMat);
    roof.position.set(p.x + l.x * side * (dist + 1.5), p.y + 11.2, p.z + l.z * side * (dist + 1.5));
    roof.rotation.y = yaw;
    scene.add(roof);

    for (var pil = -1; pil <= 1; pil += 2) {
      var post = new THREE.Mesh(new THREE.BoxGeometry(1, 12, 1), standMat);
      post.position.set(
        p.x + l.x * side * (dist + 7) + f.x * pil * 21,
        p.y + 5.6,
        p.z + l.z * side * (dist + 7) + f.z * pil * 21
      );
      scene.add(post);
    }
  }

  /* pit wall boards along the main straight */
  for (i = 0; i < 10; i++) {
    var pi = (track.startIndex - 20 + i * 4 + n) % n;
    var pp = track.p[pi], pl = track.lat[pi], pf = track.fwd[pi];
    var board = new THREE.Mesh(new THREE.BoxGeometry(11, 2.0, 0.4), pitMat);
    board.position.set(pp.x + pl.x * (WALL_HALF + 2.6), pp.y + 1.6, pp.z + pl.z * (WALL_HALF + 2.6));
    /* -PI/2 runs the board along the track and turns its lettered face inward */
    board.rotation.y = datan2(pf.x, pf.z) - Math.PI / 2;
    scene.add(board);
  }

  /* Named corner boards on the approach — papaya on anthracite, legible at
     this resolution, and they tell you which corner you're arriving at. */
  for (var ci = 0; ci < track.corners.length; ci++) {
    var corner = track.corners[ci];
    var si = (corner.index - 24 + n) % n;
    var sp = track.p[si], sl = track.lat[si], sf = track.fwd[si];
    var sideS = track.curv[corner.index] > 0 ? -1 : 1;   /* outside of the bend */
    var signMat = new THREE.MeshLambertMaterial({
      map: texFromCanvas(makeSignTex(corner.name, '#1b1c22', '#ff8000', '#ff8000'), 1, 1, true),
      side: THREE.DoubleSide
    });
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.75), signMat);
    sign.position.set(sp.x + sl.x * sideS * (WALL_HALF + 3.6), sp.y + 2.9, sp.z + sl.z * sideS * (WALL_HALF + 3.6));
    /* +PI so the lettered FRONT face turns back up the road to meet the
       driver. Facing it down-track shows the mirrored reverse. */
    sign.rotation.y = datan2(sf.x, sf.z) + Math.PI;
    scene.add(sign);

    for (var leg = -1; leg <= 1; leg += 2) {
      var legMesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.0, 0.35), standMat);
      legMesh.position.set(
        sp.x + sl.x * sideS * (WALL_HALF + 3.6) + sf.x * leg * 4.6,
        sp.y + 1.5,
        sp.z + sl.z * sideS * (WALL_HALF + 3.6) + sf.z * leg * 4.6
      );
      scene.add(legMesh);
    }
  }

  /* crossed-quad treeline */
  var treeTex = texFromCanvas(makeTreeTex(), 1, 1, true);
  var treeMat = new THREE.MeshLambertMaterial({
    map: treeTex, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide
  });
  var treeBuf = new RibbonBuilder();
  var placed = 0;
  for (i = 0; i < n; i += 2) {
    for (var side2 = -1; side2 <= 1; side2 += 2) {
      if (rnd() > 0.55) continue;
      var d = WALL_HALF + 20 + rnd() * 90;
      var tp = track.p[i], tl = track.lat[i];
      var x = tp.x + tl.x * side2 * d + (rnd() - 0.5) * 14;
      var z = tp.z + tl.z * side2 * d + (rnd() - 0.5) * 14;
      var y = tp.y - 0.6;
      var hgt = 9 + rnd() * 9;
      var wdt = hgt * 0.62;
      pushCrossQuad(treeBuf, x, y, z, wdt, hgt, rnd() * TAU);
      placed++;
      if (placed > 420) break;
    }
    if (placed > 420) break;
  }
  var trees = new THREE.Mesh(treeBuf.geometry(), treeMat);
  scene.add(trees);

  /* drifting cloud plane */
  var cloudTex = texFromCanvas(makeCloudTex(), 1, 1, true);
  var cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
  var clouds = new THREE.Group();
  for (i = 0; i < 14; i++) {
    var cq = new THREE.Mesh(new THREE.PlaneGeometry(420, 190), cloudMat);
    var ang = rnd() * TAU, rad = 700 + rnd() * 1300;
    cq.position.set(dcos(ang) * rad, 250 + rnd() * 150, dsin(ang) * rad);
    cq.rotation.y = -ang + Math.PI / 2;
    clouds.add(cq);
  }
  scene.add(clouds);

  return { clouds: clouds };
}

function pushCrossQuad(rb, x, y, z, w, h, rot) {
  var hw = w / 2;
  for (var q = 0; q < 2; q++) {
    var a = rot + q * Math.PI / 2;
    var dx = dcos(a) * hw, dz = dsin(a) * hw;
    var p0 = vec(x - dx, y, z - dz);
    var p1 = vec(x + dx, y, z + dz);
    var p2 = vec(x + dx, y + h, z + dz);
    var p3 = vec(x - dx, y + h, z - dz);
    var nrm = vec(-dz, 0, dx).normalize();
    /* V RUNS UP. p0/p1 are the base of the quad and p2/p3 the top, so the base
       takes v=0 and the top v=1. These were the other way round, which with
       Three's default flipY planted every tree canopy-first in the ground and
       left the trunk waving in the air. */
    rb.tri(p0, p1, p2, nrm, [0, 0], [1, 0], [1, 1], WHITE_C);
    rb.tri(p0, p2, p3, nrm, [0, 0], [1, 1], [0, 1], WHITE_C);
  }
}

/* Sky dome: warm haze at the horizon fading to a hard blue zenith, with the
   fog colour matched to the haze so geometry dissolves instead of popping. */
function buildSky(scene) {
  var geo = new THREE.SphereGeometry(2600, 16, 12);
  var pos = geo.attributes.position;
  var colors = new Float32Array(pos.count * 3);
  var zenith = new THREE.Color(0x2f6bd8);
  var mid = new THREE.Color(0x86b6ee);
  var horizon = new THREE.Color(SKY_HAZE);
  var c = new THREE.Color();
  for (var i = 0; i < pos.count; i++) {
    var t = clamp(pos.getY(i) / 2600, -1, 1);
    if (t > 0.28) c.copy(mid).lerp(zenith, smoothstep(0.28, 0.95, t));
    else c.copy(horizon).lerp(mid, smoothstep(-0.12, 0.28, t));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  var mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false
  }));
  mesh.renderOrder = -1;
  scene.add(mesh);
  return mesh;
}

var SKY_HAZE = 0xe9c39a;
