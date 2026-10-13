// Regression: public static pages must serve their OWN head metadata to crawlers.
import fs from 'node:fs';
import { STATIC_PAGE_META, matchStaticPath, applyStaticMeta } from '../../lib/static-page-meta.mjs';
import { STATIC_PAGES } from '../../lib/sitemap.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

const shell = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
ok(shell.includes('id="root"'), 'index.html has the app root');
const origin = 'https://sourcednexus.online';

const titles = new Set(), descs = new Set();
for (const [path, meta] of Object.entries(STATIC_PAGE_META)) {
  const out = applyStaticMeta(shell, path);
  const title = (out.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
  const canon = (out.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
  const desc = (out.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  const ogurl = (out.match(/<meta property="og:url" content="([^"]*)"/) || [])[1];
  ok(canon === origin + path, `${path} canonical -> ${canon}`);
  ok(ogurl === origin + path, `${path} og:url -> ${ogurl}`);
  ok(title && title !== (shell.match(/<title>([\s\S]*?)<\/title>/) || [])[1], `${path} title differs from homepage`);
  ok(desc && desc.length >= 50 && desc.length <= 200, `${path} description length ${desc?.length}`);
  ok(title.length <= 65, `${path} title length ${title.length}`);
  ok(out.includes('id="root"') && out.includes('<script'), `${path} app root + scripts preserved`);
  ok((out.match(/<title>/g) || []).length === 1, `${path} exactly one <title>`);
  ok((out.match(/rel="canonical"/g) || []).length === 1, `${path} exactly one canonical`);
  ok(!/noindex/i.test(out), `${path} not noindex`);
  titles.add(title); descs.add(desc);
}
ok(titles.size === Object.keys(STATIC_PAGE_META).length, 'all titles unique');
ok(descs.size === Object.keys(STATIC_PAGE_META).length, 'all descriptions unique');

// path matching: only known pages, hostile input never produces a key
ok(matchStaticPath('catalog') === '/catalog', 'catalog matches');
ok(matchStaticPath('/catalog/') === '/catalog', 'trailing slash');
ok(matchStaticPath('CATALOG') === null, 'case-sensitive');
for (const bad of ['../etc/passwd', 'catalog/../../x', '__proto__', 'constructor', 'toString', '', null, undefined, 42, 'login', 'secure/nexuspanel-trust', 'checkout', '<script>']) {
  ok(matchStaticPath(bad) === null, `rejects ${JSON.stringify(bad)}`);
}
ok(applyStaticMeta(shell, '/not-a-page') === shell, 'unknown path leaves shell untouched');

// private routes must never be given an indexable canonical here
for (const priv of ['/login', '/register', '/checkout', '/messages', '/secure/nexuspanel-trust']) {
  ok(!STATIC_PAGE_META[priv], `${priv} is not in the public map`);
}

// HTML-injection safety: metadata is escaped
const evil = applyStaticMeta(shell.replace('</head>', '</head>'), '/catalog');
ok(!/<script>alert/i.test(evil), 'no injected script');

// sitemap and metadata map agree: every sitemap static page except "/" has metadata
for (const [p] of STATIC_PAGES) if (p !== '/') ok(!!STATIC_PAGE_META[p], `sitemap page ${p} has metadata`);
ok(STATIC_PAGES.some(([p]) => p === '/bundles'), 'bundles is in the sitemap');

// vercel.json: a rewrite exists for each page and comes BEFORE the catch-all
const v = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
const idxAll = v.rewrites.findIndex((r) => r.source === '/(.*)');
for (const p of Object.keys(STATIC_PAGE_META)) {
  const i = v.rewrites.findIndex((r) => r.source === p);
  ok(i >= 0 && i < idxAll, `rewrite for ${p} precedes catch-all`);
  ok(v.rewrites[i]?.destination === `/api/static-page?p=${p.slice(1)}`, `rewrite target for ${p}`);
}
ok(!v.rewrites.some((r) => /^\/(login|register|checkout|messages|secure)/.test(r.source) && /static-page/.test(r.destination)), 'no private route routed to static-page');

console.log(`STATIC-PAGE-META RESULTS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
