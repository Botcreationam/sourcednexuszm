// ============================================================================
// PRODUCT BUNDLES: server-side loading, availability and pricing
// ----------------------------------------------------------------------------
// A bundle references EXISTING products (bundle_items.product_id). The price a
// customer pays is bundles.bundle_price, read here on the server. The browser
// only ever sends WHICH bundle, how many, and the size the customer picked for
// each garment inside it. It never sends a price.
//
// AVAILABILITY ("inventory") RULE
//   This shop keeps no stock counters; a product is available or not through
//   products.status and, for graded products, the grade's stock_status. A
//   bundle can be bought only if EVERY component passes isComponentAvailable().
//   One missing or unavailable component blocks the whole bundle, and the
//   reason names the product. Components are never modified by a bundle.
// ============================================================================

import { validateSizeSelection, requiresSizeVerification, sizingStandardFor } from './size-policy.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const money = (n) => Math.round(Number(n) * 100) / 100;

/** Is this product (and chosen grade) buyable right now? */
export function isComponentAvailable(product, gradeName) {
  if (!product) return { ok: false, reason: 'removed' };
  if (product.status === 'hidden') return { ok: false, reason: 'hidden' };
  if (product.status === 'soldout') return { ok: false, reason: 'soldout' };
  if (gradeName) {
    const grades = Array.isArray(product.grades) ? product.grades : [];
    const grade = grades.find((g) => g?.name === gradeName);
    if (!grade) return { ok: false, reason: 'grade_removed' };
    const st = String(grade.stock_status || 'In Stock').toLowerCase();
    if (st.includes('out') || st.includes('sold')) return { ok: false, reason: 'soldout' };
  }
  return { ok: true };
}

const REASON_TEXT = {
  removed: 'is no longer available',
  hidden: 'is no longer available',
  soldout: 'is sold out',
  grade_removed: 'is no longer offered in the selected grade',
};

/**
 * Load bundles with their components and the live product rows.
 * @param {string[]} bundleIds
 * @param {Function} supabaseRest  injected so this module has no import cycle with payza-shared
 * @returns {Promise<{error?:string, bundles?:Map<string,object>}>}
 */
export async function loadBundles(bundleIds, supabaseRest) {
  const ids = [...new Set(bundleIds.filter((id) => UUID_RE.test(String(id))))];
  if (ids.length === 0) return { bundles: new Map() };

  const b = await supabaseRest('GET', 'bundles', {
    query: { select: 'id,name,slug,description,images,bundle_price,is_active,availability_note', id: `in.(${ids.join(',')})` },
  });
  if (!b.ok || !Array.isArray(b.data)) return { error: 'Could not verify bundle availability. Please try again.' };

  const it = await supabaseRest('GET', 'bundle_items', {
    query: { select: 'id,bundle_id,product_id,quantity,grade_name,sort_order', bundle_id: `in.(${ids.join(',')})`, order: 'sort_order.asc' },
  });
  if (!it.ok || !Array.isArray(it.data)) return { error: 'Could not verify bundle contents. Please try again.' };

  const productIds = [...new Set(it.data.map((r) => r.product_id))];
  const products = new Map();
  for (let i = 0; i < productIds.length; i += 50) {
    const chunk = productIds.slice(i, i + 50);
    const FULL = 'id,name,category,price,images,sizes,colors,status,grades,sizing_standard,size_guide_type,requires_size_verification';
    const BASE = 'id,name,category,price,images,sizes,colors,status,grades';
    let p = await supabaseRest('GET', 'products', { query: { select: FULL, id: `in.(${chunk.join(',')})` } });
    if (!p.ok) p = await supabaseRest('GET', 'products', { query: { select: BASE, id: `in.(${chunk.join(',')})` } });
    if (!p.ok || !Array.isArray(p.data)) return { error: 'Could not verify bundle products. Please try again.' };
    for (const row of p.data) products.set(row.id, row);
  }

  const bundles = new Map();
  for (const row of b.data) {
    bundles.set(row.id, {
      ...row,
      components: it.data.filter((r) => r.bundle_id === row.id).map((r) => ({ ...r, product: products.get(r.product_id) || null })),
    });
  }
  return { bundles };
}

/** Component price for ONE unit of the component: grade price if graded, else product price. */
function componentUnitPrice(product, gradeName, parsePriceText) {
  if (gradeName) {
    const grade = (Array.isArray(product.grades) ? product.grades : []).find((g) => g?.name === gradeName);
    return grade ? parsePriceText(grade.price) : null;
  }
  return parsePriceText(product.price);
}

/**
 * Compute everything the server needs to know about one bundle line.
 *
 * @param {object} bundle     from loadBundles()
 * @param {object} line       { bundleId, quantity, componentSelections: [{productId, size, color, sizeVerified}] }
 * @param {{requireSizes:boolean}} opts
 *   requireSizes=true  : checkout (a size and a verification are mandatory for garments)
 *   requireSizes=false : quote   (the cart shows a price before sizes are chosen)
 * @returns {{ok:true, priced:object}|{ok:false, code:string, error:string, reason?:string}}
 */
export function priceBundleLine(bundle, line, { requireSizes = true, parsePriceText } = {}) {
  if (!bundle || bundle.is_active !== true) {
    return { ok: false, code: 'bundle_unavailable', error: 'A bundle in your cart is no longer available. Please review your cart.' };
  }
  const price = parsePriceText(bundle.bundle_price);
  if (price == null) {
    return { ok: false, code: 'bundle_unpriced', error: `"${bundle.name}" cannot be paid for online right now.` };
  }
  if (!bundle.components || bundle.components.length === 0) {
    return { ok: false, code: 'bundle_empty', error: `"${bundle.name}" has no products and cannot be purchased.` };
  }

  const selections = new Map();
  for (const s of line.componentSelections || []) {
    if (s && typeof s.productId === 'string') selections.set(`${s.productId}|${s.gradeName || ''}`, s);
  }

  const components = [];
  let separateTotal = 0;
  for (const c of bundle.components) {
    const avail = isComponentAvailable(c.product, c.grade_name);
    if (!avail.ok) {
      const label = c.product?.name ? `"${c.product.name}"` : 'A product in this bundle';
      return {
        ok: false,
        code: 'component_unavailable',
        reason: avail.reason,
        error: `"${bundle.name}" cannot be purchased because ${label} ${REASON_TEXT[avail.reason] || 'is unavailable'}.`,
      };
    }
    const unit = componentUnitPrice(c.product, c.grade_name, parsePriceText);
    if (unit == null) {
      return {
        ok: false,
        code: 'component_unpriced',
        error: `"${bundle.name}" cannot be purchased because "${c.product.name}" is priced on request.`,
      };
    }
    separateTotal += unit * c.quantity;

    const sel = selections.get(`${c.product_id}|${c.grade_name || ''}`) || {};
    const sizeLine = { size: sel.size ?? null, sizeVerified: sel.sizeVerified === true };
    let size = sizeLine.size;
    let standard = null;
    let verified = false;
    if (requireSizes) {
      const v = validateSizeSelection(c.product, sizeLine);
      if (!v.ok) return { ok: false, code: v.code, error: v.error };
      size = v.size;
      standard = v.requires || v.size ? v.standard : null;
      verified = v.verified;
    } else if (size && Array.isArray(c.product.sizes) && c.product.sizes.length && !c.product.sizes.map(String).includes(String(size))) {
      return { ok: false, code: 'size_unavailable', error: `The size "${size}" is not available for "${c.product.name}".` };
    }

    components.push({
      productId: c.product.id,
      productName: String(c.product.name || 'Product').slice(0, 150),
      category: c.product.category ? String(c.product.category).slice(0, 80) : null,
      image: Array.isArray(c.product.images) && c.product.images[0] ? String(c.product.images[0]).slice(0, 1000) : null,
      quantity: c.quantity,
      unitPrice: unit,
      gradeName: c.grade_name || null,
      size,
      color: sel.color != null ? String(sel.color).slice(0, 30) : null,
      sizingStandard: standard,
      sizeVerified: verified,
      requiresSize: requiresSizeVerification(c.product),
      sizes: Array.isArray(c.product.sizes) ? c.product.sizes : [],
      sizingStandardLabel: sizingStandardFor(c.product),
    });
  }

  separateTotal = money(separateTotal);
  const quantity = Math.max(1, Math.min(100, Math.floor(Number(line.quantity) || 1)));
  // A bundle must never cost MORE than buying the parts separately; if an admin
  // priced it above that, the customer is simply charged the bundle price (the
  // saving is then 0, never negative) so the receipt is never misleading.
  const savings = Math.max(0, money(separateTotal - price));
  return {
    ok: true,
    priced: {
      bundleId: bundle.id,
      bundleName: String(bundle.name).slice(0, 150),
      image: Array.isArray(bundle.images) && bundle.images[0] ? String(bundle.images[0]).slice(0, 1000) : null,
      unitPrice: price,
      quantity,
      lineTotal: money(price * quantity),
      separateTotal,
      savings,
      components,
    },
  };
}
