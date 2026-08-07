/* Engine-stability test for src/05-fpmath.js.
 *
 *   node test/fpmath.test.js
 *
 * WHAT THIS IS FOR. The README claims the deterministic transcendentals are
 * bit-identical across V8 and JavaScriptCore, with the built-in Math.* as a
 * control that is not. That claim is the foundation of the whole replay-
 * validation design — a Safari player's run can only ever be re-simulated by a
 * V8 validator if both engines agree to the last bit — and until this file it
 * was a sentence in a README with no way to check it.
 *
 * THE SAMPLE COUNT IS DEFINED HERE, not remembered. The README used to cite
 * 190,290 samples from a measurement nobody kept the harness for, so the number
 * could not be reproduced or defended. The sweep below is the sweep, this file
 * prints the count it actually ran, and the README quotes that. A figure tied to
 * a command beats a figure tied to a memory.
 *
 * THREE ASSERTIONS:
 *   1. GOLDEN  — the sweep still hashes to the committed value. Catches any
 *                change in behaviour of 05-fpmath.js on one engine alone, so
 *                this is useful even where only one engine is installed.
 *   2. STABLE  — node and bun agree bit-for-bit on dsin/dcos/dtan/datan/datan2.
 *   3. CONTROL — node and bun DISAGREE on Math.sin/cos/tan/atan/atan2 over the
 *                same sweep. Without this the test could pass on two engines
 *                that happen to be identical, which would prove nothing about
 *                engine independence.
 *
 * Exits non-zero on failure. If bun is absent, 2 and 3 report SKIP and 1 still
 * runs — a partial check that says so, rather than a green tick that lies.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const SRC = path.join(REPO, 'src', '05-fpmath.js');

/* 05-fpmath.js is written to be concatenated into one IIFE, so it declares
   top-level vars rather than exporting. Evaluate it and hand back the five
   entry points — no modification to the source, and no bundler. */
function loadFpmath() {
  const body = fs.readFileSync(SRC, 'utf8');
  return new Function(
    body + '\nreturn { dsin: dsin, dcos: dcos, dtan: dtan, datan: datan, datan2: datan2 };'
  )();
}

/* ---------------------------------------------------------------------------
   The sweep. Fixed, integer-driven, and identical on every engine: each x is
   built from + - * / on exact values, so the INPUTS cannot differ between
   engines even before the functions run. A sweep computed with Math.* would
   make a divergence in the inputs look like a divergence in the outputs.
   --------------------------------------------------------------------------- */
const N_ANGLE = 24000;   /* dsin, dcos, dtan each                              */
const N_ATAN  = 24000;   /* datan                                             */
const N_GRID  = 220;     /* datan2 over an N_GRID x N_GRID grid               */

const TWO_PI_EXACT = 6.283185307179586;

/* -8pi .. +8pi, well past one turn so argument reduction is exercised rather
   than just the core kernels. */
function angleAt(i) {
  return -4 * TWO_PI_EXACT + (i * (8 * TWO_PI_EXACT)) / (N_ANGLE - 1);
}
/* -50 .. 50, crossing 1 and -1 where atan switches to its reciprocal path. */
function ratioAt(i) {
  return -50 + (i * 100) / (N_ATAN - 1);
}
/* -4 .. 4 on both axes, so the grid lands exactly on 0 and on both axes and
   covers all four quadrants plus the origin. */
function gridAt(i) {
  return -4 + (i * 8) / (N_GRID - 1);
}

/* 64-bit FNV-style rolling hash over the raw IEEE-754 bits of every result, so
   a one-ULP difference anywhere changes the digest. Non-finite results (dtan at
   the poles) fold in a fixed sentinel, which is still deterministic. */
function hasher() {
  const buf = new DataView(new ArrayBuffer(8));
  let acc = 0xcbf29ce484222325n;
  const MASK = 0xffffffffffffffffn;
  return {
    add(v) {
      let bits;
      if (Number.isFinite(v)) {
        buf.setFloat64(0, v);
        bits = buf.getBigUint64(0);
      } else {
        bits = v > 0 ? 1n : v < 0 ? 2n : 3n; /* +Inf / -Inf / NaN */
      }
      acc = ((acc ^ bits) * 0x100000001b3n) & MASK;
    },
    hex() { return acc.toString(16).padStart(16, '0'); }
  };
}

/* Runs the sweep against one set of five functions. `count` is returned so the
   README can quote a number this file produced. */
function sweep(fns) {
  const h = hasher();
  let count = 0;

  for (let i = 0; i < N_ANGLE; i++) {
    const x = angleAt(i);
    h.add(fns.sin(x)); h.add(fns.cos(x)); h.add(fns.tan(x));
    count += 3;
  }
  for (let i = 0; i < N_ATAN; i++) {
    h.add(fns.atan(ratioAt(i)));
    count += 1;
  }
  for (let iy = 0; iy < N_GRID; iy++) {
    const y = gridAt(iy);
    for (let ix = 0; ix < N_GRID; ix++) {
      h.add(fns.atan2(y, gridAt(ix)));
      count += 1;
    }
  }
  return { hash: h.hex(), count };
}

function measure() {
  const fp = loadFpmath();
  return {
    engine: typeof globalThis.Bun !== 'undefined' ? 'bun/JavaScriptCore' : 'node/V8',
    deterministic: sweep({
      sin: fp.dsin, cos: fp.dcos, tan: fp.dtan, atan: fp.datan, atan2: fp.datan2
    }),
    builtin: sweep({
      sin: Math.sin, cos: Math.cos, tan: Math.tan, atan: Math.atan, atan2: Math.atan2
    })
  };
}

/* Child mode: print the measurement and nothing else, so the parent can run
   this same file under another engine and compare. */
if (process.argv.includes('--emit')) {
  process.stdout.write(JSON.stringify(measure()));
  process.exit(0);
}

/* ---------------------------------------------------------------------------
   The committed digest. Regenerate deliberately, never to make a red test
   green: if this changes, 05-fpmath.js changed, and every replay trace recorded
   under the old build became unverifiable. That is a SIM_VERSION bump, not a
   test edit.
   --------------------------------------------------------------------------- */
const GOLDEN = '799de904cbcc58d7';

let pass = 0, fail = 0, skip = 0;
const ok   = (m) => { console.log('  PASS  ' + m); pass++; };
const bad  = (m, d) => { console.log('  FAIL  ' + m + '\n        ' + d); fail++; };
const skipped = (m, why) => { console.log('  SKIP  ' + m + ' — ' + why); skip++; };

const here = measure();

console.log('sweep: ' + here.deterministic.count.toLocaleString('en-GB') +
            ' samples over dsin, dcos, dtan, datan, datan2');
console.log('engine: ' + here.engine);
console.log('  deterministic ' + here.deterministic.hash);
console.log('  builtin       ' + here.builtin.hash);
console.log('');

if (here.deterministic.hash === GOLDEN) {
  ok('sweep matches the committed digest');
} else {
  bad('sweep matches the committed digest',
      'got ' + here.deterministic.hash + ', committed ' + GOLDEN +
      '\n        05-fpmath.js has changed behaviour. If that was deliberate, bump' +
      '\n        SIM_VERSION in 40-game.js — existing traces are now unverifiable.');
}

/* Find bun. Not on PATH under GitHub Actions unless setup-bun ran, so check the
   default install location too. */
let bun = null;
for (const c of ['bun', path.join(process.env.HOME || '', '.bun/bin/bun')]) {
  try { execFileSync(c, ['--version'], { stdio: 'ignore' }); bun = c; break; } catch (_) { /* keep looking */ }
}

if (!bun) {
  skipped('node and bun agree on the deterministic functions', 'bun not installed');
  skipped('node and bun disagree on the built-in functions', 'bun not installed');
} else {
  const other = JSON.parse(execFileSync(bun, [__filename, '--emit'], { encoding: 'utf8' }));

  if (other.engine === here.engine) {
    skipped('cross-engine comparison', 'both runs reported ' + here.engine);
  } else if (other.deterministic.hash === here.deterministic.hash) {
    ok('V8 and JavaScriptCore agree bit-for-bit on the deterministic functions');
  } else {
    bad('V8 and JavaScriptCore agree bit-for-bit on the deterministic functions',
        here.engine + ' ' + here.deterministic.hash + '\n        ' +
        other.engine + ' ' + other.deterministic.hash +
        '\n        Replay validation cannot be trusted across engines.');
  }

  if (other.engine !== here.engine) {
    if (other.builtin.hash !== here.builtin.hash) {
      ok('the control diverges: the two engines disagree on Math.*');
    } else {
      bad('the control diverges: the two engines disagree on Math.*',
          'both hashed ' + here.builtin.hash +
          '\n        These engines agree on the built-ins over this sweep, so passing' +
          '\n        the test above proves nothing about engine independence. Widen the' +
          '\n        sweep or compare a pair of engines known to differ.');
    }
  }
}

console.log('');
console.log('assertions: ' + pass + ' passed, ' + fail + ' failed, ' + skip + ' skipped');
process.exit(fail === 0 ? 0 : 1);
