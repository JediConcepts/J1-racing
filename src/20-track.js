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


/* Brands Hatch Grand Prix circuit. 3.9 km, clockwise, and defined by its
   elevation: 34 m between the low point at the bottom of Paddock Hill and the
   summit at Druids. The road falls away the instant you cross the line.

   Corrected from the authored geometry in two ways. The point order was
   mirrored, which inverts chirality and would have made every corner a
   left-hander. And Druids was a 105 degree direction change across two ~47 m
   chords, which drove the spline's minimum radius down to 6.1 m — narrower
   than the road's own half width, so the ribbon and both barriers folded
   through the centreline. The hairpin is now six points on a 28 m arc. */
var BRANDS_CONTROL = [
  [    0,    0, 20],
  [    2, -124, 19],
  [   31, -219, 16],
  [   69, -275,  8],
  [  130, -314,  0],
  [  178, -403,  9],
  [  232, -492, 19],
  [  275, -569, 28],
  [  303, -628, 32],
  [  314, -640, 33],
  [  330, -644, 34],
  [  345, -638, 34],
  [  355, -625, 33],
  [  356, -609, 32],
  [  341, -545, 26],
  [  326, -480, 18],
  [  310, -420, 11],
  [  303, -355,  8],
  [  298, -237,  6],
  [  295, -130,  5],
  [  293,  -24,  6],
  [  290,   53,  8],
  [  306,  113,  9],
  [  391,  160,  6],
  [  492,  207,  3],
  [  590,  255,  1],
  [  666,  293,  1],
  [  728,  347,  2],
  [  772,  430,  8],
  [  791,  506, 13],
  [  791,  577, 14],
  [  758,  667,  8],
  [  711,  750,  3],
  [  661,  809,  4],
  [  598,  849,  7],
  [  519,  873,  9],
  [  436,  885, 10],
  [  355,  878, 11],
  [  275,  849, 13],
  [  199,  809, 15],
  [  128,  750, 16],
  [   77,  676, 18],
  [   45,  591, 19],
  [   19,  501, 20],
  [    2,  397, 20],
  [    0,  243, 20],
  [    0,  113, 20]
];

/* [name, index] PAIRS — mapCorners reads names[c][0] and names[c][1], so an
   array of objects silently yields undefined and every label is dropped. */
var BRANDS_CORNERS = [
  ['PADDOCK HILL BEND', 3], ['DRUIDS', 10], ['GRAHAM HILL BEND', 16],
  ['SURTEES', 22], ['HAWTHORN', 27], ['WESTFIELD', 30], ['DINGLE DELL', 31],
  ['SHEENE CURVE', 34], ['STIRLINGS', 37], ['CLEARWAYS', 40], ['CLARK CURVE', 43]
];

/* Circuit de Monaco - 3.337km street circuit around Monte Carlo harbour */
var MONACO_CONTROL = [
  [  350,   600,   0], /* Pit Straight / Start Finish */
  [  120,   600,   0],
  [ -100,   590,   0], /* Turn 1: SAINTE DEVOTE */
  [ -220,   520,  12], /* Beau Rivage Uphill Climb */
  [ -340,   410,  24],
  [ -420,   280,  32], /* Turn 3: MASSENET */
  [ -450,   120,  35], /* Turn 4: CASINO SQUARE */
  [ -380,    10,  25],
  [ -280,   -60,  15], /* Turn 5: MIRABEAU HAUTE */
  [ -180,  -120,   8], /* Turn 6: FAIRMONT HAIRPIN */
  [ -240,  -180,   4],
  [ -210,  -260,   2], /* Turn 7: MIRABEAU BAS */
  [ -120,  -320,   0], /* Turn 8: PORTIER */
  [    0,  -350,   0], /* Turn 9: TUNNEL ENTRY */
  [  200,  -320,   0], /* THE TUNNEL */
  [  400,  -240,   0],
  [  520,  -120,   0], /* Turns 10-11: NOUVELLE CHICANE */
  [  460,    20,   0],
  [  380,   120,   0], /* Turn 12: TABAC */
  [  280,   240,   0], /* Turns 13-16: SWIMMING POOL */
  [  200,   340,   0],
  [  240,   440,   0],
  [  310,   490,   0], /* Turn 18: LA RASCASSE */
  [  380,   540,   0]  /* Turn 19: ANTHONY NOGHES */
];

var MONACO_CORNERS = [
  ['SAINTE DEVOTE', 2], ['BEAU RIVAGE', 3], ['MASSENET', 5], ['CASINO SQUARE', 6],
  ['MIRABEAU', 8], ['FAIRMONT HAIRPIN', 9], ['PORTIER', 12], ['THE TUNNEL', 14],
  ['NOUVELLE CHICANE', 16], ['TABAC', 18], ['SWIMMING POOL', 19], ['LA RASCASSE', 22],
  ['ANTHONY NOGHES', 23]
];

var TRACKS = [
  {
    id: 'monaco-gp-v1',
    name: 'MONACO GRAND PRIX',
    blurb: 'MONTE CARLO STREETS',
    laps: 3,
    halfW: 5.5,          /* Tight street track */
    runoff: 4.5,         /* Armco barriers right against the track */
    music: 'monaco',
    control: MONACO_CONTROL,
    corners: MONACO_CORNERS
  },
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
    /* crowd the whole way round, outside wall and infield both */
    standRing: true,
    /* The 500 runs 33 cars in 11 rows of three — the field size and the
       three-abreast rows are the event's signature, and a six-car grid on a
       2.5 mile oval looks like an empty car park. */
    grid: 33,
    gridCols: 3,
    playerStart: 'mid',
    /* faster, flatter, four on the floor — the oval never asks for a lift */
    music: 'speedway',
    control: INDY_CONTROL,
    corners: INDY_CORNERS
  },
  {
    id: 'brands-hatch-v1',
    name: 'BRANDS HATCH',
    blurb: 'NARROW AND HILLY',
    laps: 4,
    /* the key is halfW — halfWidthM is read by nothing and would have left
       this narrow circuit at Silverstone's 14.4 m */
    halfW: 6.0,
    runoff: 6.0,
    /* darker and rollier, to match a lap spent going up and down */
    music: 'downland',
    control: BRANDS_CONTROL,
    corners: BRANDS_CORNERS
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
  asphalt: srgb(0x9c9caa),
  asphaltDark: srgb(0x8a8a95),
  runoff: srgb(0xa8a4ae),
  grass: srgb(0x6f9b52),
  grassDark: srgb(0x5c8544),
  papaya: srgb(0xff8000),
  anthracite: srgb(0x1b1c22),
  cyan: srgb(0x4fe3e0)
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

  /* Banking follows curvature, capped. A road circuit gets a token 2.6 degrees
     of camber; a speedway needs its real figure, and because an oval's turns
     hold constant radius a high gain saturates at the cap through the whole
     turn and smoothLoop blends it out onto the straights — which is exactly
     the real banking profile. */
  var bankGain = def.bankGain || 14;
  var bankMax = def.bankMax || 0.046;
  var bankRaw = new Float32Array(this.n);
  /* SIGN — derive it, do not guess, because two of the three terms are
     counter-intuitive:

       lat = up X fwd. With three.js's frame (fwd = -Z, +X right, +Y up) that
       cross product is -X, so LATERAL OFFSET IS POSITIVE TO THE CAR'S LEFT,
       not its right. Every comment here used to claim the opposite.

       curv = atan2(f0.z*f1.x - f0.x*f1.z, ...) is positive when yaw increases,
       which swings fwd from +Z toward +X — a LEFT turn.

     So curv > 0 puts the inside of the corner at POSITIVE offset, and since
     pointAt() sets height to `off * tan(bank)`, lifting the OUTSIDE (negative
     off) needs tan(bank) < 0. Bank therefore opposes curvature.

     Getting this backwards banks every corner off-camber. It hides at
     Silverstone's 2.6 degrees and is unmissable at Indy's 9.2. */
  for (i = 0; i < this.n; i++) bankRaw[i] = clamp(-this.curv[i] * bankGain, -bankMax, bankMax);
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
  /* THE REAL LENGTH OF THIS SEGMENT, not the average.

     `ds` is length/n, but the spline is sampled at uniform PARAMETER rather
     than uniform arc length, so segments vary — at Brands they run 3.09 m to
     5.43 m against a 4.34 m average, nearly 30% either way. Normalising the
     interpolation by `ds` therefore makes t reach 1 before the next sample on
     a short segment, and never reach it on a long one, so the height flat-
     lines and then snaps at every boundary.

     Flat circuits hide this completely: with every p.y at zero the lerp has
     nothing to get wrong. Brands climbs up to 0.626 m per segment and it
     showed up as the car shaking — 0.111 m RMS of pure frame-to-frame jitter
     in the car's vertical position, against a predicted 0.11 m worst case. */
  var seg = this.cum[i + 1] - this.cum[i];
  /* Step back to the segment we are actually ON.

     nearestIndex returns the nearest sample POINT, which flips to i+1 at the
     MIDPOINT of a segment — but everything below treats i as the segment
     START. So for the second half of every segment the nearest sample is
     ahead of the car, `along` comes out NEGATIVE, and t clamps to 0: the
     height stops interpolating and snaps to that sample's value.

     The old guard was `along < -seg`, which can never fire, because
     nearestIndex has already guaranteed |along| <= seg/2. The result was a
     jump of half a segment's climb at every single sample crossing — 0.4 m at
     Brands, once every five frames at racing speed. That is the shaking.

     `along < 0` is the correct test: it puts the car back on the segment
     whose start it has passed, so along lands in [0, seg] and t sweeps the
     full 0..1 continuously. */
  if (along > seg) { i = (i + 1) % n; p = this.p[i]; f = this.fwd[i]; l = this.lat[i]; dx = x - p.x; dz = z - p.z; along = dx * f.x + dz * f.z; lateral = dx * l.x + dz * l.z; seg = this.cum[i + 1] - this.cum[i]; }
  else if (along < 0) { i = (i - 1 + n) % n; p = this.p[i]; f = this.fwd[i]; l = this.lat[i]; dx = x - p.x; dz = z - p.z; along = dx * f.x + dz * f.z; lateral = dx * l.x + dz * l.z; seg = this.cum[i + 1] - this.cum[i]; }

  var t = clamp(along / seg, 0, 1);
  var nextY = this.p[(i + 1) % n].y;
  var y = lerp(p.y, nextY, t) + lateral * dtan(this.bank[i]);

  out.i = i;
  out.lateral = lateral;
  out.s = this.cum[i] + clamp(along, 0, seg);
  out.y = y;
  out.fwd = f;
  out.lat = l;
  return out;
};

Track.prototype.heightAt = function (x, z, hint) {
  var tmp = TMP_FRAME_B;
  this.frame(x, z, hint, tmp);
  /* same drop the mesh uses, so the car rides the surface you can see */
  return tmp.y - runoffDrop(tmp.lateral);
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

    /* grass or city street pavement skirt */
    if (track.id === 'monaco-gp-v1') {
      var cityPavement = (i % 2 === 0) ? srgb(0x9a9a9a) : srgb(0x8a8a8a);
      pushStrip(grass, track, i, i2, WALL_HALF, WALL_HALF + VERGE, -0.55, v0 * 0.35, v1 * 0.35, cityPavement);
      pushStrip(grass, track, i, i2, -(WALL_HALF + VERGE), -WALL_HALF, -0.55, v0 * 0.35, v1 * 0.35, cityPavement);
    } else {
      var gShade = (i % 5 === 0) ? COL.grassDark : COL.grass;
      pushStrip(grass, track, i, i2, WALL_HALF, WALL_HALF + VERGE, -0.55, v0 * 0.35, v1 * 0.35, gShade);
      pushStrip(grass, track, i, i2, -(WALL_HALF + VERGE), -WALL_HALF, -0.55, v0 * 0.35, v1 * 0.35, gShade);
    }

    /* barrier walls */
    pushWall(wall, track, i, i2, WALL_HALF, 1.25, vAccum);
    pushWall(wall, track, i, i2, -WALL_HALF, 1.25, vAccum);
  }

  var group = new THREE.Group();

  group.add(new THREE.Mesh(road.geometry(), new THREE.MeshStandardMaterial({
    map: texFromCanvas(makeAsphaltTex(), 1, 1), vertexColors: true, roughness: 0.92, metalness: 0.0 })));
  group.add(new THREE.Mesh(runoff.geometry(), new THREE.MeshStandardMaterial({
    map: texFromCanvas(makeRunoffTex(), 1, 1), vertexColors: true, roughness: 0.95, metalness: 0.0 })));
  
  var grassTexCanvas = track.id === 'monaco-gp-v1' ? makeAsphaltTex() : makeGrassTex();
  group.add(new THREE.Mesh(grass.geometry(), new THREE.MeshStandardMaterial({
    map: texFromCanvas(grassTexCanvas, 6, 1), vertexColors: true, roughness: 1.0, metalness: 0.0 })));

  group.add(new THREE.Mesh(kerb.geometry(), new THREE.MeshStandardMaterial({
    map: texFromCanvas(makeKerbTex(), 1, 1, true), vertexColors: true, roughness: 0.72, metalness: 0.0 })));
  group.add(new THREE.Mesh(wall.geometry(), new THREE.MeshStandardMaterial({
    map: texFromCanvas(makeWallTex(), 1, 1), vertexColors: true, roughness: 0.55, metalness: 0.35 })));
  var lineMesh = new THREE.Mesh(line.geometry(), new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.85, metalness: 0.0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
  }));
  group.add(lineMesh);

  /* receiveShadow is PER MESH — setting it on the Group does nothing, three.js
     never walks the tree for it. The road, kerbs, runoff and grass all take
     shadows; none of them casts one. */
  group.traverse(function (o) { if (o.isMesh) o.receiveShadow = true; });
  scene.add(group);
  return group;
}

var WHITE_C = new THREE.Color(0xffffff);

function edge(track, i, off) {
  var p = track.p[i], l = track.lat[i];
  return vec(p.x + l.x * off, p.y + off * dtan(track.bank[i]), p.z + l.z * off);
}

/* The runoff sits below the racing surface, so dropping a wheel off the road
   is felt as well as seen.

   THIS MUST BE APPLIED TO THE MESH AND TO heightAt ALIKE. It used to live only
   in heightAt, so the car drove along a surface up to half a metre below the
   one on screen — which reads exactly as sinking into the gravel. */
function runoffDrop(off) {
  var a = Math.abs(off);
  return a > HALF_W ? Math.min((a - HALF_W) * 0.05, 0.5) : 0;
}

/* Ground height at a lateral offset from sample i.

   Anything standing beside the circuit must be placed with this rather than
   with p.y. p.y is the height on the CENTRELINE, and on a banked circuit the
   verge is nowhere near it: at Indy's 9.2 degrees the apron where the corner
   boards stand is 3.5 m above the centreline, so a board pinned to p.y is
   buried up to its lettering and its legs never surface. */
function groundY(track, i, off) {
  return track.p[i].y + off * dtan(track.bank[i]) - runoffDrop(off);
}

function edgeY(track, i, off, dy) {
  var p = track.p[i], l = track.lat[i];
  return vec(p.x + l.x * off, groundY(track, i, off) + dy, p.z + l.z * off);
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
  /* WINDING. quad(a,b,c,d) winds a->b->c, so its normal is (b-a) x (c-a).
     Both faces here span fwd*ds and up*h, which makes the normal +/-lat and
     nothing else — the side of the track the wall sits on does not enter into
     it, only the vertex order does. These two branches were swapped, so BOTH
     barriers faced away from the circuit and were culled by the FrontSide
     material: solid to drive into, invisible to look at. Only the 0.35 m cap
     strip below, which winds to +up, was ever drawn. */
  if (inward > 0) rb.quad(base1, base0, top0, top1, [[u1, 1], [u0, 1], [u0, 0], [u1, 0]], WHITE_C);
  else rb.quad(base0, base1, top1, top0, [[u0, 1], [u1, 1], [u1, 0], [u0, 0]], WHITE_C);
  /* capping strip so the wall reads as solid from a chase camera */
  var capIn0 = edgeY(track, i, off + inward * 0.35, h), capIn1 = edgeY(track, i2, off + inward * 0.35, h);
  if (inward > 0) rb.quad(top0, top1, capIn1, capIn0, [[u0, 0], [u1, 0], [u1, 0.2], [u0, 0.2]], WHITE_C);
  else rb.quad(capIn0, capIn1, top1, top0, [[u0, 0.2], [u1, 0.2], [u1, 0], [u0, 0]], WHITE_C);
}

/* A speedway is not dotted with grandstands, it is enclosed by them, so a
   circuit can ask for `standRing` and get unbroken terracing round the whole
   lap on BOTH sides — the outside wall and the infield.

   Built as one closed strip per side rather than a stand mesh every few
   metres: at Indy that is roughly 160 objects collapsed into four, which
   matters because every one of them would otherwise be its own draw call.

   The rake matches the individual stands — the face climbs away from the
   circuit so its normal points up and inward, toward the racing. */
function buildStandRing(scene, track, crowdMat) {
  var n = track.n;
  var STEP = 4;                     /* one quad per 4 samples is ample here */
  var Y0 = 1.4, Y1 = 15.0;
  /* The two sides are NOT symmetrical. Perimeter terracing crowds the wall,
     but infield terracing at the same offset sits square in the driver's eye
     line all the way round — it has to go back across the apron, which is
     also where it really is. lat is the car's LEFT and this oval runs
     anti-clockwise, so side +1 is the infield.

     The perimeter figure also has to clear the corner boards, which stand at
     WALL_HALF + 3.6. At WALL_HALF + 6 the terracing rose barely two metres
     behind them, so a dark board landed against the stand's dark base and
     stopped reading. WALL_HALF + 14 leaves ten metres of grass behind every
     board, which is also roughly where the apron, wall and fence put the
     first row on a real speedway.

     Both figures must also stay inside the grass skirt, which only reaches
     WALL_HALF + VERGE (46). Past that there is no ground mesh at all, so a
     ring placed further out stands on nothing — the infield bank at + 52 was
     hanging over the void with groundY extrapolating the banking 8 m below
     the centreline. Outer spans 14 to 37 with its roof, infield 22 to 45. */
  var OFFSETS = { '1': WALL_HALF + 22, '-1': WALL_HALF + 14 };
  /* 44 m per tile, matching PlaneGeometry(44, ...) on the single stands, so
     the crowd is the same density everywhere on the circuit. */
  var TILE = 44;
  var roofMat = new THREE.MeshStandardMaterial({ color: COL.papaya, side: THREE.DoubleSide, roughness: 0.48, metalness: 0.15 });

  for (var side = 1; side >= -1; side -= 2) {
    var near = OFFSETS[String(side)], far = near + 19;
    var strips = [
      { pos: [], uv: [], idx: [], near: near, far: far, y0: Y0, y1: Y1, mat: crowdMat },
      { pos: [], uv: [], idx: [], near: far - 1, far: far + 4, y0: Y1 + 0.9, y1: Y1 + 1.4, mat: roofMat }
    ];
    var run = 0, cols = 0;

    /* k runs to n inclusive so the last quad closes back onto sample 0 */
    for (var k = 0; k <= n; k += STEP) {
      var i = k % n;
      var p = track.p[i], l = track.lat[i];
      if (k > 0) run += track.ds * STEP;
      var u = run / TILE;
      for (var t = 0; t < 2; t++) {
        var st = strips[t];
        st.pos.push(p.x + l.x * side * st.near, groundY(track, i, side * st.near) + st.y0, p.z + l.z * side * st.near);
        st.pos.push(p.x + l.x * side * st.far, groundY(track, i, side * st.far) + st.y1, p.z + l.z * side * st.far);
        st.uv.push(u, 0, u, 1);
      }
      cols++;
    }

    for (var c = 0; c < cols - 1; c++) {
      var a = c * 2;
      for (var s2 = 0; s2 < 2; s2++) {
        strips[s2].idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }

    for (var g = 0; g < 2; g++) {
      var sg = strips[g];
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(sg.pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(sg.uv, 2));
      geo.setIndex(sg.idx);
      geo.computeVertexNormals();
      scene.add(new THREE.Mesh(geo, sg.mat));
    }
  }
}

/* =========================================================================
   FURNITURE — gantry, grandstands, trees, boards, sky
   ========================================================================= */

function buildStartGantry(track, scene) {
  var idx = track.startIndex;
  var g = new THREE.Group();
  var mid = track.p[idx], lat = track.lat[idx], fwd = track.fwd[idx];
  var yaw = datan2(fwd.x, fwd.z);

  var darkMat = new THREE.MeshStandardMaterial({ color: srgb(0x24252c), roughness: 0.52, metalness: 0.45 });
  var papMat = new THREE.MeshStandardMaterial({ color: COL.papaya, roughness: 0.45, metalness: 0.2 });

  var pillarGeo = new THREE.BoxGeometry(1.1, 8.4, 1.1);
  for (var s = -1; s <= 1; s += 2) {
    var pillar = new THREE.Mesh(pillarGeo, darkMat);
    pillar.position.set(mid.x + lat.x * s * (WALL_HALF + 1.2), groundY(track, idx, s * (WALL_HALF + 1.2)) + 4.2, mid.z + lat.z * s * (WALL_HALF + 1.2));
    g.add(pillar);
  }

  
    var beam = new THREE.Mesh(new THREE.BoxGeometry((WALL_HALF + 1.8) * 2, 1.9, 1.3), darkMat);
    beam.position.set(mid.x, mid.y + 8.0, mid.z);
    beam.rotation.y = yaw;
    g.add(beam);
    var gpName = track.id === 'monaco-gp-v1' ? 'MONACO GP' : 'PAPAYA GP';
    var bannerTex = texFromCanvas(makeCheckeredBannerTex(gpName, '#ff8000', '#1b1c22', '#ffffff'), 1, 1, true);
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
    m.position.set(mid.x + lat.x * t, groundY(track, idx, t) + 7.2, mid.z + lat.z * t);
    m.rotation.y = yaw + Math.PI / 2;
    g.add(m);
    lights.push(m);
  }

  /* start line */
  var lineTex = texFromCanvas(makeStartLineTex(), 8, 1, true);
  var startLine = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, 2.2),
    new THREE.MeshStandardMaterial({ map: lineTex, roughness: 0.8, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  startLine.rotation.x = -Math.PI / 2;
  /* +yaw, not -yaw. Laid flat by rotation.x = -PI/2 under the default XYZ
     order, a NEGATIVE z mirrors the heading instead of rotating it, so the
     span only lands across the road at cardinal headings. Every circuit here
     happens to start near one, which hid it — Silverstone was out by 1.4
     degrees on a straight 0.7 degrees off axis, exactly the 2x that a
     reflection gives. */
  startLine.rotation.z = yaw;
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
  var standMat = new THREE.MeshStandardMaterial({ color: srgb(0x33353f), roughness: 0.82, metalness: 0.1 });
  var crowdMat = new THREE.MeshStandardMaterial({ map: crowdTex, side: THREE.DoubleSide, roughness: 1.0, metalness: 0.0 });
  var roofMat = new THREE.MeshStandardMaterial({ color: COL.papaya, roughness: 0.45, metalness: 0.2 });
  var pitMat = new THREE.MeshStandardMaterial({ map: texFromCanvas(makePitwallTex(), 4, 1, true), roughness: 0.7, metalness: 0.0 });

  /* Stands stand back far enough to frame the straight instead of walling it
     in, and the terracing is dark so the crowd is what actually reads.

     A `standRing` circuit skips these entirely — the ring already covers the
     start line, and leaving both in would bury five stands inside it. */
  var ringed = !!track.def.standRing;
  if (ringed) buildStandRing(scene, track, crowdMat);
  for (var s = 0; !ringed && track.id !== 'monaco-gp-v1' && s < 5; s++) {
    var idx = (track.startIndex - 12 + s * 9 + n) % n;
    var side = s % 2 === 0 ? 1 : -1;
    var p = track.p[idx], l = track.lat[idx], f = track.fwd[idx];
    var yaw = datan2(f.x, f.z);
    var dist = WALL_HALF + 20;
    var facing = yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2);

    var base = new THREE.Mesh(new THREE.BoxGeometry(46, 8, 15), standMat);
    base.position.set(p.x + l.x * side * dist, groundY(track, idx, side * dist) + 3.2, p.z + l.z * side * dist);
    /* -PI/2 turns the 46 m span ALONG the track. BoxGeometry puts that span
       on local X, and rotation.y = yaw alone sends local X to lat — across
       the road — so the shell sat crosswise under a crowd panel that runs
       lengthwise, protruding 22 m from each end of a 15 m deep box. */
    base.rotation.y = yaw - Math.PI / 2;
    scene.add(base);

    var cd = dist - 8.2;
    var crowd = new THREE.Mesh(new THREE.PlaneGeometry(44, 10.5), crowdMat);
    crowd.position.set(p.x + l.x * side * cd, groundY(track, idx, side * cd) + 5.4, p.z + l.z * side * cd);
    crowd.rotation.order = 'YXZ';
    crowd.rotation.y = facing;
    /* NEGATIVE. With order YXZ the world normal is
       (cos x * sin y, -sin x, cos x * cos y), so a POSITIVE rotation.x drives
       the normal's y below zero — the seating face tilts down and leans in
       over the track, which reads as a stand built back-to-front. A real rake
       climbs away from the circuit: back rows higher and further out, normal
       pointing up and inward. */
    crowd.rotation.x = -0.42;
    scene.add(crowd);

    var roof = new THREE.Mesh(new THREE.BoxGeometry(48, 0.7, 17), roofMat);
    roof.position.set(p.x + l.x * side * (dist + 1.5), groundY(track, idx, side * (dist + 1.5)) + 11.2, p.z + l.z * side * (dist + 1.5));
    roof.rotation.y = yaw - Math.PI / 2;   /* same 90 degrees as the base */
    scene.add(roof);

    for (var pil = -1; pil <= 1; pil += 2) {
      var post = new THREE.Mesh(new THREE.BoxGeometry(1, 12, 1), standMat);
      post.position.set(
        p.x + l.x * side * (dist + 7) + f.x * pil * 21,
        groundY(track, idx, side * (dist + 7)) + 5.6,
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
    board.position.set(pp.x + pl.x * (WALL_HALF + 2.6), groundY(track, pi, WALL_HALF + 2.6) + 1.6, pp.z + pl.z * (WALL_HALF + 2.6));
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
    if (track.id === 'monaco-gp-v1' && si > 460 && si < 580) continue; /* skip signs in tunnel */
    
    var signTex = texFromCanvas(makeSignTex(corner.name, '#1b1c22', '#ff8000', '#ff8000'), 1, 1, true);
    var signMat = new THREE.MeshBasicMaterial({
      map: signTex,
      side: THREE.DoubleSide, roughness: 0.7, metalness: 0.0
    });
    var signAspect = signTex.image.width / signTex.image.height;
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(2.75 * signAspect, 2.75), signMat);

    sign.position.set(sp.x + sl.x * sideS * (WALL_HALF + 3.6), groundY(track, si, sideS * (WALL_HALF + 3.6)) + 2.9, sp.z + sl.z * sideS * (WALL_HALF + 3.6));
    /* +PI so the lettered FRONT face turns back up the road to meet the
       driver. Facing it down-track shows the mirrored reverse. */
    sign.rotation.y = datan2(sf.x, sf.z) + Math.PI;
    scene.add(sign);

    for (var leg = -1; leg <= 1; leg += 2) {
      var legMesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.0, 0.35), standMat);
      legMesh.position.set(
        sp.x + sl.x * sideS * (WALL_HALF + 3.6) + sf.x * leg * 4.6,
        groundY(track, si, sideS * (WALL_HALF + 3.6)) + 1.5,
        sp.z + sl.z * sideS * (WALL_HALF + 3.6) + sf.z * leg * 4.6
      );
      scene.add(legMesh);
    }
  }

  /* crossed-quad treeline */
  if (true) {
    var treeTex = texFromCanvas(makeTreeTex(), 1, 1, true);
    var treeMat = new THREE.MeshStandardMaterial({
      map: treeTex, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1.0, metalness: 0.0
    });
    var treeBuf = new RibbonBuilder();
    var treeProbe = { i: 0, lateral: 0, s: 0, y: 0, fwd: null, lat: null };
    var placed = 0;
    for (i = 0; i < n; i += 2) {
      for (var side2 = -1; side2 <= 1; side2 += 2) {
        if (rnd() > 0.55) continue;
        if (track.id === 'monaco-gp-v1' && i > 540 && i < 880 && side2 === 1) continue; /* harbour */
        if (track.def.standRing && side2 > 0) continue;
        var d = WALL_HALF + (track.def.standRing ? 56 : 20) + rnd() * 90;
        var tp = track.p[i], tl = track.lat[i];
        var x = tp.x + tl.x * side2 * d + (rnd() - 0.5) * 14;
        var z = tp.z + tl.z * side2 * d + (rnd() - 0.5) * 14;

        track.frame(x, z, null, treeProbe);
        if (Math.abs(treeProbe.lateral) < WALL_HALF + 6) continue;

        var vergeEdge = WALL_HALF + VERGE;
        var y = groundY(track, treeProbe.i, clamp(treeProbe.lateral, -vergeEdge, vergeEdge)) - 0.6;
        var hgt = 9 + rnd() * 9;
        var wdt = hgt * 0.62;
        pushCrossQuad(treeBuf, x, y, z, wdt, hgt, rnd() * TAU);
        placed++;
        if (placed > 420) break;
      }
      if (placed > 420) break;
    }
    var trees = new THREE.Mesh(treeBuf.geometry(), treeMat); trees.castShadow = true; trees.receiveShadow = true;
    scene.add(trees);
  }

  /* Monaco GP Real 3D Tunnel Canopy, Fairmont Hotel & Urban Street Environment */
  if (track.id === 'monaco-gp-v1') {
    buildMonacoTunnelAndUrbanScenery(track, scene);
  }

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

function buildMonacoTunnelAndUrbanScenery(track, scene) {
  var n = track.n;
  var tunnelBuilder = new RibbonBuilder();
  var lightBuilder = new RibbonBuilder();
  var darkConcrete = srgb(0x22242a);
  var lightConcrete = srgb(0x555860);
  var goldLight = new THREE.Color(0xffd700);

  var tunnelStart = 470;
  var tunnelEnd = 575;

  /* 3D Tunnel Canopy & Inside Ceiling Lights */
  for (var i = tunnelStart; i < tunnelEnd; i++) {
    var i2 = (i + 1) % n;
    var H = 5.8;
    var wL = -WALL_HALF;
    var wR = WALL_HALF;

    var bL0 = edgeY(track, i, wL, 1.25), bL1 = edgeY(track, i2, wL, 1.25);
    var bR0 = edgeY(track, i, wR, 1.25), bR1 = edgeY(track, i2, wR, 1.25);

    var rL0 = edgeY(track, i, wL, H), rL1 = edgeY(track, i2, wL, H);
    var rR0 = edgeY(track, i, wR, H), rR1 = edgeY(track, i2, wR, H);

    /* Tunnel Roof Ceiling (inner face looking down) */
    tunnelBuilder.quad(rL0, rL1, rR1, rR0, [[0, 0], [0, 1], [1, 1], [1, 0]], darkConcrete);

    /* Tunnel Upper Side Walls */
    tunnelBuilder.quad(bL0, bL1, rL1, rL0, [[0, 0], [0, 1], [1, 1], [1, 0]], darkConcrete);
    tunnelBuilder.quad(rR0, rR1, bR1, bR0, [[0, 0], [0, 1], [1, 1], [1, 0]], darkConcrete);

    /* Outer Roof Cover */
    var oL0 = edgeY(track, i, wL - 1.0, H + 0.4), oL1 = edgeY(track, i2, wL - 1.0, H + 0.4);
    var oR0 = edgeY(track, i, wR + 1.0, H + 0.4), oR1 = edgeY(track, i2, wR + 1.0, H + 0.4);
    tunnelBuilder.quad(oL0, oL1, oR1, oR0, [[0, 0], [0, 1], [1, 1], [1, 0]], lightConcrete);

    /* Interior Ceiling Lights */
    if (i % 3 === 0) {
      var lA0 = edgeY(track, i, -2.5, H - 0.05), lA1 = edgeY(track, i2, -2.5, H - 0.05);
      var lB0 = edgeY(track, i, -1.5, H - 0.05), lB1 = edgeY(track, i2, -1.5, H - 0.05);
      lightBuilder.quad(lA0, lA1, lB1, lB0, [[0,0],[0,1],[1,1],[1,0]], goldLight);

      var rA0 = edgeY(track, i, 1.5, H - 0.05), rA1 = edgeY(track, i2, 1.5, H - 0.05);
      var rB0 = edgeY(track, i, 2.5, H - 0.05), rB1 = edgeY(track, i2, 2.5, H - 0.05);
      lightBuilder.quad(rA0, rA1, rB1, rB0, [[0,0],[0,1],[1,1],[1,0]], goldLight);
    }
  }

  var tunnelMesh = new THREE.Mesh(tunnelBuilder.geometry(), new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.8, metalness: 0.2, side: THREE.DoubleSide
  }));
  tunnelMesh.castShadow = true; tunnelMesh.receiveShadow = true; scene.add(tunnelMesh);

  var lightMesh = new THREE.Mesh(lightBuilder.geometry(), new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide
  }));
  scene.add(lightMesh);

  /* Tunnel Entrance & Exit Portals */
  function buildPortal(idx, title) {
    var p = track.p[idx], f = track.fwd[idx];
    var yaw = datan2(f.x, f.z);
    var g = new THREE.Group();
    var archMat = new THREE.MeshStandardMaterial({ color: srgb(0x3a3d45), roughness: 0.7 });
    
    var archW = WALL_HALF * 2 + 3;
    var arch = new THREE.Mesh(new THREE.BoxGeometry(archW, 2.2, 2.5), archMat);
    arch.position.set(p.x, p.y + 6.2, p.z);
    arch.rotation.y = yaw;
    g.add(arch);

    var bannerTex = texFromCanvas(makeCheckeredBannerTex(title, '#ff8000', '#1b1c22', '#ffffff'), 1, 1, true);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry((WALL_HALF + 1.5) * 2, 2.6),
      new THREE.MeshBasicMaterial({ map: bannerTex, side: THREE.DoubleSide, fog: false }));
    
    // Position it slightly in front of the arch (from the driver's perspective)
    // Driver comes from -f. So to face the driver, we move it back along -f.
    var signOffset = idx === tunnelStart ? -1.3 : -1.3; 
    sign.position.set(p.x + f.x * signOffset, p.y + 6.2, p.z + f.z * signOffset);
    sign.rotation.y = yaw + Math.PI;
    g.add(sign);
    scene.add(g);
  }

  buildPortal(tunnelStart, 'THE TUNNEL - MONTE CARLO');
  buildPortal(tunnelEnd, 'TUNNEL EXIT - NOUVELLE CHICANE');

  /* Fairmont Hotel on top of Tunnel */
  var midI = Math.floor((tunnelStart + tunnelEnd) / 2);
  var midP = track.p[midI], midL = track.lat[midI], midF = track.fwd[midI];
  var midYaw = datan2(midF.x, midF.z);

  var hotelMat = new THREE.MeshStandardMaterial({ color: srgb(0xdedad4), roughness: 0.8 });
  var hotel = new THREE.Mesh(new THREE.BoxGeometry(40, 16, 50), hotelMat);
  hotel.position.set(midP.x + midL.x * 28, midP.y + 14, midP.z + midL.z * 28);
  hotel.rotation.y = midYaw;
  hotel.castShadow = true; hotel.receiveShadow = true; scene.add(hotel);

  /* Casino de Monte-Carlo at Casino Square (Outer Left Side, clear of Sainte Devote) */
  var casI = 225;
  var casP = track.p[casI], casL = track.lat[casI], casF = track.fwd[casI];
  var casYaw = datan2(casF.x, casF.z);

  var casOff = WALL_HALF + 38;
  var casX = casP.x + casL.x * casOff;
  var casZ = casP.z + casL.z * casOff;

  var casinoMat = new THREE.MeshStandardMaterial({ color: srgb(0xe8e2d8), roughness: 0.7 });
  var casinoDomeMat = new THREE.MeshStandardMaterial({ color: srgb(0x386b62), roughness: 0.4 });
  var casinoGroup = new THREE.Group();

  var casinoMain = new THREE.Mesh(new THREE.BoxGeometry(40, 18, 22), casinoMat);
  casinoMain.position.set(casX, casP.y + 9, casZ);
  casinoMain.rotation.y = casYaw;
  casinoGroup.add(casinoMain);

  var dome = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), casinoDomeMat);
  dome.position.set(casX, casP.y + 18, casZ);
  casinoGroup.add(dome);

  var casSignTex = texFromCanvas(makeSignTex('CASINO DE MONTE-CARLO', '#ff8000', '#1c1b22', '#ffffff'), 1, 1, true);
  var casSign = new THREE.Mesh(new THREE.PlaneGeometry(22, 3.2), new THREE.MeshBasicMaterial({ map: casSignTex, side: THREE.DoubleSide }));
  var signX = casP.x + casL.x * (WALL_HALF + 9);
  var signZ = casP.z + casL.z * (WALL_HALF + 9);
  casSign.position.set(signX, casP.y + 5.5, signZ);
  casSign.rotation.y = casYaw - Math.PI / 2;
  casinoGroup.add(casSign);

  casinoGroup.traverse(function(c) { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); scene.add(casinoGroup);

  /* Harbour Mediterranean Sea & Superyachts */
  var seaGeo = new THREE.PlaneGeometry(600, 700);
  var seaMat = new THREE.MeshStandardMaterial({ color: srgb(0x16334f), roughness: 0.25, metalness: 0.6 });
  var sea = new THREE.Mesh(seaGeo, seaMat);
  sea.rotation.x = -Math.PI / 2;
  var harbourY = track.p[700].y; // use track elevation at the harbour
  sea.position.set(220, harbourY - 0.4, 50);
  sea.receiveShadow = true; scene.add(sea);
  track.sea = sea;

  var yachtHullMat = new THREE.MeshStandardMaterial({ color: srgb(0xf0f2f5), roughness: 0.3, metalness: 0.2 });
  var yachtDeckMat = new THREE.MeshStandardMaterial({ color: srgb(0x20242a), roughness: 0.5 });

  var yachtPositions = [
    { x: 300, z: -100, yaw: -0.5 },
    { x: 220, z: -50, yaw: -0.2 },
    { x: 250, z: 20, yaw: -0.7 },
    { x: 350, z: 0, yaw: -0.3 },
    { x: 300, z: 80, yaw: -0.5 },
    { x: 240, z: 120, yaw: 0.1 },
    { x: 180, z: 160, yaw: 0.3 },
    { x: 280, z: 180, yaw: -0.4 },
    { x: 220, z: 240, yaw: 0.5 },
    { x: 150, z: 280, yaw: 0.8 }
  ];

  var safeDistSqYacht = (WALL_HALF + 8) * (WALL_HALF + 8);

  yachtPositions.forEach(function (pos) {
    var hitsTrack = false;
    for (var tj = 0; tj < n; tj += 3) {
      var tp = track.p[tj];
      var dx = pos.x - tp.x, dz = pos.z - tp.z;
      if (dx * dx + dz * dz < safeDistSqYacht) {
        hitsTrack = true;
        break;
      }
    }
    if (hitsTrack) return;

    var yacht = new THREE.Group();
    
    // Hull base
    var hw = 4;
    var hl = 12;
    var hh = 2.5;

    // Main box for the back of the hull
    var backHull = new THREE.Mesh(new THREE.BoxGeometry(hw*2, hh*2, hl*2), yachtHullMat);
    backHull.position.set(0, hh, -hl/2);
    yacht.add(backHull);

    // Cylinder/Cone for the front (bow)
    var bowGeo = new THREE.CylinderGeometry(0.1, hw, hl*1.5, 3, 1, false, 0, Math.PI);
    var bow = new THREE.Mesh(bowGeo, yachtHullMat);
    // Cylinder is along Y. We want it along Z.
    bow.rotation.x = Math.PI / 2;
    // We want the flat part of the half-cylinder to align with the backHull.
    // The half-cylinder is from 0 to PI. 
    // Actually, a simple cone is better.
    
    var coneGeo = new THREE.ConeGeometry(hw, hl*1.5, 16);
    var cone = new THREE.Mesh(coneGeo, yachtHullMat);
    cone.rotation.x = Math.PI / 2;
    cone.position.set(0, hh, hl/2 + hl*0.75);
    // yacht.add(cone);

    // Let's just use a Box for the back and a manually positioned wedge for the bow.
    var bowWedge = new THREE.BufferGeometry();
    var verts = new Float32Array([
      -hw, 0, 0,    hw, 0, 0,     0, 0, hl*1.5,      // bottom triangle
      -hw, hh*2, 0, hw, hh*2, 0,  0, hh*2, hl*1.5,   // top triangle
      -hw, 0, 0,   -hw, hh*2, 0,  0, hh*2, hl*1.5,   // left side 1
      -hw, 0, 0,    0, hh*2, hl*1.5, 0, 0, hl*1.5,   // left side 2
       hw, 0, 0,    hw, hh*2, 0,  0, hh*2, hl*1.5,   // right side 1
       hw, 0, 0,    0, hh*2, hl*1.5, 0, 0, hl*1.5,   // right side 2
      -hw, 0, 0,    hw, 0, 0,     hw, hh*2, 0,       // back side 1
      -hw, 0, 0,    hw, hh*2, 0, -hw, hh*2, 0        // back side 2
    ]);
    bowWedge.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    bowWedge.computeVertexNormals();
    var bow = new THREE.Mesh(bowWedge, yachtHullMat);
    bow.position.set(0, 0, hl/2);
    yacht.add(bow);

    // Cabin
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(hw*1.5, 2.5, hl*1.2), yachtDeckMat);
    cabin.position.set(0, hh*2 + 1.25, -hl/4);
    yacht.add(cabin);
    
    // Windows
    var winGeo = new THREE.BoxGeometry(hw*1.55, 1.2, hl*1.25);
    var windowMat = new THREE.MeshBasicMaterial({color: 0x050505});
    var windows = new THREE.Mesh(winGeo, windowMat);
    windows.position.set(0, hh*2 + 1.25, -hl/4);
    yacht.add(windows);

    // Flybridge / Roof
    var roof = new THREE.Mesh(new THREE.BoxGeometry(hw*1.4, 0.5, hl*1.1), yachtHullMat);
    roof.position.set(0, hh*2 + 2.5 + 0.25, -hl/4);
    yacht.add(roof);
    
    // Radar dome / Mast
    var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3, 8), yachtHullMat);
    mast.position.set(0, hh*2 + 2.5 + 1.5, -hl/2);
    yacht.add(mast);

    yacht.position.set(pos.x, harbourY - 0.5, pos.z);
    yacht.rotation.y = pos.yaw;
    yacht.traverse(function(c) { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); scene.add(yacht);
  });

  /* Monte Carlo Urban Buildings along streets */
  var buildingTex1 = texFromCanvas(makeBuildingTex('#dbd3c5', '#1a1f24'), 1, 1, true);
  var buildingTex2 = texFromCanvas(makeBuildingTex('#c9bba8', '#2a2f34'), 1, 1, true);
  var buildingTex3 = texFromCanvas(makeBuildingTex('#b0a18f', '#1a1f24'), 1, 1, true);
  var buildingMat1 = new THREE.MeshStandardMaterial({ map: buildingTex1, roughness: 0.8 });
  var buildingMat2 = new THREE.MeshStandardMaterial({ map: buildingTex2, roughness: 0.8 });
  var buildingMat3 = new THREE.MeshStandardMaterial({ map: buildingTex3, roughness: 0.8 });
  var mats = [buildingMat1, buildingMat2, buildingMat3];

  var step = 6;
  for (var bi = 0; bi < n; bi += step) {
    if (bi >= tunnelStart - 25 && bi <= tunnelEnd + 25) continue;
    /* Strictly keep start/finish straight, Sainte Devote hill / Turn 1 (0-220), and La Rascasse / Anthony Noghes / Pit exit (640-n) 100% open */
    

    var bp = track.p[bi], bl = track.lat[bi], bf = track.fwd[bi];
    var bYaw = datan2(bf.x, bf.z);
    var cosY = dcos(bYaw), sinY = dsin(bYaw);

    for (var bSide = -1; bSide <= 1; bSide += 2) {
      if (bi > 540 && bi < 880 && bSide === 1) continue; /* Keep harbour side clear for superyachts */

      var bDist = track.id === 'monaco-gp-v1' ? WALL_HALF + 15 + (bi % 4) * 5 : WALL_HALF + 30 + (bi % 3) * 6;
      var bx = bp.x + bl.x * bSide * bDist;
      var bz = bp.z + bl.z * bSide * bDist;

      var bHeight = 16 + (bi % 5) * 8;
      var bWidth = 16 + (bi % 2) * 6;
      var bDepth = 14;

      /* Dense rotated 2D footprint grid check against ALL track sample points across the ENTIRE circuit */
      var marginW = bWidth / 2 + 5;
      var marginD = bDepth / 2 + 5;
      var safeDistSq = (WALL_HALF + 4) * (WALL_HALF + 4); /* 4m clearance from track centerline */
      var hitsTrack = false;

      for (var u = -1.0; u <= 1.0; u += 0.5) {
        for (var v = -1.0; v <= 1.0; v += 0.5) {
          var lx = u * marginW;
          var lz = v * marginD;
          /* Rotate local footprint offsets by bYaw into world space */
          var wx = bx + lx * cosY - lz * sinY;
          var wz = bz + lx * sinY + lz * cosY;

          for (var tj = 0; tj < n; tj += 2) {
            var tp = track.p[tj];
            var dx = wx - tp.x, dz = wz - tp.z;
            if (dx * dx + dz * dz < safeDistSq) {
              hitsTrack = true;
              break;
            }
          }
          if (hitsTrack) break;
        }
        if (hitsTrack) break;
      }
      if (hitsTrack) continue;

      var bGeo = new THREE.BoxGeometry(bWidth, bHeight, bDepth);
      var pos = bGeo.attributes.position;
      var uv = bGeo.attributes.uv;
      for (var i = 0; i < uv.count; i++) {
        var x = pos.getX(i);
        var y = pos.getY(i);
        var z = pos.getZ(i);
        // Box faces: simple UV scaling based on world-ish size
        if (Math.abs(x) >= bWidth/2 - 0.01) {
          uv.setXY(i, z / 6, y / 6);
        } else if (Math.abs(z) >= bDepth/2 - 0.01) {
          uv.setXY(i, x / 6, y / 6);
        } else {
          uv.setXY(i, x / 6, z / 6);
        }
      }
      var bMesh = new THREE.Mesh(bGeo, mats[(bi / step) % mats.length]);
      bMesh.position.set(bx, bp.y + bHeight / 2 - 0.5, bz);
      bMesh.rotation.y = bYaw; bMesh.castShadow = true; bMesh.receiveShadow = true;
      scene.add(bMesh);
    }
  }
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
