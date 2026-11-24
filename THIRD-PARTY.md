# Third-party notices

This project bundles two libraries. Both are MIT, and MIT requires their
copyright and permission notices to travel with every copy — including the
single-file build in `dist/`, which inlines both of them.

`build.js` emits these notices into the build output and **asserts they are
present**, because an unattributed dependency is a licence breach rather than a
cosmetic omission, and a silent one: minifiers strip comments, and the way you
find out is never pleasant.

---

## three.js

- Version: 0.187.0, the WebGPU flavour (`vendor/three.bundle.js`)
- Upstream: <https://github.com/mrdoob/three.js>
- Licence: MIT

What is vendored. three.js no longer ships a single script that defines a
global, which is what this game is built on, so the vendored file is made from
the npm package `three@0.187.0` by `tools/vendor-three.js`. It holds the names
listed in `tools/three-entry.webgpu.js` and nothing else: the WebGPU renderer,
which carries its own WebGL 2 fallback, and the parts of the node system the
game uses. They are bundled and minified with esbuild 0.28.2 into one classic
script. Nothing in it is edited by hand. It is 853,640 bytes, SHA-256
`2e8ae995106f0b89b907a1330c957e28b6a100ee778227590d43b129abd53325`.

How it is rebuilt, by hand, when the release or the entry changes:

```bash
node tools/vendor-three.js webgpu <a folder outside the repo>
mv vendor/three.webgpu.js vendor/three.bundle.js
```

The tool fetches the two packages into that folder if they are not there, and
never installs anything into the repo. The same release and entry give the
same bytes. Before a rebuilt bundle is committed, read "The engine" in
`CLAUDE.md`: a newer release is not a drop in.

The vendored file begins with the package's own `@license` header, reproduced
here as it ships:

```
Copyright 2010-2026 Three.js Authors
SPDX-License-Identifier: MIT
```

After that header the tool writes one line that names the release. `build.js`
takes the version and the copyright line of the notice it emits from the head
of the vendored file, not from a string of its own, and refuses to build if
the file does not say which release it is or says another one than 0.187. (The
notice used to be typed into `build.js`, and read "r131" over a vendored r128.)
What MIT asks you to preserve is the notice on the copy you actually received,
and this is that notice.

A second, older three.js is in the repo and is NOT in the built page:
`tools/vendor/three-r128.min.js`, r128, with its own header (`Copyright
2010-2021 Three.js Authors`, MIT). The game ran on it until the move to 0.187.
`tools/bake-tracks.js` still samples the circuits with it, so that the baked
track data does not move with the engine, and `test/track-bake.test.js` checks
that through the same tool. Nothing in `dist/` carries it.

The permission notice that copyright line refers to, in full:

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## supabase-js

- Version: 2.110.9 (`vendor/supabase.js`)
- Upstream: <https://github.com/supabase/supabase-js>
- Licence: MIT

```
MIT License

Copyright (c) 2020 Supabase

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

This one had to be restored twice. The minified distribution ships with no
licence header at all, so before `build.js` emitted a notice both the repo and
the deployed page carried supabase-js with no attribution whatsoever — found
during a security review. The first fix emitted only the copyright line and an
`MIT` label, which is not what the licence asks for: MIT requires the copyright
notice **and this permission notice** to accompany copies. An external audit
caught that the shipped page contained zero occurrences of "Permission is hereby
granted". The build now emits and asserts the complete terms.

Only the standalone build inlines supabase-js. The Artifact fragment
deliberately excludes it — that host's CSP blocks every external origin, so the
SDK would be dead weight there — so the fragment carries the three.js notice
only, and the invariants check each build for exactly the notices it should have.

---

## What is not covered by this project's licence

`LICENSE` is a copyright licence over the code in this repository. It grants no
rights in anyone's trade marks, and it cannot: this is an unofficial fan
project, and the names, liveries, colour schemes and circuit names it evokes
belong to their respective owners. Nothing here is endorsed by or affiliated
with any racing team, series, circuit or sponsor.
