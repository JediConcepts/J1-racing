/* =========================================================================
   MCL-64  —  car model, vehicle physics, AI
   ========================================================================= */

/* --- model -------------------------------------------------------------- */

function part(geo, color, p, r, s) {
  var g = geo.index ? geo.toNonIndexed() : geo;
  var m = new THREE.Matrix4();
  var q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0));
  m.compose(new THREE.Vector3(p[0], p[1], p[2]), q, new THREE.Vector3(s ? s[0] : 1, s ? s[1] : 1, s ? s[2] : 1));
  g.applyMatrix4(m);
  var count = g.attributes.position.count;
  var arr = new Float32Array(count * 3);
  var c = new THREE.Color(color).convertSRGBToLinear();
  for (var i = 0; i < count; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

function mergeParts(list) {
  var total = 0, i, j;
  for (i = 0; i < list.length; i++) total += list[i].attributes.position.count;
  var pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  var o = 0;
  for (i = 0; i < list.length; i++) {
    var g = list[i];
    var pa = g.attributes.position.array, na = g.attributes.normal.array, ca = g.attributes.color.array;
    for (j = 0; j < pa.length; j++) { pos[o * 3 + j] = pa[j]; nor[o * 3 + j] = na[j]; col[o * 3 + j] = ca[j]; }
    o += g.attributes.position.count;
  }
  var out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

/* INDEX 0 IS THE PLAYER'S AND NOBODY ELSE'S. Papaya is the car you are
   looking for on a 33-car grid, so buildGrid hands index 0 to the player and
   draws the AI from 1 upward. Assigning by `i % LIVERIES.length` put a papaya
   car in six of Indy's 33 slots and made the player's own car unfindable.

   The rest exist in enough number that a full Indy field does not read as the
   same six cars repeated: 15 AI liveries over 32 opponents is roughly two of
   each, which is what a real grid looks like anyway. None of them is anywhere
   near papaya — no yellow-orange, no bronze — so nothing else can be mistaken
   for the car you are driving. */
var LIVERIES = [
  { name: 'MCL 64', body: 0xff8000, body2: 0x23262e, trim: 0x1b1c22, accent: 0x4fe3e0, helmet: 0xf2f2f4, num: '4' },
  { name: 'ARGENT', body: 0xb9bec7, trim: 0x22242c, accent: 0x39d17a, helmet: 0x2c2f3a, num: '17' },
  { name: 'ROSSO', body: 0xd2352f, trim: 0x1c1417, accent: 0xf2d16b, helmet: 0xf2d16b, num: '9' },
  { name: 'AZUL', body: 0x2b56c4, trim: 0x141a2c, accent: 0x4fe3e0, helmet: 0xe8e8ea, num: '22' },
  { name: 'VERDE', body: 0x1f7a54, trim: 0x11251d, accent: 0xd8e84a, helmet: 0xd8e84a, num: '55' },
  { name: 'VIOLA', body: 0x6b3fb0, trim: 0x1a1426, accent: 0xff8ad1, helmet: 0xffffff, num: '31' },
  { name: 'NERO', body: 0x2b2f36, trim: 0x121417, accent: 0x4fe3e0, helmet: 0xe8e8ea, num: '3' },
  { name: 'GIALLO', body: 0xeddb3a, trim: 0x1e1c12, accent: 0x2b2f36, helmet: 0x2b2f36, num: '12' },
  { name: 'CIELO', body: 0x5bc8f5, trim: 0x14232c, accent: 0xffffff, helmet: 0x14232c, num: '27' },
  { name: 'ROSA', body: 0xe0559a, trim: 0x2a1420, accent: 0xf2f2f4, helmet: 0xf2f2f4, num: '7' },
  { name: 'TEAL', body: 0x128f8b, trim: 0x0c2422, accent: 0xd8e84a, helmet: 0xe8e8ea, num: '44' },
  { name: 'SABBIA', body: 0xcdb894, trim: 0x241f16, accent: 0x7a1f2b, helmet: 0x241f16, num: '18' },
  { name: 'GRANATO', body: 0x7a1f2b, trim: 0x1a0d10, accent: 0xcdb894, helmet: 0xcdb894, num: '5' },
  { name: 'INDACO', body: 0x35358f, trim: 0x121230, accent: 0x9bd642, helmet: 0xe8e8ea, num: '63' },
  { name: 'LIME', body: 0x9bd642, trim: 0x18220c, accent: 0x2b2f36, helmet: 0x2b2f36, num: '81' },
  { name: 'ARDESIA', body: 0x5b6572, trim: 0x191d22, accent: 0xff8ad1, helmet: 0xe8e8ea, num: '10' }
];

var _shadowTex = null;
function shadowTexture() {
  if (_shadowTex) return _shadowTex;
  var s = 32, cv = makeCanvas(s, s), ctx = cv.getContext('2d');
  var g = ctx.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.30)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  _shadowTex = new THREE.CanvasTexture(cv);
  return _shadowTex;
}

/* A modern-generation car: long, low and rounded rather than boxy. The
   volumes are tapered cylinders with smooth normals, so Lambert's per-vertex
   lighting rolls across them the way it does on a real bodywork surface —
   the shapes read as curved even at this triangle count. HALF is the length
   of the car forward of centre; +Z is the nose. */
function buildCarMesh(livery) {
  var body = livery.body, trim = livery.trim, accent = livery.accent;
  /* Secondary body colour for the sidepods and engine cover. Modern cars are
     two-tone — the MCL38 runs papaya over the nose, monocoque and rear wing
     with the flanks and deck in anthracite — and a car painted one flat colour
     end to end reads as a toy next to it. Optional, and defaults to `body`, so
     a livery that does not want the split is unchanged. */
  var body2 = (livery.body2 == null) ? body : livery.body2;
  var parts = [];
  var RX = Math.PI / 2;          /* stand a cylinder up along Z */

  /* Floor and plank — a single flat blade, dark, running the whole length */
  parts.push(part(new THREE.BoxGeometry(1.62, 0.07, 5.05), trim, [0, 0.11, -0.10]));
  parts.push(part(new THREE.CylinderGeometry(0.40, 0.52, 2.30, 8), trim,
    [0, 0.15, -1.25], [RX, 0, 0], [1.55, 1, 0.16]));

  /* Monocoque: a wide, shallow tub — the car is far flatter than it is tall */
  parts.push(part(new THREE.CylinderGeometry(0.30, 0.40, 2.55, 8), body2,
    [0, 0.34, 0.62], [RX, 0, 0], [1.08, 1, 0.58]));
  /* shoulder line in anthracite, as on the real livery */
  parts.push(part(new THREE.CylinderGeometry(0.31, 0.38, 1.15, 8), trim,
    [0, 0.42, 0.30], [RX, 0, 0], [1.10, 1, 0.44]));

  /* NOSE. A long low blade that DROPS toward the wing, not a fat tube carried
     out at chassis height. This is the single biggest thing dating the
     silhouette: on a modern car the nose tip sits barely above the front wing,
     and the whole assembly is far longer and thinner than it looks in photos.
     The slight -X rotation is the droop. */
  parts.push(part(new THREE.CylinderGeometry(0.15, 0.27, 1.60, 8), body,
    [0, 0.305, 1.98], [RX - 0.05, 0, 0], [0.90, 1, 0.52]));
  parts.push(part(new THREE.CylinderGeometry(0.075, 0.15, 1.15, 8), body,
    [0, 0.205, 3.02], [RX - 0.06, 0, 0], [0.82, 1, 0.48]));

  /* Sidepods: wide and low at the inlet, undercut into the coke-bottle */
  for (var s = -1; s <= 1; s += 2) {
    parts.push(part(new THREE.CylinderGeometry(0.13, 0.36, 2.55, 8), body2,
      [s * 0.60, 0.295, -0.55], [RX, 0, 0], [1.32, 1, 0.50]));
    /* dark inlet mouth */
    parts.push(part(new THREE.CylinderGeometry(0.30, 0.30, 0.22, 8), trim,
      [s * 0.60, 0.34, 0.58], [RX, 0, 0], [1.30, 1, 0.60]));
    /* accent flash along the pod */
    parts.push(part(new THREE.CylinderGeometry(0.12, 0.30, 1.55, 8), accent,
      [s * 0.775, 0.30, -0.30], [RX, 0, 0], [0.26, 1, 0.34]));
    /* floor edge winglet */
    parts.push(part(new THREE.BoxGeometry(0.06, 0.14, 1.30), body, [s * 0.82, 0.19, 0.30]));
  }

  /* Airbox and engine cover, tapering into the gearbox */
  parts.push(part(new THREE.CylinderGeometry(0.21, 0.27, 0.54, 8), trim,
    [0, 0.78, -0.34], [RX, 0, 0], [1, 1, 0.86]));
  parts.push(part(new THREE.CylinderGeometry(0.09, 0.30, 2.45, 8), body2,
    [0, 0.50, -1.55], [RX, 0, 0], [0.94, 1, 0.66]));
  /* shark-fin spine */
  /* teal down the spine: the reference carries it as a line, and painting
     the whole airbox with it turned the car's shoulder into a slab. */
  parts.push(part(new THREE.BoxGeometry(0.045, 0.26, 1.40), accent, [0, 0.74, -1.70]));

  /* Halo — a real hoop, not three sticks */
  /* A halo is a ring lying nearly FLAT around the cockpit, wider than it is
     tall, with a single strut dropping from its front point to the chassis.
     Built as a half-torus in the XY plane it came out a vertical semicircle —
     a rainbow archway standing over the car, which is not the shape at all
     and reads as badly wrong from inside. Full ring, laid into the XZ plane
     by RX and stretched fore-and-aft, tilted a little nose-down so the front
     sits where the strut can meet it. */
  /* TEARDROP, not an oval. The real halo is a rear arc around the driver's
     shoulders with two blades sweeping FORWARD and inward to a single point
     ahead of the cockpit, where the strut drops to the chassis. An even ring
     reads as a hoop dropped over the car; the pinch at the front is the whole
     silhouette. Raised to clear the helmet crown at 0.96.

     [RX, 0, PI] lays the half-torus flat AND spins it 180 in its own plane, so
     the arc is the REAR half — without the PI it wraps the front, where the
     blades need to be. */
  parts.push(part(new THREE.TorusGeometry(0.40, 0.042, 4, 12, Math.PI), trim,
    [0, 0.985, 0.44], [RX, 0, Math.PI]));
  for (var hb = -1; hb <= 1; hb += 2) {
    parts.push(part(new THREE.BoxGeometry(0.055, 0.048, 0.72), trim,
      [hb * 0.20, 0.992, 0.735], [0, -hb * 0.604, 0]));
  }
  /* The strut is a blade, not a rod — from the driver's seat it is the single
     heaviest thing in frame, splitting the road ahead in two. */
  parts.push(part(new THREE.BoxGeometry(0.075, 0.58, 0.05), trim, [0, 0.71, 1.07], [-0.13, 0, 0]));

  /* COCKPIT COAMING — the raised rim around the opening, in body colour.
     From outside it is a detail; from the driver's eye it is the frame the
     entire view sits in, the bright band running across the lower third and
     up both sides. Without it the helmet camera looks like sitting on a plank
     rather than down inside a tub. Oval: 0.40 across, 0.60 fore-and-aft. */
  parts.push(part(new THREE.TorusGeometry(0.40, 0.040, 4, 14), body,
    [0, 0.565, 0.46], [RX, 0, 0], [1.0, 1.45, 1.0]));

  /* Driver's head is built SEPARATELY, below — the helmet camera sits inside
     it, and a head merged into the chassis could not be hidden for that one
     car without hiding the whole bodywork with it. */

  /* FRONT WING. Wider than the car, sitting almost ON the ground, with tall
     endplates that turn the air around the tyre. The old one was a stack of
     narrow slats floating at axle height, which is what a 1990s wing looked
     like and reads as a toy under a modern nose. */
  parts.push(part(new THREE.BoxGeometry(2.06, 0.032, 0.66), body2, [0, 0.072, 3.42]));
  parts.push(part(new THREE.BoxGeometry(1.96, 0.032, 0.44), body,  [0, 0.132, 3.26]));
  parts.push(part(new THREE.BoxGeometry(1.82, 0.032, 0.30), body2, [0, 0.192, 3.14]));
  for (var e = -1; e <= 1; e += 2) {
    parts.push(part(new THREE.BoxGeometry(0.045, 0.44, 0.86), body, [e * 1.02, 0.235, 3.34]));
    parts.push(part(new THREE.BoxGeometry(0.05, 0.16, 0.30), accent, [e * 1.03, 0.50, 3.46]));
  }

  /* Rear wing on swan-neck supports */
  /* REAR WING. Tall, well above the tyre, on deep endplates. The old one sat
     barely proud of the engine cover and vanished behind the rear wheels. */
  parts.push(part(new THREE.BoxGeometry(1.08, 0.045, 0.50), body, [0, 1.12, -2.60]));
  parts.push(part(new THREE.BoxGeometry(1.08, 0.035, 0.28), body2, [0, 0.96, -2.46]));
  for (var q = -1; q <= 1; q += 2) {
    parts.push(part(new THREE.BoxGeometry(0.05, 0.70, 0.88), body, [q * 0.54, 0.80, -2.54]));
    parts.push(part(new THREE.BoxGeometry(0.05, 0.34, 0.06), trim, [q * 0.24, 0.96, -2.42], [0.35, 0, 0]));
  }
  /* beam wing + diffuser */
  parts.push(part(new THREE.BoxGeometry(0.94, 0.035, 0.22), trim, [0, 0.48, -2.50]));
  parts.push(part(new THREE.CylinderGeometry(0.26, 0.34, 0.62, 8), trim,
    [0, 0.26, -2.34], [RX, 0, 0], [1.75, 1, 0.42]));

  /* Mirrors */
  for (var m = -1; m <= 1; m += 2) {
    parts.push(part(new THREE.BoxGeometry(0.30, 0.03, 0.04), trim, [m * 0.38, 0.66, 0.74]));
    parts.push(part(new THREE.BoxGeometry(0.10, 0.07, 0.05), accent, [m * 0.52, 0.66, 0.74]));
  }

  var bodyGeo = mergeParts(parts);
  /* Car paint: glossy and slightly metallic, so the environment map reads
     across the bodywork the way clearcoat does. This is the material that
     carries the whole "modern" look — flat shading on a car reads as plastic. */
  var bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.30, metalness: 0.45, envMapIntensity: 1.15 });

  var group = new THREE.Group();
  var chassis = new THREE.Mesh(bodyGeo, bodyMat);
  chassis.castShadow = true;
  group.add(chassis);

  /* Wheels: 14-sided so they read as round, with a covered rim face */
  var wheelGeo = mergeParts([
    part(new THREE.CylinderGeometry(0.36, 0.36, 0.40, 14), 0x14151a, [0, 0, 0], [0, 0, Math.PI / 2]),
    part(new THREE.CylinderGeometry(0.235, 0.235, 0.42, 12), trim, [0, 0, 0], [0, 0, Math.PI / 2]),
    part(new THREE.CylinderGeometry(0.20, 0.20, 0.44, 12), livery.body, [0, 0, 0], [0, 0, Math.PI / 2])
  ]);
  var wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.0 });
  var wheels = [];
  var spots = [[0.86, 0.36, 1.78], [-0.86, 0.36, 1.78], [0.90, 0.36, -1.72], [-0.90, 0.36, -1.72]];
  for (var i = 0; i < 4; i++) {
    var w = new THREE.Mesh(wheelGeo, wheelMat);
    w.castShadow = true;
    w.position.set(spots[i][0], spots[i][1], spots[i][2]);
    group.add(w);
    wheels.push(w);
  }

  /* Driver's head — its own mesh so the helmet camera can switch it off for
     the car you are sitting in, and only that car. */
  var head = new THREE.Mesh(mergeParts([
    part(new THREE.SphereGeometry(0.185, 8, 6), livery.helmet, [0, 0.775, 0.28]),
    part(new THREE.BoxGeometry(0.27, 0.085, 0.05), trim, [0, 0.79, 0.45])
  ]), bodyMat);
  group.add(head);

  /* Steering wheel — the thing that sells a driver's-eye view, and the only
     part of the car that answers your hands. Separate because it turns.
     Sits below and forward of the eye line, as the real one does. */
  var steerWheel = new THREE.Mesh(mergeParts([
    /* squared-off rim, flattened top and bottom like a modern F1 wheel */
    part(new THREE.TorusGeometry(0.175, 0.026, 4, 12), 0x14151a, [0, 0, 0], [0, 0, 0], [1, 0.82, 1]),
    /* face, with a lit strip standing in for the display */
    part(new THREE.BoxGeometry(0.24, 0.135, 0.022), trim, [0, 0, -0.012]),
    part(new THREE.BoxGeometry(0.165, 0.038, 0.008), accent, [0, 0.036, -0.028]),
    /* grips */
    part(new THREE.BoxGeometry(0.05, 0.12, 0.055), 0x14151a, [-0.185, -0.015, -0.018]),
    part(new THREE.BoxGeometry(0.05, 0.12, 0.055), 0x14151a, [0.185, -0.015, -0.018])
  ]), bodyMat);
  /* High and close, as a real F1 wheel sits — chest height, not lap height.
     Any lower and the monocoque swallows it from the driver's eye. */
  steerWheel.position.set(0, 0.620, 0.66);
  /* POSITIVE. The face the driver sees is the mesh's -Z side, and a negative
     rake swings that face down and away — measured 44.2 degrees off the eye
     line, so you looked at the rim edge-on from above. At +0.42 it is 3.9
     degrees off, i.e. aimed at the driver, which is what the comment always
     claimed and what a real raked wheel does.

     The spin axis stays mostly +Z through this, so the rim still reads
     clockwise-for-right from behind and the steering direction is unaffected. */
  steerWheel.rotation.x = 0.42;
  group.add(steerWheel);

  /* fake contact shadow */
  var shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.1, 6.1),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, fog: false })
  );
  shadow.rotation.x = -Math.PI / 2;

  return { group: group, wheels: wheels, shadow: shadow, chassis: chassis, head: head, steerWheel: steerWheel };
}

/* --- physics ------------------------------------------------------------ */

var V_MAX = 92;          /* m/s on the limiter, ~331 km/h */
var A_MAX = 15.5;
var A_BRAKE = 32;
var DRAG = 0.0019;
var ROLL = 0.42;
var WHEELBASE = 4.55;
var GEARS = 8;

function Vehicle(track, livery, isPlayer) {
  this.track = track;
  this.livery = livery;
  this.isPlayer = !!isPlayer;

  var built = buildCarMesh(livery);
  this.group = built.group;
  this.wheels = built.wheels;
  this.head = built.head;
  this.steerWheel = built.steerWheel;
  this.shadow = built.shadow;

  this.pos = new THREE.Vector3();
  this.yaw = 0;
  this.vFwd = 0;
  this.vLat = 0;
  this.yawRate = 0;
  this.steerVis = 0;
  this.wheelSpin = 0;
  this.roll = 0;
  this.pitch = 0;

  this.frameIdx = 0;
  this.f = { i: 0, lateral: 0, s: 0, y: 0, fwd: null, lat: null };

  this.lapsDone = 0;
  this.lapStart = 0;
  this.lastLap = 0;
  this.bestLap = 0;
  this.progress = 0;
  this.prevS = 0;
  this.finished = false;
  this.finishTime = 0;
  this.position = 1;

  this.offTrack = false;
  this.onKerb = false;
  this.drift = 0;
  this.hitImpulse = 0;
  this.drsActive = false;
  this.boost = 0;
}

Vehicle.prototype.placeAt = function (index, lateral) {
  var t = this.track;
  var p = t.p[index], l = t.lat[index], f = t.fwd[index];
  this.pos.set(p.x + l.x * lateral, p.y, p.z + l.z * lateral);
  this.yaw = datan2(f.x, f.z);
  this.vFwd = 0; this.vLat = 0; this.yawRate = 0;
  this.frameIdx = index;
  t.frame(this.pos.x, this.pos.z, index, this.f);
  this.prevS = this.f.s;
  this.progress = this.f.s;
  this.sync(0);
};

/* Visual basis: same as forward/right but built from the interpolated yaw, so
   anything that follows the car (the camera) tracks what is drawn rather than
   the 60Hz physics state it was drawn from. */
Vehicle.prototype.visForward = function (out) {
  var y = (this.vyaw === undefined) ? this.yaw : this.vyaw;
  return out.set(dsin(y), 0, dcos(y));
};
Vehicle.prototype.visRight = function (out) {
  var y = (this.vyaw === undefined) ? this.yaw : this.vyaw;
  return out.set(dcos(y), 0, -dsin(y));
};
Vehicle.prototype.visX = function () { return this.vx === undefined ? this.pos.x : this.vx; };
Vehicle.prototype.visY = function () { return this.vy === undefined ? this.pos.y : this.vy; };
Vehicle.prototype.visZ = function () { return this.vz === undefined ? this.pos.z : this.vz; };

Vehicle.prototype.forward = function (out) { return out.set(dsin(this.yaw), 0, dcos(this.yaw)); };
Vehicle.prototype.right = function (out) { return out.set(dcos(this.yaw), 0, -dsin(this.yaw)); };

var _f3 = new THREE.Vector3(), _r3 = new THREE.Vector3(), _tv = new THREE.Vector3();

Vehicle.prototype.step = function (dt, input, raceLive) {
  var t = this.track;

  /* Snapshot for render interpolation. Physics advances in fixed 60Hz steps
     but frames are drawn whenever the display asks, so without a previous
     state to blend from the car only moves on the frames a step happened to
     land on — while the camera, damped on real frame time, keeps gliding.
     Against the world that reads as mild stutter; on the chase car, which sits
     still in frame, it reads as the car twitching. */
  this.prevX = this.pos.x;
  this.prevZ = this.pos.z;
  this.prevYaw = this.yaw;

  var f = t.frame(this.pos.x, this.pos.z, this.frameIdx, this.f);
  this.frameIdx = f.i;

  var absLat = Math.abs(f.lateral);
  this.onKerb = absLat > HALF_W - 0.25 && absLat < HALF_W + 1.7;
  this.offTrack = absLat > HALF_W + 1.2;

  var surfaceGrip = this.offTrack ? 0.60 : (this.onKerb ? 0.88 : 1.0);
  var surfaceDrag = this.offTrack ? 3.4 : 0;

  var steer = raceLive ? input.steer : 0;
  var thr = raceLive ? input.throttle : 0;
  var brk = raceLive ? input.brake : 0;
  var hand = raceLive ? input.handbrake : 0;

  /* DRS / overtake boost tops out the limiter and adds punch */
  var vmax = V_MAX * (this.offTrack ? 0.60 : 1) + this.boost * 11;
  var accel = A_MAX * (1 + this.boost * 0.30) * thr * clamp(1 - this.vFwd / Math.max(vmax, 1), 0, 1);
  if (this.offTrack) accel *= 0.55;

  var drag = DRAG * this.vFwd * Math.abs(this.vFwd) + ROLL * this.vFwd * 0.06 + surfaceDrag * sign(this.vFwd) * 0.4;
  var aFwd = accel - drag - Math.abs(this.vLat) * 0.55;

  if (brk > 0.02) {
    if (this.vFwd > 0.6) aFwd -= A_BRAKE * brk * (this.offTrack ? 0.6 : 1);
    else aFwd -= 7.5 * brk;             /* reverse */
  }

  /* Steering authority falls away with speed so the car stays drivable flat out.
     steer = +1 always means "turn right on screen". A positive yaw rate swings
     the nose toward +lat, which the chase camera sees as LEFT, so the input is
     negated exactly here — the single place the two conventions meet. */
  var steerMax = 0.60 / (1 + Math.abs(this.vFwd) * 0.052);
  var steerAngle = -steer * steerMax;
  var targetYawRate = (this.vFwd / WHEELBASE) * dtan(steerAngle);
  targetYawRate = clamp(targetYawRate, -2.6, 2.6);
  this.yawRate = damp(this.yawRate, targetYawRate * (hand > 0.5 ? 1.28 : 1), 12, dt);

  /* body-frame velocity: tyres supply centripetal force up to a downforce-
     scaled cap; past that the rear steps out and we're drifting */
  var latCap = latCapacity(this.vFwd) * surfaceGrip * (hand > 0.5 ? 0.32 : 1);
  var required = this.yawRate * this.vFwd;
  var aLat = clamp(required - this.vLat * 6.5, -latCap, latCap);

  this.vFwd += (aFwd + this.yawRate * this.vLat) * dt;
  this.vLat += (aLat - this.yawRate * this.vFwd) * dt;

  this.vFwd = clamp(this.vFwd, -11, vmax + 4);
  this.vLat = clamp(this.vLat, -34, 34);
  this.yaw += this.yawRate * dt;

  this.drift = damp(this.drift, clamp(Math.abs(this.vLat) / 9, 0, 1) * (this.vFwd > 6 ? 1 : 0), 9, dt);

  var fx = dsin(this.yaw), fz = dcos(this.yaw);
  var rx = dcos(this.yaw), rz = -dsin(this.yaw);
  this.pos.x += (fx * this.vFwd + rx * this.vLat) * dt;
  this.pos.z += (fz * this.vFwd + rz * this.vLat) * dt;

  /* barriers */
  t.frame(this.pos.x, this.pos.z, this.frameIdx, f);
  this.frameIdx = f.i;
  var limit = WALL_HALF - 1.1;
  if (Math.abs(f.lateral) > limit) {
    var s = sign(f.lateral);
    var over = Math.abs(f.lateral) - limit;
    var lat = t.lat[f.i];
    this.pos.x -= lat.x * s * over;
    this.pos.z -= lat.z * s * over;

    var vx = fx * this.vFwd + rx * this.vLat;
    var vz = fz * this.vFwd + rz * this.vLat;
    var nx = -lat.x * s, nz = -lat.z * s;
    var vn = vx * nx + vz * nz;
    if (vn < 0) {
      var impact = -vn;
      vx -= vn * 1.35 * nx; vz -= vn * 1.35 * nz;
      vx *= 0.86; vz *= 0.86;
      this.hitImpulse = Math.max(this.hitImpulse, clamp(impact / 22, 0, 1));
      this.yawRate *= 0.35;
    }
    this.vFwd = vx * fx + vz * fz;
    this.vLat = vx * rx + vz * rz;
    this.vFwd = Math.max(this.vFwd, -8);
  }

  /* lap bookkeeping */
  t.frame(this.pos.x, this.pos.z, this.frameIdx, f);
  this.frameIdx = f.i;
  this.updateProgress(f.s);

  this.wheelSpin += this.vFwd * dt / 0.37;
  this.steerVis = damp(this.steerVis, steer, 14, dt);
  this.hitImpulse = damp(this.hitImpulse, 0, 5, dt);
};

Vehicle.prototype.updateProgress = function (s) {
  var len = this.track.length;
  var half = len * 0.5;
  var d = s - this.prevS;
  if (d < -half) this.lapCross = true;        /* wrapped forward past the line */
  else if (d > half) this.lapCross = false;   /* wrapped backwards */
  this.prevS = s;
  this.progress = this.lapsDone * len + s;
};

/* alpha is how far the current frame sits between the last physics step and
   the next, so the visible car moves smoothly at whatever rate the display
   runs. The PHYSICS position is never touched — only what is drawn. */
Vehicle.prototype.sync = function (dt, alpha) {
  var t = this.track;
  var g = this.group;

  var a = (alpha === undefined) ? 1 : clamp(alpha, 0, 1);
  if (this.prevX === undefined) { this.prevX = this.pos.x; this.prevZ = this.pos.z; this.prevYaw = this.yaw; }

  var vx = lerp(this.prevX, this.pos.x, a);
  var vz = lerp(this.prevZ, this.pos.z, a);
  /* through the shortest arc, or the car spins the wrong way past +/-PI */
  var vyaw = this.prevYaw + angleDelta(this.prevYaw, this.yaw) * a;

  this.vx = vx; this.vz = vz; this.vyaw = vyaw;

  var fx = dsin(vyaw), fz = dcos(vyaw);
  var rx = dcos(vyaw), rz = -dsin(vyaw);

  var hC = t.heightAt(vx, vz, this.frameIdx);
  var hF = t.heightAt(vx + fx * 2.2, vz + fz * 2.2, this.frameIdx);
  var hB = t.heightAt(vx - fx * 2.2, vz - fz * 2.2, this.frameIdx);
  /* (rx, rz) is (cos yaw, -sin yaw), which is up X fwd — the car's LEFT, not
     its right (see the sign derivation in 20-track.js). These two were named
     the wrong way round, which silently negated the whole terrain-roll term. */
  var hL = t.heightAt(vx + rx * 1.5, vz + rz * 1.5, this.frameIdx);
  var hR = t.heightAt(vx - rx * 1.5, vz - rz * 1.5, this.frameIdx);

  this.vy = hC;
  this.pos.y = hC;
  var pitch = datan2(hF - hB, 4.4);
  var roll = datan2(hL - hR, 3.0);

  /* SIGNS. Both roll terms hinge on one fact that is easy to get backwards:
     rotation.z lifts the car's local +X, and with rotation.y = yaw that axis
     maps to (cos yaw, 0, -sin yaw) — which is `lat`, the car's LEFT. So

         POSITIVE rotation.z LIFTS THE CAR'S LEFT SIDE.

     Terrain: the road's left edge sits at hL, so matching the camber means
     rolling by exactly atan2(hL - hR, track). Get this backwards and the car
     rolls the wrong way by twice the bank angle, which on Indy's 9.2 degrees
     buries one whole side of the chassis under the road surface.

     Body lean is separate, and opposes nothing here: weight goes to the
     OUTSIDE of a corner, so a left turn (positive yaw rate, since increasing
     yaw swings forward from +Z toward +X) presses the RIGHT side down and
     therefore lifts the left. Same sign as yawRate.

     Pitch is the odd one out: rotation.x positive drops the NOSE, so climbing
     needs -pitch. */
  var lean = clamp(this.yawRate * 0.062, -0.11, 0.11);
  var k = dt > 0 ? 1 - Math.exp(-10 * dt) : 1;
  this.pitch = lerp(this.pitch, -pitch, k);
  this.roll = lerp(this.roll, roll + lean, k);

  g.position.set(vx, this.vy + 0.02, vz);
  g.rotation.set(0, 0, 0);
  g.rotation.order = 'YXZ';
  g.rotation.y = vyaw;
  g.rotation.x = this.pitch;
  g.rotation.z = this.roll;

  /* About 1.5 turns lock to lock, against the front wheels' 0.42 rad — the
     rim moves far more than the tyres, which is what makes it readable. */
  /* NOT negated, unlike the road wheels below — the two axes are handed
     differently and it is only a coincidence that they look alike.

     The road wheels steer about Y, where a positive angle points them at the
     car's LEFT (local +X is the left), so turning right needs -steerVis.

     The rim spins about Z, whose axis points FORWARD, away from the driver.
     Seen from behind it — which is the only place anyone ever sees it from —
     a positive rotation reads CLOCKWISE, which is a right turn. Negating it
     turned the wheel the opposite way to the car. */
  if (this.steerWheel) this.steerWheel.rotation.z = this.steerVis * 2.4;
  this.wheels[0].rotation.set(0, -this.steerVis * 0.42, 0);
  this.wheels[1].rotation.set(0, -this.steerVis * 0.42, 0);
  for (var i = 0; i < 4; i++) {
    var w = this.wheels[i];
    if (i < 2) { w.rotation.order = 'YXZ'; w.rotation.x = this.wheelSpin; }
    else w.rotation.x = this.wheelSpin;
  }

  this.shadow.position.set(vx, this.vy + 0.05, vz);
  /* +vyaw. Same reflection trap as the start line: with rotation.x = -PI/2
     and the default XYZ order, negating z mirrors rather than rotates, and
     the 6.1 m long axis swings up to 90 degrees out — measured 80.2 degrees
     off at a 0.7 rad heading, laying the shadow across the car. */
  this.shadow.rotation.set(-Math.PI / 2, 0, vyaw);
};

Vehicle.prototype.speedKph = function () { return Math.max(0, this.vFwd) * 3.6; };

Vehicle.prototype.gear = function () {
  var v = Math.max(0, this.vFwd);
  var g = Math.floor(v / (V_MAX / GEARS)) + 1;
  return clamp(g, 1, GEARS);
};

Vehicle.prototype.rpm01 = function () {
  var v = Math.max(0, this.vFwd);
  var span = V_MAX / GEARS;
  var within = (v % span) / span;
  return clamp(0.18 + within * 0.82, 0, 1);
};

/* --- AI ------------------------------------------------------------------ */

function AIDriver(vehicle, track, skill, seed) {
  this.v = vehicle;
  this.track = track;
  this.skill = skill;
  this.rnd = mulberry32(seed);
  this.wobblePhase = this.rnd() * TAU;
  this.avoid = 0;
  this.input = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };
}

var _aiTarget = new THREE.Vector3();

AIDriver.prototype.update = function (dt, cars, time) {
  var v = this.v, t = this.track, n = t.n;
  var i = v.frameIdx;

  /* Pure-pursuit lookahead. Too short and it saws at the wheel; too long and
     it aims across the apex and drives straight off the outside of the bend.
     Tuned by measuring off-track time over a full race. */
  var lookM = clamp(11 + v.vFwd * 0.82, 13, 58);
  var ahead = Math.max(2, Math.round(lookM / t.ds));
  var ti = (i + ahead) % n;

  /* lateral avoidance: ease off the line when someone is right there */
  var desiredAvoid = 0;
  for (var c = 0; c < cars.length; c++) {
    var o = cars[c];
    if (o === v) continue;
    var dx = o.pos.x - v.pos.x, dz = o.pos.z - v.pos.z;
    var dist2 = dx * dx + dz * dz;
    if (dist2 > 900) continue;
    var fwdDot = dx * dsin(v.yaw) + dz * dcos(v.yaw);
    if (fwdDot < 0 || fwdDot > 26) continue;
    var side = sign((o.f.lateral - v.f.lateral) || 1);
    desiredAvoid -= side * 4.2 * (1 - clamp(Math.sqrt(dist2) / 30, 0, 1));
  }
  this.avoid = damp(this.avoid, clamp(desiredAvoid, -5.5, 5.5), 3.5, dt);

  var wobble = dsin(time * 0.7 + this.wobblePhase) * 0.35;
  var targetOff = clamp(t.lineOff[ti] + this.avoid + wobble, -(HALF_W - 1.2), HALF_W - 1.2);
  t.pointAt(ti, targetOff, _aiTarget);

  var desiredYaw = datan2(_aiTarget.x - v.pos.x, _aiTarget.z - v.pos.z);
  var err = angleDelta(v.yaw, desiredYaw);
  this.input.steer = clamp(-err * 2.6, -1, 1);   /* steer is screen-relative; yaw is not */

  /* speed target from the precomputed racing-line profile */
  var si = (i + Math.max(2, Math.round(18 / t.ds))) % n;
  var vt = t.vTarget[si] * this.skill;
  if (v.offTrack) vt *= 0.62;

  var err2 = vt - v.vFwd;
  if (err2 > 1.2) { this.input.throttle = 1; this.input.brake = 0; }
  else if (err2 < -2.5) { this.input.throttle = 0; this.input.brake = clamp(-err2 / 9, 0.2, 1); }
  else { this.input.throttle = clamp(0.45 + err2 * 0.4, 0, 1); this.input.brake = 0; }

  /* recovery: if it's spun or beached, straighten up toward the road */
  if (v.vFwd < 4 && v.offTrack) {
    var backIdx = (i + 3) % n;
    t.pointAt(backIdx, t.lineOff[backIdx], _aiTarget);
    var recYaw = datan2(_aiTarget.x - v.pos.x, _aiTarget.z - v.pos.z);
    this.input.steer = clamp(-angleDelta(v.yaw, recYaw) * 3, -1, 1);
    this.input.throttle = 1;
    this.input.brake = 0;
  }

  this.input.handbrake = 0;
  return this.input;
};

/* Soft body-to-body separation. Arcade contact: cars nudge, never wedge. */
function resolveCarContacts(cars, audio) {
  var R = 2.5;
  for (var a = 0; a < cars.length; a++) {
    for (var b = a + 1; b < cars.length; b++) {
      var A = cars[a], B = cars[b];
      var dx = B.pos.x - A.pos.x, dz = B.pos.z - A.pos.z;
      var d2 = dx * dx + dz * dz;
      if (d2 > (R * 2) * (R * 2) || d2 < 1e-6) continue;
      var d = Math.sqrt(d2);
      var overlap = (R * 2) - d;
      var nx = dx / d, nz = dz / d;
      var push = overlap * 0.5;
      A.pos.x -= nx * push; A.pos.z -= nz * push;
      B.pos.x += nx * push; B.pos.z += nz * push;

      var avx = dsin(A.yaw) * A.vFwd + dcos(A.yaw) * A.vLat;
      var avz = dcos(A.yaw) * A.vFwd - dsin(A.yaw) * A.vLat;
      var bvx = dsin(B.yaw) * B.vFwd + dcos(B.yaw) * B.vLat;
      var bvz = dcos(B.yaw) * B.vFwd - dsin(B.yaw) * B.vLat;
      var rel = (bvx - avx) * nx + (bvz - avz) * nz;
      if (rel < 0) {
        var j = rel * 0.5;
        avx += j * nx; avz += j * nz;
        bvx -= j * nx; bvz -= j * nz;
        A.vFwd = avx * dsin(A.yaw) + avz * dcos(A.yaw);
        A.vLat = avx * dcos(A.yaw) - avz * dsin(A.yaw);
        B.vFwd = bvx * dsin(B.yaw) + bvz * dcos(B.yaw);
        B.vLat = bvx * dcos(B.yaw) - bvz * dsin(B.yaw);
        var mag = clamp(-rel / 18, 0, 1);
        if (mag > 0.15 && (A.isPlayer || B.isPlayer)) {
          A.hitImpulse = Math.max(A.hitImpulse, mag * 0.7);
          B.hitImpulse = Math.max(B.hitImpulse, mag * 0.7);
          if (audio) audio.thud(mag * 0.6);
        }
      }
    }
  }
}
