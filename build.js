/* Bundles vendor/three.min.js + src/*.js into a playable page.
   Artifacts are served under a CSP that blocks every external host, so the
   library has to be inlined rather than linked.

   TWO outputs, and the difference matters:

     dist/artifact.html  A BARE FRAGMENT. The Artifact host wraps whatever you
                         give it in <!doctype html><head></head><body>, so this
                         file must NOT carry those tags itself.

     dist/index.html     A COMPLETE STANDALONE DOCUMENT for normal web hosting,
                         where nothing supplies that wrapper. Without a doctype
                         the browser falls into quirks mode, and without a
                         viewport meta every phone renders the page into a
                         ~980px virtual viewport and scales it down — which
                         breaks the game on mobile before touch input is even
                         reached. Shipping the fragment to a real web server is
                         exactly the bug this split exists to prevent. */

const fs = require('fs');
const path = require('path');

const root = __dirname;
const SRC = [
  /* First: 20-track.js and 30-cars.js call dsin/dcos/dtan/datan2 instead of
     the built-ins, so the whole simulation produces identical bits on every
     JS engine. That is what makes a submitted lap verifiable server-side. */
  'src/05-fpmath.js',
  'src/10-core.js',
  'src/20-track.js',
  'src/30-cars.js',
  'src/35-mobile.js',
  /* Must precede 40-game.js: boot() runs at the end of that file, and
     prototype assignments do not hoist the way declarations do. */
  'src/36-cloud.js',
  'src/40-game.js'
];

function read(p) {
  return fs.readFileSync(path.join(root, p), 'utf8');
}

const three = read('vendor/three.min.js');
const supabase = read('vendor/supabase.js');
const template = read('src/index.template.html');

/* Public by design — this key ships in every browser that loads the game.
   What protects the data is the RLS and the revoked grants in
   supabase/migrations/0001_leaderboard.sql, not this string being secret.
   The service_role key must NEVER appear here; it lives only in Edge
   Function environment variables. */
const CLOUD = {
  url: 'https://goqhiuxpinzltzxbjgug.supabase.co',
  key: 'sb_publishable_MD1h-WEKI5xqWtLEk_OIOA_T-i77YHW'
};

/* Where the standalone build is actually served. Open Graph and canonical
   tags need ABSOLUTE urls — a relative og:image is simply ignored by every
   scraper, which is the usual reason a shared link shows no preview. */
const SITE = {
  url: 'https://jediconcepts.com/mcl64/',
  image: 'https://jediconcepts.com/mcl64/share.png',
  imageW: 1200,
  imageH: 630,
  name: 'MCL-64 — Papaya Grand Prix',
  author: 'Jamie Easterman',
  publisher: 'Jedi Concepts',
  description:
    'A Formula 1 racer built the way a 1997 console would have built it: 240p, a ' +
    'five-bit dither, three laps of a stylised Silverstone against a full grid. ' +
    'Plays in a browser, on desktop or phone, with a global leaderboard.'
};

const game = SRC.map(f => '\n/* ===== ' + f + ' ===== */\n' + read(f)).join('\n');
const wrapped = '(function(){\n"use strict";\n' + game + '\n})();\n';

/* A literal </script> anywhere in the payload would close the tag early. */
for (const [label, body] of [['three.min.js', three], ['supabase.js', supabase], ['game', wrapped]]) {
  if (/<\/script/i.test(body)) {
    throw new Error('Refusing to build: ' + label + ' contains a literal </script>');
  }
}

const cloudBlob = supabase + '\nwindow.MCL64_CLOUD = ' + JSON.stringify(CLOUD) + ';\n';

function render(cloud) {
  return template
    .replace('/*INJECT_THREE*/', () => three)
    .replace('/*INJECT_CLOUD*/', () => cloud)
    .replace('/*INJECT_GAME*/', () => wrapped);
}

/* The Artifact host's CSP blocks every external origin, so Supabase can never
   be reached from there. Shipping the SDK into that build would cost 51 KB
   gzipped to power a feature that cannot work — so the artifact gets nothing,
   and the game detects the absent config and hides all account UI. */
const fragment = render('');
const standaloneSource = render(cloudBlob);

/* Lift <title> and <style> out of the fragment so the standalone build can put
   them where they belong. A <title> stranded in <body> is invalid, and browsers
   are inconsistent about honouring it. */
const titleMatch = standaloneSource.match(/<title>([\s\S]*?)<\/title>/i);
const styleMatch = standaloneSource.match(/<style>[\s\S]*?<\/style>/i);
if (!titleMatch || !styleMatch) {
  throw new Error('Refusing to build: template is missing its <title> or <style> block');
}

const pageTitle = titleMatch[1].trim();
const styleBlock = styleMatch[0];
const bodyOnly = standaloneSource
  .replace(titleMatch[0], '')
  .replace(styleBlock, '')
  .trim();

const HEAD = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<!-- Without this the page is laid out in a ~980px virtual viewport on phones
     and scaled down, which makes every touch target land in the wrong place.
     viewport-fit=cover lets the layout reach under notches; the CSS then pads
     itself back out with env(safe-area-inset-*). -->
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#ff8000" />
<meta name="color-scheme" content="dark light" />
<meta name="description" content="${SITE.description}" />
<link rel="canonical" href="${SITE.url}" />

<!-- Open Graph: what a link looks like when pasted into a chat, a post or a
     message. Without og:image most platforms render a bare grey rectangle. -->
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Jedi Concepts" />
<meta property="og:url" content="${SITE.url}" />
<meta property="og:title" content="${SITE.name}" />
<meta property="og:description" content="${SITE.description}" />
<meta property="og:image" content="${SITE.image}" />
<meta property="og:image:width" content="${SITE.imageW}" />
<meta property="og:image:height" content="${SITE.imageH}" />
<meta property="og:image:alt" content="A papaya Formula 1 car mid-corner on a stylised Silverstone, rendered in a late-1990s console style." />
<meta property="og:locale" content="en_GB" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${SITE.name}" />
<meta name="twitter:description" content="${SITE.description}" />
<meta name="twitter:image" content="${SITE.image}" />

<meta name="author" content="${SITE.author}" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="MCL-64" />
<title>${pageTitle}</title>

<!-- Structured data. Tells a search engine this is a playable game rather
     than an article about one, which is what earns the richer result. -->
<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'VideoGame',
  name: SITE.name,
  alternateName: 'MCL-64',
  url: SITE.url,
  image: SITE.image,
  description: SITE.description,
  genre: ['Racing', 'Simulation', 'Arcade'],
  gamePlatform: 'Web browser',
  playMode: 'SinglePlayer',
  applicationCategory: 'Game',
  operatingSystem: 'Any (web browser)',
  inLanguage: 'en-GB',
  author: { '@type': 'Person', name: SITE.author },
  publisher: { '@type': 'Organization', name: SITE.publisher },
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' }
}, null, 2)}
</script>
${styleBlock}
</head>
<body>
`;

const FOOT = `
</body>
</html>
`;

const standalone = HEAD + bodyOnly + FOOT;

const distDir = path.join(root, 'dist');
fs.mkdirSync(distDir, { recursive: true });

const outputs = [
  ['artifact.html', fragment, 'fragment for the Artifact host'],
  ['index.html', standalone, 'standalone document for web hosting']
];

for (const [name, content, note] of outputs) {
  fs.writeFileSync(path.join(distDir, name), content);
  const kb = (Buffer.byteLength(content) / 1024).toFixed(0);
  console.log(`  dist/${name.padEnd(14)} ${String(kb).padStart(4)} KB   ${note}`);
}

/* Guard the invariant both ways, so the two builds can never be swapped. */
const problems = [];
if (/<!doctype/i.test(fragment)) problems.push('artifact.html must NOT contain a doctype');
if (/<body[\s>]/i.test(fragment)) problems.push('artifact.html must NOT contain a <body> tag');
if (!/<!doctype html>/i.test(standalone)) problems.push('index.html is missing its doctype');
if (!/name="viewport"/i.test(standalone)) problems.push('index.html is missing its viewport meta');
if (!/<title>/i.test(standalone.split('</head>')[0])) problems.push('index.html has no <title> in <head>');
/* The artifact must never carry the cloud layer: its CSP blocks Supabase, so
   the SDK would be 51 KB of dead weight and the key would be published for
   nothing. Assert it stayed out. */
/* Check for the ASSIGNMENT, not the identifier: 50-cloud.js legitimately
   mentions window.MCL64_CLOUD in both builds, because that is exactly how it
   detects that the config is absent. */
const CLOUD_ASSIGN = 'window.MCL64_CLOUD = ';
if (fragment.indexOf(CLOUD_ASSIGN) !== -1) problems.push('artifact.html must NOT contain the cloud config');
if (fragment.indexOf(CLOUD.key) !== -1) problems.push('artifact.html must NOT contain the publishable key');
if (fragment.indexOf(CLOUD.url) !== -1) problems.push('artifact.html must NOT contain the project URL');
if (standalone.indexOf(CLOUD_ASSIGN) === -1) problems.push('index.html is missing the cloud config');
if (standalone.indexOf(CLOUD.key) === -1) problems.push('index.html is missing the publishable key');
if (problems.length) throw new Error('Build invariant failed:\n  - ' + problems.join('\n  - '));

console.log('\n  invariants OK — fragment stays bare, standalone is a full document');
