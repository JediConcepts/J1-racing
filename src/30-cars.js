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
  var c = new THREE.Color(color);
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

var LIVERIES = [
  { name: 'MCL 64', body: 0xff8000, trim: 0x1b1c22, accent: 0x4fe3e0, helmet: 0xf2f2f4, num: '4' },
  { name: 'ARGENT', body: 0xb9bec7, trim: 0x22242c, accent: 0x39d17a, helmet: 0x2c2f3a, num: '17' },
  { name: 'ROSSO', body: 0xd2352f, trim: 0x1c1417, accent: 0xf2d16b, helmet: 0xf2d16b, num: '9' },
  { name: 'AZUL', body: 0x2b56c4, trim: 0x141a2c, accent: 0xf25c2a, helmet: 0xe8e8ea, num: '22' },
  { name: 'VERDE', body: 0x1f7a54, trim: 0x11251d, accent: 0xd8e84a, helmet: 0xd8e84a, num: '55' },
  { name: 'VIOLA', body: 0x6b3fb0, trim: 0x1a1426, accent: 0xff8ad1, helmet: 0xffffff, num: '31' }
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
  var parts = [];
  var RX = Math.PI / 2;          /* stand a cylinder up along Z */

  /* Floor and plank — a single flat blade, dark, running the whole length */
  parts.push(part(new THREE.BoxGeometry(1.62, 0.07, 5.05), trim, [0, 0.11, -0.10]));
  parts.push(part(new THREE.CylinderGeometry(0.40, 0.52, 2.30, 8), trim,
    [0, 0.15, -1.25], [RX, 0, 0], [1.55, 1, 0.16]));

  /* Monocoque: a wide, shallow tub — the car is far flatter than it is tall */
  parts.push(part(new THREE.CylinderGeometry(0.30, 0.40, 2.55, 8), body,
    [0, 0.34, 0.62], [RX, 0, 0], [1.08, 1, 0.58]));
  /* shoulder line in anthracite, as on the real livery */
  parts.push(part(new THREE.CylinderGeometry(0.31, 0.38, 1.15, 8), trim,
    [0, 0.42, 0.30], [RX, 0, 0], [1.10, 1, 0.44]));

  /* Nose: broad at the bulkhead, tapering to a blunt tip rather than a spike */
  parts.push(part(new THREE.CylinderGeometry(0.17, 0.30, 1.72, 8), body,
    [0, 0.33, 2.12], [RX, 0, 0], [1.0, 1, 0.62]));
  parts.push(part(new THREE.CylinderGeometry(0.145, 0.17, 0.34, 8), body,
    [0, 0.32, 3.13], [RX, 0, 0], [1.0, 1, 0.70]));

  /* Sidepods: wide and low at the inlet, undercut into the coke-bottle */
  for (var s = -1; s <= 1; s += 2) {
    parts.push(part(new THREE.CylinderGeometry(0.16, 0.40, 2.35, 8), body,
      [s * 0.58, 0.33, -0.55], [RX, 0, 0], [1.34, 1, 0.60]));
    /* dark inlet mouth */
    parts.push(part(new THREE.CylinderGeometry(0.30, 0.30, 0.22, 8), trim,
      [s * 0.60, 0.34, 0.58], [RX, 0, 0], [1.30, 1, 0.60]));
    /* accent flash along the pod */
    parts.push(part(new THREE.CylinderGeometry(0.12, 0.30, 1.55, 8), accent,
      [s * 0.775, 0.30, -0.30], [RX, 0, 0], [0.26, 1, 0.34]));
    /* floor edge winglet */
    parts.push(part(new THREE.BoxGeometry(0.06, 0.14, 1.30), trim, [s * 0.82, 0.19, 0.30]));
  }

  /* Airbox and engine cover, tapering into the gearbox */
  parts.push(part(new THREE.CylinderGeometry(0.21, 0.27, 0.54, 8), trim,
    [0, 0.78, -0.34], [RX, 0, 0], [1, 1, 0.86]));
  parts.push(part(new THREE.CylinderGeometry(0.09, 0.30, 2.45, 8), body,
    [0, 0.50, -1.55], [RX, 0, 0], [0.94, 1, 0.66]));
  /* shark-fin spine */
  parts.push(part(new THREE.BoxGeometry(0.04, 0.26, 1.40), trim, [0, 0.74, -1.70]));

  /* Halo — a real hoop, not three sticks */
  parts.push(part(new THREE.TorusGeometry(0.40, 0.035, 4, 14, Math.PI), trim,
    [0, 0.80, 0.72], [0.30, 0, 0]));
  parts.push(part(new THREE.CylinderGeometry(0.035, 0.045, 0.34, 6), trim, [0, 0.86, 1.06], [0.22, 0, 0]));

  /* Driver */
  parts.push(part(new THREE.SphereGeometry(0.185, 8, 6), livery.helmet, [0, 0.775, 0.28]));
  parts.push(part(new THREE.BoxGeometry(0.27, 0.085, 0.05), trim, [0, 0.79, 0.45]));

  /* Front wing: three stacked elements, thin vertical endplates */
  parts.push(part(new THREE.BoxGeometry(1.98, 0.035, 0.50), trim, [0, 0.105, 3.34]));
  parts.push(part(new THREE.BoxGeometry(1.84, 0.035, 0.32), body, [0, 0.165, 3.22]));
  parts.push(part(new THREE.BoxGeometry(1.66, 0.035, 0.24), trim, [0, 0.215, 3.13]));
  for (var e = -1; e <= 1; e += 2) {
    parts.push(part(new THREE.BoxGeometry(0.05, 0.30, 0.62), body, [e * 0.98, 0.21, 3.30]));
    parts.push(part(new THREE.BoxGeometry(0.05, 0.13, 0.26), accent, [e * 0.985, 0.40, 3.38]));
  }

  /* Rear wing on swan-neck supports */
  parts.push(part(new THREE.BoxGeometry(1.02, 0.04, 0.42), trim, [0, 1.02, -2.52]));
  parts.push(part(new THREE.BoxGeometry(1.02, 0.035, 0.24), body, [0, 0.90, -2.40]));
  for (var q = -1; q <= 1; q += 2) {
    parts.push(part(new THREE.BoxGeometry(0.045, 0.44, 0.66), body, [q * 0.51, 0.86, -2.48]));
    parts.push(part(new THREE.BoxGeometry(0.05, 0.30, 0.06), trim, [q * 0.22, 0.88, -2.36], [0.35, 0, 0]));
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
  var bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });

  var group = new THREE.Group();
  var chassis = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(chassis);

  /* Wheels: 14-sided so they read as round, with a covered rim face */
  var wheelGeo = mergeParts([
    part(new THREE.CylinderGeometry(0.36, 0.36, 0.40, 14), 0x14151a, [0, 0, 0], [0, 0, Math.PI / 2]),
    part(new THREE.CylinderGeometry(0.235, 0.235, 0.42, 12), trim, [0, 0, 0], [0, 0, Math.PI / 2]),
    part(new THREE.CylinderGeometry(0.20, 0.20, 0.44, 12), livery.body, [0, 0, 0], [0, 0, Math.PI / 2])
  ]);
  var wheelMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  var wheels = [];
  var spots = [[0.86, 0.36, 1.78], [-0.86, 0.36, 1.78], [0.90, 0.36, -1.72], [-0.90, 0.36, -1.72]];
  for (var i = 0; i < 4; i++) {
    var w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(spots[i][0], spots[i][1], spots[i][2]);
    group.add(w);
    wheels.push(w);
  }

  /* fake contact shadow */
  var shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.1, 6.1),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, fog: false })
  );
  shadow.rotation.x = -Math.PI / 2;

  return { group: group, wheels: wheels, shadow: shadow, chassis: chassis };
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

Vehicle.prototype.forward = function (out) { return out.set(dsin(this.yaw), 0, dcos(this.yaw)); };
Vehicle.prototype.right = function (out) { return out.set(dcos(this.yaw), 0, -dsin(this.yaw)); };

var _f3 = new THREE.Vector3(), _r3 = new THREE.Vector3(), _tv = new THREE.Vector3();

Vehicle.prototype.step = function (dt, input, raceLive) {
  var t = this.track;
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

Vehicle.prototype.sync = function (dt) {
  var t = this.track;
  var g = this.group;

  var fx = dsin(this.yaw), fz = dcos(this.yaw);
  var rx = dcos(this.yaw), rz = -dsin(this.yaw);

  var hC = t.heightAt(this.pos.x, this.pos.z, this.frameIdx);
  var hF = t.heightAt(this.pos.x + fx * 2.2, this.pos.z + fz * 2.2, this.frameIdx);
  var hB = t.heightAt(this.pos.x - fx * 2.2, this.pos.z - fz * 2.2, this.frameIdx);
  var hR = t.heightAt(this.pos.x + rx * 1.5, this.pos.z + rz * 1.5, this.frameIdx);
  var hL = t.heightAt(this.pos.x - rx * 1.5, this.pos.z - rz * 1.5, this.frameIdx);

  this.pos.y = hC;
  var pitch = datan2(hF - hB, 4.4);
  var roll = datan2(hR - hL, 3.0);

  /* Body roll leans away from the turn centre. Local +X is the car's +lat
     side, so a positive yaw rate lifts it. */
  var lean = clamp(this.yawRate * 0.062, -0.11, 0.11);
  var k = dt > 0 ? 1 - Math.exp(-10 * dt) : 1;
  this.pitch = lerp(this.pitch, -pitch, k);
  this.roll = lerp(this.roll, -roll + lean, k);

  g.position.set(this.pos.x, this.pos.y + 0.02, this.pos.z);
  g.rotation.set(0, 0, 0);
  g.rotation.order = 'YXZ';
  g.rotation.y = this.yaw;
  g.rotation.x = this.pitch;
  g.rotation.z = this.roll;

  this.wheels[0].rotation.set(0, -this.steerVis * 0.42, 0);
  this.wheels[1].rotation.set(0, -this.steerVis * 0.42, 0);
  for (var i = 0; i < 4; i++) {
    var w = this.wheels[i];
    if (i < 2) { w.rotation.order = 'YXZ'; w.rotation.x = this.wheelSpin; }
    else w.rotation.x = this.wheelSpin;
  }

  this.shadow.position.set(this.pos.x, this.pos.y + 0.05, this.pos.z);
  this.shadow.rotation.set(-Math.PI / 2, 0, -this.yaw);
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
