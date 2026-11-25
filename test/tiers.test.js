/* Who is given which picture tier, decided without a browser.
 *
 *   node test/tiers.test.js
 *
 * WHAT THIS IS FOR. A new player is given Ultra, the heavy tier, on a device
 * nobody has measured, and src/38-tiers.js decides when that device keeps it
 * and when it is given Modern. The eight rules it has to keep (R1 to R8) are
 * written out at the top of that file. Every one of them was broken at commit
 * c9fe9ff in a way a review found by running the real functions in node
 * against a fake storage, and this file is those runs kept: a table of cases,
 * one line each, under the rule it belongs to. A case marked (was: ...) is one
 * that went wrong before, with what happened then.
 *
 * HOW IT RUNS THE REAL CODE. src/38-tiers.js has no page, no renderer and no
 * clock in it, so it is evaluated here as it stands, the way
 * test/physics.test.js evaluates its chain. The four names it takes from the
 * rest of the game (the circuit registry, the hours, the cameras, clamp) are
 * handed in. `Page` below is the few lines of Game that carry an answer out
 * (tierAct in src/40-game.js): write the key, put the tier on the screen,
 * save. A tab that dies is a Page that is simply dropped, and the next Page
 * is made from the storage it left.
 *
 * WHAT IT DOES NOT COVER: that the browser's events reach these functions
 * (the listeners, the real storage, a real lost context). test/picture.js
 * does that, in a browser.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');

const CIRCUITS = ['monaco-gp-v1', 'las-vegas-v1', 'silverstone-v1', 'indianapolis-v1', 'brands-hatch-v1'];
const NAMES = ['TIERS', 'TIER_ORDER', 'TIER_SAFE', 'TIER_TRIAL_FRAMES', 'TIER_TRIAL_MS', 'TIER_TRIAL_KEY', 'TIER_GRACE_MS', 'PACE',
  'SETTINGS_KEY', 'SETTINGS_KEY_OLD', 'SETTINGS_DEFAULTS', 'RANDOM', 'FIRST_VISIT', 'drawLoad', 'drawRace', 'drawHour', 'drawWeather', 'drawCircuit', 'settingsLoad', 'settingsWrite', 'tierFresh', 'tierFrame', 'tierPace', 'tierOut', 'tierBack',
  'tierDeviceLost', 'tierPick', 'tierTaps', 'tierTap', 'tierHint', 'tierKeyParse'];
const T = new Function('trackById', 'TIME_OF_DAY_NAMES', 'CAM_LABELS', 'clamp',
  read('src/38-tiers.js') + '\nreturn {' + NAMES.map((n) => n + ': ' + n).join(',') + '};'
)(
  (id) => ({ id: CIRCUITS.indexOf(id) >= 0 ? id : CIRCUITS[0] }),
  ['morning', 'midday', 'golden', 'dusk'],
  ['CHASE CAM', 'T-CAM', 'HELMET CAM', 'GYRO CAM'],
  (v, a, b) => (v < a ? a : (v > b ? b : v))
);
const KEY = T.TIER_TRIAL_KEY, V2 = T.SETTINGS_KEY, V1 = T.SETTINGS_KEY_OLD;

let pass = 0, fail = 0;
function check(ok, name, detail) {
  if (ok) { console.log('  PASS  ' + name); pass++; }
  else { console.log('  FAIL  ' + name + (detail ? '\n        ' + detail : '')); fail++; }
}

/* --- a browser's storage -------------------------------------------------
   `mode` 'blocked' refuses everything (private browsing with storage off);
   'full' can be read and not written. Every write is counted by key. */
const writesTo = {};
function Store(held, mode) {
  this.m = Object.assign({}, held);
  this.mode = mode || 'ok';
}
Store.prototype.get = function (k) {
  return this.mode !== 'blocked' && Object.prototype.hasOwnProperty.call(this.m, k) ? this.m[k] : null;
};
Store.prototype.set = function (k, v) {
  if (this.mode !== 'ok') return false;
  writesTo[k] = (writesTo[k] || 0) + 1;
  if (v == null) delete this.m[k]; else this.m[k] = String(v);
  return true;
};
Store.prototype.saved = function () { return this.m[V2] ? JSON.parse(this.m[V2]) : null; };
Store.prototype.key = function () { return this.get(KEY); };

/* --- a page: the defaults of Game.loadSettings, and Game.tierAct ---------- */
function Page(store, opts) {
  const o = opts || {};
  this.store = store;
  this.said = [];
  this.builds = 0;
  const s = {
    steerTilt: false, steerChosen: false, tiltInvert: false, steerSens: 1, engineVol: 10, musicVol: 10, musicOn: true, engineOn: false,
    camMode: 0, autoThrottle: false, throttleChosen: false, autoFullscreen: true,
    quality: 'ultra', tierChosen: false, tierBarred: false, timeOfDay: 'random', trackId: 'random',
    weather: 'random', defaults: 3, userConfigured: false
  };
  const g = this.g = Object.assign(T.tierFresh(), { settings: s });
  const t = T.settingsLoad(store, s, { hidden: !!o.hidden });
  for (const f in t) if (f !== 'key' && f !== 'save') g[f] = t[f];
  g.tierOn = s.quality;
  this.hidden = !!o.hidden;
  if (g.tierFell) this.said.push(g.tierFell);
}
Page.prototype.act = function (o, byPlayer) {
  if (!o) return;
  if (o.key !== undefined) this.store.set(KEY, o.key);
  if (o.build) { this.g.tierOn = this.g.settings.quality; this.builds++; }
  if (o.save) { if (byPlayer) this.g.settings.userConfigured = true; T.settingsWrite(this.store, this.g.settings); }
  if (o.say) this.said.push(o.say);
};
/* one turn of the frame loop: a frame is drawn, then the guard has its gap */
Page.prototype.frame = function (gap, held) {
  this.act(T.tierFrame(this.g));
  this.act(T.tierPace(this.g, gap, !!held || this.hidden));
};
Page.prototype.frames = function (n, gap, held) { for (let i = 0; i < n; i++) this.frame(gap, held); return this; };
Page.prototype.hide = function () { this.hidden = true; this.act(T.tierOut(this.g)); return this; };
Page.prototype.show = function () { this.hidden = false; this.act(T.tierBack(this.g)); return this; };
Page.prototype.leave = function () { this.act(T.tierOut(this.g)); return this; };            /* pagehide */
Page.prototype.lost = function (sinceMs) { this.act(T.tierDeviceLost(this.g, this.hidden, sinceMs === undefined ? Infinity : sinceMs)); return this; };
Page.prototype.pick = function (name) { this.g.settings.quality = name; this.act(T.tierPick(this.g), true); return this; };
/* a tap on the Graphics button, and the wait after it run out */
Page.prototype.tap = function () { return this.pick(T.tierTap(this.g)).g.settings.quality; };
/* taps with no wait between them: the button moves, and nothing is built */
Page.prototype.flick = function (n) { const out = []; for (let i = 0; i < n; i++) out.push(this.g.settings.quality = T.tierTap(this.g)); return out; };
Page.prototype.setting = function (k, v) { this.g.settings[k] = v; this.act({ save: true }, true); return this; };
Page.prototype.circuit = function (id) { this.setting('trackId', id); this.act(T.tierOut(this.g)); return this; };
Page.prototype.on = function () { return this.g.tierOn; };
/* Feeds gaps from `gen` until the tier is no longer Ultra or `maxMs` of
   screen time has passed. Answers the screen time used. */
Page.prototype.run = function (gen, maxMs) {
  let wall = 0, i = 0;
  while (this.g.tierOn === 'ultra' && wall < maxMs) { const gap = gen(i++); wall += gap; this.frame(gap); }
  return wall;
};
const steady = (ms) => () => ms;
/* `first` are the gaps of the load itself, then `base` with a hitch at each
   [frame, ms] of `later` */
const shaped = (base, first, later) => (i) => {
  if (i < first.length) return first[i];
  for (const h of later) if (i - first.length === h[0]) return h[1];
  return base;
};
/* a healthy page that has passed its trial: three seconds at 60 a second */
const settledPage = (store, opts) => new Page(store, opts).frames(200, 16.7);
const secs = (ms) => (ms / 1000).toFixed(1) + ' s';
const show = (p) => 'on ' + p.on() + ', key ' + JSON.stringify(p.store.key()) + ', saved ' +
  JSON.stringify(p.store.saved() && { quality: p.store.saved().quality, tierChosen: p.store.saved().tierChosen, tierBarred: p.store.saved().tierBarred }) +
  ', trial ' + p.g.trialOn + ' ' + p.g.trialLeft + ' frames ' + Math.round(p.g.trialMs) + ' ms, said ' + JSON.stringify(p.said);

/* The live game's own load and save (origin/main, src/40-game.js): it knows
   Retro and Modern, takes any circuit, and writes the fields it knows. */
function liveSave(store, change) {
  const s = { quality: 'modern', trackId: 'silverstone-v1', camMode: 0, musicVol: 10, userConfigured: false };
  let p = {};
  try { p = JSON.parse(store.m[V1] || '{}'); } catch (e) { p = {}; }
  if (p.quality === 'retro' || p.quality === 'modern') s.quality = p.quality;
  if (CIRCUITS.indexOf(p.trackId) >= 0) s.trackId = p.trackId;
  if (typeof p.camMode === 'number') s.camMode = p.camMode;
  if (typeof p.musicVol === 'number') s.musicVol = p.musicVol;
  Object.assign(s, change, { userConfigured: true });
  store.m[V1] = JSON.stringify(s);          /* the live game's write, not this build's: not counted */
  return s;
}

let st, p, q, r, w;

/* --------------------------------------------------------------------------- */
console.log('R1  its own settings');

st = new Store({});
p = new Page(st);
check(p.on() === 'ultra' && p.g.settings.trackId === 'random' && p.g.settings.timeOfDay === 'random' && st.saved() &&
  st.saved().quality === 'ultra' && st.saved().tierChosen === false && st.saved().steerSens === 1 && st.m[V1] === undefined && p.g.firstVisit === true,
  'a browser with nothing saved starts in Ultra, sensitivity 1, the circuit and the hour RANDOM, saved under the new key only, as a first visit', show(p));

const OLD = JSON.stringify({ quality: 'modern', trackId: 'silverstone-v1', musicVol: 4, userConfigured: true });
st = new Store({ [V1]: OLD });
p = new Page(st);
check(p.on() === 'ultra' && st.saved().trackId === 'random' && st.saved().timeOfDay === 'random' && st.saved().musicVol === 4 &&
  st.saved().tierChosen === false && st.m[V1] === OLD && p.g.firstVisit === false,
  'the old defaults under the old key are moved to Ultra and RANDOM; the music volume is kept; the old key is not touched; not a first visit',
  show(p) + ', old key ' + st.m[V1]);

st = new Store({ [V1]: JSON.stringify({ quality: 'retro', trackId: 'brands-hatch-v1', timeOfDay: 'golden' }) });
p = new Page(st);
check(p.on() === 'retro' && st.saved().trackId === 'brands-hatch-v1' && st.saved().timeOfDay === 'golden' && st.saved().tierChosen === true,
  'a Retro, a circuit and an hour that were picked under the old key are kept', show(p));

st = new Store({ [V1]: JSON.stringify({ quality: 'modern', tierChosen: true, trackId: 'silverstone-v1', timeOfDay: 'midday', defaults: 2 }) });
p = new Page(st);
check(p.on() === 'modern' && st.saved().trackId === 'silverstone-v1' && st.saved().timeOfDay === 'midday' && st.saved().tierChosen === true,
  'settings an earlier copy of this build saved under the old key are taken as they stand', show(p));

/* The weather is a look in Ultra only (WEATHER_NAMES in src/38-tiers.js).
   A saved one is kept; anything else is clear. */
st = new Store({ [V2]: JSON.stringify({ quality: 'ultra', tierChosen: true, weather: 'rain', defaults: 2 }) });
p = new Page(st);
check(p.g.settings.weather === 'rain', 'a saved weather of rain is kept', 'weather ' + p.g.settings.weather);
st = new Store({ [V2]: JSON.stringify({ quality: 'ultra', tierChosen: true, weather: 'snow', defaults: 2 }) });
p = new Page(st);
w = p.g.settings.weather;
st = new Store({ [V2]: JSON.stringify({ quality: 'ultra', tierChosen: true, weather: 3, defaults: 2 }) });
p = new Page(st);
check(w === 'random' && p.g.settings.weather === 'random', 'an unknown weather, or one that is not a word, is RANDOM',
  'snow gave ' + w + ', 3 gave ' + p.g.settings.weather);
st = new Store({ [V1]: JSON.stringify({ quality: 'retro', weather: 'cloudy' }) });
p = new Page(st);
check(p.on() === 'retro' && st.saved().weather === 'cloudy', 'a weather saved with Retro is kept in the settings (Retro draws none of it)', show(p));

/* the review's case A */
st = new Store({});
p = new Page(st).pick('modern').setting('trackId', 'silverstone-v1').setting('timeOfDay', 'morning');
p.leave();
liveSave(st, { camMode: 2 });
q = new Page(st);
check(q.on() === 'modern' && q.g.settings.trackId === 'silverstone-v1' && q.g.settings.timeOfDay === 'morning' && q.store.key() === null,
  'Modern, Silverstone and morning picked here survive a save in the live game (was: Ultra at Monaco at dusk, on trial)',
  show(q) + ', circuit ' + q.g.settings.trackId + ', hour ' + q.g.settings.timeOfDay);

/* the review's case B */
st = new Store({});
p = new Page(st);
p.run(steady(500), 60000);
p.leave();
liveSave(st, { musicVol: 3 });
q = new Page(st);
check(p.on() === 'modern' && q.on() === 'modern' && q.g.trialOn === false && st.saved().tierChosen === false,
  'a device stepped down to Modern stays there after a save in the live game (was: Ultra on trial again)', show(q));

/* the review's case C */
st = new Store({});
const liveBefore = JSON.stringify(liveSave(st, { quality: 'retro' }));
p = new Page(st);
p.frames(200, 16.7).setting('musicVol', 7).pick('modern').circuit('indianapolis-v1');
check(st.m[V1] === liveBefore && JSON.parse(st.m[V1]).trackId === 'silverstone-v1' && JSON.parse(st.m[V1]).quality === 'retro',
  'the live game keeps its own circuit and tier whatever this build loads, saves or picks (was: the live game opened at Monaco)',
  'the old key was ' + liveBefore + ' and is ' + st.m[V1]);

st = new Store({ [V1]: OLD });
p = new Page(st);
p.frames(200, 16.7).pick('retro').leave();
liveSave(st, { quality: 'modern', trackId: 'silverstone-v1' });
q = new Page(st);
check(q.on() === 'retro' && q.g.settings.trackId === 'random',
  'the move from the old key happens once: what the live game saves there afterwards is not read again', show(q));

/* --------------------------------------------------------------------------- */
console.log('R2  a device that cannot run Ultra ends in Modern, within about 10 seconds, and stays');

[500, 1000, 2000, 4000].forEach((ms) => {
  st = new Store({});
  p = new Page(st);
  w = p.run(steady(ms), 600000);
  q = new Page(st);
  const before = { 500: 7.5, 1000: 15, 2000: 30, 4000: 60 }[ms];
  check(p.on() === 'modern' && w <= 12000 && st.saved().quality === 'modern' && st.saved().tierChosen === false && st.key() === null &&
    q.on() === 'modern' && q.g.trialOn === false,
    'every frame takes ' + ms + ' ms: Modern after ' + secs(w) + ', saved, and the next load is Modern (was: ' + before + ' s)', show(p));
});

[[100, '10 frames a second'], [45, '22 frames a second'], [41, '24 frames a second']].forEach((c) => {
  st = new Store({});
  p = new Page(st);
  w = p.run(steady(c[0]), 600000);
  check(p.on() === 'modern' && w <= 12000 && st.saved().quality === 'modern', c[1] + ': Modern after ' + secs(w), show(p));
});

st = new Store({});
p = new Page(st);
w = p.run((i) => (i % 4 === 3 ? 30 : 300), 600000);
check(p.on() === 'modern' && w <= 12000, 'three frames of 300 ms and one of 30, for ever: Modern after ' + secs(w), show(p));

/* the review's case D: a slow device that is reloaded before the verdict */
st = new Store({});
let loads = 0, total = 0;
do { p = new Page(st); loads++; total += p.run(steady(1000), 3000); if (p.on() === 'ultra') p.leave(); } while (p.on() === 'ultra' && loads < 50);
q = new Page(st);
check(p.on() === 'modern' && total <= 12000 && q.on() === 'modern' && st.saved().tierBarred === true,
  'a slow device reloaded every 3 seconds: Modern in load ' + loads + ', after ' + secs(total) + ' on the screen (was: Ultra on every load, for ever)',
  show(p) + ', loads ' + loads);

/* the review before live: a healthy device's short visits must not add up
   to a failed trial. Ordinary frames are not evidence of a slow device. */
st = new Store({});
for (let i = 0; i < 10; i++) { p = new Page(st); p.run(steady(16.7), 2800); if (p.on() === 'ultra') p.leave(); }
q = new Page(st);
q.run(steady(16.7), 4000);
check(p.on() === 'ultra' && q.on() === 'ultra' && q.g.trialOn === false && st.saved().quality === 'ultra' && st.saved().tierBarred !== true,
  'a healthy device left ten times after 2.8 seconds keeps Ultra, and passes its trial on the next full visit (was: Modern on the fourth visit, for good)',
  show(q));

st = new Store({});
p = new Page(st);
total = 0;
for (let i = 0; i < 50 && p.on() === 'ultra'; i++) { total += p.run(steady(2000), 4000); if (p.on() === 'ultra') p.hide().frames(5, 2000).show(); }
check(p.on() === 'modern' && total <= 12000,
  'a slow device whose player keeps leaving for another tab and coming back: Modern after ' + secs(total) + ' on the screen', show(p));

st = new Store({});
p = settledPage(st);
const trusted = p.g.trialOn === false && st.key() === 'ultra running';
w = p.run(steady(500), 600000);
check(trusted && p.on() === 'modern' && w <= 4000 && st.saved().quality === 'modern',
  'a device that passed its trial and turns slow later (a race, a bigger circuit): Modern after ' + secs(w), show(p));

st = new Store({ [KEY]: 'ultra' });
p = new Page(st);
q = new Page(st);
check(p.on() === 'modern' && st.saved().quality === 'modern' && st.saved().tierBarred === true && p.said.length === 0 && q.on() === 'modern',
  'a first load that died while Ultra was being tried in view: Modern, saved, with nothing said', show(p));

/* --------------------------------------------------------------------------- */
console.log('R3  a device that can run Ultra never has it taken away by mistake');

const keeps = (name, gen, wasText) => {
  st = new Store({});
  p = new Page(st);
  p.run(gen, 60000);
  check(p.on() === 'ultra' && p.g.trialOn === false && st.key() === 'ultra running' && st.saved().quality === 'ultra',
    name + ': keeps Ultra, and passes its trial' + (wasText ? ' (was: ' + wasText + ')' : ''), show(p));
};
keeps('60 frames a second', steady(16.7));
keeps('held to 30 frames a second, a steady 33.4 ms', steady(33.4));
keeps('held to 30, one frame in seven taking two refreshes', (i) => (i % 7 === 6 ? 66.8 : 33.4), 'Modern after 4.5 s');
keeps('held to 30, six frames of 400 ms at load and a 200 ms hitch a second on', shaped(33.4, [400, 400, 400, 400, 400, 400], [[30, 200]]), 'Modern after 4.7 s, saved');
keeps('held to 30, four frames of 400 ms at load and 200 ms hitches at 0.7 and 1.6 s', shaped(33.4, [400, 400, 400, 400], [[20, 200], [45, 200]]), 'Modern after 4.4 s');
keeps('60 a second with the same six frames of 400 ms at load', shaped(16.7, [400, 400, 400, 400, 400, 400], [[60, 200]]));
keeps('a first frame of 5 seconds, then 30 a second', shaped(33.4, [5000], []));

st = new Store({});
p = settledPage(st);
p.frame(5000);
p.frames(600, 33.4);
p.frame(240);
p.frames(600, 33.4);
check(p.on() === 'ultra', 'after the trial, one gap of 5 seconds and a hitch of 240 ms do not step down', show(p));

st = new Store({});
p = settledPage(st);
for (let i = 0; i < 20; i++) { p.frame(300); p.frames(29, 33.4); }
check(p.on() === 'ultra', 'a hitch of 300 ms every second at 30 a second does not step down', show(p));

st = new Store({});
p = new Page(st);
p.frames(2000, 33.4, true);
check(p.on() === 'ultra' && p.g.trialMs === 0, 'a minute in a pause inside the trial uses none of its time', show(p));

/* finding 14: loaded in a background tab, no frame drawn, then thrown away */
st = new Store({});
p = new Page(st, { hidden: true });
const hiddenKey = st.key();
q = new Page(st);
check(/^ultra untried/.test(hiddenKey) && q.on() === 'ultra' && q.g.trialOn && st.key() === 'ultra' && st.saved().quality === 'ultra',
  'a page loaded in a background tab and thrown away there: the next load is Ultra, on trial (was: Modern, saved, for good)',
  'key left ' + JSON.stringify(hiddenKey) + ', then ' + show(q));

st = new Store({});
p = new Page(st, { hidden: true });
p.show();
const shownKey = st.key();
p.frames(10, 16.7).hide();
q = new Page(st);
check(shownKey === 'ultra' && q.on() === 'ultra' && q.g.trialOn,
  'shown, then hidden ten frames into its trial and thrown away: the next load is Ultra, on trial', 'key when shown ' + shownKey + ', then ' + show(q));

st = new Store({});
for (let i = 0; i < 3; i++) { p = new Page(st); p.frames(3, 16.7).leave(); }
q = new Page(st);
check(q.on() === 'ultra' && q.g.trialOn && q.g.trialLeft === T.TIER_TRIAL_FRAMES,
  'a page closed three frames into its trial, three times over: Ultra again, on trial', show(q));

/* findings 3 and 8: the device is taken while the page is in the background */
st = new Store({});
let ended = [];
for (let i = 0; i < 3; i++) { p = settledPage(st); p.frames(600, 16.7).hide().lost(); ended.push(st.key()); }
q = new Page(st);
check(q.on() === 'ultra' && q.said.length === 0 && ended.join() === ',,' && st.saved().quality === 'ultra',
  'the device lost while the page is hidden, three sessions running: Ultra every time (was: Modern after one, off for good after two)',
  'keys left ' + JSON.stringify(ended) + ', then ' + show(q));

st = new Store({});
p = settledPage(st).hide().show().lost(3000);
q = new Page(st);
check(st.key() === 'ultra' && q.on() === 'ultra', 'the device found lost 3 seconds after the page came back: not counted', show(q));

st = new Store({});
p = new Page(st);
p.frames(10, 16.7).hide().lost();
r = st.key();
q = new Page(st);
check(/^ultra untried/.test(r) && q.on() === 'ultra' && q.g.trialOn, 'the device lost while hidden inside the trial: Ultra again, on trial', 'key left ' + r + ', then ' + show(q));

/* an error nobody caught, and the page left inside its trial: a loss, not the end */
st = new Store({});
p = new Page(st);
p.frames(3, 16.7);
p.g.tierBroke = true;
p.leave();
r = st.key();
q = new Page(st);
const restOn = q.on(), restSaved = st.saved().quality;
q.leave();
w = new Page(st);
check(r === 'ultra running' && restOn === 'modern' && restSaved === 'ultra' && w.on() === 'ultra' && w.g.tierAgain,
  'a page left inside its trial with an uncaught error on it costs Ultra one load, not for good (was: Modern, saved)', 'key left ' + r + '; then on ' + restOn + '; then ' + show(w));
w.frames(3, 16.7);
w.g.tierBroke = true;
w.leave();
q = new Page(st);
check(q.on() === 'modern' && st.saved().quality === 'modern' && st.saved().tierBarred === true,
  'and the same again in its second chance turns Ultra off', show(q));

/* minor 2: a second tab opened beside a hidden first */
st = new Store({});
p = new Page(st);
p.frames(5, 16.7).hide();
q = new Page(st);
check(q.on() === 'ultra' && st.saved().quality === 'ultra', 'a second tab opened while the first is hidden inside its trial is in Ultra (was: Modern, saved)', show(q));

/* --------------------------------------------------------------------------- */
console.log('R4  every load of a heavy tier is on trial, and a tab that dies in view leaves a trace');

st = new Store({});
settledPage(st).leave();
p = new Page(st);
check(p.on() === 'ultra' && p.g.trialOn && p.g.trialLeft === T.TIER_TRIAL_FRAMES && st.key() === 'ultra',
  'the second load of an Ultra that passed its trial is on trial again (was: no key, no trial)', show(p));

st = new Store({ [V2]: JSON.stringify({ quality: 'ultra', tierChosen: true, defaults: 2 }) });
p = new Page(st);
check(p.g.trialOn && st.key() === 'ultra', 'an Ultra the player picked is on trial at load like any other', show(p));

st = new Store({ [V2]: JSON.stringify({ quality: 'cinema', defaults: 2 }) });
p = new Page(st);
check(p.on() === 'ultra' && p.g.trialOn && st.key() === 'ultra', 'a saved tier this build does not know falls to Ultra, on trial (was: Ultra with no trial)', show(p));

/* the review's case J: a setting saved inside the wait of a tier clicked to */
st = new Store({ [V2]: JSON.stringify({ quality: 'modern', tierChosen: true, defaults: 2 }) });
p = new Page(st);
p.g.settings.quality = 'ultra';
p.setting('musicVol', 5).leave();
q = new Page(st);
check(st.saved().quality === 'ultra' && q.g.trialOn && st.key() === 'ultra',
  'Ultra clicked to, a volume saved inside the wait, the page left: the next load has Ultra on trial (was: no trial)', show(q));

st = new Store({});
p = settledPage(st).circuit('indianapolis-v1');
q = new Page(st);
check(q.g.settings.trackId === 'indianapolis-v1' && q.g.trialOn && st.key() === 'ultra', 'a change of circuit in a trusted Ultra loads the new circuit on trial (was: no trial)', show(q));

/* finding 10: the tab is killed after the trial, with the page in view */
st = new Store({});
settledPage(st);                                   /* dies here: no event at all */
const leftRunning = st.key();
p = new Page(st);
const afterKill = show(p), killOn = p.on(), killSaved = st.saved().quality, killKey = st.key();
p.leave();
q = new Page(st);
check(leftRunning === 'ultra running' && killOn === 'modern' && killSaved === 'ultra' && killKey === 'ultra again' && q.on() === 'ultra' && q.g.tierAgain,
  'a tab killed in view after its trial: Modern for one load, then Ultra again as a second chance (was: Ultra at once, no trace)',
  'left ' + leftRunning + '; the load after: ' + afterKill + '; the one after that: ' + show(q));
q.frames(200, 16.7);                               /* and dies again in view */
r = st.key();
p = new Page(st);
w = new Page(st);
check(r === 'ultra running twice' && p.on() === 'modern' && st.saved().quality === 'modern' && st.saved().tierBarred === true && w.on() === 'modern' && w.g.trialOn === false,
  'killed in view again in its second chance: Modern, saved, and it stays', 'left ' + r + '; ' + show(p));

st = new Store({});
settledPage(st).hide();                            /* thrown away in the background */
r = st.key();
p = new Page(st);
check(r === null && p.on() === 'ultra' && p.said.length === 0, 'a tab thrown away in the background after its trial leaves no trace: Ultra', 'left ' + r + '; ' + show(p));

st = new Store({});
p = settledPage(st).hide().show();
check(st.key() === 'ultra running', 'the mark is back when the page is in view again', show(p));

/* --------------------------------------------------------------------------- */
console.log('R5  the second chance, and the player\'s own pick');

st = new Store({ [V2]: JSON.stringify({ quality: 'ultra', tierChosen: true, defaults: 2 }) });
p = settledPage(st).lost();
r = st.key();
q = new Page(st);
const said1 = q.said.join(), on1 = q.on(), saved1 = st.saved().quality;
q.setting('musicVol', 3).leave();                  /* a setting saved in the load between */
w = new Page(st);
check(r === 'ultra lost' && on1 === 'modern' && said1 === 'lost' && saved1 === 'ultra' && w.on() === 'ultra' && w.g.tierAgain &&
  w.g.settings.tierChosen === true && w.g.trialOn && st.saved().quality === 'ultra',
  'one device lost in view: Modern for one load with the line, then Ultra on trial again as the player\'s own, a setting saved between or not',
  'key ' + r + '; between: on ' + on1 + ', said ' + said1 + '; after: ' + show(w));
w.frames(200, 16.7).lost();
r = st.key();
p = new Page(st);
q = new Page(st);
check(r === 'ultra lost twice' && p.on() === 'modern' && p.said.join() === 'lost' && st.saved().quality === 'modern' && st.saved().tierChosen === false &&
  q.on() === 'modern' && q.said.length === 0,
  'lost again in the second chance: off, saved, said once', 'key ' + r + '; ' + show(p));

st = new Store({});
settledPage(st).lost();
p = new Page(st);
check(p.on() === 'modern' && p.said.length === 0 && st.key() === 'ultra again', 'a player who was given Ultra and lost the device is told nothing', show(p));

st = new Store({});
settledPage(st).lost();
p = new Page(st);
p.pick('retro').leave();
q = new Page(st);
check(q.on() === 'retro' && st.key() === null, 'a tier picked in the load between cancels the second chance', show(q));

st = new Store({});
settledPage(st).lost();
new Page(st).leave();
p = settledPage(st);                               /* the second chance, and it runs */
p.hide();                                          /* and ends cleanly */
q = settledPage(st).lost();
w = new Page(st);
check(st.key() === 'ultra again' && w.on() === 'modern' && st.saved().quality === 'ultra',
  'a second chance that ran and ended cleanly is forgotten: the next loss is a first loss again', show(w));

st = new Store({});
p = new Page(st);
p.run(steady(500), 60000);
const stepped = p.on();
p.pick('ultra');
p.frames(400, 500);
const kept = p.on();
p.leave();
q = new Page(st);
q.run(steady(500), 60000);
check(stepped === 'modern' && kept === 'ultra' && p.g.settings.tierChosen === true && q.on() === 'modern' && q.said.join() === 'slow',
  'Ultra picked by hand after a step down is not argued with in that load; the load after watches again, and says why', show(p) + '; next ' + show(q));

/* --------------------------------------------------------------------------- */
console.log('R6  nobody passes through Ultra on the way from Modern to Retro');

st = new Store({});
p = settledPage(st);
r = [p.tap(), p.tap(), p.tap(), p.tap()];
check(r.join() === 'modern,retro,ultra,modern', 'the button steps Ultra, Modern, Retro, Ultra (was: from Modern the next step was Ultra)', r.join());

/* a device the game took Ultra away from: the button leaves it out until the
   player has been all the way round the other tiers once */
st = new Store({});
p = new Page(st);
p.run(steady(500), 60000);
const hint0 = T.tierHint(p.g);
r = [p.tap(), p.tap(), p.tap()];
const hint3 = T.tierHint(p.g), built3 = p.on();
check(r.join() === 'retro,modern,retro' && built3 === 'retro' && hint0 === 'round' && hint3 === 'offered' && st.saved().tierBarred === true,
  'after a step down three taps from Modern give Retro, Modern, Retro and never Ultra, and the hint says how to have it back (was: one tap from Modern built Ultra)',
  r.join() + ', hints ' + hint0 + ' then ' + hint3 + ', ' + show(p));
r = p.tap();
check(r === 'ultra' && p.on() === 'ultra' && p.g.trialOn && st.key() === 'ultra' && p.g.tierBarred === false && p.g.tierRound === false &&
  st.saved().tierBarred === false && st.saved().tierChosen === true && T.tierHint(p.g) === null,
  'the tap after that, all the way round once, is Ultra: on trial, the player\'s own, and no longer barred', r + ', ' + show(p));
r = [p.tap(), p.tap(), p.tap()];
check(r.join() === 'modern,retro,ultra', 'and from then on the button steps through all three again', r.join());

st = new Store({});
p = new Page(st);
p.run(steady(500), 60000);
p.tap();
p.leave();
q = new Page(st);
const startsIn = q.on(), hintQ = T.tierHint(q.g);
r = [q.tap(), q.tap()];
check(startsIn === 'retro' && q.g.tierBarred && hintQ === 'round' && r.join() === 'modern,retro' && q.on() === 'retro',
  'the load after a step down counts afresh: from Retro the taps give Modern, Retro, and Ultra is not built by them', startsIn + ', hint ' + hintQ + ', then ' + r.join());
r = q.tap();
check(r === 'ultra' && q.g.trialOn && st.saved().tierBarred === false, 'and the third tap in that load, once round, is Ultra', r + ', ' + show(q));

st = new Store({});
p = new Page(st);
p.run(steady(500), 60000);
r = p.flick(4);
const flicked = p.on(), flickKey = st.key();
p.g.settings.quality = p.on();                     /* the page is left inside the wait: nothing was picked */
p.leave();
q = new Page(st);
check(r.join() === 'retro,modern,retro,ultra' && flicked === 'modern' && flickKey === null && q.on() === 'modern' && q.g.tierBarred && q.g.tierRound === false,
  'four quick taps show Ultra and build nothing; left there, the next load is Modern, barred, and counts afresh', r.join() + ', on ' + flicked + ', then ' + show(q));

st = new Store({});
settledPage(st).lost();
p = new Page(st);
r = [p.g.tierBarred, st.saved().tierBarred, T.tierHint(p.g), T.tierTap(p.g)];
check(r.join() === 'true,false,round,retro', 'in the Modern load after a first loss a tap leaves Ultra out, and nothing about that is saved', r.join());

/* finding 7: clicked from Modern to Ultra, and the build took the tab down */
st = new Store({ [V2]: JSON.stringify({ quality: 'modern', tierChosen: true, defaults: 2 }) });
p = new Page(st);
p.g.settings.quality = 'ultra';
const o = T.tierPick(p.g);
st.set(KEY, o.key);                                /* the key is written, and the build never returns */
q = new Page(st);
check(o.key === 'ultra' && q.on() === 'modern' && q.g.tierBarred && T.tierTap(q.g) === 'retro' && st.key() === null,
  'Ultra clicked to from Modern, and the tab died building it: Modern, and the next tap leads to Retro', show(q));

/* --------------------------------------------------------------------------- */
console.log('R7  storage that is blocked or full');

st = new Store({}, 'blocked');
r = [];
for (let i = 0; i < 3; i++) { p = new Page(st); r.push(p.on()); }
p.pick('ultra').frames(200, 16.7);
q = new Page(st);
check(r.join() === 'modern,modern,modern' && p.on() === 'ultra' && q.on() === 'modern' && p.g.tierBarred === false,
  'storage blocked: every load starts in Modern, and Ultra picked by hand is on for that visit (was: Ultra on every load)', r.join() + '; picked: ' + p.on());

st = new Store({ [V2]: JSON.stringify({ quality: 'ultra', tierChosen: true, defaults: 2 }) }, 'full');
p = new Page(st);
check(p.on() === 'modern' && p.g.trialOn === false && T.tierTaps(p.g).indexOf('ultra') >= 0,
  'storage that reads and cannot be written: a saved Ultra starts in Modern, and the button still offers Ultra', show(p));

/* --------------------------------------------------------------------------- */
console.log('the key, as text');

r = T.tierKeyParse('ultra untried');
check(r && r.word === 'untried' && r.ms === 0, 'the mark an earlier copy of this build left, with no time in it, is read as no time used');
st = new Store({ [KEY]: 'ultra lost twice', [V2]: JSON.stringify({ quality: 'ultra', tierChosen: true, defaults: 2 }) });
p = new Page(st);
check(p.on() === 'modern' && p.said.join() === 'lost' && st.saved().quality === 'modern', 'a key an earlier copy left for a tier lost twice still turns it off', show(p));
check(T.tierKeyParse('modern') === null && T.tierKeyParse('ultra nonsense') === null && T.tierKeyParse('') === null && T.tierKeyParse(null) === null,
  'a key naming a light tier, an unknown word, or nothing at all is no key');
st = new Store({ [KEY]: 'ultra untried 2500', [V2]: JSON.stringify({ quality: 'retro', tierChosen: true, defaults: 2 }) });
p = new Page(st);
check(p.on() === 'retro' && st.key() === null && p.g.tierBarred === false, 'a mark for a tier that is not the saved one is dropped', show(p));

/* --------------------------------------------------------------------------- */
console.log('the defaults of 25 Nov 2026 (SETTINGS_DEFAULTS 3), and the randomiser');

st = new Store({});
p = new Page(st);
check(T.SETTINGS_DEFAULTS === 3 && st.saved().defaults === 3 && st.saved().steerSens === 1 && st.saved().quality === 'ultra' &&
  ['timeOfDay', 'weather', 'trackId'].every((f) => st.saved()[f] === 'random') && st.saved().steerChosen === false,
  'a new player: sensitivity 1, Ultra, hour, weather and circuit RANDOM, steering not chosen', JSON.stringify(st.saved()));

const TWO = { defaults: 2, steerSens: 6, timeOfDay: 'dusk', weather: 'clear', trackId: 'monaco-gp-v1', musicVol: 3, engineVol: 2,
  camMode: 2, engineOn: true, musicOn: false, quality: 'ultra', tierChosen: true, autoThrottle: true };
st = new Store({ [V2]: JSON.stringify(TWO) });
p = new Page(st);
r = st.saved();
check(r.steerSens === 1 && r.timeOfDay === 'random' && r.weather === 'random' && r.trackId === 'random' && r.defaults === 3 &&
  r.musicVol === 3 && r.engineVol === 2 && r.camMode === 2 && r.engineOn === true && r.musicOn === false && r.quality === 'ultra' && r.tierChosen === true,
  'saved under 2 with what the defaults were (6, dusk, clear, Monaco): moved to 1 and RANDOM, saved under 3; volumes, camera, music and engine kept', JSON.stringify(r));

st = new Store({ [V2]: JSON.stringify({ defaults: 2, steerSens: 4, timeOfDay: 'golden', weather: 'rain', trackId: 'silverstone-v1' }) });
p = new Page(st);
r = st.saved();
check(r.steerSens === 4 && r.timeOfDay === 'golden' && r.weather === 'rain' && r.trackId === 'silverstone-v1',
  'saved under 2 with anything else (4, golden, rain, Silverstone): every one was picked, and kept', JSON.stringify(r));

st = new Store({ [V2]: JSON.stringify(TWO) });
new Page(st).setting('steerSens', 6).setting('timeOfDay', 'dusk').setting('trackId', 'monaco-gp-v1');
p = new Page(st);
check(p.g.settings.steerSens === 6 && p.g.settings.timeOfDay === 'dusk' && p.g.settings.trackId === 'monaco-gp-v1',
  'the move is made once: 6, dusk and Monaco picked again after it are kept', JSON.stringify(st.saved()));

st = new Store({ [V2]: JSON.stringify({ defaults: 3, steerSens: 6, timeOfDay: 'dusk', weather: 'clear', trackId: 'monaco-gp-v1' }) });
p = new Page(st);
check(p.g.settings.steerSens === 6 && p.g.settings.timeOfDay === 'dusk' && p.g.settings.weather === 'clear' && p.g.settings.trackId === 'monaco-gp-v1',
  'saved under 3, the same values are choices and kept', JSON.stringify(p.g.settings));

st = new Store({ [V1]: JSON.stringify({ quality: 'modern', trackId: 'silverstone-v1', timeOfDay: 'midday', steerSens: 6, steerTilt: true, autoThrottle: false }) });
p = new Page(st);
r = p.g.settings;
check(r.steerSens === 1 && r.trackId === 'random' && r.timeOfDay === 'random' && r.quality === 'ultra' && r.steerChosen === true && r.throttleChosen === true,
  'saved with no number at all: the defaults of then move to today\'s; a saved tilt and a saved manual throttle were picked', JSON.stringify(r));

st = new Store({ [V2]: JSON.stringify({ defaults: 2, steerTilt: false, autoThrottle: true }) });
p = new Page(st);
check(p.g.settings.steerChosen === false && p.g.settings.throttleChosen === false,
  'a saved joystick and auto throttle from before 3 say nothing was picked, so a phone may be given tilt', JSON.stringify(p.g.settings));

['timeOfDay', 'weather', 'trackId'].forEach((f) => {
  st = new Store({ [V2]: JSON.stringify({ defaults: 3, [f]: 'random' }) });
  p = new Page(st);
  const kept = p.g.settings[f];
  st = new Store({ [V2]: JSON.stringify({ defaults: 2, [f]: 'random' }) });
  p = new Page(st);
  check(kept === 'random' && p.g.settings[f] === 'random', f + ': RANDOM is a value it may hold, and is kept', kept + ', ' + p.g.settings[f]);
});

/* the draw, with the rolls given */
const IDS = CIRCUITS;
const rolls = (list) => { let i = 0; const f = () => { f.used++; return list[i++ % list.length]; }; f.used = 0; return f; };
const RAND = { trackId: 'random', timeOfDay: 'random', weather: 'random' };

w = rolls([0.9, 0.9, 0.9]);
r = T.drawLoad(RAND, { firstVisit: true, ids: IDS }, w);
check(r.trackId === 'monaco-gp-v1' && r.timeOfDay === 'dusk' && r.weather === 'clear' && w.used === 0,
  'the very first visit is Monaco at dusk, clear, and nothing is rolled (FIRST_VISIT)', JSON.stringify(r));
r = T.drawLoad(RAND, { firstVisit: false, ids: IDS }, rolls([0.3, 0.3, 0.8]));
check(r.trackId === 'las-vegas-v1' && r.timeOfDay === 'midday' && r.weather === 'rain',
  'any other visit draws all three (rolls 0.3, 0.3, 0.8: Las Vegas, midday, rain)', JSON.stringify(r));
w = rolls([0.5]);
r = T.drawLoad({ trackId: 'silverstone-v1', timeOfDay: 'golden', weather: 'cloudy' }, { firstVisit: false, ids: IDS }, w);
check(r.trackId === 'silverstone-v1' && r.timeOfDay === 'golden' && r.weather === 'cloudy' && w.used === 0,
  'what is chosen is used, and nothing is rolled for it (the tools\' pages draw nothing)', JSON.stringify(r) + ', rolls ' + w.used);
r = T.drawLoad(RAND, { firstVisit: false, ids: IDS, next: 'indianapolis-v1', last: 'monaco-gp-v1' }, rolls([0.0]));
check(r.trackId === 'indianapolis-v1', 'a circuit drawn at the end of the last race is the one this load builds', r.trackId);

const tally = (fn) => { const t = {}; for (let i = 0; i < 1000; i++) { const n = fn((i + 0.5) / 1000); t[n] = (t[n] || 0) + 1; } return t; };
r = tally(T.drawHour);
check(Object.keys(r).length === 4 && Object.values(r).every((n) => n === 250), 'hours with equal weight: 1000 even rolls give 250 of each', JSON.stringify(r));
r = tally(T.drawWeather);
check(r.clear === 500 && r.cloudy === 250 && r.rain === 250, 'weather: clear twice as likely as cloudy or rain (500, 250, 250 of 1000)', JSON.stringify(r));
r = tally((x) => T.drawCircuit(IDS, 'silverstone-v1', x));
check(!r['silverstone-v1'] && Object.keys(r).length === 4 && Object.values(r).every((n) => n === 250),
  'circuits with equal weight, never the one before: four of 250 and no Silverstone', JSON.stringify(r));
let prev = 'monaco-gp-v1', twice = 0;
w = rolls([0.0, 0.99, 0.5, 0.25, 0.75, 0.1, 0.6, 0.33, 0.9, 0.05, 0.45, 0.66, 0.2, 0.8, 0.15, 0.95, 0.4, 0.7, 0.3, 0.55]);
for (let i = 0; i < 20; i++) { const n = T.drawLoad(RAND, { firstVisit: false, ids: IDS, last: prev }, w).trackId; if (n === prev) twice++; prev = n; }
check(twice === 0, 'twenty draws one after another never give the same circuit twice running', twice + ' repeats');
r = T.drawRace({ trackId: 'random', timeOfDay: 'random', weather: 'clear' }, { trackId: 'silverstone-v1', timeOfDay: 'dusk', weather: 'clear' }, rolls([0.0, 0.9]));
check(r.trackId === 'silverstone-v1' && r.timeOfDay === 'morning' && r.weather === 'clear',
  'another race in the same load draws the hour again, keeps a chosen weather, and keeps the circuit', JSON.stringify(r));

/* --------------------------------------------------------------------------- */
console.log('R1 and R8, read from the source');

check(!writesTo[V1], 'nothing in this whole run wrote the old settings key', (writesTo[V1] || 0) + ' writes');
const tiersSrc = read('src/38-tiers.js').replace(/\/\*[\s\S]*?\*\//g, '');
const reaches = ['document', 'window', 'performance', 'Date', 'localStorage', 'setTimeout', 'requestAnimationFrame'].filter((n) => new RegExp('\\b' + n + '\\b').test(tiersSrc));
check(reaches.length === 0, 'src/38-tiers.js names no page, no storage and no clock', 'it names ' + reaches.join(', '));
const gameSrc = read('src/40-game.js');
const tick = gameSrc.slice(gameSrc.indexOf('Game.prototype.tick = function'));
const tickBody = tick.slice(0, tick.indexOf('\nGame.prototype.', 10));
const inTick = ['countFrame', 'watchPace', 'tierAct', 'performance.now', 'Date.now', 'STORE'].filter((n) => tickBody.indexOf(n) >= 0);
check(tickBody.length > 200 && inTick.length === 0, 'Game.tick calls none of this and reads no clock', 'tick holds ' + inTick.join(', ') + ' (' + tickBody.length + ' characters read)');
check(gameSrc.indexOf(V1) < 0 && gameSrc.indexOf('SETTINGS_KEY_OLD') < 0,
  'src/40-game.js never names the old settings key', 'it does');
check(/steerSens: 1,[\s\S]*quality: 'ultra',\s+tierChosen: false,\s+tierBarred: false,\s+timeOfDay: RANDOM,\s+trackId: RANDOM,\s+weather: RANDOM,/.test(gameSrc),
  'the defaults of Game.loadSettings are the ones this file starts a page from');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
