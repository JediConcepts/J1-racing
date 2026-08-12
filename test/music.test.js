/* What the music scheduler actually emits, per theme.
 *
 *   node test/music.test.js
 *   node test/music.test.js --emit     (print digests, for updating this file)
 *
 * WHAT THIS IS FOR. Adding Monaco's waltz meant generalising tickMusic: the
 * pattern length and the bar length stopped being the constants 32 and 8 and
 * became derived from the theme's own arrays, the chord gained a comp pattern
 * so it can hit on beats two and three instead of only on the downbeat, the
 * lead gained a detuned second voice, and the kick and snare arrays became
 * velocities rather than bare flags.
 *
 * Every one of those is a change to code the three EXISTING themes run through.
 * A waltz that plays correctly while quietly moving papaya's backbeat is not a
 * feature, it is a regression with a nice tune over it — and nobody would hear
 * it, because you would have to A/B two builds of a background loop to notice.
 *
 * So the three existing themes are pinned to a digest of their whole scheduled
 * event stream: every tone and drum call, its step, and every argument. The
 * digests below were captured BEFORE the generalisation. If a refactor moves a
 * single note, changes one gain, or drops one hi-hat, they stop matching.
 *
 * Monaco is asserted against the SHAPE it is supposed to have — 3/4, oom on the
 * downbeat, pah-pah on two and three — rather than against a digest of itself.
 * A digest of new code only records what that code already does, which catches
 * a later regression but cannot tell you the thing was right to begin with.
 *
 * No DOM and no Web Audio: tickMusic is driven directly with a fake clock, and
 * tone/drum are replaced with recorders, so this tests the scheduling contract
 * without stubbing an oscillator graph.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');

/* 05-fpmath and 10-core are plain: no THREE, no document, no window. */
const api = (function () {
  let body = '';
  for (const f of ['src/05-fpmath.js', 'src/10-core.js']) {
    body += '\n;/* ' + f + ' */\n' + read(f);
  }
  const names = ['EngineAudio', 'MUSIC_THEMES', 'midiFreq'];
  return new Function(
    body + '\nreturn {' + names.map((n) => n + ': typeof ' + n + ' !== "undefined" ? ' + n + ' : undefined').join(',') + '};'
  )();
})();

const { EngineAudio, MUSIC_THEMES, midiFreq } = api;

let pass = 0, fail = 0;
const ok  = (m) => { console.log('  PASS  ' + m); pass++; };
const bad = (m, d) => { console.log('  FAIL  ' + m + '\n        ' + d); fail++; };
const is  = (m, got, want) => (String(got) === String(want) ? ok(m) : bad(m, 'got ' + got + ', wanted ' + want));

/* --------------------------------------------------------------------------
   Drive tickMusic with a fake clock and record every scheduled event.

   tone/drum are replaced rather than stubbed at the Web Audio layer: what is
   under test is which note is asked for, when, and how loudly — not how an
   oscillator is wired, which no theme can affect.
   -------------------------------------------------------------------------- */
function render(themeName) {
  const th = MUSIC_THEMES[themeName];
  if (!th) throw new Error('no such theme: ' + themeName);

  const events = [];
  const r = (n) => Math.round(n * 10000) / 10000;

  const fake = {
    ready: true,
    musicMuted: false,
    musicVol: 1,
    theme: th,
    musicStep: 0,
    musicNext: 0,
    ctx: { currentTime: 0 },
    musicBus: { gain: { value: 1, setTargetAtTime() {} } },
    initMusic() {},
    tone(t, freq, dur, type, vol, cutoff) {
      events.push(['tone', this.musicStep, r(t), r(freq), r(dur), type, r(vol), cutoff]);
    },
    drum(t, kind, vel) {
      /* Normalised, not recorded raw. An omitted velocity and an explicit 1
         are the same sound, and the pin has to mean "nothing changed that you
         could hear" — otherwise generalising the call signature would read as
         a regression in all three themes while every note stayed put. */
      events.push(['drum', this.musicStep, r(t), kind, vel === undefined ? 1 : r(vel)]);
    }
  };

  /* One full loop of the pattern. The scheduler works a 0.25 s lookahead, so
     advance the clock in steps smaller than that and let it fill in. */
  const n = th.bass.length;
  const stepDur = 30 / th.bpm;
  const total = n * stepDur;
  for (let c = 0; fake.ctx.currentTime < total + stepDur; c++) {
    EngineAudio.prototype.tickMusic.call(fake, 1);
    fake.ctx.currentTime = r(fake.ctx.currentTime + 0.1);
    if (c > 4000) throw new Error('scheduler did not advance for ' + themeName);
  }

  /* Trim to exactly one loop so the digest does not depend on how far the
     lookahead happened to run past the end. */
  const oneLoop = events.filter((e) => e[2] < r(total));
  return { events: oneLoop, n, stepDur, th };
}

const digest = (events) =>
  crypto.createHash('sha256').update(JSON.stringify(events)).digest('hex').slice(0, 16);

/* --------------------------------------------------------------------------
   Digests captured before Monaco's waltz generalised the scheduler.
   Regenerate deliberately with --emit, never to make a red test go green.
   -------------------------------------------------------------------------- */
const PINNED = {
  papaya:   'fc2518391cc19b03',
  speedway: 'fd7463be1e4eefe4',
  downland: '0449ae3997ff342d'
};

if (process.argv.includes('--emit')) {
  for (const name of Object.keys(MUSIC_THEMES)) {
    console.log('  ' + name.padEnd(10) + digest(render(name).events));
  }
  process.exit(0);
}

/* --------------------------------------------------------------------------- */
console.log('the themes that already shipped are untouched');
for (const name of Object.keys(PINNED)) {
  is(name + ' schedules exactly what it did before', digest(render(name).events), PINNED[name]);
}

/* --------------------------------------------------------------------------- */
console.log('');
console.log('every theme is internally consistent');
for (const name of Object.keys(MUSIC_THEMES)) {
  const th = MUSIC_THEMES[name];
  const n = th.bass.length;
  const sameLength = th.lead.length === n && th.kick.length === n && th.snare.length === n;
  is(name + ' voices are all one pattern long', sameLength, true);
  /* barSteps is derived as n / chords.length, so a pattern that does not
     divide by its chord count would silently index a fractional bar. */
  is(name + ' divides into whole bars', n % th.chords.length, 0);
  is(name + ' has three notes per chord',
    th.chords.every((c) => c.length === 3), true);
}

/* --------------------------------------------------------------------------- */
console.log('');
console.log('Monaco is a waltz (0017)');
const mo = render('monaco');
const barSteps = mo.n / mo.th.chords.length;
is('four bars of six eighth-notes', mo.n + '/' + barSteps, '24/6');
is('three beats to the bar', barSteps / 2, 3);

/* The oom: bass on beat one of every bar and nowhere else on a downbeat's
   neighbours. The pickup at the end of a bar is deliberate and allowed. */
const bassSteps = mo.th.bass.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0);
is('bass lands on every downbeat',
  [0, 6, 12, 18].every((s) => bassSteps.includes(s)), true);
is('bass never lands on beat two or three',
  bassSteps.some((s) => s % barSteps === 2 || s % barSteps === 4), false);

/* The pah-pah: the chord sounds on beats two and three, not on the downbeat.
   That inversion is the whole character of the style. */
is('chord comps on beats two and three', String(mo.th.comp), String([2, 4]));
is('chord is staccato, not a pad', mo.th.compDur < 0.25, true);

const chordEvents = mo.events.filter((e) => e[0] === 'tone' && e[4] === mo.th.compDur);
is('four bars of two comps, three notes each', chordEvents.length, 4 * 2 * 3);
is('no chord on any downbeat',
  chordEvents.some((e) => e[1] % barSteps === 0), false);

/* The reed. Musette tuning is two reeds beating against each other, so every
   lead note must be voiced twice, at a slight offset and never in unison. */
const leadNotes = mo.th.lead.filter((v) => v != null).length;
const leadEvents = mo.events.filter((e) => e[0] === 'tone' && e[5] === mo.th.leadWave && e[7] === 2600);
is('every lead note is voiced twice', leadEvents.length, leadNotes * 2);
is('the two reeds are detuned', mo.th.detune > 1, true);
is('detune is a beat, not a bad note', mo.th.detune < 1.02, true);

/* The backbeat, kept deliberately soft so it sits under the accordion. */
const snareHits = mo.th.snare.filter((v) => v > 0);
is('snare on two and three of every bar', snareHits.length, 8);
is('snare is softer than a full hit', snareHits.every((v) => v < 1), true);
is('kick only on the downbeat',
  mo.th.kick.map((v, i) => (v ? i : -1)).filter((i) => i >= 0).join(','), '0,6,12,18');

/* --------------------------------------------------------------------------- */
console.log('');
console.log('velocity is backward compatible');
is('older themes still use plain 1 hits',
  ['papaya', 'speedway', 'downland'].every((t) =>
    MUSIC_THEMES[t].kick.every((v) => v === 0 || v === 1) &&
    MUSIC_THEMES[t].snare.every((v) => v === 0 || v === 1)), true);

/* --------------------------------------------------------------------------- */
console.log('');
console.log('the tune is in key');
const GM_HARMONIC = [7, 9, 10, 0, 2, 3, 6];   /* G A Bb C D Eb F#, pitch classes */
const outOfKey = mo.th.lead.concat(mo.th.bass)
  .filter((v) => v != null)
  .filter((v) => !GM_HARMONIC.includes(v % 12));
is('every note is in G harmonic minor', outOfKey.join(','), '');

/* --------------------------------------------------------------------------- */
console.log('');
console.log('assertions: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
