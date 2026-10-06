// ============================================================================
// Dynamic sitemap.xml for Sourced Nexus.
// Static public pages + every publicly visible product, read from Supabase with
// the anon key (RLS already hides non-public rows; we also filter 'hidden').
// Private/admin/account/checkout routes are intentionally never listed.
// ============================================================================

export const SITE_ORIGIN = (process.env.SITE_BASE_URL || 'https://sourcednexus.online').replace(/\/$/, '');

// path, changefreq, priority
export const STATIC_PAGES = [
  ['/', 'daily', '1.0'],
  ['/catalog', 'daily', '0.9'],
  ['/categories', 'weekly', '0.8'],
  ['/pre-order', 'weekly', '0.8'],
  ['/how-it-works', 'monthly', '0.6'],
  ['/contact', 'monthly', '0.6'],
  ['/refund-policy', 'yearly', '0.3'],
  ['/terms', 'yearly', '0.3'],
  ['/privacy', 'yearly', '0.3'],
  ['/accessibility', 'yearly', '0.3'],
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function isoDate(v) {
  const d = v ? new Date(v) : null;
  return d && !isNaN(d) ? d.toISOString().slice(0, 10) : null;
}

export async function fetchPublicProducts(fetchImpl = fetch) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  const out = [];
  const PAGE = 1000;
  for (let from = 0; from < 20000; from += PAGE) {
    const r = await fetchImpl(
      `${url}/rest/v1/products?select=id,updated_at,created_at,status&status=neq.hidden&order=created_at.asc`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!r.ok) throw new Error(`products fetch failed: ${r.status}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out.filter((p) => p && UUID_RE.test(String(p.id)) && p.status !== 'hidden');
}

export function buildSitemapXml(products = [], origin = SITE_ORIGIN, today = new Date().toISOString().slice(0, 10)) {
  const urls = STATIC_PAGES.map(([path, freq, pri]) =>
    `  <url>\n    <loc>${xmlEscape(origin + (path === '/' ? '/' : path))}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${freq}</changefreq>\n    <priority>${pri}</priority>\n  </url>`);
  for (const p of products) {
    const last = isoDate(p.updated_at) || isoDate(p.created_at) || today;
    urls.push(`  <url>\n    <loc>${xmlEscape(`${origin}/product/${p.id}`)}</loc>\n    <lastmod>${last}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export function buildRobotsTxt(origin = SITE_ORIGIN) {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /secure/',
    'Disallow: /api/',
    'Disallow: /checkout',
    'Disallow: /messages',
    'Disallow: /account/',
    'Disallow: /login',
    'Disallow: /register',
    'Disallow: /forgot-password',
    'Disallow: /reset-password',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

// Never fail a crawl hard: if Supabase is down, still serve the static pages.
export async function renderSitemap() {
  let products = [];
  try { products = await fetchPublicProducts(); } catch (e) { console.warn('[sitemap] product fetch failed:', e.message); }
  return buildSitemapXml(products);
}
