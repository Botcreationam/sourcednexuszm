// ============================================================================
// SOURCED NEXUS - product-specific Open Graph / SEO metadata (server side)
// ----------------------------------------------------------------------------
// The site is a client-rendered SPA, so every URL used to return the same
// index.html with the HOMEPAGE social tags. Social crawlers (WhatsApp,
// Facebook, Telegram, X, LinkedIn) never run JavaScript, so a shared product
// link previewed as "Sourced Nexus". This module fixes that at the source:
// for /product/<slug> the server looks the product up, then rewrites the
// <head> of the built index.html BEFORE sending it. Used by both backends
// (Vercel api/product-page.js and Render server.js) so they cannot disagree.
//
// URL FORMAT   /product/<name-slug>-<first 8 hex of the product id>
//   - The 8-char id tail is the real key; the name part is cosmetic and
//     SEO-friendly. Renaming a product therefore never breaks old links:
//     the old URL still resolves by id and 301-redirects to the new slug.
//   - Old bare-UUID links (/product/<uuid>) keep working and 301 to the slug.
//   - No database migration is needed; the slug is always derived live.
// ============================================================================

export const SITE_ORIGIN = (process.env.SITE_BASE_URL || 'https://sourcednexus.online').replace(/\/$/, '');
export const SITE_NAME = 'Sourced Nexus';
export const FALLBACK_IMAGE = `${SITE_ORIGIN}/og-image.jpg`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^([a-z0-9]+(?:-[a-z0-9]+)*?)?-?([0-9a-f]{8})$/;

// ------------------------------------------------------------------ slugs
export function slugify(name) {
  const s = String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['\u2018\u2019`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return s || 'product';
}

/** Canonical path for a product: /product/black-designer-dress-3f9a2c1e */
export function productPath(product) {
  const tail = String(product.id).replace(/-/g, '').slice(0, 8).toLowerCase();
  return `/product/${slugify(product.name)}-${tail}`;
}

/**
 * Parse the :param of /product/:param.
 * Returns { kind: 'uuid', id } | { kind: 'slug', tail, slug } | null
 */
export function parseProductParam(param) {
  const p = decodeURIComponent(String(param || '')).trim();
  if (UUID_RE.test(p)) return { kind: 'uuid', id: p.toLowerCase() };
  const m = p.toLowerCase().match(SLUG_RE);
  if (m) return { kind: 'slug', tail: m[2], slug: (m[1] || '').replace(/-$/, '') };
  return null;
}

// --------------------------------------------------------------- data fetch
function supa() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

const FIELDS = 'id,name,description,price,category,images,status,updated_at';

/**
 * Look a product up by the parsed URL param. Uses the PUBLIC anon key, so RLS
 * already hides unpublished (status = hidden) rows from this code path.
 * Returns the product row, null (not found / hidden) or throws on a data error.
 */
export async function findProduct(parsed, fetchImpl = fetch) {
  const s = supa();
  if (!s || !parsed) return null;
  const headers = { apikey: s.key, Authorization: `Bearer ${s.key}` };

  let query;
  if (parsed.kind === 'uuid') {
    query = `id=eq.${parsed.id}`;
  } else {
    // id is a uuid column: match its first 8 hex chars with a range, which
    // stays index friendly. e.g. 3f9a2c1e -> [3f9a2c1e-0000-.., 3f9a2c1e-ffff-..]
    const lo = `${parsed.tail}-0000-0000-0000-000000000000`;
    const hi = `${parsed.tail}-ffff-ffff-ffff-ffffffffffff`;
    query = `id=gte.${lo}&id=lte.${hi}`;
  }
  const r = await fetchImpl(`${s.url}/rest/v1/products?select=${FIELDS}&${query}&status=neq.hidden&limit=2`, {
    headers,
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new Error(`products lookup failed: ${r.status}`);
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length !== 1) return null; // none, or ambiguous tail: never guess
  return rows[0];
}

// ------------------------------------------------------------ text helpers
export function clean(text) {
  return String(text ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(text, max) {
  const t = clean(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.\-]+$/, '')}\u2026`;
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// JSON placed inside <script type="application/ld+json">: "<" must never appear
const safeJson = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** One confirmed numeric price, or null. Same rule as the checkout parser. */
export function parseConfirmedPrice(value) {
  if (value == null) return null;
  const cleaned = String(value).trim().replace(/[KkZMWDd$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n > 0 && n <= 10_000_000 ? Math.round(n * 100) / 100 : null;
}

/** Absolute, https, publicly fetchable image URL, else null. */
export function absoluteImage(url) {
  if (typeof url !== 'string') return null;
  const u = url.trim();
  if (!u) return null;
  try {
    const abs = new URL(u, `${SITE_ORIGIN}/`);
    if (abs.protocol !== 'https:' && abs.protocol !== 'http:') return null;
    if (abs.protocol === 'http:') abs.protocol = 'https:';
    return abs.toString();
  } catch {
    return null;
  }
}

const AVAILABILITY = {
  available: 'https://schema.org/InStock',
  preorder: 'https://schema.org/PreOrder',
  soldout: 'https://schema.org/OutOfStock',
};
const STATUS_LABEL = { available: 'In stock', preorder: 'Pre-order', soldout: 'Sold out' };

// -------------------------------------------------------- metadata builder
/**
 * Everything the <head> needs, derived ONLY from the product record.
 * Nothing is invented: no price when it is "Price on request", no description
 * text beyond a short factual line built from real fields when none exists.
 */
export function buildProductMeta(product) {
  const path = productPath(product);
  const url = `${SITE_ORIGIN}${path}`;
  const price = parseConfirmedPrice(product.price);
  const images = (Array.isArray(product.images) ? product.images : []).map(absoluteImage).filter(Boolean);
  const image = images[0] || FALLBACK_IMAGE;
  const hasRealImage = images.length > 0;

  const title = `${clean(product.name)} | ${SITE_NAME}`;
  const factual = [
    clean(product.category),
    price != null ? `K${price.toLocaleString('en-US')}` : 'Price on request',
    STATUS_LABEL[product.status],
  ].filter(Boolean);
  const description = truncate(
    clean(product.description) || `${clean(product.name)}. ${factual.join(' \u2022 ')}. Sourced Nexus, Lusaka.`,
    200,
  );

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: clean(product.name),
    description: truncate(clean(product.description) || description, 5000),
    image: hasRealImage ? images.slice(0, 6) : [FALLBACK_IMAGE],
    url,
    sku: String(product.id),
    category: clean(product.category) || undefined,
    brand: { '@type': 'Brand', name: SITE_NAME },
  };
  // An Offer only when there is a confirmed number. "Price on request" gets NO
  // price, never 0, so search/social do not show a fake amount.
  if (price != null) {
    jsonLd.offers = {
      '@type': 'Offer',
      url,
      price: price.toFixed(2),
      priceCurrency: 'ZMW',
      availability: AVAILABILITY[product.status] || 'https://schema.org/InStock',
      seller: { '@type': 'Organization', name: SITE_NAME },
    };
  }

  return {
    path, url, title, description, image, hasRealImage, price, jsonLd,
    availability: AVAILABILITY[product.status] || null,
  };
}

// ------------------------------------------------------------ HTML rewrite
const META_KEYS_REMOVED = [
  /<title>[\s\S]*?<\/title>/i,
  /<meta\s+name="description"[^>]*>/i,
  /<link\s+rel="canonical"[^>]*>/i,
  /<meta\s+property="og:[^"]*"[^>]*>/gi,
  /<meta\s+name="twitter:[^"]*"[^>]*>/gi,
  /<meta\s+property="product:[^"]*"[^>]*>/gi,
];

/**
 * Replace the homepage head tags in the built index.html with this product's.
 * Anything not recognised is left untouched, so scripts/styles/CSP hashes in
 * the document are never altered.
 */
export function injectProductMeta(html, meta) {
  let out = html;
  for (const re of META_KEYS_REMOVED) out = out.replace(re, '');
  // Drop a previously injected product JSON-LD block, if any (idempotent)
  out = out.replace(/<script type="application\/ld\+json" data-sn-product>[\s\S]*?<\/script>/gi, '');

  const t = escapeHtml(meta.title);
  const d = escapeHtml(meta.description);
  const u = escapeHtml(meta.url);
  const i = escapeHtml(meta.image);
  const alt = escapeHtml(meta.title);

  const tags = [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<link rel="canonical" href="${u}" />`,
    `<meta property="og:type" content="product" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta property="og:image" content="${i}" />`,
    `<meta property="og:image:secure_url" content="${i}" />`,
    `<meta property="og:image:alt" content="${alt}" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${i}" />`,
    `<meta name="twitter:image:alt" content="${alt}" />`,
  ];
  if (meta.price != null) {
    tags.push(
      `<meta property="product:price:amount" content="${meta.price.toFixed(2)}" />`,
      `<meta property="product:price:currency" content="ZMW" />`,
      `<meta property="og:price:amount" content="${meta.price.toFixed(2)}" />`,
      `<meta property="og:price:currency" content="ZMW" />`,
    );
  }
  if (meta.availability) {
    tags.push(`<meta property="product:availability" content="${meta.availability === 'https://schema.org/InStock' ? 'in stock' : meta.availability.endsWith('PreOrder') ? 'preorder' : 'out of stock'}" />`);
  }
  tags.push(`<script type="application/ld+json" data-sn-product>${safeJson(meta.jsonLd)}</script>`);

  const block = `    ${tags.join('\n    ')}\n`;
  return out.replace(/<\/head>/i, `${block}  </head>`);
}

// -------------------------------------------------------- request handling
/**
 * Resolve /product/<param> to what the server should do.
 *   { type: 'html', status: 200, html }        product found, canonical URL
 *   { type: 'redirect', status: 301, location } old slug / uuid -> canonical
 *   { type: 'html', status: 404, html }         unknown / hidden / deleted
 *   { type: 'passthrough' }                     data source unavailable: serve
 *                                               the normal SPA (never a 5xx)
 */
export async function resolveProductRequest(param, indexHtml, fetchImpl = fetch) {
  const parsed = parseProductParam(param);
  if (!parsed) return { type: 'html', status: 404, html: notFoundHtml(indexHtml) };

  let product;
  try {
    product = await findProduct(parsed, fetchImpl);
  } catch (err) {
    console.error('[product-meta] lookup failed:', err?.message || err);
    return { type: 'passthrough' };
  }
  if (!product) return { type: 'html', status: 404, html: notFoundHtml(indexHtml) };

  const meta = buildProductMeta(product);
  const requested = `/product/${String(param).toLowerCase()}`;
  if (requested !== meta.path.toLowerCase()) {
    // Renamed product, or an old UUID link: keep the link alive, point it home
    return { type: 'redirect', status: 301, location: meta.path };
  }
  return { type: 'html', status: 200, html: injectProductMeta(indexHtml, meta), meta };
}

/** Unknown products get a real 404 status (so search engines drop them) but
 *  still load the SPA, which shows the site's own "product not found" page. */
export function notFoundHtml(indexHtml) {
  const t = `Product not found | ${SITE_NAME}`;
  let out = indexHtml.replace(/<meta\s+name="robots"[^>]*>/i, '');
  for (const re of META_KEYS_REMOVED) out = out.replace(re, '');
  return out.replace(
    /<\/head>/i,
    `    <title>${t}</title>\n    <meta name="robots" content="noindex, follow" />\n    <meta property="og:site_name" content="${SITE_NAME}" />\n    <meta property="og:title" content="${t}" />\n    <meta property="og:image" content="${FALLBACK_IMAGE}" />\n    <meta name="twitter:card" content="summary_large_image" />\n    <meta name="twitter:image" content="${FALLBACK_IMAGE}" />\n  </head>`,
  );
}
