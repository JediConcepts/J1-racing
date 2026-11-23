/* Shared helpers for the headless simulation tests.
 *
 * Nothing here knows about the renderer. It holds the pieces that a headless run
 * of the race loop needs: the fixed step, the byte layout of the state that gets
 * hashed, the input quantiser, and a small reporter whose output matches
 * test/physics.test.js.
 */

'use strict';

const crypto = require('crypto');

const STEP = 1 / 60;

/* The state that identifies a run. For each car, in index order: pos.x, pos.z,
   yaw, vFwd, vLat, yawRate, progress, finishTime, bestLap, lapsDone. The race
   clock in milliseconds goes last. Float64 so no precision is thrown away. */
function stateBytes(cars, raceTimeMs) {
  const per = 10;
  const f = new Float64Array(cars.length * per + 1);
  let k = 0;
  for (let i = 0; i < cars.length; i++) {
    const v = cars[i];
    f[k++] = v.pos.x;
    f[k++] = v.pos.z;
    f[k++] = v.yaw;
    f[k++] = v.vFwd;
    f[k++] = v.vLat;
    f[k++] = v.yawRate;
    f[k++] = v.progress;
    f[k++] = v.finishTime;
    f[k++] = v.bestLap;
    f[k++] = v.lapsDone;
  }
  f[k++] = raceTimeMs;
  return new Uint8Array(f.buffer);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/* The rule at the end of Game.prototype.playerInput in src/40-game.js: the
   8 bit grid the replay trace stores. Same operations, same order. */
function quantise(inp) {
  const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));   /* as src/10-core.js */
  inp.steer = Math.round(clamp(inp.steer, -1, 1) * 127) / 127;
  inp.throttle = Math.round(clamp(inp.throttle, 0, 1) * 255) / 255;
  inp.brake = Math.round(clamp(inp.brake, 0, 1) * 255) / 255;
  return inp;
}

function makeReporter() {
  let pass = 0, fail = 0;
  const r = {
    ok(name) { console.log('  PASS  ' + name); pass++; },
    bad(name, detail) { console.log('  FAIL  ' + name + '\n        ' + detail); fail++; },
    assert(cond, name, detail) { if (cond) r.ok(name); else r.bad(name, detail); },
    skip(name, why) { console.log('  SKIP  ' + name + ' (' + why + ')'); },
    done() {
      console.log('');
      console.log(pass + ' passed, ' + fail + ' failed');
      process.exit(fail ? 1 : 0);
    }
  };
  return r;
}

function throws(fn, part) {
  try { fn(); } catch (e) { return part ? String(e && e.message).indexOf(part) !== -1 : true; }
  return false;
}

module.exports = { STEP, stateBytes, sha256, quantise, makeReporter, throws };
