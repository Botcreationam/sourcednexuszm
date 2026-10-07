// Storefront data access for bundles. Reads go through Supabase with the
// public RLS policies (anyone sees ACTIVE bundles). Prices shown here are for
// DISPLAY only: the server re-prices every bundle at quote and checkout time.
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { parseUnitPrice } from "@/lib/cartPricing";
import { requiresSizeVerification, sizingStandardFor } from "@/lib/sizePolicy";

const PRODUCT_COLS = "id,name,category,price,images,sizes,colors,status,grades,sizing_standard,size_guide_type,requires_size_verification";
const PRODUCT_COLS_BASE = "id,name,category,price,images,sizes,colors,status,grades";

/** Same availability rule as the server (lib/bundles.mjs isComponentAvailable). */
export function componentAvailability(product, gradeName) {
  if (!product) return { ok: false, reason: "removed" };
  if (product.status === "hidden") return { ok: false, reason: "hidden" };
  if (product.status === "soldout") return { ok: false, reason: "soldout" };
  if (gradeName) {
    const grade = (product.grades || []).find((g) => g?.name === gradeName);
    if (!grade) return { ok: false, reason: "grade_removed" };
    const st = String(grade.stock_status || "In Stock").toLowerCase();
    if (st.includes("out") || st.includes("sold")) return { ok: false, reason: "soldout" };
  }
  return { ok: true };
}

function componentPrice(product, gradeName) {
  if (gradeName) {
    const g = (product.grades || []).find((x) => x?.name === gradeName);
    return g ? parseUnitPrice(g.price) : null;
  }
  return parseUnitPrice(product.price);
}

/** Shape a raw bundle row + items + products into what the UI uses. */
export function shapeBundle(row, items, productsById) {
  const components = items
    .filter((i) => i.bundle_id === row.id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => {
      const product = productsById.get(i.product_id) || null;
      const avail = componentAvailability(product, i.grade_name);
      return {
        productId: i.product_id,
        name: product?.name || "Unavailable product",
        category: product?.category || null,
        image: product?.images?.[0] || null,
        quantity: i.quantity,
        gradeName: i.grade_name || null,
        unitPrice: product ? componentPrice(product, i.grade_name) : null,
        sizes: product?.sizes || [],
        requiresSize: product ? requiresSizeVerification(product) : false,
        sizingStandard: product && requiresSizeVerification(product) ? sizingStandardFor(product) : null,
        product,
        available: avail.ok,
        unavailableReason: avail.ok ? null : avail.reason,
      };
    });
  const separateTotal = components.reduce((s, c) => s + (c.unitPrice || 0) * c.quantity, 0);
  const bundlePrice = Number(row.bundle_price);
  const savings = Math.max(0, Math.round((separateTotal - bundlePrice) * 100) / 100);
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    images: row.images || [],
    image: row.images?.[0] || null,
    bundlePrice,
    isActive: row.is_active,
    availabilityNote: row.availability_note || "",
    components,
    separateTotal: Math.round(separateTotal * 100) / 100,
    savings,
    savingsPercent: separateTotal > 0 ? Math.round((savings / separateTotal) * 100) : 0,
    // purchasable only if EVERY component is available
    purchasable: row.is_active && components.length > 0 && components.every((c) => c.available && c.unitPrice != null),
    blockedBy: components.find((c) => !c.available || c.unitPrice == null) || null,
  };
}

async function fetchProducts(ids) {
  const map = new Map();
  if (!ids.length) return map;
  let res = await supabase.from("products").select(PRODUCT_COLS).in("id", ids);
  if (res.error) res = await supabase.from("products").select(PRODUCT_COLS_BASE).in("id", ids);
  for (const p of res.data || []) map.set(p.id, p);
  return map;
}

/** Active bundles for the storefront. Resolves to [] when bundles are not set up yet. */
export async function fetchActiveBundles() {
  if (!isSupabaseConfigured) return [];
  const { data: rows, error } = await supabase
    .from("bundles").select("*").eq("is_active", true).order("display_order", { ascending: true }).order("created_at", { ascending: false });
  if (error || !rows?.length) return [];
  const { data: items } = await supabase.from("bundle_items").select("*").in("bundle_id", rows.map((r) => r.id));
  const products = await fetchProducts([...new Set((items || []).map((i) => i.product_id))]);
  return rows.map((r) => shapeBundle(r, items || [], products));
}

export async function fetchBundle(id) {
  if (!isSupabaseConfigured) return null;
  const { data: row, error } = await supabase.from("bundles").select("*").eq("id", id).maybeSingle();
  if (error || !row) return null;
  const { data: items } = await supabase.from("bundle_items").select("*").eq("bundle_id", id);
  const products = await fetchProducts([...new Set((items || []).map((i) => i.product_id))]);
  return shapeBundle(row, items || [], products);
}

export const UNAVAILABLE_TEXT = {
  soldout: "is sold out",
  hidden: "is no longer available",
  removed: "is no longer available",
  grade_removed: "is no longer offered in the selected grade",
};
