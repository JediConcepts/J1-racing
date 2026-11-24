/* Turns three.js into one classic script that defines the global THREE.
 *
 *   node tools/vendor-three.js <webgl|webgpu> <workdir>
 *
 * WHY. The game is plain scripts that read a global called THREE, and
 * build.js inlines one vendored file to provide it. three.js stopped shipping
 * such a file: 0.187 is ES modules only. This tool bundles the entry for one
 * flavour (tools/three-entry.<flavour>.js, which lists what goes in) into
 * vendor/three.<flavour>.js and prints its byte size and SHA-256. It is run by
 * hand when the three.js version or an entry changes; `node build.js` never
 * runs it and needs no install.
 *
 * <workdir> is a folder OUTSIDE the repo that holds the two npm packages, in
 * its own node_modules. What is already there is used as it is. A package
 * that is missing, or there at another version, is fetched with npm into
 * <workdir>. Nothing is ever installed into the repo, and the repo's own
 * package.json is never read: it names three at ^0.185.1, which nothing uses.
 * Given the repo, a folder inside it, a folder the repo is inside, or any
 * folder that holds a .git entry, the tool stops before it does anything
 * (workdirRefusal below).
 *
 * The output depends only on the two versions below and the entry, so two
 * runs give the same bytes, whichever workdir they use. Change a version here
 * and nowhere else. */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const VERSIONS = { three: '0.187.0', esbuild: '0.28.2' };
const FLAVOURS = ['webgl', 'webgpu'];
const ROOT = fs.realpathSync(path.resolve(__dirname, '..'));

function stop(message, code) {
  console.error(message);
  process.exit(code === undefined ? 1 : code);
}

/* A folder and every folder above it, up to the top of the disk. */
function upwards(dir) {
  const list = [];
  for (let at = dir; ; at = path.dirname(at)) {
    list.push(at);
    if (path.dirname(at) === at) return list;
  }
}

/* Says why a folder cannot be the workdir, or returns null when it can.

   WHY IDENTITY. Two folders are the same folder when the disk says so (the
   same device and the same file number from fs.statSync), not when their
   paths are spelt the same. This disk ignores letter case and fs.realpathSync
   does not correct it, so the repo typed as /users/.../F1GAME is another
   string and the same folder. The first form of this check compared strings,
   let that spelling through, and npm would then have installed into the repo.
   The numbers are read as BigInt, because a file number can be larger than a
   plain number holds exactly.

   Refused:
   - the repo, or a folder inside it: the repo is met on the way up from the
     workdir. The way up starts from the real path, so a symlink is followed
     first.
   - a folder the repo is inside: the workdir is met on the way up from the
     repo. node looks in every node_modules above a script, so packages put
     there would reach the repo's own requires.
   - belt and braces, any folder that holds a .git entry, whatever it is.
   A check that cannot be made is a refusal as well. */
function workdirRefusal(workArg) {
  let work;
  try {
    if (!fs.statSync(workArg).isDirectory()) throw new Error('not a folder');
    work = fs.realpathSync(workArg);
  } catch (e) {
    return 'workdir is not a folder: ' + workArg + '\nMake an empty folder outside the repo and pass that.';
  }
  const refusing = 'Refusing to use ' + work + ' as the workdir: ';
  const advice = '\nNothing from npm is installed into the repo. Pass a folder outside it.';
  try {
    const identity = (dir) => fs.statSync(dir, { bigint: true });
    const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
    const repoId = identity(ROOT);
    const workId = identity(work);
    if (upwards(work).some((dir) => same(identity(dir), repoId))) {
      return refusing + 'it is the repo, or inside it.' + advice;
    }
    if (upwards(ROOT).some((dir) => same(identity(dir), workId))) {
      return refusing + 'the repo is inside it.' + advice;
    }
  } catch (e) {
    return refusing + 'it could not be compared with the repo (' + e.message + ').' + advice;
  }
  try {
    fs.lstatSync(path.join(work, '.git'));
    return refusing + 'it holds a .git entry.\nNothing from npm is installed into a repository. Pass a plain folder outside the repo.';
  } catch (e) {
    if (e.code !== 'ENOENT') return refusing + 'its .git entry could not be looked for (' + e.message + ').' + advice;
  }
  return null;
}

/* Required by another script, this file hands over the check and does nothing
   more, so the check can be tried on the repo itself without the tool ever
   running there. Run directly, it carries on as the tool. (A return at the
   top level is allowed in a CommonJS file: node runs it as a function body.) */
module.exports = { workdirRefusal: workdirRefusal };
if (require.main !== module) return;

const flavour = process.argv[2];
const workArg = process.argv[3];
if (process.argv.length !== 4 || FLAVOURS.indexOf(flavour) === -1) {
  stop('usage: node tools/vendor-three.js <webgl|webgpu> <workdir>', 2);
}

const refusal = workdirRefusal(workArg);
if (refusal) stop(refusal, 2);
const WORK = fs.realpathSync(workArg);

function installedVersion(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(WORK, 'node_modules', name, 'package.json'), 'utf8')).version;
  } catch (e) {
    return null;
  }
}

/* Fetch only what is missing or at another version. --prefix pins npm to the
   workdir: without it npm walks up to the nearest folder that has a
   package.json and installs there. */
const wanted = Object.keys(VERSIONS).filter((name) => installedVersion(name) !== VERSIONS[name]);
if (wanted.length) {
  const specs = wanted.map((name) => name + '@' + VERSIONS[name]);
  console.log('fetching ' + specs.join(' and ') + ' into ' + WORK);
  try {
    execFileSync('npm', ['install', '--prefix', WORK, '--no-audit', '--no-fund', '--save-exact'].concat(specs),
      { cwd: WORK, stdio: 'inherit' });
  } catch (e) {
    stop('npm could not fetch ' + specs.join(' and ') + ': ' + e.message);
  }
  for (const name of wanted) {
    if (installedVersion(name) !== VERSIONS[name]) {
      stop(name + ' is at ' + installedVersion(name) + ' in ' + WORK + ' after the fetch, wanted ' + VERSIONS[name]);
    }
  }
}

const PKG = path.join(WORK, 'node_modules', 'three');
/* An install that was cut short leaves an esbuild that will not load. That
   ends in one line, not a stack. (An esbuild without the binary for this
   machine, as in a workdir copied from another one, loads here and fails when
   the build starts: the catch at the foot of the file gives that its line.) */
let esbuild;
try {
  esbuild = require(path.join(WORK, 'node_modules', 'esbuild'));
} catch (e) {
  stop('vendor-three: esbuild in ' + WORK + ' could not be loaded (' + String(e && e.message).split('\n')[0] +
    '). Take esbuild out of its node_modules and run this again, which fetches it afresh.');
}

/* Where each `three...` import in an entry or an addon really is. This is
   spelt out, not left to node's rules, for two reasons: the entries live in
   the repo, where node would look for a node_modules beside them, and a path
   inside the package does not go through its export map. Any other bare
   import is an error, so nothing can be pulled in from anywhere else.

   One flavour, one build of the engine. In the WebGPU flavour a plain `three`
   means the WebGPU build as well: some addons on that path import `three` for
   a class or two (CSMFrustum.js takes Vector3 and Matrix4 from it), and sent
   to build/three.module.js that import drags the whole WebGL shader library
   into a file that never uses it. The WebGL flavour has no `three/webgpu` or
   `three/tsl` at all, so an addon written for the other renderer fails here
   and is not quietly bundled with a second engine. */
const BUILDS = flavour === 'webgpu'
  ? { 'three': 'build/three.webgpu.js', 'three/webgpu': 'build/three.webgpu.js', 'three/tsl': 'build/three.tsl.js' }
  : { 'three': 'build/three.module.js' };
const ADDONS = 'three/addons/';
const resolver = {
  name: 'three-from-the-workdir',
  setup(build) {
    build.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.kind === 'entry-point') return null;
      let file = null;
      if (BUILDS[args.path]) file = path.join(PKG, BUILDS[args.path]);
      else if (args.path.startsWith(ADDONS)) file = path.join(PKG, 'examples/jsm', args.path.slice(ADDONS.length));
      if (!file || !fs.existsSync(file)) {
        return { errors: [{ text: 'the ' + flavour + ' flavour of three@' + VERSIONS.three + ' has no file for the import "' + args.path + '"' }] };
      }
      return { path: file };
    });
  }
};

/* three.js's own licence header, read from the package so it is word for word
   what the package carries: the first comment of the build this flavour is
   made from. */
function licenceHeader() {
  const source = fs.readFileSync(path.join(PKG, BUILDS.three), 'utf8');
  const end = source.indexOf('*/');
  const header = source.slice(0, end + 2);
  if (!source.startsWith('/**') || end === -1 ||
      header.indexOf('Three.js Authors') === -1 || header.indexOf('SPDX-License-Identifier: MIT') === -1) {
    stop('three@' + VERSIONS.three + ' does not begin with the licence header this tool expects. Read the package before going on.');
  }
  return header;
}

(async () => {
  const out = path.join(ROOT, 'vendor', 'three.' + flavour + '.js');
  const result = await esbuild.build({
    entryPoints: [path.join(ROOT, 'tools', 'three-entry.' + flavour + '.js')],
    bundle: true,
    format: 'iife',
    globalName: 'THREE',
    minify: true,
    write: false,
    plugins: [resolver],
    /* Licence. The header goes first, and 'inline' keeps every @license
       comment where it stands in the code, so an addon that carries its own
       notice keeps it. (None of the addons in the entries has one today; the
       copies inside the file are the same header at the head of each three.js
       build file.) */
    banner: { js: licenceHeader() },
    legalComments: 'inline',
    /* The bundler writes `var THREE = ...`. In a page that is the global. In
       the node tests the file is run as the body of a function
       (`new Function(source)()` in test/physics.test.js), where a `var` is
       local and would be lost, so the last line hands it to the global object
       by name. In a page that line changes nothing. */
    footer: { js: 'globalThis.THREE=THREE;' },
    logLevel: 'warning'
  });
  const bytes = Buffer.from(result.outputFiles[0].contents);
  fs.writeFileSync(out, bytes);
  console.log('three ' + VERSIONS.three + ', esbuild ' + esbuild.version);
  console.log(path.relative(ROOT, out) + '  ' + bytes.length + ' bytes  sha256 ' +
    crypto.createHash('sha256').update(bytes).digest('hex'));
})().catch((e) => {
  /* esbuild has already printed what was wrong with the bundle */
  stop('vendor-three: ' + (e && e.message ? e.message.split('\n')[0] : e));
});
