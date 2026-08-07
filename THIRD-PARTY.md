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

- Version: r131 (`vendor/three.min.js`)
- Upstream: <https://github.com/mrdoob/three.js>
- Licence: MIT

The vendored file carries its own `@license` header, reproduced here as it ships:

```
Copyright 2010-2021 Three.js Authors
SPDX-License-Identifier: MIT
```

Note this is the notice for the **bundled** revision. Upstream now reads
`Copyright © 2010-2026 three.js authors`; what MIT asks you to preserve is the
notice on the copy you actually received, so the 2021 line is the correct one
to carry until the vendored file is updated.

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
