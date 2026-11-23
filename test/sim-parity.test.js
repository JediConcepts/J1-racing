/* Headless parity test of the race loop.
 *
 *   node test/sim-parity.test.js            compare against test/golden/sim-2.json
 *   node test/sim-parity.test.js --record   rewrite that file (done by hand, never in CI)
 *
 * WHAT THIS IS FOR. The 3D engine is about to be replaced. The claim to protect
 * is that no lap time moves when it is. This runs a whole race on each of the
 * four circuits with no browser, hashes the final state of every car, and
 * compares the hash to a committed one. If a single float anywhere in the sim
 * differs, the hash does.
 *
 * DUPLICATION, ACCEPTED. The race loop below is a transcription of parts of
 * src/40-game.js (buildGrid, gridOrder, resetRace, tick, settleField, inDrsZone,
 * checkLap, updatePositions), because that file is the DOM layer and cannot be
 * loaded under node. Audio, flash, split and light calls are removed, since they
 * never touch the simulation. Every arithmetic operation keeps its original
 * order. This duplication is intended, and it is retired when the race rules get
 * a headless entry point of their own.
 *
 * The player is driven by an AIDriver (skill 0.965, seed 7) through the same
 * quantiser the replay trace uses, with DRS held on, until the race reaches the
 * FINISHED state (the 2.6 s hold and settleField included).
 *
 * No meshes are built: buildCarMesh and Vehicle.prototype.sync are overridden
 * inside the evaluated source so the vendored three.js is only used for maths.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { STEP, stateBytes, sha256, quantise, makeReporter } = require('./lib/sim');

const REPO = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');

/* One place for what gets loaded, so swapping the vendor file is one edit. */
const VENDOR = 'vendor/three.min.js';
const CHAIN = ['src/05-fpmath.js', 'src/10-core.js', 'src/12-trackdata.js', 'src/20-track.js', 'src/30-cars.js'];

const GOLDEN = path.join(__dirname, 'golden', 'sim-2.json');
/* Same order as TRACKS in src/20-track.js: Monaco first, then the older three. */
const RACES = ['monaco-gp-v1', 'silverstone-v1', 'indianapolis-v1', 'brands-hatch-v1'];
const TICK_CAP = 72000;

global.window = global;
global.self = global;
new Function(read(VENDOR))();
const THREE = global.THREE;

const sim = (function () {
  let body = '';
  for (const f of CHAIN) body += '\n;/* ' + f + ' */\n' + read(f);
  body += '\n;buildCarMesh = function () { return { group: {}, wheels: [], head: {}, steerWheel: {}, shadow: {}, chassis: {} }; };\n';
  body += 'Vehicle.prototype.sync = function () {};\n';
  const names = ['Track', 'trackById', 'Vehicle', 'AIDriver', 'LIVERIES', 'resolveCarContacts', 'damp'];
  return new Function('THREE',
    body + '\nreturn {' + names.map((n) => n + ': ' + n).join(',') + '};'
  )(THREE);
})();

const { Track, trackById, Vehicle, AIDriver, LIVERIES, resolveCarContacts, damp } = sim;

const STATE = { TITLE: 0, COUNTDOWN: 1, RACING: 2, FINISHED: 3 };
const GRID_SIZE = 6;
const TOTAL_LAPS = 3;

/* --- transcription of src/40-game.js ------------------------------------- */

function gridSize(g) {
  return (g.track && g.track.def && g.track.def.grid) || GRID_SIZE;
}

function gridOrder(g, n) {
  const def = (g.track && g.track.def) || {};
  if (!def.grid && n === 6) return [1, 4, 2, 5, 3, 0];
  const slot = def.playerStart === 'mid' ? Math.floor(n / 2) : n - 1;
  const order = [];
  for (let s = 0, car = 1; s < n; s++) order.push(s === slot ? 0 : car++);
  return order;
}

function buildGrid(g) {
  g.cars = [];
  g.ais = [];
  for (let i = 0; i < gridSize(g); i++) {
    const livery = (i === 0) ? LIVERIES[0]
      : LIVERIES[1 + ((i - 1) % Math.max(1, LIVERIES.length - 1))];
    const v = new Vehicle(g.track, livery, i === 0);
    g.cars.push(v);
    if (i > 0) g.ais.push(new AIDriver(v, g.track, 0.940 + (i % 3) * 0.018, 100 + i * 37));
  }
  g.player = g.cars[0];
}

/* resetRace(false) */
function resetRace(g) {
  const t = g.track, n = t.n;
  const cols = (t.def && t.def.gridCols) || 2;
  const colPitch = cols >= 3 ? 3.4 : 6.2;
  const order = gridOrder(g, g.cars.length);
  for (let i = 0; i < g.cars.length; i++) {
    const v = g.cars[i];
    const slot = order.indexOf(i);
    const row = Math.floor(slot / cols);
    const col = slot % cols;
    const idx = (t.startIndex - 5 - row * 3 + n) % n;
    v.placeAt(idx, (col - (cols - 1) / 2) * colPitch);

    v.lapsDone = 0; v.started = false; v.finished = false;
    v.lapStart = 0; v.lastLap = 0; v.bestLap = 0; v.finishTime = 0;
    v.boost = 0; v.drift = 0; v.hitImpulse = 0; v.position = i + 1;
    v.sectorBest = [0, 0, 0]; v.sectorNow = [0, 0, 0]; v.sectorIdx = 0;
    const u = (v.f.s - t.startS + t.length) % t.length;
    v.prevU = u;
    v.progress = -t.length + u;
  }
  g.ais = [];
  for (let ai = 1; ai < g.cars.length; ai++) {
    g.ais.push(new AIDriver(g.cars[ai], t, 0.940 + (ai % 3) * 0.018, 100 + ai * 37));
  }
  /* The player's driver, made once per race. */
  g.driver = new AIDriver(g.player, t, 0.965, 7);

  g.time = 0;
  g.settling = false;
  g.raceTime = 0;
  g.finishHold = 0;
  g.countdown = 0;
  g.state = STATE.COUNTDOWN;
}

function laps(g) {
  return (g.track && g.track.laps) || TOTAL_LAPS;
}

function inDrsZone(g, v) {
  const z = g.track.drsZones;
  for (let i = 0; i < z.length; i++) {
    const a = z[i][0], b = z[i][1];
    if (a <= b) { if (v.frameIdx >= a && v.frameIdx <= b) return true; }
    else if (v.frameIdx >= a || v.frameIdx <= b) return true;
  }
  return false;
}

function checkLap(g, v) {
  const t = g.track, len = t.length;
  const u = (v.f.s - t.startS + len) % len;
  const d = u - v.prevU;
  const half = len * 0.5;

  if (d < -half) {
    if (!v.started) {
      v.started = true;
      v.lapStart = g.raceTime;
      v.sectorIdx = 0;
    } else {
      const lap = g.raceTime - v.lapStart;
      v.lastLap = lap;
      if (!v.bestLap || lap < v.bestLap) {
        v.bestLap = lap;
      }
      v.lapStart = g.raceTime;
      v.lapsDone++;
      v.sectorIdx = 0;
      if (v.lapsDone >= laps(g)) {
        v.finished = true;
        v.finishTime = g.raceTime;
      }
    }
  } else if (d > half) {
    if (v.lapsDone > 0) v.lapsDone--;
  }
  v.prevU = u;
  v.progress = (v.started ? v.lapsDone : -1) * len + u;

  /* The sector split block is display only (it writes sectorBest and sectorIdx
     for the player, which nothing in the simulation reads), so it is omitted. */
}

function updatePositions(g) {
  const sorted = g.cars.slice();
  sorted.sort(function (a, b) {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });
  for (let i = 0; i < sorted.length; i++) sorted[i].position = i + 1;
  g.order = sorted;
}

function settleField(g) {
  g.settling = true;
  const cap = 60 * 180;
  let n = 0, pending;
  while (n < cap) {
    pending = 0;
    for (let i = 0; i < g.cars.length; i++) if (!g.cars[i].finished) pending++;
    if (!pending) break;
    tick(g, STEP);
    n++;
  }
  g.settling = false;
}

function tick(g, dt) {
  g.time += dt;

  const live = g.state === STATE.RACING;
  let liveNow = live;

  if (g.state === STATE.COUNTDOWN) {
    const prev = g.countdown;
    g.countdown += dt;
    if (prev < 5.0 && g.countdown >= 5.0) {
      g.state = STATE.RACING;
      liveNow = true;
    }
  }

  if (liveNow) g.raceTime += dt * 1000;

  /* DRS. input.keyDrs is always held. */
  const p = g.player;
  const wantBoost = true && inDrsZone(g, p) && p.vFwd > 42 && liveNow;
  p.drsActive = wantBoost;
  p.boost = damp(p.boost, wantBoost ? 1 : 0, wantBoost ? 3.2 : 2.2, dt);

  for (let i = 0; i < g.cars.length; i++) {
    const v = g.cars[i];
    let inp;
    if (v.isPlayer) {
      inp = quantise(g.driver.update(dt, g.cars, g.time));
    } else {
      inp = g.ais[i - 1].update(dt, g.cars, g.time);
      const aiBoost = inDrsZone(g, v) && v.vFwd > 42;
      v.boost = damp(v.boost, aiBoost ? 0.85 : 0, 2.5, dt);
    }
    const alive = liveNow && !v.finished;
    v.step(dt, inp, alive);
    if (liveNow) checkLap(g, v);
  }

  resolveCarContacts(g.cars, null);
  updatePositions(g);

  if (p.finished && g.state !== STATE.FINISHED) {
    g.finishHold += dt;
    if (g.finishHold > 2.6 && !g.settling) {
      settleField(g);
      g.state = STATE.FINISHED;
    }
  }
}

/* --- one race ------------------------------------------------------------- */

function runRace(trackId) {
  /* trackById falls back to TRACKS[0] for an id it does not know. That is
     Monaco now, so a mistyped id would quietly run Monaco under the wrong
     name and record a hash for a race nobody asked for. */
  const def = trackById(trackId);
  if (def.id !== trackId) {
    throw new Error('no circuit with the id "' + trackId + '" in src/20-track.js (trackById fell back to "' + def.id + '")');
  }
  const g = { track: new Track(def) };
  buildGrid(g);
  resetRace(g);
  let ticks = 0;
  while (g.state !== STATE.FINISHED && ticks < TICK_CAP) {
    tick(g, STEP);
    ticks++;
  }
  return {
    finished: g.state === STATE.FINISHED,
    ticks: ticks,
    playerFinishMs: g.player.finishTime,
    sha256: sha256(stateBytes(g.cars, g.raceTime))
  };
}

/* --- main ----------------------------------------------------------------- */

const record = process.argv.indexOf('--record') !== -1;
const results = {};
for (const id of RACES) results[id] = runRace(id);

if (record) {
  const recIdx = process.argv.indexOf('--recorded-at');
  const recordedAt = recIdx !== -1 ? process.argv[recIdx + 1] : '';
  if (!recordedAt) {
    console.error('--record needs --recorded-at <date>, so the golden file says when it was recorded. Nothing was written.');
    process.exit(1);
  }
  const out = { recordedAt: recordedAt, races: {} };
  for (const id of RACES) out.races[id] = { ticks: results[id].ticks, sha256: results[id].sha256 };
  fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
  fs.writeFileSync(GOLDEN, JSON.stringify(out, null, 2) + '\n');
  for (const id of RACES) {
    console.log('  recorded  ' + id + '  ticks ' + results[id].ticks + '  player ' + Math.round(results[id].playerFinishMs) + ' ms  ' + results[id].sha256);
  }
  console.log('wrote ' + path.relative(REPO, GOLDEN));
  process.exit(0);
}

const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
const t = makeReporter();
console.log('race loop parity (golden recorded at ' + golden.recordedAt + ')');
for (const id of RACES) {
  const r = results[id], want = golden.races[id];
  t.assert(r.finished && !!want && r.ticks === want.ticks && r.sha256 === want.sha256,
    id + ' final state matches the golden hash (' + r.ticks + ' ticks, player ' + Math.round(r.playerFinishMs) + ' ms)',
    (r.finished ? 'finished' : 'NOT finished within ' + TICK_CAP + ' ticks') + '; got ' + r.ticks + ' ticks ' + r.sha256 +
    ', want ' + (want ? want.ticks + ' ticks ' + want.sha256 : 'no golden entry'));
}
t.done();
