// Product URLs: /product/<name-slug>-<first 8 hex chars of the id>
// Must stay identical to slugify() / productPath() in lib/product-meta.mjs,
// which is what the server uses to build the canonical URL and social tags.
export function slugify(name) {
  const s = String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2018\u2019`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return s || "product";
}

export function productPath(product) {
  if (!product?.id) return "/catalog";
  const tail = String(product.id).replace(/-/g, "").slice(0, 8).toLowerCase();
  return `/product/${slugify(product.name)}-${tail}`;
}

/** Absolute shareable URL for a product (what gets copied / sent to people). */
export function productShareUrl(product) {
  return `${window.location.origin}${productPath(product)}`;
}

/**
 * The route param is either a full uuid (old links) or "<slug>-<8 hex>".
 * Returns { id } for a uuid, { tail } for a slug link, or null.
 */
export function parseProductParam(param) {
  const p = String(param || "").trim().toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(p)) return { id: p };
  const m = p.match(/(?:^|-)([0-9a-f]{8})$/);
  return m ? { tail: m[1] } : null;
}
