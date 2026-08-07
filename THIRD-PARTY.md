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

## supabase-js

- Version: 2.110.9 (`vendor/supabase.js`)
- Upstream: <https://github.com/supabase/supabase-js>
- Licence: MIT

```
Copyright (c) 2020 Supabase
```

This one had to be restored. The minified distribution ships with no licence
header at all, so before `build.js` emitted the notice above, both the repo and
the deployed page carried supabase-js with no attribution whatsoever. That was
a real if minor licence breach, found during a security review of the
repository, and it is the reason the build now asserts on both notices instead
of trusting a vendor file to keep its own.

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
