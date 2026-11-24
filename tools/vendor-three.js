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
 * Given the repo, or a folder inside it, the tool stops before it does
 * anything.
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

const flavour = process.argv[2];
const workArg = process.argv[3];
if (process.argv.length !== 4 || FLAVOURS.indexOf(flavour) === -1) {
  stop('usage: node tools/vendor-three.js <webgl|webgpu> <workdir>', 2);
}

/* The workdir is checked by its real path, so a symlink into the repo is
   caught as well. */
if (!fs.existsSync(workArg) || !fs.statSync(workArg).isDirectory()) {
  stop('workdir is not a folder: ' + workArg + '\nMake an empty folder outside the repo and pass that.', 2);
}
const WORK = fs.realpathSync(workArg);
if (WORK === ROOT || WORK.startsWith(ROOT + path.sep)) {
  stop('Refusing to use ' + WORK + ' as the workdir: it is the repo, or inside it.\n' +
    'Nothing from npm is installed into the repo. Pass a folder outside it.', 2);
}

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
const esbuild = require(path.join(WORK, 'node_modules', 'esbuild'));

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
