// Offline tests for lib/product-meta.mjs against a mock Supabase REST server.
//   node tests/product-meta/test-product-meta.mjs
import http from 'node:http';
import fs from 'node:fs';

process.env.VITE_SUPABASE_URL = 'http://localhost:4621';
process.env.VITE_SUPABASE_ANON_KEY = 'anon';
process.env.SITE_BASE_URL = 'https://sourcednexus.online';
const M = await import('../../lib/product-meta.mjs');

const P = {
  dress: { id: '3f9a2c1e-1111-4222-8333-444455556666', name: 'Black Designer Dress', description: 'Elegant black dress, tailored fit.', price: 'K400', category: 'Dresses', images: ['https://cdn.example.com/dress.jpg', 'https://cdn.example.com/dress2.jpg'], status: 'available' },
  mirror: { id: '7b8c9d0e-2222-4333-8444-555566667777', name: 'Full-Length Mirror', description: 'x'.repeat(600), price: 'k600', category: 'Home', images: ['https://cdn.example.com/mirror.jpg'], status: 'available' },
  glasses: { id: 'a1b2c3d4-3333-4444-8555-666677778888', name: 'Designer Glasses', description: '', price: 'K350', category: 'Accessories', images: ['/storage/glasses.jpg'], status: 'preorder' },
  por: { id: 'c0ffee00-4444-4555-8666-777788889999', name: 'Custom <Suit> & "Tie"', description: null, price: 'Price on request', category: 'Suits', images: [], status: 'available' },
  hidden: { id: 'deadbeef-5555-4666-8777-888899990000', name: 'Secret', description: 'd', price: 'K1', category: 'X', images: [], status: 'hidden' },
  // two products sharing the same 8 char tail: must never be guessed between
  twinA: { id: 'abcd1234-0000-4000-8000-000000000001', name: 'Twin A', description: 'a', price: 'K1', category: 'X', images: [], status: 'available' },
  twinB: { id: 'abcd1234-ffff-4fff-8fff-000000000002', name: 'Twin B', description: 'b', price: 'K1', category: 'X', images: [], status: 'available' },
};
let DB = Object.values(P);

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const q = u.searchParams;
  let rows = DB.filter((r) => r.status !== 'hidden');          // RLS + neq.hidden
  for (const [k, v] of u.searchParams.entries()) {
    if (k !== 'id') continue;
    const [op, val] = [v.slice(0, v.indexOf('.')), v.slice(v.indexOf('.') + 1)];
    if (op === 'eq') rows = rows.filter((r) => r.id === val);
    if (op === 'gte') rows = rows.filter((r) => r.id >= val);
    if (op === 'lte') rows = rows.filter((r) => r.id <= val);
  }
  rows = rows.slice(0, Number(q.get('limit') || 100));
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(rows));
});
await new Promise((r) => srv.listen(4621, r));

let pass = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { pass++; console.log('  PASS ', n); } else { fail++; console.log('  FAIL ', n, x); } };
const INDEX = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const meta = (html, re) => (html.match(re) || [])[1];
const og = (html, p) => meta(html, new RegExp(`<meta property="${p}" content="([^"]*)"`));
const tw = (html, n) => meta(html, new RegExp(`<meta name="${n}" content="([^"]*)"`));

console.log('\n[1] slugs');
check('simple', M.slugify('Black Designer Dress') === 'black-designer-dress');
check('accents/punctuation', M.slugify("  Café  & Crème's  ") === 'cafe-and-cremes');
check('empty name -> product', M.slugify('???') === 'product');
check('long name capped', M.slugify('a '.repeat(100)).length <= 60);
check('productPath', M.productPath(P.dress) === '/product/black-designer-dress-3f9a2c1e', M.productPath(P.dress));
check('parse uuid', M.parseProductParam(P.dress.id).kind === 'uuid');
check('parse slug', JSON.stringify(M.parseProductParam('black-designer-dress-3f9a2c1e')) === JSON.stringify({ kind: 'slug', tail: '3f9a2c1e', slug: 'black-designer-dress' }));
check('parse bare tail', M.parseProductParam('3f9a2c1e').tail === '3f9a2c1e');
check('reject garbage', M.parseProductParam('hello') === null && M.parseProductParam("x'; drop") === null && M.parseProductParam('../../etc') === null);

console.log('\n[2] three products produce three different, correct previews');
const out = {};
for (const k of ['dress', 'mirror', 'glasses']) {
  const r = await M.resolveProductRequest(M.productPath(P[k]).replace('/product/', ''), INDEX);
  out[k] = r;
  check(`${k}: 200`, r.status === 200 && r.type === 'html');
}
const d = out.dress.html, m = out.mirror.html, g = out.glasses.html;
check('dress og:title', og(d, 'og:title') === 'Black Designer Dress | Sourced Nexus');
check('mirror og:title', og(m, 'og:title') === 'Full-Length Mirror | Sourced Nexus');
check('glasses og:title', og(g, 'og:title') === 'Designer Glasses | Sourced Nexus');
check('dress og:image is the dress', og(d, 'og:image') === 'https://cdn.example.com/dress.jpg');
check('mirror og:image is the mirror', og(m, 'og:image') === 'https://cdn.example.com/mirror.jpg');
check('glasses relative image made absolute', og(g, 'og:image') === 'https://sourcednexus.online/storage/glasses.jpg', og(g, 'og:image'));
check('og:url is the exact product url', og(d, 'og:url') === 'https://sourcednexus.online/product/black-designer-dress-3f9a2c1e');
check('og:url differs per product', new Set([og(d, 'og:url'), og(m, 'og:url'), og(g, 'og:url')]).size === 3);
check('og:type product', og(d, 'og:type') === 'product');
check('canonical per product', meta(d, /<link rel="canonical" href="([^"]*)"/) === og(d, 'og:url') && meta(m, /<link rel="canonical" href="([^"]*)"/) === og(m, 'og:url'));
check('twitter card + title + image', tw(d, 'twitter:card') === 'summary_large_image' && tw(d, 'twitter:title') === 'Black Designer Dress | Sourced Nexus' && tw(d, 'twitter:image') === 'https://cdn.example.com/dress.jpg');
check('twitter description matches og', tw(d, 'twitter:description') === og(d, 'og:description'));
check('<title> is product', meta(d, /<title>([^<]*)<\/title>/) === 'Black Designer Dress | Sourced Nexus');
check('real description used', og(d, 'og:description') === 'Elegant black dress, tailored fit.');
check('long description shortened for social', og(m, 'og:description').length <= 200 && og(m, 'og:description').endsWith('\u2026'));
check('empty description -> factual line, no invention', og(g, 'og:description') === 'Designer Glasses. Accessories \u2022 K350 \u2022 Pre-order. Sourced Nexus, Lusaka.', og(g, 'og:description'));

console.log('\n[3] no leftover homepage tags');
const count = (h, re) => (h.match(re) || []).length;
for (const [k, h] of [['dress', d], ['mirror', m], ['glasses', g]]) {
  check(`${k}: exactly 1 of each og:title/og:image/og:url/canonical/title/description`,
    count(h, /property="og:title"/g) === 1 && count(h, /property="og:image"/g) === 1 && count(h, /property="og:url"/g) === 1 &&
    count(h, /rel="canonical"/g) === 1 && count(h, /<title>/g) === 1 && count(h, /name="description"/g) === 1);
  check(`${k}: no homepage image/title left`, !h.includes('og-image.jpg') && !h.includes('Luxury Fashion, Electronics'));
}
check('rest of document untouched (scripts/body)', d.includes('<div id="root">') || d.includes('id="root"'));

console.log('\n[4] price handling and JSON-LD');
const ld = (h) => JSON.parse(meta(h, /<script type="application\/ld\+json" data-sn-product>([\s\S]*?)<\/script>/));
const ldD = ld(d), ldM = ld(m), ldG = ld(g);
check('Product type', ldD['@type'] === 'Product' && ldD.name === 'Black Designer Dress');
check('offer price K400 ZMW', ldD.offers.price === '400.00' && ldD.offers.priceCurrency === 'ZMW');
check('mirror K600 (lowercase k)', ldM.offers.price === '600.00');
check('glasses K350', ldG.offers.price === '350.00');
check('availability InStock / PreOrder', ldD.offers.availability === 'https://schema.org/InStock' && ldG.offers.availability === 'https://schema.org/PreOrder');
check('image array real images', ldD.image.length === 2 && ldD.image[0] === 'https://cdn.example.com/dress.jpg');
check('product:price meta present', og(d, 'product:price:amount') === '400.00' && og(d, 'product:price:currency') === 'ZMW');
const por = await M.resolveProductRequest(M.productPath(P.por).replace('/product/', ''), INDEX);
check('price on request: page ok', por.status === 200);
const ldP = ld(por.html);
check('price on request: NO offer, no fake price', ldP.offers === undefined && !por.html.includes('product:price:amount') && !/"price"/.test(por.html));
check('price on request: description says so, not a number', og(por.html, 'og:description').includes('Price on request'));
check('no image -> branded fallback, still valid', og(por.html, 'og:image') === 'https://sourcednexus.online/og-image.jpg' && ldP.image[0] === 'https://sourcednexus.online/og-image.jpg');

console.log('\n[5] escaping / injection safety');
check('name with <>&" is escaped in attributes', og(por.html, 'og:title') === 'Custom Suit &amp; &quot;Tie&quot; | Sourced Nexus' || og(por.html, 'og:title').includes('&amp;'), og(por.html, 'og:title'));
check('no raw < from the product name in head tags', !/content="[^"]*<[^"]*"/.test(por.html.split('</head>')[0]));
check('JSON-LD cannot close its own script tag', !ldScriptBreak(por.html));
function ldScriptBreak(h) { const b = meta(h, /data-sn-product>([\s\S]*?)<\/script>/); return /<\/script/i.test(b); }
const evil = M.injectProductMeta(INDEX, M.buildProductMeta({ ...P.dress, name: '</script><script>alert(1)</script>', description: '"><img src=x onerror=alert(1)>' }));
check('script/attribute breakout attempt is neutralised', !evil.includes('<script>alert(1)') && !evil.includes('<img src=x'));

console.log('\n[6] redirects keep old links alive');
let r = await M.resolveProductRequest(P.dress.id, INDEX);
check('bare uuid -> 301 to slug url', r.status === 301 && r.location === '/product/black-designer-dress-3f9a2c1e');
r = await M.resolveProductRequest('old-name-for-dress-3f9a2c1e', INDEX);
check('renamed product (old slug) -> 301 to current slug', r.status === 301 && r.location === '/product/black-designer-dress-3f9a2c1e');
r = await M.resolveProductRequest('3f9a2c1e', INDEX);
check('bare tail -> 301 to slug', r.status === 301 && r.location === '/product/black-designer-dress-3f9a2c1e');
r = await M.resolveProductRequest('BLACK-DESIGNER-DRESS-3F9A2C1E', INDEX);
check('uppercase url -> 200 (case-insensitive match, not a redirect loop)', r.status === 200);
check('old slug NEVER shows another product', (await M.resolveProductRequest('full-length-mirror-3f9a2c1e', INDEX)).location === '/product/black-designer-dress-3f9a2c1e');

console.log('\n[7] deleted / unpublished / unknown');
r = await M.resolveProductRequest(M.productPath(P.hidden).replace('/product/', ''), INDEX);
check('hidden product -> 404', r.status === 404 && r.type === 'html');
check('404 page has noindex and brand fallback, not product meta', /noindex/.test(r.html) && !r.html.includes('Secret') && og(r.html, 'og:title') === 'Product not found | Sourced Nexus');
check('404 has exactly one robots tag', count(r.html, /name="robots"/g) === 1);
r = await M.resolveProductRequest('deleted-product-00000000', INDEX);
check('unknown id -> 404', r.status === 404);
r = await M.resolveProductRequest('not-a-product', INDEX);
check('unparseable -> 404', r.status === 404);
r = await M.resolveProductRequest('twin-a-abcd1234', INDEX);
check('ambiguous id tail -> 404, never guesses', r.status === 404);
r = await M.resolveProductRequest(P.twinA.id, INDEX);
check('...but the full uuid still resolves', r.status === 301 || r.status === 200);

console.log('\n[8] data source down never breaks the site');
const saved = process.env.VITE_SUPABASE_URL;
process.env.VITE_SUPABASE_URL = 'http://localhost:1';
r = await M.resolveProductRequest(M.productPath(P.dress).replace('/product/', ''), INDEX);
check('lookup error -> passthrough (normal SPA), not a 5xx', r.type === 'passthrough');
process.env.VITE_SUPABASE_URL = saved;

console.log('\n[9] homepage metadata is untouched');
check('index.html still has the homepage OG', INDEX.includes('og-image.jpg') && og(INDEX, 'og:type') === 'website' && og(INDEX, 'og:title').startsWith('Sourced Nexus |'));

console.log(`\n==========\nPRODUCT-META RESULTS: ${pass} passed, ${fail} failed\n==========`);
srv.close();
process.exit(fail ? 1 : 0);
