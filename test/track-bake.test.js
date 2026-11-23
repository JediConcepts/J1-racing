/* The baked circuit centrelines (src/12-trackdata.js) must equal a fresh
 * sampling with the vendored r128 CatmullRomCurve3, and every number must
 * survive a text round trip. If this fails after a three.js change, the
 * engine moved the samples: that is the lap time drift this data exists to
 * prevent. Rebake only on purpose, with node tools/bake-tracks.js.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { makeReporter } = require('./lib/sim');
const { sampleWithThree } = require('../tools/bake-tracks');

const REPO = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const t = makeReporter();

let body = '';
for (const f of ['src/05-fpmath.js', 'src/10-core.js', 'src/12-trackdata.js', 'src/20-track.js']) body += '\n;/* ' + f + ' */\n' + read(f);

sampleWithThree({ control: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]] });   /* forces the vendor load */
const api = new Function('THREE', body + '\nreturn { TRACKS: TRACKS, TRACK_BAKED: TRACK_BAKED };')(global.THREE);

for (const def of api.TRACKS) {
  const fresh = sampleWithThree(def);
  const b = api.TRACK_BAKED[def.geom];
  let same = !!b && b.n === 900 && b.x.length === 900 && b.y.length === 900 && b.z.length === 900;
  for (let i = 0; same && i < 900; i++) same = b.x[i] === fresh[i].x && b.y[i] === fresh[i].y && b.z[i] === fresh[i].z;
  t.assert(same, def.name + ' baked centreline equals a fresh r128 sampling', '');
  t.assert(!!b && b.x.concat(b.y, b.z).every((v) => Number(String(v)) === v), def.name + ' numbers round trip', '');
}

t.done();
