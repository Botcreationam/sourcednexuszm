// ============================================================================
// SOURCED NEXUS — Payza payment integration (server-side shared module)
// ----------------------------------------------------------------------------
// Provider: https://payzaapi.co.ke (API docs: /docs)
// Used by BOTH backend surfaces:
//   - server.js  (Render deployment: POST /api/... handled inline)
//   - api/*.js   (Vercel serverless mirrors)
//
// SECURITY MODEL
//   - PAYZA_SECRET_KEY, PAYZA_WEBHOOK_SECRET and SUPABASE_SERVICE_ROLE_KEY
//     never leave this module's server-side callers. They are read from
//     process.env only, are never returned in any API response, and are
//     never logged.
//   - The customer's browser never sends a price to the server. The server
//     recomputes every line from the live products table (service role), so a
//     tampered frontend request cannot change K500 into K5.
//   - Payza webhooks are authenticated with X-Payza-Signature
//     (HMAC-SHA256 of the raw body keyed with the account's Webhook Signing
//     Secret, per Payza's docs) and are re-verified against the Payza API
//     before being applied.
//   - Payment state transitions are atomic, conditional updates
//     (UPDATE ... WHERE status = 'pending'), so duplicate webhooks or racing
//     verify calls can never double-mark, duplicate orders or double-clear
//     the cart.
// ============================================================================

import crypto from 'node:crypto';

import { validateSizeSelection, requiresSizeVerification, sizingStandardFor } from './size-policy.mjs';
import { loadBundles, priceBundleLine } from './bundles.mjs';
// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function payzaConfig() {
  const publicKey = process.env.PAYZA_PUBLIC_KEY || '';
  const secretKey = process.env.PAYZA_SECRET_KEY || '';
  // Payza's webhook signing secret is a SEPARATE account secret (found in
  // Dashboard -> API keys -> Webhook Signing Secret), not an API key.
  const webhookSecret = process.env.PAYZA_WEBHOOK_SECRET || '';
  const apiBase = (process.env.PAYZA_API_BASE_URL || 'https://payzaapi.co.ke/api/v1').replace(/\/$/, '');
  // Test vs live mode is decided by the key prefix (pk_test_/sk_test_ vs
  // pk_live_/sk_live_) per Payza's docs.
  const env = secretKey.startsWith('sk_test_') || publicKey.startsWith('pk_test_') ? 'test' : 'live';
  return {
    configured: Boolean(secretKey && publicKey && supabaseServiceConfigured()),
    webhookConfigured: Boolean(webhookSecret),
    publicKey,
    secretKey,
    webhookSecret,
    env,
    apiBase,
  };
}

export function supabaseServiceConfigured() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && (process.env.VITE_SUPABASE_URL || ''));
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function supabaseUrl() {
  return process.env.VITE_SUPABASE_URL || '';
}

function serviceHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

// Generic Supabase REST call (service role). Returns { ok, status, data }.
export async function supabaseRest(method, path, { query, body, prefer } = {}) {
  let url = `${supabaseUrl()}/rest/v1/${path}`;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) qs.append(k, v);
    url += `?${qs.toString()}`;
  }
  const headers = serviceHeaders();
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

/**
 * Validate a Supabase access token (Authorization: Bearer <jwt>) and return
 * { id, email } for the caller, or null. Delegates the check to Supabase's
 * auth endpoint so token validity, expiry and revocation are authoritative.
 */
export async function getAuthUser(authHeader) {
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!token || !supabaseUrl()) return null;
  try {
    const res = await fetch(`${supabaseUrl()}/auth/v1/user`, {
      headers: {
        apikey: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const user = await res.json();
    if (!user || !user.id) return null;
    return { id: user.id, email: user.email || '' };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Price parsing — products.price is free text ("K 250", "1,200.50", ...)
// Only unambiguous numeric prices are payable online; anything else must go
// through the existing inquiry flow ("Price on request").
// ---------------------------------------------------------------------------

export function parsePriceText(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const str = String(value).trim();
  if (!str) return null;
  const cleaned = str.replace(/[KkZMWDd$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) return null;
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Order creation — trusted server-side pricing
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_QUANTITY = 100;
const MAX_ITEMS = 50;

/**
 * Sanitize the incoming checkout lines. The browser sends ONLY identity
 * (productId, quantity, size, color, gradeName) — never a price.
 */
export function sanitizeCheckoutItems(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) {
    return { error: 'Please select between 1 and 50 items to check out.' };
  }
  const lines = [];
  const seen = new Map();
  for (const raw of items) {
    const quantity = Math.max(1, Math.min(MAX_QUANTITY, Math.floor(Number(raw?.quantity) || 1)));

    // ---- Bundle line: identity is the bundle id + the customer's per-garment size picks
    if (raw && typeof raw.bundleId === 'string' && raw.bundleId.trim() !== '') {
      const bundleId = raw.bundleId.trim();
      if (!UUID_RE.test(bundleId)) return { error: 'Invalid bundle in the cart.' };
      const selections = [];
      for (const sel of Array.isArray(raw.componentSelections) ? raw.componentSelections.slice(0, 30) : []) {
        const pid = typeof sel?.productId === 'string' ? sel.productId.trim() : '';
        if (!UUID_RE.test(pid)) return { error: 'Invalid product in the bundle.' };
        selections.push({
          productId: pid,
          gradeName: sel?.gradeName != null ? String(sel.gradeName).slice(0, 50) : null,
          size: sel?.size != null ? String(sel.size).slice(0, 30) : null,
          color: sel?.color != null ? String(sel.color).slice(0, 30) : null,
          sizeVerified: sel?.sizeVerified === true,
        });
      }
      const sig = selections.map((x) => `${x.productId}:${x.gradeName || ''}:${x.size || ''}:${x.color || ''}`).sort().join(',');
      const bkey = `bundle|${bundleId}|${sig}`;
      const bIdx = seen.get(bkey);
      if (bIdx !== undefined) {
        lines[bIdx].quantity = Math.max(1, Math.min(MAX_QUANTITY, Math.max(lines[bIdx].quantity, quantity)));
        continue;
      }
      seen.set(bkey, lines.length);
      lines.push({ bundleId, quantity, componentSelections: selections });
      continue;
    }

    // ---- Product line (unchanged identity) + size verification flag
    const productId = typeof raw?.productId === 'string' ? raw.productId.trim() : '';
    if (!UUID_RE.test(productId)) return { error: 'Invalid product in the cart.' };
    const size = raw?.size != null ? String(raw.size).slice(0, 30) : null;
    const color = raw?.color != null ? String(raw.color).slice(0, 30) : null;
    const gradeName = raw?.gradeName != null ? String(raw.gradeName).slice(0, 50) : null;
    const sizeVerified = raw?.sizeVerified === true;
    const key = `${productId}|${size || 'std'}|${color || 'std'}|${gradeName || 'std'}`;
    const existingIdx = seen.get(key);
    if (existingIdx !== undefined) {
      // merge duplicates instead of double-charging or dropping; Math.max
      // matches the app's own cartMerge rules for identical line keys
      lines[existingIdx].quantity = Math.max(1, Math.min(MAX_QUANTITY, Math.max(lines[existingIdx].quantity, quantity)));
      lines[existingIdx].sizeVerified = lines[existingIdx].sizeVerified && sizeVerified;
      continue;
    }
    seen.set(key, lines.length);
    lines.push({ productId, quantity, size, color, gradeName, sizeVerified });
  }
  if (lines.length === 0) return { error: 'No valid items in the cart.' };
  return { lines };
}


// Columns added by migration 20261008000000. If the database does not have them
// yet, PostgREST rejects the whole select, so product reads retry with the
// original column list. Checkout therefore keeps working before the migration
// is applied (bundles and size verification simply stay inactive until then).
const PRODUCT_COLUMNS_BASE = 'id,name,category,price,images,status,grades,sizes';
const PRODUCT_COLUMNS_FULL = `${PRODUCT_COLUMNS_BASE},sizing_standard,size_guide_type,requires_size_verification`;

async function fetchProductsByIds(ids) {
  const products = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    let res = await supabaseRest('GET', 'products', { query: { select: PRODUCT_COLUMNS_FULL, id: `in.(${chunk.join(',')})` } });
    if (!res.ok) {
      res = await supabaseRest('GET', 'products', { query: { select: PRODUCT_COLUMNS_BASE, id: `in.(${chunk.join(',')})` } });
    }
    if (!res.ok || !Array.isArray(res.data)) return null;
    for (const p of res.data) products.set(p.id, p);
  }
  return products;
}

/**
 * Reprice each line against the live products table (service role).
 * Uses the selected grade's CURRENT valid price (grade.price already reflects
 * any discount); falls back to the product price when no grade is selected.
 * Any unavailable product / grade or non-numeric price is rejected, so the
 * customer is never charged for something the catalog can no longer price.
 */
export async function priceCheckoutLines(lines) {
  const productLines = lines.filter((l) => !l.bundleId);
  const bundleLines = lines.filter((l) => l.bundleId);

  const ids = [...new Set(productLines.map((l) => l.productId))];
  const products = await fetchProductsByIds(ids);
  if (!products) return { error: 'Could not verify product availability. Please try again.' };

  let bundleMap = new Map();
  if (bundleLines.length) {
    const loaded = await loadBundles(bundleLines.map((l) => l.bundleId), supabaseRest);
    if (loaded.error) return { error: loaded.error };
    bundleMap = loaded.bundles;
  }

  const priced = [];
  for (const line of lines) {
    // ---------------- BUNDLE LINE ----------------
    if (line.bundleId) {
      const r = priceBundleLine(bundleMap.get(line.bundleId), line, { requireSizes: true, parsePriceText });
      if (!r.ok) return { error: r.error, code: r.code };
      const b = r.priced;
      priced.push({
        isBundle: true,
        bundleId: b.bundleId,
        productId: null,
        productName: b.bundleName,
        bundleName: b.bundleName,
        category: 'Bundle',
        image: b.image,
        size: null,
        color: null,
        gradeName: null,
        gradeOriginalPrice: null,
        gradeDiscount: null,
        sizingStandard: null,
        sizeVerified: false,
        bundleSeparateTotal: b.separateTotal,
        bundleSavings: b.savings,
        components: b.components,
        unitPrice: b.unitPrice,
        quantity: b.quantity,
        lineTotal: b.lineTotal,
      });
      continue;
    }

    // ---------------- PRODUCT LINE ----------------
    const product = products.get(line.productId);
    if (!product || product.status === 'hidden') {
      return { error: 'An item in your cart is no longer available. Please review your cart and try again.' };
    }
    let unitPrice = null;
    let originalPrice = null;
    let discount = null;
    if (line.gradeName) {
      const grades = Array.isArray(product.grades) ? product.grades : [];
      const grade = grades.find((g) => g?.name === line.gradeName) ||
        grades.find((g) => typeof g?.name === 'string' && line.gradeName &&
          g.name.toLowerCase() === line.gradeName.toLowerCase());
      if (!grade) {
        return { error: `The selected grade for "${product.name}" is no longer available. Please review your cart.` };
      }
      unitPrice = parsePriceText(grade.price);
      originalPrice = parsePriceText(grade.original_price ?? grade.originalPrice);
      discount = Number.isFinite(Number(grade.discount_percentage ?? grade.discount)) ? Number(grade.discount_percentage ?? grade.discount) : null;
    } else {
      unitPrice = parsePriceText(product.price);
    }
    if (unitPrice == null) {
      return { error: `"${product.name}" is priced on request and cannot be paid for online. Please use the inquiry flow for this item.` };
    }

    // Size policy: server decides whether verification is required. The
    // chosen size is recorded exactly as the customer picked it. It is never
    // converted or replaced.
    const sizeCheck = validateSizeSelection(product, line);
    if (!sizeCheck.ok) return { error: sizeCheck.error, code: sizeCheck.code };

    priced.push({
      isBundle: false,
      bundleId: null,
      productId: product.id,
      productName: String(product.name || 'Unnamed Product').slice(0, 150),
      category: product.category ? String(product.category).slice(0, 80) : null,
      image: Array.isArray(product.images) && product.images[0] ? String(product.images[0]).slice(0, 1000) : null,
      size: sizeCheck.size,
      color: line.color,
      gradeName: line.gradeName,
      gradeOriginalPrice: originalPrice,
      gradeDiscount: discount,
      sizingStandard: sizeCheck.size ? sizeCheck.standard : null,
      sizeVerified: sizeCheck.verified,
      unitPrice,
      quantity: line.quantity,
      lineTotal: Math.round(unitPrice * line.quantity * 100) / 100,
    });
  }

  const subtotal = Math.round(priced.reduce((sum, l) => sum + l.lineTotal, 0) * 100) / 100;
  if (!(subtotal > 0) || subtotal > 10_000_000) return { error: 'Invalid order amount. Please review your cart.' };
  return { priced, subtotal };
}

/**
 * Server-side QUOTE for the cart screen. Same trusted source and the same
 * parser as the real charge (priceCheckoutLines), but it answers per line
 * instead of rejecting the whole basket, so the browser can show:
 *   - the authoritative unit price / line total for every payable line
 *   - which lines cannot be paid online (price on request, ranges, bundles,
 *     removed or hidden products, unknown grades) and why
 *   - the one authoritative order total (payable lines only)
 * Nothing is written. The browser's own prices are never read here.
 */
export async function quoteCartLines(lines) {
  const productLines = lines.filter((l) => !l.bundleId);
  const bundleLines = lines.filter((l) => l.bundleId);
  const ids = [...new Set(productLines.map((l) => l.productId))];
  const products = await fetchProductsByIds(ids);
  if (!products) return { error: 'Could not verify prices. Please try again.' };
  let bundleMap = new Map();
  if (bundleLines.length) {
    const loaded = await loadBundles(bundleLines.map((l) => l.bundleId), supabaseRest);
    if (loaded.error) return { error: loaded.error };
    bundleMap = loaded.bundles;
  }

  const out = [];
  for (const line of lines) {
    // ---- bundle: priced from bundles.bundle_price; one unavailable part blocks it
    if (line.bundleId) {
      const base = { bundleId: line.bundleId, quantity: line.quantity, isBundle: true };
      const bundle = bundleMap.get(line.bundleId);
      const r = priceBundleLine(bundle, line, { requireSizes: false, parsePriceText });
      if (!r.ok) {
        out.push({
          ...base,
          name: bundle?.name || null,
          payable: false,
          reason: r.code === 'bundle_unavailable' ? 'unavailable' : r.code,
          message: r.error,
          unitPrice: null,
          lineTotal: null,
        });
        continue;
      }
      out.push({
        ...base,
        name: r.priced.bundleName,
        payable: true,
        unitPrice: r.priced.unitPrice,
        lineTotal: r.priced.lineTotal,
        separateTotal: r.priced.separateTotal,
        savings: r.priced.savings,
        components: r.priced.components.map((c) => ({
          productId: c.productId, name: c.productName, quantity: c.quantity, unitPrice: c.unitPrice,
          requiresSize: c.requiresSize, sizes: c.sizes, sizingStandard: c.sizingStandardLabel,
        })),
      });
      continue;
    }

    const base = { productId: line.productId, size: line.size, color: line.color, gradeName: line.gradeName, quantity: line.quantity };
    const product = products.get(line.productId);
    if (!product || product.status === 'hidden') {
      out.push({ ...base, payable: false, reason: 'unavailable', unitPrice: null, lineTotal: null });
      continue;
    }
    let unitPrice = null;
    if (line.gradeName) {
      const grades = Array.isArray(product.grades) ? product.grades : [];
      const grade = grades.find((g) => g?.name === line.gradeName) ||
        grades.find((g) => typeof g?.name === 'string' && g.name.toLowerCase() === line.gradeName.toLowerCase());
      if (!grade) {
        out.push({ ...base, name: product.name, payable: false, reason: 'grade_unavailable', unitPrice: null, lineTotal: null });
        continue;
      }
      unitPrice = parsePriceText(grade.price);
    } else {
      unitPrice = parsePriceText(product.price);
    }
    if (unitPrice == null) {
      out.push({ ...base, name: product.name, payable: false, reason: 'price_on_request', unitPrice: null, lineTotal: null });
      continue;
    }
    out.push({
      ...base,
      name: product.name,
      payable: true,
      unitPrice,
      lineTotal: Math.round(unitPrice * line.quantity * 100) / 100,
      // Tells the cart/checkout whether THIS line needs the size confirmation.
      // Computed from the product on the server, never from the browser.
      requiresSizeVerification: requiresSizeVerification(product),
      sizingStandard: requiresSizeVerification(product) ? sizingStandardFor(product) : null,
    });
  }
  const total = Math.round(out.filter((l) => l.payable).reduce((sum, l) => sum + l.lineTotal, 0) * 100) / 100;
  return { lines: out, total, currency: 'ZMW' };
}

/**
 * Fingerprint of the basket contents (without quantities) — used to reuse a
 * pending order instead of creating duplicates when the customer retries.
 */
export function cartFingerprint(lines) {
  const normalized = lines
    .map((l) => l.bundleId
      ? `bundle:${l.bundleId}|${(l.componentSelections || []).map((x) => `${x.productId}:${x.gradeName || ''}:${x.size || ''}:${x.color || ''}`).sort().join(',')}`
      : `${l.productId}|${l.size || 'std'}|${l.color || 'std'}|${l.gradeName || 'std'}`)
    .sort()
    .join(';;');
  return crypto.createHash('md5').update(normalized).digest('hex');
}

function generateOrderNumber() {
  const date = new Date();
  const stamp = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `SN-${stamp}-${rand}`;
}

// Payza reference: URL-safe (it goes into the verify path), only -, ., _
// and alphanumeric; unique per attempt because Payza rejects reuse (409).
function generatePaymentReference() {
  return `SNPAY-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

/**
 * Create (or reuse) a pending order + a fresh payment attempt, then start
 * the hosted-checkout payment at Payza.
 * Reuse rule: if this user already has a PENDING order with the same cart
 * fingerprint, the order is repriced and reused — its order_items are
 * replaced and any older pending payment attempts are marked 'cancelled'.
 * Every attempt gets a brand new unique reference (Payza rejects reuse).
 */
/**
 * Map a priced line to the order_items table's snake_case columns.
 */
function toOrderItemRow(orderId, l) {
  const row = {
    order_id: orderId,
    product_id: l.productId,
    product_name: l.productName,
    category: l.category,
    image: l.image,
    selected_size: l.size,
    selected_color: l.color,
    grade_name: l.gradeName,
    grade_original_price: l.gradeOriginalPrice,
    grade_discount: l.gradeDiscount,
    unit_price: l.unitPrice,
    quantity: l.quantity,
    line_total: l.lineTotal,
  };
  // New snapshot columns (migration 20261008000000). They are added ONLY when
  // this line actually uses them, so an ordinary product checkout writes the
  // exact same row as before and keeps working even before the migration has
  // been applied to the database.
  if (l.isBundle) {
    row.bundle_id = l.bundleId;
    row.is_bundle = true;
    row.bundle_name = l.bundleName;
    row.bundle_separate_total = l.bundleSeparateTotal;
    row.bundle_savings = l.bundleSavings;
  }
  if (l.sizingStandard || l.sizeVerified) {
    row.sizing_standard = l.sizingStandard || null;
    row.size_verified = Boolean(l.sizeVerified);
    row.size_verified_at = l.sizeVerified ? new Date().toISOString() : null;
  }
  return row;
}

/**
 * Write the order's line items, then the frozen contents of every bundle line.
 * Used by BOTH the new-order and the reuse-pending-order paths so they cannot
 * drift apart. Returns { ok } or { error }.
 */
async function writeOrderItems(orderId, priced) {
  const rawRows = priced.map((l) => toOrderItemRow(orderId, l));
  // PostgREST bulk inserts need every row to carry the same keys: fill any
  // optional snapshot column that some rows use with null/false for the rest.
  const optionalDefaults = {
    bundle_id: null, is_bundle: false, bundle_name: null, bundle_separate_total: null, bundle_savings: null,
    sizing_standard: null, size_verified: false, size_verified_at: null,
  };
  const used = Object.keys(optionalDefaults).filter((k) => rawRows.some((r) => k in r));
  const rows = rawRows.map((r) => {
    const out = { ...r };
    for (const k of used) if (!(k in out)) out[k] = optionalDefaults[k];
    return out;
  });
  let ins = await supabaseRest('POST', 'order_items', { body: rows, prefer: 'return=representation' });
  if (!ins.ok && !priced.some((l) => l.isBundle)) {
    // The database may not have the snapshot columns yet (migration
    // 20261008000000 not applied). A plain product order must still go through,
    // exactly as it did before this feature: retry with only the original
    // columns. Bundles are never retried this way (they cannot be stored
    // without their tables), so they fail cleanly instead of losing data.
    const legacyKeys = new Set(Object.keys(optionalDefaults));
    const legacyRows = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !legacyKeys.has(k))));
    ins = await supabaseRest('POST', 'order_items', { body: legacyRows, prefer: 'return=representation' });
  }
  if (!ins.ok || !Array.isArray(ins.data) || ins.data.length !== rows.length) {
    return { error: 'Could not save your order items. Please try again.' };
  }
  // PostgREST returns inserted rows in request order, so index i matches priced[i].
  const componentRows = [];
  priced.forEach((l, i) => {
    if (!l.isBundle) return;
    for (const c of l.components) {
      componentRows.push({
        order_item_id: ins.data[i].id,
        product_id: c.productId,
        product_name: c.productName,
        category: c.category,
        image: c.image,
        quantity: c.quantity,
        unit_price: c.unitPrice,
        grade_name: c.gradeName,
        selected_size: c.size,
        selected_color: c.color,
        sizing_standard: c.sizingStandard,
        size_verified: Boolean(c.sizeVerified),
      });
    }
  });
  if (componentRows.length) {
    const comp = await supabaseRest('POST', 'order_item_components', { body: componentRows, prefer: 'return=minimal' });
    if (!comp.ok) return { error: 'Could not save your bundle contents. Please try again.' };
  }
  return { ok: true };
}

export async function createPendingOrder({ user, lines, customer, baseUrl }) {
  const pricedResult = await priceCheckoutLines(lines);
  if (pricedResult.error) return { error: pricedResult.error };
  const { priced, subtotal } = pricedResult;
  const fingerprint = cartFingerprint(lines);
  const nowIso = new Date().toISOString();

  // Look for an existing pending order with the same basket
  const existing = await supabaseRest('GET', 'orders', {
    query: {
      select: 'id,order_number',
      user_id: `eq.${user.id}`,
      status: 'eq.pending',
      cart_fingerprint: `eq.${fingerprint}`,
      order: 'created_at.desc',
      limit: '1',
    },
  });

  let orderId;
  let orderNumber;

  if (existing.ok && Array.isArray(existing.data) && existing.data.length > 0) {
    orderId = existing.data[0].id;
    orderNumber = existing.data[0].order_number;
    // Replace the line items with freshly-priced ones
    await supabaseRest('DELETE', 'order_items', { query: { order_id: `eq.${orderId}` } });
    const wrote = await writeOrderItems(orderId, priced);
    if (wrote.error) return { error: wrote.error };
    await supabaseRest('PATCH', 'orders', {
      query: { id: `eq.${orderId}` },
      body: {
        subtotal,
        customer_email: customer.email,
        customer_phone: customer.phone,
        customer_first_name: customer.firstName,
        customer_last_name: customer.lastName,
        updated_at: nowIso,
      },
    });
    // Cancel previous pending attempts of this order so only one can complete
    await supabaseRest('PATCH', 'payments', {
      query: { order_id: `eq.${orderId}`, status: 'eq.pending' },
      body: { status: 'cancelled', failure_reason: 'Superseded by a new payment attempt' },
    });
  } else {
    orderNumber = generateOrderNumber();
    const created = await supabaseRest('POST', 'orders', {
      body: {
        order_number: orderNumber,
        user_id: user.id,
        customer_email: customer.email,
        customer_phone: customer.phone,
        customer_first_name: customer.firstName,
        customer_last_name: customer.lastName,
        subtotal,
        currency: 'ZMW',
        status: 'pending',
        payment_status: 'pending',
        cart_fingerprint: fingerprint,
        created_at: nowIso,
        updated_at: nowIso,
      },
      prefer: 'return=representation',
    });
    if (!created.ok || !Array.isArray(created.data) || created.data.length === 0) {
      return { error: 'Could not create your order. Please try again.' };
    }
    orderId = created.data[0].id;
    const wrote = await writeOrderItems(orderId, priced);
    if (wrote.error) {
      // do not leave an empty pending order behind
      await supabaseRest('DELETE', 'orders', { query: { id: `eq.${orderId}` } });
      return { error: wrote.error };
    }
  }

  // Fresh payment attempt with a unique reference
  const reference = generatePaymentReference();
  const payment = await supabaseRest('POST', 'payments', {
    body: {
      order_id: orderId,
      user_id: user.id,
      provider: 'payza',
      reference,
      amount: subtotal,
      currency: 'ZMW',
      status: 'pending',
      created_at: nowIso,
    },
    prefer: 'return=representation',
  });
  if (!payment.ok || !Array.isArray(payment.data) || payment.data.length === 0) {
    return { error: 'Could not start the payment. Please try again.' };
  }

  // Start the hosted-checkout payment at Payza with OUR reference. If Payza
  // cannot be reached the attempt is recorded as failed so a retry starts
  // cleanly with a fresh reference.
  const payResult = await createPayzaPayment({
    reference,
    amount: subtotal,
    customer,
    baseUrl,
    description: `Sourced Nexus order ${orderNumber}`,
    metadata: { order_id: orderId, order_number: orderNumber },
  });
  if (payResult.error) {
    await supabaseRest('PATCH', 'payments', {
      query: { id: `eq.${payment.data[0].id}`, status: 'eq.pending' },
      body: { status: 'failed', failure_reason: payResult.error },
    });
    return { error: payResult.error };
  }

  return {
    order: { id: orderId, orderNumber, subtotal, items: priced },
    payment: { reference, amount: subtotal, paymentUrl: payResult.paymentUrl },
  };
}

// ---------------------------------------------------------------------------
// Payza API — create payment + verification (server-side only)
// ---------------------------------------------------------------------------

/**
 * Start a hosted-checkout payment at Payza.
 * POST {apiBase}/pay  with X-Public-Key / X-Secret-Key headers.
 * For ZMW, Payza hosts the checkout page (Airtel Money, MTN, Zamtel) and the
 * customer is redirected to the returned payment_url.
 * Returns { paymentUrl } or { error }.
 */
export async function createPayzaPayment({ reference, amount, customer, baseUrl, description, metadata }) {
  const cfg = payzaConfig();
  if (!cfg.configured) return { error: 'Online payments are not available right now.' };
  if (!baseUrl) return { error: 'Online payments are not configured. Please contact support.' };
  if (!referenceIsValid(reference)) return { error: 'Invalid payment reference.' };
  if (!(Number(amount) > 0)) return { error: 'Invalid payment amount.' };
  try {
    const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim() || null;
    const res = await fetch(`${cfg.apiBase}/pay`, {
      method: 'POST',
      headers: {
        'X-Public-Key': cfg.publicKey,
        'X-Secret-Key': cfg.secretKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount,
        currency: 'ZMW',
        reference,
        customer: {
          email: customer.email,
          ...(name ? { name } : {}),
          ...(customer.phone ? { phone: customer.phone } : {}),
        },
        callback_url: `${baseUrl}/api/webhooks/payza`,
        redirect_url: `${baseUrl}/checkout?payza=return&ref=${encodeURIComponent(reference)}`,
        cancel_url: `${baseUrl}/checkout?payza=cancelled&ref=${encodeURIComponent(reference)}`,
        ...(description ? { description } : {}),
        ...(metadata ? { metadata } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.success !== true || !body.data?.payment_url) {
      const msg = body?.message || `Payza rejected the payment (status ${res.status}).`;
      return { error: `Could not start the payment: ${msg}` };
    }
    return { paymentUrl: String(body.data.payment_url), providerReference: body.data.reference || reference };
  } catch {
    return { error: 'Could not reach the payment provider. Please try again.' };
  }
}

/**
 * Verify a payment with Payza using OUR reference.
 * GET {apiBase}/verify/:reference — in live mode Payza re-checks with the
 * payment network while answering, so the result is as fresh as possible.
 * Returns mapped { status, amount, currency, method, completedAt, reason }
 * or { error } when Payza could not be reached / rejected the call.
 */
export async function verifyPayzaPayment(reference) {
  const cfg = payzaConfig();
  if (!cfg.configured) return { error: 'Payment provider is not configured.' };
  try {
    const res = await fetch(
      `${cfg.apiBase}/verify/${encodeURIComponent(reference)}`,
      {
        headers: { 'X-Public-Key': cfg.publicKey, 'X-Secret-Key': cfg.secretKey },
        signal: AbortSignal.timeout(15_000),
      }
    );
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.success !== true || !body.data) {
      return { error: `Payza verification failed (status ${res.status}).` };
    }
    const d = body.data;
    return {
      status: mapPayzaStatus(d.status),
      payzaStatus: d.status,
      amount: d.amount != null ? parsePriceText(d.amount) : null,
      currency: d.currency || null,
      method: d.actual_gateway || d.gateway || null,
      completedAt: d.paid_at || null,
      reason: null,
    };
  } catch {
    return { error: 'Could not reach the payment provider. Please try again.' };
  }
}

/**
 * Map Payza payment statuses to our payment vocabulary:
 *   success    -> paid
 *   failed     -> failed
 *   cancelled  -> cancelled
 *   pending    -> confirmation_pending
 */
export function mapPayzaStatus(payzaStatus) {
  switch (payzaStatus) {
    case 'success':
      return 'paid';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'pending':
    default:
      return 'confirmation_pending';
  }
}

// ---------------------------------------------------------------------------
// State transitions — atomic & idempotent
// ---------------------------------------------------------------------------

const OPEN_STATUSES = 'in.(pending,confirmation_pending)';

/**
 * Apply a verified Payza result to a payment row (and its order).
 * Atomicity: the payment update is conditional on the payment still being in
 * an open state. If two webhooks / verify calls race, exactly one performs
 * the transition; the other sees 0 affected rows and returns { duplicate }.
 */
export async function applyPaymentResult(reference, result, opts = {}) {
  const { source = 'verify' } = opts;
  const { data: payments } = await supabaseRest('GET', 'payments', {
    query: { select: '*', reference: `eq.${reference}`, limit: '1' },
  });
  if (!Array.isArray(payments) || payments.length === 0) {
    return { error: 'Payment reference not found.', code: 404 };
  }
  const payment = payments[0];

  // Already terminal: idempotent no-op. For a PAID payment we still make sure
  // its receipt exists (self-heal: covers a crash between "mark paid" and
  // "issue receipt"). createReceiptForPayment is idempotent, so this can never
  // create a second receipt or send a second email.
  if (payment.status === 'paid') {
    try {
      const { createReceiptForPayment } = await import('./order-receipts.mjs');
      await createReceiptForPayment(payment, { req: opts.req });
    } catch (err) {
      console.error('[receipt] self-heal failed:', err?.message || err);
    }
    return { duplicate: true, status: 'paid', payment };
  }
  if (payment.status === 'cancelled') return { duplicate: true, status: 'cancelled', payment };
  if (result.status === 'failed' && payment.status === 'failed') {
    return { duplicate: true, status: 'failed', payment };
  }

  // Amount integrity: Payza must report the exact amount we recorded.
  if (result.status === 'paid') {
    if (result.amount == null || Math.abs(result.amount - Number(payment.amount)) > 0.009) {
      // Never mark paid on a mismatch — record failure and stop.
      await supabaseRest('PATCH', 'payments', {
        query: { id: `eq.${payment.id}`, status: `eq.${payment.status}` },
        body: {
          status: 'failed',
          failure_reason: 'Verified amount did not match the order amount',
        },
      });
      return { error: 'Payment amount mismatch. The payment was not confirmed.', code: 409 };
    }
    if (result.currency && result.currency.toUpperCase() !== 'ZMW') {
      return { error: 'Payment currency mismatch. The payment was not confirmed.', code: 409 };
    }
  }

  const patch = {
    status: result.status,
    payment_method: result.method || payment.payment_method || null,
    failure_reason: result.status === 'failed' ? (result.reason || 'Payment failed') : null,
  };
  if (result.status === 'paid') {
    patch.completed_at = result.completedAt || new Date().toISOString();
  }

  // --- Atomic conditional transition ---
  const updated = await supabaseRest('PATCH', 'payments', {
    query: { id: `eq.${payment.id}`, status: OPEN_STATUSES },
    body: patch,
    prefer: 'return=representation',
  });
  if (!updated.ok || !Array.isArray(updated.data) || updated.data.length === 0) {
    // Another call already transitioned this payment.
    const fresh = await supabaseRest('GET', 'payments', {
      query: { select: '*', id: `eq.${payment.id}`, limit: '1' },
    });
    const current = Array.isArray(fresh.data) && fresh.data[0] ? fresh.data[0] : payment;
    return { duplicate: true, status: current.status, payment: current };
  }

  // --- Order-level transition ---
  if (result.status === 'paid') {
    // Only move the order forward if it is still pending (idempotent guard).
    await supabaseRest('PATCH', 'orders', {
      query: { id: `eq.${payment.order_id}`, status: 'eq.pending' },
      body: {
        payment_status: 'paid',
        status: 'processing',
        updated_at: new Date().toISOString(),
      },
    });
    // Clear ONLY the purchased lines from the persisted cart.
    await clearPurchasedCartLines(payment.user_id, payment.order_id);
    // Issue the receipt from the CONFIRMED order and email it. This runs only
    // for the one call that won the atomic open -> paid transition above, and
    // createReceiptForPayment is itself idempotent (UNIQUE payment_id), so a
    // duplicate webhook can never create a second receipt or email. Any email
    // problem is recorded on the receipt and retried; it can never undo the
    // payment, so errors are swallowed here on purpose.
    try {
      const { createReceiptForPayment } = await import('./order-receipts.mjs');
      await createReceiptForPayment(updated.data[0], { req: opts.req });
    } catch (err) {
      console.error('[receipt] could not issue receipt:', err?.message || err);
    }
  } else if (result.status === 'failed') {
    await supabaseRest('PATCH', 'orders', {
      query: { id: `eq.${payment.order_id}`, status: 'eq.pending' },
      body: { payment_status: 'failed', updated_at: new Date().toISOString() },
    });
  }

  return { status: result.status, payment: updated.data[0], source };
}

/**
 * Remove exactly the purchased order lines from user_profiles.cart so the
 * next cart sync does not resurrect them. Unrelated items are preserved.
 */
export async function clearPurchasedCartLines(userId, orderId) {
  const { data: items } = await supabaseRest('GET', 'order_items', {
    query: {
      select: 'product_id,selected_size,selected_color,grade_name',
      order_id: `eq.${orderId}`,
      limit: '100',
    },
  });
  if (!Array.isArray(items) || items.length === 0) return;

  const { data: profiles } = await supabaseRest('GET', 'user_profiles', {
    query: { select: 'id,cart', id: `eq.${userId}`, limit: '1' },
  });
  if (!Array.isArray(profiles) || profiles.length === 0) return;
  const cart = Array.isArray(profiles[0].cart) ? profiles[0].cart : [];

  const purchased = new Set(
    items.map((i) => `${i.product_id}|${i.selected_size || 'std'}|${i.selected_color || 'std'}|${i.grade_name || 'std'}`)
  );
  const keep = cart.filter((rawItem) => {
    if (!rawItem || typeof rawItem !== 'object') return true;
    const gradeName = rawItem.gradeName || rawItem.selectedGrade?.name || null;
    const key = `${rawItem.id}|${rawItem.selectedSize || 'std'}|${rawItem.selectedColor || 'std'}|${gradeName || 'std'}`;
    return !purchased.has(key);
  });

  if (keep.length !== cart.length) {
    await supabaseRest('PATCH', 'user_profiles', {
      query: { id: `eq.${userId}` },
      body: { cart: keep, updated_at: new Date().toISOString() },
    });
  }
}

/**
 * Cancel an open payment attempt (customer cancelled or abandoned the Payza
 * checkout before paying). Ownership is checked by the caller. Idempotent.
 */
export async function cancelPaymentAttempt(reference) {
  const updated = await supabaseRest('PATCH', 'payments', {
    query: { reference: `eq.${reference}`, status: OPEN_STATUSES },
    body: { status: 'cancelled', failure_reason: 'Customer closed the payment window' },
    prefer: 'return=representation',
  });
  if (updated.ok && Array.isArray(updated.data) && updated.data.length > 0) {
    return { cancelled: true, payment: updated.data[0] };
  }
  return { cancelled: false };
}

// ---------------------------------------------------------------------------
// Webhook signature verification (Payza spec)
// X-Payza-Signature = HMAC-SHA256(rawBody, webhookSecret), hex-encoded.
// The raw body must be used — re-encoding changes the bytes and breaks it.
// ---------------------------------------------------------------------------

export function verifyPayzaSignature(rawBody, signatureHeader) {
  const cfg = payzaConfig();
  if (!cfg.webhookSecret || !signatureHeader) return false;
  const expected = crypto
    .createHmac('sha256', cfg.webhookSecret)
    .update(rawBody, 'utf8')
    .digest('hex');
  const received = String(signatureHeader).toLowerCase();
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

// ---------------------------------------------------------------------------
// Customer payload validation
// ---------------------------------------------------------------------------

export function sanitizeCustomer(raw) {
  const email = typeof raw?.email === 'string' ? raw.email.trim().toLowerCase() : '';
  if (!email || !/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,10}$/.test(email) || email.length > 254) {
    return { error: 'A valid email address is required for payment receipts.' };
  }
  // The phone number is required: the receipt and the administrators' payment
  // notification both identify the customer by it. Digits with an optional
  // leading +, spaces, dashes and brackets; at least 7 digits.
  const phone = typeof raw?.phone === 'string' ? raw.phone.trim() : '';
  const phoneDigits = phone.replace(/\D/g, '');
  if (!phone) {
    return { error: 'A phone number is required so we can contact you about your order.' };
  }
  if (phone.length > 35 || phoneDigits.length < 7 || phoneDigits.length > 15 || !/^\+?[\d\s\-().]+$/.test(phone)) {
    return { error: 'Please provide a valid phone number.' };
  }
  const firstName = raw?.firstName != null ? String(raw.firstName).slice(0, 60) : null;
  const lastName = raw?.lastName != null ? String(raw.lastName).slice(0, 60) : null;
  return { customer: { email, phone, firstName, lastName } };
}

export function referenceIsValid(reference) {
  return typeof reference === 'string' && /^[A-Za-z0-9._-]{6,100}$/.test(reference);
}
