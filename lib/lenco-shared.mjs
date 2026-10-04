// ============================================================================
// SOURCED NEXUS — Lenco payment integration (server-side shared module)
// ----------------------------------------------------------------------------
// Used by BOTH backend surfaces:
//   - server.js  (Render deployment: POST /api/... handled inline)
//   - api/*.js   (Vercel serverless mirrors)
//
// SECURITY MODEL
//   - LENCO_SECRET_KEY and SUPABASE_SERVICE_ROLE_KEY never leave this module's
//     server-side callers. They are read from process.env only, are never
//     returned in any API response, and are never logged.
//   - The customer's browser never sends a price to the server. The server
//     recomputes every line from the live products table (service role), so a
//     tampered frontend request cannot change K500 into K5.
//   - Payment state transitions are atomic, conditional updates
//     (UPDATE ... WHERE status = 'pending'), so duplicate webhooks or racing
//     verify calls can never double-mark, duplicate orders or double-clear
//     the cart.
// ============================================================================

import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function lencoConfig() {
  const secretKey = process.env.LENCO_SECRET_KEY || '';
  const publicKey = process.env.LENCO_PUBLIC_KEY || '';
  const env = (process.env.LENCO_ENV || 'production').toLowerCase() === 'sandbox' ? 'sandbox' : 'production';
  // The webhook hash key is the SHA-256 of the Lenco secret key (per Lenco's
  // current docs). LENCO_WEBHOOK_HASH can override it for key rotation.
  const webhookHash = process.env.LENCO_WEBHOOK_HASH || (secretKey ? sha256Hex(secretKey) : '');
  const apiBase =
    process.env.LENCO_API_BASE_URL ||
    (env === 'sandbox' ? 'https://api.sandbox.lenco.co' : 'https://api.lenco.co');
  const widgetUrl =
    env === 'sandbox' ? 'https://pay.sandbox.lenco.co/js/v1/inline.js' : 'https://pay.lenco.co/js/v1/inline.js';
  return {
    configured: Boolean(secretKey && publicKey && supabaseServiceConfigured()),
    secretKey,
    publicKey,
    env,
    webhookHash,
    apiBase,
    widgetUrl,
  };
}

export function supabaseServiceConfigured() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && (process.env.VITE_SUPABASE_URL || ''));
}

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
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
    const productId = typeof raw?.productId === 'string' ? raw.productId.trim() : '';
    if (!UUID_RE.test(productId)) return { error: 'Invalid product in the cart.' };
    const quantity = Math.max(1, Math.min(MAX_QUANTITY, Math.floor(Number(raw?.quantity) || 1)));
    const size = raw?.size != null ? String(raw.size).slice(0, 30) : null;
    const color = raw?.color != null ? String(raw.color).slice(0, 30) : null;
    const gradeName = raw?.gradeName != null ? String(raw.gradeName).slice(0, 50) : null;
    const key = `${productId}|${size || 'std'}|${color || 'std'}|${gradeName || 'std'}`;
    const existingIdx = seen.get(key);
    if (existingIdx !== undefined) {
      // merge duplicates instead of double-charging or dropping; Math.max
      // matches the app's own cartMerge rules for identical line keys
      lines[existingIdx].quantity = Math.max(1, Math.min(MAX_QUANTITY, Math.max(lines[existingIdx].quantity, quantity)));
      continue;
    }
    seen.set(key, lines.length);
    lines.push({ productId, quantity, size, color, gradeName });
  }
  if (lines.length === 0) return { error: 'No valid items in the cart.' };
  return { lines };
}

/**
 * Reprice each line against the live products table (service role).
 * Uses the selected grade's CURRENT valid price (grade.price already reflects
 * any discount); falls back to the product price when no grade is selected.
 * Any unavailable product / grade or non-numeric price is rejected, so the
 * customer is never charged for something the catalog can no longer price.
 */
export async function priceCheckoutLines(lines) {
  const ids = [...new Set(lines.map((l) => l.productId))];
  // fetch in chunks of 50 (PostgREST in= filter safety)
  const products = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const { ok, data } = await supabaseRest('GET', 'products', {
      query: {
        select: 'id,name,category,price,images,status,grades',
        id: `in.(${chunk.join(',')})`,
      },
    });
    if (!ok || !Array.isArray(data)) return { error: 'Could not verify product availability. Please try again.' };
    for (const p of data) products.set(p.id, p);
  }

  const priced = [];
  for (const line of lines) {
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
    priced.push({
      productId: product.id,
      productName: String(product.name || 'Unnamed Product').slice(0, 150),
      category: product.category ? String(product.category).slice(0, 80) : null,
      image: Array.isArray(product.images) && product.images[0] ? String(product.images[0]).slice(0, 1000) : null,
      size: line.size,
      color: line.color,
      gradeName: line.gradeName,
      gradeOriginalPrice: originalPrice,
      gradeDiscount: discount,
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
 * Fingerprint of the basket contents (without quantities) — used to reuse a
 * pending order instead of creating duplicates when the customer retries.
 */
export function cartFingerprint(lines) {
  const normalized = lines
    .map((l) => `${l.productId}|${l.size || 'std'}|${l.color || 'std'}|${l.gradeName || 'std'}`)
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

// Lenco reference: only -, ., _ and alphanumeric are allowed
function generatePaymentReference() {
  return `SNPAY-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

/**
 * Create (or reuse) a pending order + a fresh payment attempt.
 * Reuse rule: if this user already has a PENDING order with the same cart
 * fingerprint, the order is repriced and reused — its order_items are
 * replaced and any older pending payment attempts are marked 'cancelled'.
 * Every attempt gets a brand new unique Lenco reference.
 */
/**
 * Map a priced line to the order_items table's snake_case columns.
 */
function toOrderItemRow(orderId, l) {
  return {
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
}

export async function createPendingOrder({ user, lines, customer }) {
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
    await supabaseRest('POST', 'order_items', {
      body: priced.map((l) => toOrderItemRow(orderId, l)),
      prefer: 'return=minimal',
    });
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
    await supabaseRest('POST', 'order_items', {
      body: priced.map((l) => toOrderItemRow(orderId, l)),
      prefer: 'return=minimal',
    });
  }

  // Fresh payment attempt with a unique reference
  const reference = generatePaymentReference();
  const payment = await supabaseRest('POST', 'payments', {
    body: {
      order_id: orderId,
      user_id: user.id,
      provider: 'lenco',
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

  return {
    order: { id: orderId, orderNumber, subtotal, items: priced },
    payment: { reference, amount: subtotal },
  };
}

// ---------------------------------------------------------------------------
// Lenco API — verification (server-side only)
// ---------------------------------------------------------------------------

/**
 * Verify a collection with Lenco using OUR reference.
 * GET {apiBase}/access/v2/collections/status/:reference
 * Returns mapped { status, lencoReference, amount, currency, method, completedAt, reason }
 * or { error } when Lenco could not be reached / rejected the call.
 */
export async function verifyLencoCollection(reference) {
  const cfg = lencoConfig();
  if (!cfg.configured) return { error: 'Payment provider is not configured.' };
  try {
    const res = await fetch(
      `${cfg.apiBase}/access/v2/collections/status/${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${cfg.secretKey}` },
        signal: AbortSignal.timeout(15_000),
      }
    );
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.status !== true || !body.data) {
      return { error: `Lenco verification failed (status ${res.status}).` };
    }
    const d = body.data;
    return {
      status: mapLencoStatus(d.status),
      lencoStatus: d.status,
      lencoReference: d.lencoReference || null,
      amount: d.amount != null ? parsePriceText(d.amount) : null,
      currency: d.currency || null,
      method: d.type || null,
      completedAt: d.completedAt || null,
      reason: d.reasonForFailure || null,
    };
  } catch {
    return { error: 'Could not reach the payment provider. Please try again.' };
  }
}

/**
 * Map Lenco collection statuses to our payment vocabulary:
 *   successful            -> paid
 *   failed                -> failed
 *   pending / 3ds-auth-required / pay-offline -> confirmation_pending
 */
export function mapLencoStatus(lencoStatus) {
  switch (lencoStatus) {
    case 'successful':
      return 'paid';
    case 'failed':
      return 'failed';
    case 'pending':
    case '3ds-auth-required':
    case 'pay-offline':
      return 'confirmation_pending';
    default:
      return 'confirmation_pending';
  }
}

// ---------------------------------------------------------------------------
// State transitions — atomic & idempotent
// ---------------------------------------------------------------------------

const OPEN_STATUSES = 'in.(pending,confirmation_pending)';

/**
 * Apply a verified Lenco result to a payment row (and its order).
 * Atomicity: the payment update is conditional on the payment still being in
 * an open state. If two webhooks / verify calls race, exactly one performs
 * the transition; the other sees 0 affected rows and returns { duplicate }.
 */
export async function applyPaymentResult(reference, result, { source = 'verify' } = {}) {
  const { data: payments } = await supabaseRest('GET', 'payments', {
    query: { select: '*', reference: `eq.${reference}`, limit: '1' },
  });
  if (!Array.isArray(payments) || payments.length === 0) {
    return { error: 'Payment reference not found.', code: 404 };
  }
  const payment = payments[0];

  // Already terminal: idempotent no-op
  if (payment.status === 'paid') return { duplicate: true, status: 'paid', payment };
  if (payment.status === 'cancelled') return { duplicate: true, status: 'cancelled', payment };
  if (result.status === 'failed' && payment.status === 'failed') {
    return { duplicate: true, status: 'failed', payment };
  }

  // Amount integrity: Lenco must report the exact amount we recorded.
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
    lenco_reference: result.lencoReference || payment.lenco_reference || null,
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
 * Cancel an open payment attempt (customer closed the Lenco window before
 * paying). Ownership is checked by the caller. Idempotent.
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
// Webhook signature verification (current Lenco spec)
// X-Lenco-Signature = HMAC-SHA512(rawBody, sha256Hex(secretKey))
// ---------------------------------------------------------------------------

export function verifyLencoSignature(rawBody, signatureHeader) {
  const cfg = lencoConfig();
  if (!cfg.webhookHash || !signatureHeader) return false;
  const expected = crypto
    .createHmac('sha512', cfg.webhookHash)
    .update(rawBody, 'utf8')
    .digest('hex');
  const received = String(signatureHeader).toLowerCase();
  const expectedLower = expected.toLowerCase();
  if (received.length !== expectedLower.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expectedLower));
}

// ---------------------------------------------------------------------------
// Customer payload validation
// ---------------------------------------------------------------------------

export function sanitizeCustomer(raw) {
  const email = typeof raw?.email === 'string' ? raw.email.trim().toLowerCase() : '';
  if (!email || !/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,10}$/.test(email) || email.length > 254) {
    return { error: 'A valid email address is required for payment receipts.' };
  }
  const phone = typeof raw?.phone === 'string' ? raw.phone.trim() : '';
  if (phone && (phone.length < 6 || phone.length > 35)) {
    return { error: 'Please provide a valid phone number.' };
  }
  const firstName = raw?.firstName != null ? String(raw.firstName).slice(0, 60) : null;
  const lastName = raw?.lastName != null ? String(raw.lastName).slice(0, 60) : null;
  return { customer: { email, phone: phone || null, firstName, lastName } };
}

export function referenceIsValid(reference) {
  return typeof reference === 'string' && /^[A-Za-z0-9._-]{6,100}$/.test(reference);
}
