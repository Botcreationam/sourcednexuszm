/**
 * Sourced Nexus — pure cart/wishlist merge helpers.
 *
 * These functions are intentionally side-effect free (no React, no localStorage,
 * no Supabase) so the merge semantics can be unit-tested and reused by
 * CartContext without duplicating logic.
 *
 * Merge rules:
 *  - Cart items are identified by itemKey (productId + size + color + grade).
 *    The same product in two different grades is TWO separate line items.
 *  - On conflict (same itemKey), quantity is combined with Math.max to avoid
 *    duplicate records, and the data-rich side (grade, prices) wins.
 *  - Wishlists dedupe by product id.
 */

export const MAX_CART_ITEMS = 100;
export const MAX_WISHLIST_ITEMS = 200;

/**
 * Build the stable identity of a cart line.
 * Backwards compatible: items stored before grades existed (no grade) produce
 * the same key as the previous `${id}_${size}_${color}` scheme.
 */
export function getCartItemKey(productId, size = null, color = null, gradeName = null) {
  return `${productId || "item"}_${size || "std"}_${color || "std"}_${gradeName || "std"}`;
}

/**
 * Identity of a BUNDLE line: the bundle plus the exact size the customer chose
 * for each garment inside it. Same bundle with different sizes = different line.
 */
export function getBundleItemKey(bundleId, selections = []) {
  const sig = (selections || [])
    .map((s) => `${s.productId}:${s.size || "std"}`)
    .sort()
    .join(",");
  return `bundle_${bundleId}_${sig || "std"}`;
}

/** Compute an item's key from a stored item that may or may not have itemKey. */
export function resolveItemKey(item) {
  if (!item) return null;
  if (item.itemKey) return item.itemKey;
  return getCartItemKey(item.id, item.selectedSize, item.selectedColor, item.gradeName || item.selectedGrade?.name || null);
}

/**
 * Normalize a cart item coming from either the database or localStorage.
 * Ensures the grade selection and its pricing are preserved exactly:
 * a customer who added Third Grade keeps Third Grade — grade, unit price,
 * original price and discount travel with the line item.
 */
export function normalizeCartItem(item) {
  if (!item) return null;
  const key = resolveItemKey(item);
  const grade = item.selectedGrade || null;
  return {
    ...item,
    itemKey: key,
    id: item.id,
    name: item.name || "Item",
    category: item.category || "General",
    price: item.price ?? item.gradePrice ?? "Price on Request",
    gradeName: item.gradeName || grade?.name || null,
    gradePrice: item.gradePrice ?? item.price ?? grade?.price ?? null,
    gradeOriginalPrice: item.gradeOriginalPrice ?? grade?.original_price ?? null,
    gradeDiscount: item.gradeDiscount ?? grade?.discount_percentage ?? null,
    gradeStockStatus: item.gradeStockStatus ?? grade?.stock_status ?? null,
    isBundle: Boolean(item.isBundle),
    bundleId: item.bundleId || null,
    bundleComponents: Array.isArray(item.bundleComponents) ? item.bundleComponents : [],
    quantity: Math.max(1, Number(item.quantity) || 1),
    selectedSize: item.selectedSize || null,
    selectedColor: item.selectedColor || null,
    specifications: item.specifications || "",
    image: item.image || null,
    addedAt: item.addedAt || new Date().toISOString(),
  };
}

/**
 * Merge a database cart with a genuine guest (localStorage) cart without
 * creating duplicate lines. On the same itemKey, quantities combine with
 * Math.max and the more complete record (prefer db) is kept.
 *
 * @param {Array} dbCart   cart rows stored in user_profiles.cart
 * @param {Array} guestCart locally stored guest cart
 * @returns {Array} merged cart (capped at MAX_CART_ITEMS)
 */
export function mergeCartItems(dbCart = [], guestCart = []) {
  const merged = new Map();

  for (const raw of dbCart || []) {
    const item = normalizeCartItem(raw);
    if (item) merged.set(item.itemKey, item);
  }

  for (const raw of guestCart || []) {
    const item = normalizeCartItem(raw);
    if (!item) continue;
    const existing = merged.get(item.itemKey);
    if (existing) {
      merged.set(item.itemKey, {
        ...item,
        ...existing, // db fields win on conflict
        quantity: Math.max(existing.quantity, item.quantity),
        itemKey: item.itemKey,
      });
    } else {
      merged.set(item.itemKey, item);
    }
  }

  return Array.from(merged.values()).slice(0, MAX_CART_ITEMS);
}

/**
 * Merge a database wishlist with a guest wishlist, deduped by product id.
 * Existing (db) entries win; guest entries are appended.
 */
export function mergeWishlists(dbWishlist = [], guestWishlist = []) {
  const merged = new Map();
  for (const item of dbWishlist || []) {
    if (item?.id && !merged.has(item.id)) merged.set(item.id, item);
  }
  for (const item of guestWishlist || []) {
    if (item?.id && !merged.has(item.id)) merged.set(item.id, item);
  }
  return Array.from(merged.values()).slice(0, MAX_WISHLIST_ITEMS);
}

/** Normalize a whole cart array (used when the DB is authoritative). */
export function normalizeCart(cart = []) {
  return (cart || []).map(normalizeCartItem).filter(Boolean);
}
