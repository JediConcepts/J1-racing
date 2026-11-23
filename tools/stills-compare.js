/* Compares two sets of stills.
 *
 *   node tools/stills-compare.js <dirA> <dirB> [--max 6]
 *
 * For every .png file name present in both folders, prints the mean absolute
 * difference of each colour channel (R, G, B, on a scale of 0 to 255) and the
 * share of pixels where any channel differs by more than 24. Exits 1 if any
 * channel mean is above --max, if a pair differs in size, or if no file name
 * is common to both folders (nothing compared is not a pass). Files present
 * on one side only are named, and do not by themselves fail the run.
 *
 * The decoding and the arithmetic run in a browser page through Playwright,
 * so no image library is needed. Needs Playwright on NODE_PATH; see
 * tools/browser.js. */
'use strict';

const fs = require('fs');
const path = require('path');
const { requirePlaywright } = require('./browser');

const argv = process.argv.slice(2);
const dirs = [];
let max = 6;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--max') max = Number(argv[++i]);
  else dirs.push(argv[i]);
}
if (dirs.length !== 2 || !isFinite(max)) {
  console.error('usage: node tools/stills-compare.js <dirA> <dirB> [--max 6]');
  process.exit(2);
}

const [dirA, dirB] = dirs.map((d) => path.resolve(d));
const pngs = (d) => fs.readdirSync(d).filter((f) => f.endsWith('.png'));
const inA = new Set(pngs(dirA));
const inB = new Set(pngs(dirB));
const names = pngs(dirA).filter((f) => inB.has(f)).sort();
const onlyA = pngs(dirA).filter((f) => !inB.has(f)).sort();
const onlyB = pngs(dirB).filter((f) => !inA.has(f)).sort();
function nameMissing() {
  for (const f of onlyA) console.log('only in A  ' + f);
  for (const f of onlyB) console.log('only in B  ' + f);
}
if (!names.length) {
  nameMissing();
  console.error('no file names in common between ' + dirA + ' and ' + dirB);
  process.exit(1);
}

(async () => {
  const { chromium } = requirePlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent('<!doctype html><title>compare</title>');

  let over = false;
  console.log('mean absolute difference per channel (0 to 255), share of pixels off by more than 24, --max ' + max);
  for (const name of names) {
    const a = fs.readFileSync(path.join(dirA, name)).toString('base64');
    const b = fs.readFileSync(path.join(dirB, name)).toString('base64');
    const r = await page.evaluate(async ([a64, b64]) => {
      async function pixels(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }),
          { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
        const cv = document.createElement('canvas');
        cv.width = bmp.width; cv.height = bmp.height;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(bmp, 0, 0);
        return { w: bmp.width, h: bmp.height, d: ctx.getImageData(0, 0, bmp.width, bmp.height).data };
      }
      const A = await pixels(a64), B = await pixels(b64);
      if (A.w !== B.w || A.h !== B.h) return { size: [A.w, A.h, B.w, B.h] };
      const sum = [0, 0, 0];
      let off = 0;
      const n = A.w * A.h;
      for (let p = 0; p < n * 4; p += 4) {
        let worst = 0;
        for (let c = 0; c < 3; c++) {
          const d = Math.abs(A.d[p + c] - B.d[p + c]);
          sum[c] += d;
          if (d > worst) worst = d;
        }
        if (worst > 24) off++;
      }
      return { mean: sum.map((s) => s / n), off: off / n };
    }, [a, b]);

    if (r.size) {
      console.log('SIZE  ' + name + '  ' + r.size[0] + 'x' + r.size[1] + ' against ' + r.size[2] + 'x' + r.size[3]);
      over = true;
      continue;
    }
    const bad = r.mean.some((m) => m > max);
    if (bad) over = true;
    console.log((bad ? 'OVER  ' : 'ok    ') + name.padEnd(46) +
      '  R ' + r.mean[0].toFixed(3) + '  G ' + r.mean[1].toFixed(3) + '  B ' + r.mean[2].toFixed(3) +
      '  >24: ' + (r.off * 100).toFixed(3) + '%');
  }
  nameMissing();
  console.log(names.length + ' compared' + (onlyA.length || onlyB.length ? ', ' + onlyA.length + ' only in A, ' + onlyB.length + ' only in B' : ''));
  await browser.close();
  process.exit(over ? 1 : 0);
})();
