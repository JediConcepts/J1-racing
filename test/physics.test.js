/* Sign-convention and geometry tests for the simulation.
 *
 *   node test/physics.test.js
 *
 * WHAT THIS IS FOR. Of the 40 commits after the first playable build, eight fixed
 * an inverted orientation — upside-down trees, inverted banking, inverted camber,
 * body roll leaning out of corners, a steering wheel turning the wrong way, a
 * gyro camera banking away from the corner. The worst was a cancelling pair:
 * b58a5af flipped the sign where roll is APPLIED and asserted it was correct,
 * then 1fac796 had to flip the sign where roll is COMPUTED, because both terms
 * had been backwards and fixing one merely moved the error. On Indianapolis's
 * 9.2 degrees the car rolled the wrong way by twice the bank angle.
 *
 * Two wrong signs can multiply into a right-looking result on flat ground and
 * only separate where the geometry gets interesting, which is why this file
 * asserts against PHYSICAL invariants — the outside of a banked corner is higher
 * than the inside — rather than against whatever the code currently returns.
 * An assertion that just records today's output cannot catch a flip.
 *
 * WHAT IT COVERS, precisely: the geometry, elevation, banking and roll
 * invariants underlying the PHYSICS-RELATED part of that orientation sequence.
 * Three of the eight corrective commits touch src/30-cars.js and src/20-track.js
 * and are in scope — b58a5af, 5c407c2, 1fac796.
 *
 * WHAT IT DOES NOT COVER: the rest of them. 9ba9a65 is 40-game.js only, a gyro
 * camera change that was partly a feel decision rather than objectively wrong
 * physics. 18ad4f5 and a9b737f are steering-wheel mesh. d82b7de is tree
 * orientation. 503462f spans all three files. Nothing here renders — whether the
 * car MESH visibly leans the right way needs the renderer, and 40-game.js has 98
 * references to `document`.
 *
 * An earlier version of this comment claimed this suite was the chain "where
 * every one of those eight bugs actually lived". That was an overstatement, and
 * an external audit caught it. They are eight corrective commits addressing
 * orientation mistakes and design decisions, not eight discrete defects in the
 * physics this file exercises.
 *
 * No DOM and no jsdom: 20-track.js and 30-cars.js reference THREE but never
 * `document` or `window`, so the whole physics chain loads in plain node.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');

/* THREE ships as a UMD bundle that wants a global to attach to. */
global.window = global;
global.self = global;
new Function(read('vendor/three.min.js'))();
const THREE = global.THREE;

/* The src files are written to be concatenated into one IIFE, so evaluate them
   in order and hand back what the tests need. 40-game.js is deliberately absent:
   it is the DOM layer. */
const CHAIN = ['src/05-fpmath.js', 'src/10-core.js', 'src/20-track.js', 'src/30-cars.js'];
const api = (function () {
  let body = '';
  for (const f of CHAIN) body += '\n;/* ' + f + ' */\n' + read(f);
  const names = ['TRACKS', 'Track', 'dsin', 'dcos', 'dtan', 'datan2', 'lerp', 'clamp'];
  return new Function('THREE',
    body + '\nreturn {' + names.map((n) => n + ': typeof ' + n + ' !== "undefined" ? ' + n + ' : undefined').join(',') + '};'
  )(THREE);
})();

const { TRACKS, Track, dtan, datan2 } = api;

let pass = 0, fail = 0;
const ok  = (m) => { console.log('  PASS  ' + m); pass++; };
const bad = (m, d) => { console.log('  FAIL  ' + m + '\n        ' + d); fail++; };
const assert = (cond, m, d) => (cond ? ok(m) : bad(m, d));

/* --------------------------------------------------------------------------- */
console.log('loading circuits');
assert(Array.isArray(TRACKS) && TRACKS.length === 3,
  'three circuits are defined', 'got ' + (TRACKS && TRACKS.length));

const built = TRACKS.map((def) => {
  /* Track() sets module-level HALF_W/RUNOFF/WALL_HALF from the def, so each has
     to be built and measured before the next one overwrites them. */
  const t = new Track(def);
  const halfW = def.halfW || 7.2;
  /* Centroid of the centreline. For a closed circuit the inside of every corner
     faces this, which is how "outside" is decided below without having to
     untangle whether +lat points left or right. */
  let cx = 0, cz = 0;
  for (let i = 0; i < t.n; i++) { cx += t.p[i].x; cz += t.p[i].z; }
  cx /= t.n; cz /= t.n;
  return { def, t, halfW, cx, cz };
});
ok('all three circuits construct without a DOM');

/* --------------------------------------------------------------------------- */
console.log('');
console.log('circuit geometry');
for (const { def, t } of built) {
  const first = t.p[0], last = t.p[t.n - 1];
  const gap = Math.hypot(first.x - last.x, first.z - last.z);
  const ds = t.cum[t.n] / t.n;
  assert(gap < ds * 2.5, def.name + ' centreline closes into a loop',
    'first and last samples are ' + gap.toFixed(2) + ' m apart, mean segment ' + ds.toFixed(2) + ' m');

  let monotonic = true;
  for (let i = 0; i < t.n; i++) if (!(t.cum[i + 1] > t.cum[i])) { monotonic = false; break; }
  assert(monotonic, def.name + ' arc length increases every segment', 'cum[] is not strictly increasing');

  assert(t.cum[t.n] > 1000 && t.cum[t.n] < 20000,
    def.name + ' lap length is plausible', 'lap is ' + t.cum[t.n].toFixed(0) + ' m');
}

/* --------------------------------------------------------------------------- */
console.log('');
console.log('elevation is continuous — the cause of e9bd70b, the shaking car');
for (const { def, t } of built) {
  /* frame() interpolates height per segment. Normalising by the AVERAGE segment
     length rather than the real one made the height flat-line and then snap at
     every boundary — 0.111 m RMS of pure frame-to-frame jitter at Brands.

     MEASURE THE SECOND DIFFERENCE, not the first. A circuit that climbs has a
     large first difference by definition: Brands legitimately gains up to
     0.626 m per segment, and an earlier version of this test flagged exactly
     that as jitter. What a snap produces and a steady gradient does not is
     curvature in the height curve, so d2 is the discriminator. */
  const ys = [];
  const SUB = 12; /* substeps per segment, so boundaries are crossed mid-walk */
  for (let i = 0; i < t.n; i++) {
    const a = t.p[i], b = t.p[(i + 1) % t.n];
    for (let k = 0; k < SUB; k++) {
      const u = k / SUB;
      ys.push(t.heightAt(a.x + (b.x - a.x) * u, a.z + (b.z - a.z) * u, i));
    }
  }
  let worst = 0, sumSq = 0;
  for (let k = 1; k < ys.length - 1; k++) {
    const d2 = Math.abs(ys[k + 1] - 2 * ys[k] + ys[k - 1]);
    if (d2 > worst) worst = d2;
    sumSq += d2 * d2;
  }
  const rms = Math.sqrt(sumSq / (ys.length - 2));
  assert(worst < 0.05,
    def.name + ' height curve has no snap at segment boundaries',
    'worst second difference ' + worst.toFixed(4) + ' m, RMS ' + rms.toFixed(5) +
    ' m over ' + ys.length + ' samples');
}

/* --------------------------------------------------------------------------- */
console.log('');
console.log('banking: the outside of a corner is higher than the inside');
for (const { def, t, halfW, cx, cz } of built) {
  const bankMax = def.bankMax || 0.046;
  /* Only the corners carry meaningful banking; a straight has none to check. */
  const corners = [];
  for (let i = 0; i < t.n; i++) if (Math.abs(t.bank[i]) > bankMax * 0.5) corners.push(i);

  if (!corners.length) {
    console.log('  ....  ' + def.name + ' has no strongly banked samples — skipped');
    continue;
  }

  /* SKIP THE TRANSITIONS, for a reason taken from the source rather than tuned
     until the test went green. bank is smoothLoop(bankRaw, 11, 2) and curv is
     itself smoothLoop(curvRaw, 7, 2) — two stacked kernels, each run twice, so
     the smoothed bank near a change of direction still carries the previous
     corner's sign for roughly 16 samples either side. That is what a real
     circuit does too: camber transitions, it does not switch. Measured on Brands
     Hatch, which has the tightest direction changes of the three: 4 disagreeing
     samples with no exclusion, 2 at ±11, and 0 at ±16.

     The convention is what this test is for. Whether the smoothing overshoots
     slightly through an esses is a different question, and not one worth
     failing a sign-convention test over. */
  const SMOOTH_REACH = 16;
  const nearTransition = (i) => {
    const here = t.curv[i];
    if (here === 0) return true;
    for (let d = 1; d <= SMOOTH_REACH; d++) {
      const before = t.curv[(i - d + t.n) % t.n];
      const after = t.curv[(i + d) % t.n];
      if ((here > 0 && before < 0) || (here < 0 && before > 0)) return true;
      if ((here > 0 && after < 0) || (here < 0 && after > 0)) return true;
    }
    return false;
  };

  const A = new THREE.Vector3(), B = new THREE.Vector3();
  let wrong = 0, checked = 0, maxTilt = 0, skipped = 0;
  for (const i of corners) {
    if (nearTransition(i)) { skipped++; continue; }
    /* WHICH SIDE IS THE OUTSIDE, without assuming a convention. For three
       consecutive centreline points the vector (a-b)+(c-b) points from b toward
       the concave side, which is the centre of the turn and therefore the
       INSIDE. It is zero on a straight and needs no knowledge of whether +lat
       is left or right, or which way the circuit runs.

       An earlier version of this test used distance from the circuit centroid
       instead. That is only correct for an oval: it passed all 444 Indianapolis
       samples and then failed about 10% of Silverstone and Brands Hatch, because
       on a road course an esses turns away from the centroid. The heuristic was
       wrong, not the banking. */
    const a = t.p[(i - 1 + t.n) % t.n], b = t.p[i], c = t.p[(i + 1) % t.n];
    const mx = (a.x - b.x) + (c.x - b.x);
    const mz = (a.z - b.z) + (c.z - b.z);
    const mag = Math.hypot(mx, mz);
    if (mag < 1e-6) continue; /* effectively straight here */

    const l = t.lat[i];
    const insideIsPlusLat = (mx / mag) * l.x + (mz / mag) * l.z > 0;
    t.pointAt(i, insideIsPlusLat ? +halfW : -halfW, A); /* inside  */
    t.pointAt(i, insideIsPlusLat ? -halfW : +halfW, B); /* outside */

    const tilt = B.y - A.y;
    if (tilt > maxTilt) maxTilt = tilt;
    if (tilt <= 0) wrong++;
    checked++;
  }
  assert(wrong === 0,
    def.name + ' banks into every corner (' + checked + ' samples, ' + skipped + ' in transitions)',
    wrong + ' of ' + checked + ' samples have the INSIDE edge higher — banking is inverted');

  const expected = 2 * halfW * dtan(bankMax);
  assert(maxTilt > expected * 0.5 && maxTilt < expected * 1.5,
    def.name + ' peak cross-slope matches its declared bankMax',
    'measured ' + maxTilt.toFixed(3) + ' m across ' + (2 * halfW).toFixed(1) +
    ' m, expected about ' + expected.toFixed(3) + ' m for ' + bankMax + ' rad');
}

/* --------------------------------------------------------------------------- */
console.log('');
console.log('body roll: the term 30-cars.js derives, sampled the way it samples it');
for (const { def, t, halfW, cx, cz } of built) {
  const bankMax = def.bankMax || 0.046;
  let idx = -1, best = 0;
  for (let i = 0; i < t.n; i++) if (Math.abs(t.bank[i]) > best) { best = Math.abs(t.bank[i]); idx = i; }
  if (idx < 0 || best < bankMax * 0.5) {
    console.log('  ....  ' + def.name + ' is not banked enough to test roll — skipped');
    continue;
  }

  /* Exactly 30-cars.js:519-525. hL and hR straddle the car by 1.5 m either side
     along lat, and roll is datan2(hL - hR, 3.0). */
  const p = t.p[idx], l = t.lat[idx];
  const hL = t.heightAt(p.x + l.x * 1.5, p.z + l.z * 1.5, idx);
  const hR = t.heightAt(p.x - l.x * 1.5, p.z - l.z * 1.5, idx);
  const roll = datan2(hL - hR, 3.0);

  /* Same convention-free construction as above: (a-b)+(c-b) points to the
     inside of the turn, so the outside is the other side. */
  const pa = t.p[(idx - 1 + t.n) % t.n], pc = t.p[(idx + 1) % t.n];
  const mx = (pa.x - p.x) + (pc.x - p.x);
  const mz = (pa.z - p.z) + (pc.z - p.z);
  const mag = Math.hypot(mx, mz) || 1;
  const outerIsPlusLat = ((mx / mag) * l.x + (mz / mag) * l.z) < 0;

  /* Matching the camber means rolling toward the OUTSIDE edge, which is the
     higher one. So hL must exceed hR exactly when +lat is the outside — and
     therefore roll must carry that same sign. Invert either the sampling or the
     datan2 arguments and this flips. */
  const rollAgreesWithCamber = outerIsPlusLat ? roll > 0 : roll < 0;

  assert(rollAgreesWithCamber,
    def.name + ' roll leans into the banking, not against it',
    'roll = ' + roll.toFixed(5) + ' rad with the outside edge on the ' +
    (outerIsPlusLat ? '+lat' : '-lat') + ' side (hL ' + hL.toFixed(3) +
    ', hR ' + hR.toFixed(3) + ').\n        This is the b58a5af/1fac796 pair: one of the two signs is back to front.');

  assert(Math.abs(roll) > bankMax * 0.4 && Math.abs(roll) < bankMax * 1.6,
    def.name + ' roll magnitude tracks the bank angle',
    '|roll| = ' + Math.abs(roll).toFixed(4) + ' rad against bankMax ' + bankMax);
}

/* --------------------------------------------------------------------------- */
console.log('');
console.log('elevation profile matches what each circuit claims to be');
const flat = built.find((b) => b.def.id === 'silverstone-v1');
if (flat) {
  let span = 0;
  for (let i = 0; i < flat.t.n; i++) span = Math.max(span, Math.abs(flat.t.p[i].y));
  assert(span < 0.01, 'Silverstone is flat, as its control data says', 'height span ' + span.toFixed(3) + ' m');
}
const hilly = built.find((b) => b.def.id === 'brands-hatch-v1');
if (hilly) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < hilly.t.n; i++) { lo = Math.min(lo, hilly.t.p[i].y); hi = Math.max(hi, hilly.t.p[i].y); }
  assert(hi - lo > 1, 'Brands Hatch actually climbs', 'height range only ' + (hi - lo).toFixed(2) + ' m');
}

/* --------------------------------------------------------------------------- */
console.log('');
console.log('the simulation uses the deterministic maths, not the built-ins');
{
  const trackSrc = read('src/20-track.js') + read('src/30-cars.js');
  /* Math.sqrt/abs/round/min/max are fine — IEEE requires sqrt to be correctly
     rounded and the others are exact. The transcendentals are the problem. */
  const leaks = (trackSrc.match(/Math\.(sin|cos|tan|atan2|atan|log)\b/g) || []);
  assert(leaks.length === 0,
    'no built-in transcendentals in the track or car physics',
    'found ' + leaks.length + ': ' + [...new Set(leaks)].join(', ') +
    '\n        These are not correctly rounded, so they break replay validation across engines.');
}

console.log('');
console.log('assertions: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
