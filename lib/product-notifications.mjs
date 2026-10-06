// ============================================================================
// SOURCED NEXUS - Product update email notifications (server-side only)
// ----------------------------------------------------------------------------
// Used by BOTH backend surfaces (same pattern as lib/payza-shared.mjs):
//   - server.js  (Render)        -> POST /api/notifications/process
//   - api/*.js   (Vercel)        -> api/notifications-process.js
//
// FLOW
//   admin saves product -> DB trigger creates an idempotent event
//   -> processNotificationQueue():
//        1. queue each pending event into one delivery row per eligible user
//        2. claim a batch of due deliveries (atomic, safe with parallel workers)
//        3. send each email through the configured provider
//        4. record sent / failed, schedule retries for temporary failures
//
// SECURITY
//   - EMAIL_API_KEY, SUPABASE_SERVICE_ROLE_KEY are read from process.env only.
//     They are never returned in a response, logged, or sent to the browser.
//   - The processor endpoint accepts ONLY (a) a signed-in admin's token, or
//     (b) the server cron secret. Ordinary users cannot trigger sending.
//   - Recipient addresses come from auth.users on the server. They are never
//     returned to any browser.
// ============================================================================

import crypto from 'node:crypto';
import { supabaseRest, getAuthUser, supabaseServiceConfigured } from './payza-shared.mjs';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function emailConfig() {
  const apiKey = process.env.EMAIL_API_KEY || '';
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || '';
  return {
    configured: Boolean(apiKey && fromAddress),
    apiKey,
    fromAddress,
    fromName: process.env.EMAIL_FROM_NAME || 'Sourced Nexus',
    // 'resend' (default, needs a verified domain) or 'brevo' (free tier, can send
    // from a single verified address such as a Gmail with no domain).
    provider: (process.env.EMAIL_PROVIDER || 'resend').toLowerCase() === 'brevo' ? 'brevo' : 'resend',
    apiUrl: process.env.EMAIL_API_URL
      || ((process.env.EMAIL_PROVIDER || '').toLowerCase() === 'brevo'
        ? 'https://api.brevo.com/v3/smtp/email'
        : 'https://api.resend.com/emails'),
  };
}

export function siteBaseUrl(req) {
  const fromEnv = (process.env.SITE_BASE_URL || '').replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  if (host && /^[a-z0-9.-]+(:\d+)?$/i.test(host)) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    return `${proto}://${host}`;
  }
  return 'https://sourcednexus.online';
}

// Absolute URL of the small (240px) brand logo, served from /public. Email clients
// need an absolute https URL. Derived from the settings link's origin so it follows
// SITE_BASE_URL, with the production site as the safe fallback.
export function emailLogoUrl(settingsUrl) {
  try {
    const u = new URL(settingsUrl);
    if (u.protocol === 'https:' || u.protocol === 'http:') return `${u.origin}/email-logo.png`;
  } catch { /* fall through */ }
  return 'https://sourcednexus.online/email-logo.png';
}

export const MAX_ATTEMPTS = 5;
export const BATCH_SIZE = 40;
export const RETRY_DELAYS_MIN = [2, 10, 30, 120, 360];

// ---------------------------------------------------------------------------
// Authorization  (admin JWT, or the server cron secret)
// ---------------------------------------------------------------------------

function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Returns { ok: true, via: 'admin'|'cron' } only for a verified admin or the
 * configured cron secret. Admin status is checked SERVER-SIDE against the
 * trusted public.admin_users table using the service role, never trusted from
 * the browser.
 */
export async function authorizeProcessor(req) {
  const authHeader = req.headers['authorization'] || '';
  const cronSecret = process.env.CRON_SECRET || '';

  if (cronSecret && authHeader.startsWith('Bearer ')) {
    const supplied = authHeader.slice(7).trim();
    if (supplied && timingSafeEqualStr(supplied, cronSecret)) return { ok: true, via: 'cron' };
  }

  const user = await getAuthUser(authHeader);
  if (!user) return { ok: false, status: 401, error: 'Please sign in.' };

  const admin = await supabaseRest('GET', 'admin_users', {
    query: { select: 'id', id: `eq.${user.id}`, limit: '1' },
  });
  if (admin.ok && Array.isArray(admin.data) && admin.data.length > 0) {
    return { ok: true, via: 'admin', userId: user.id };
  }
  return { ok: false, status: 403, error: 'Administrator access required.' };
}

// ---------------------------------------------------------------------------
// Product data + image validation
// ---------------------------------------------------------------------------

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function firstName(fullName, email) {
  const n = String(fullName || '').trim();
  if (n) return n.split(/\s+/)[0];
  const local = String(email || '').split('@')[0].replace(/[._\d-]+/g, ' ').trim();
  if (local) return local.split(/\s+/)[0].replace(/^./, (c) => c.toUpperCase());
  return 'there';
}

function shortDescription(text, max = 180) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}\u2026`;
}

function priceLabel(product) {
  const raw = String(product.price || '').trim();
  if (!raw) return 'Price on request';
  return /^k\s*/i.test(raw) ? raw : /^[\d\s.,-]+$/.test(raw) ? `K ${raw}` : raw;
}

/**
 * Check that a product image is publicly reachable (HTTPS, image content
 * type). Any failure returns null so the email is sent WITHOUT the image
 * rather than failing. Results are cached per run.
 */
const imageCache = new Map();
export async function validateImageUrl(url) {
  if (!url || typeof url !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (imageCache.has(url)) return imageCache.get(url);
  let result = null;
  try {
    let res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000), redirect: 'follow' });
    if (res.status === 405 || res.status === 403) {
      res = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
        signal: AbortSignal.timeout(5000),
        redirect: 'follow',
      });
    }
    const type = (res.headers.get('content-type') || '').toLowerCase();
    if (res.ok && type.startsWith('image/')) result = url;
  } catch {
    result = null;
  }
  imageCache.set(url, result);
  if (imageCache.size > 200) imageCache.clear();
  return result;
}

// ---------------------------------------------------------------------------
// Email templates  (table-based, inline CSS, mobile responsive)
// ---------------------------------------------------------------------------

export function buildEmail({ type, firstName: name, product, imageUrl, updateSummary, productUrl, settingsUrl }) {
  const isNew = type === 'new_product';
  const subject = isNew ? 'New Product Just Added \u2014 Sourced Nexus' : 'Product Updated \u2014 Sourced Nexus';
  const heading = isNew ? 'New Product Available' : 'A Product Has Been Updated';
  const intro = isNew
    ? "We've just added a new product to Sourced Nexus."
    : 'An update has been made to a product on Sourced Nexus.';
  const desc = shortDescription(product.description);
  const price = priceLabel(product);

  const image = imageUrl
    ? `<tr><td style="padding:0 32px 20px 32px;"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(product.name)}" width="536" style="display:block;width:100%;max-width:536px;height:auto;border:0;border-radius:4px;background:#f1efeb;"></td></tr>`
    : '';

  const detailBlock = isNew
    ? (desc ? `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#44403c;">${escapeHtml(desc)}</p>` : '')
    : `<p style="margin:0 0 6px 0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#78716c;"><strong>Updated information</strong></p>
       <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#44403c;">${escapeHtml(updateSummary || 'Product details were updated.')}</p>`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f3ef;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ef;"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e7e2da;font-family:Helvetica,Arial,sans-serif;color:#1c1917;">
    <tr><td align="center" style="padding:28px 32px 20px 32px;border-bottom:1px solid #e7e2da;">
      <img src="${escapeHtml(emailLogoUrl(settingsUrl))}" alt="Sourced Nexus" width="72" height="72" style="display:block;margin:0 auto 14px auto;width:72px;height:72px;border:0;border-radius:14px;">
      <span style="font-size:20px;letter-spacing:.32em;font-weight:700;color:#1c1917;">SOURCED NEXUS</span>
    </td></tr>
    <tr><td style="padding:28px 32px 8px 32px;">
      <h1 style="margin:0 0 14px 0;font-size:24px;line-height:1.3;font-weight:600;color:#1c1917;">${escapeHtml(heading)}</h1>
      <p style="margin:0 0 6px 0;font-size:15px;line-height:1.6;color:#44403c;">Hello <strong>${escapeHtml(name)}</strong>,</p>
      <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#44403c;">${escapeHtml(intro)}</p>
    </td></tr>
    ${image}
    <tr><td style="padding:0 32px 8px 32px;">
      <h2 style="margin:0 0 8px 0;font-size:20px;line-height:1.3;font-weight:600;color:#1c1917;">${escapeHtml(product.name)}</h2>
      <p style="margin:0 0 14px 0;font-size:14px;color:#57534e;"><strong>Category:</strong> ${escapeHtml(product.category)}</p>
      ${detailBlock}
      <p style="margin:0 0 24px 0;font-size:16px;color:#1c1917;"><strong>Price:</strong> ${escapeHtml(price)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 32px 0;"><tr><td style="background:#1c1917;">
        <a href="${escapeHtml(productUrl)}" style="display:inline-block;padding:14px 32px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;font-weight:700;color:#ffffff;text-decoration:none;">View Product</a>
      </td></tr></table>
    </td></tr>
    <tr><td style="padding:20px 32px 28px 32px;border-top:1px solid #e7e2da;background:#faf9f7;">
      <p style="margin:0 0 10px 0;font-size:12px;line-height:1.6;color:#78716c;">You're receiving this email because product-update notifications are enabled on your Sourced Nexus account.</p>
      <p style="margin:0 0 10px 0;font-size:12px;line-height:1.6;"><a href="${escapeHtml(settingsUrl)}" style="color:#1c1917;text-decoration:underline;">Manage Notification Preferences</a></p>
      <p style="margin:0;font-size:12px;color:#a8a29e;">\u00a9 Sourced Nexus</p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;

  const text = [
    'SOURCED NEXUS',
    '',
    heading,
    '',
    `Hello ${name},`,
    intro,
    '',
    product.name,
    `Category: ${product.category}`,
    isNew ? desc : `Updated information: ${updateSummary || 'Product details were updated.'}`,
    `Price: ${price}`,
    '',
    `View product: ${productUrl}`,
    '',
    "You're receiving this email because product-update notifications are enabled on your Sourced Nexus account.",
    `Manage Notification Preferences: ${settingsUrl}`,
    '',
    '\u00a9 Sourced Nexus',
  ].filter((l) => l !== undefined).join('\n');

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Email provider  (Resend-compatible REST API; swap via EMAIL_API_URL)
// ---------------------------------------------------------------------------

/**
 * Send one email. Returns:
 *   { ok: true, messageId }
 *   { ok: false, retryable: boolean, reason }
 * 4xx responses (except 408/429) are PERMANENT (invalid address etc.) and are
 * never retried. 5xx, 429, 408 and network errors are temporary and retried.
 */
export async function sendEmail({ to, subject, html, text, idempotencyKey }) {
  const cfg = emailConfig();
  if (!cfg.configured) {
    return { ok: false, retryable: true, reason: 'Email provider is not configured (EMAIL_API_KEY / EMAIL_FROM_ADDRESS).' };
  }
  try {
    const isBrevo = cfg.provider === 'brevo';
    const res = await fetch(cfg.apiUrl, {
      method: 'POST',
      headers: isBrevo
        ? { 'api-key': cfg.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' }
        : {
            Authorization: `Bearer ${cfg.apiKey}`,
            'Content-Type': 'application/json',
            ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
          },
      body: JSON.stringify(
        isBrevo
          ? {
              sender: { name: cfg.fromName, email: cfg.fromAddress },
              to: [{ email: to }],
              subject,
              htmlContent: html,
              textContent: text,
            }
          : { from: `${cfg.fromName} <${cfg.fromAddress}>`, to: [to], subject, html, text },
      ),
      signal: AbortSignal.timeout(15_000),
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (res.ok) return { ok: true, messageId: data?.id || data?.messageId || null };

    const detail = String(data?.message || data?.error || data?.code || `HTTP ${res.status}`).slice(0, 300);
    const temporary = res.status === 429 || res.status === 408 || res.status >= 500;
    return { ok: false, retryable: temporary, reason: `Provider ${res.status}: ${detail}` };
  } catch (err) {
    return { ok: false, retryable: true, reason: `Network error: ${String(err?.message || err).slice(0, 200)}` };
  }
}

// ---------------------------------------------------------------------------
// Queue processing
// ---------------------------------------------------------------------------

export async function rpc(name, args = {}) {
  const url = `${process.env.VITE_SUPABASE_URL}/rest/v1/rpc/${name}`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(url, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(20_000),
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

export async function getUserInfo(userId) {
  // Email + name come from auth.users via the admin API. The service role key
  // stays on the server; the address never reaches a browser.
  const res = await fetch(`${process.env.VITE_SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404) return { gone: true };
  if (!res.ok) throw new Error(`user lookup ${res.status}`);
  const u = await res.json();
  return {
    gone: false,
    email: u.email || '',
    deleted: Boolean(u.deleted_at),
    banned: Boolean(u.banned_until && new Date(u.banned_until) > new Date()),
    name: u.user_metadata?.full_name || u.user_metadata?.name || '',
  };
}

export function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

async function markDelivery(id, patch) {
  await supabaseRest('PATCH', 'product_notification_deliveries', {
    query: { id: `eq.${id}` },
    body: patch,
  });
}

/**
 * Process the queue. Safe to call repeatedly and concurrently.
 * Returns aggregate counts only (never recipient addresses).
 */
export async function processNotificationQueue(req, { maxBatches = 5 } = {}) {
  const summary = { eventsQueued: 0, recipientsQueued: 0, sent: 0, failed: 0, retried: 0, skipped: 0, emailConfigured: emailConfig().configured };
  if (!supabaseServiceConfigured()) {
    return { ...summary, error: 'Server database access is not configured.' };
  }

  // 1. Queue pending events into per-user deliveries (idempotent, atomic claim).
  const pending = await supabaseRest('GET', 'product_notification_events', {
    query: { select: 'id', status: 'eq.pending', order: 'created_at.asc', limit: '20' },
  });
  if (pending.ok && Array.isArray(pending.data)) {
    for (const ev of pending.data) {
      const r = await rpc('queue_product_notification_event', { p_event_id: ev.id });
      if (r.ok && typeof r.data === 'number') {
        summary.eventsQueued += 1;
        summary.recipientsQueued += r.data;
      }
    }
  }

  // Without a provider we keep deliveries queued (pending) instead of burning retries.
  if (!summary.emailConfigured) {
    await rpc('finalize_product_notification_events');
    return summary;
  }

  const base = siteBaseUrl(req);
  const productCache = new Map();
  const eventCache = new Map();

  const loadProduct = async (id) => {
    if (productCache.has(id)) return productCache.get(id);
    const r = await supabaseRest('GET', 'products', {
      query: { select: 'id,name,description,price,category,images,status', id: `eq.${id}`, limit: '1' },
    });
    const p = r.ok && Array.isArray(r.data) ? r.data[0] || null : null;
    productCache.set(id, p);
    return p;
  };
  const loadEvent = async (id) => {
    if (eventCache.has(id)) return eventCache.get(id);
    const r = await supabaseRest('GET', 'product_notification_events', {
      query: { select: 'id,event_type,change_summary', id: `eq.${id}`, limit: '1' },
    });
    const e = r.ok && Array.isArray(r.data) ? r.data[0] || null : null;
    eventCache.set(id, e);
    return e;
  };

  // 2. Claim and send batches.
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const claimed = await rpc('claim_product_notification_deliveries', { p_limit: BATCH_SIZE });
    const rows = claimed.ok && Array.isArray(claimed.data) ? claimed.data : [];
    if (rows.length === 0) break;

    for (const d of rows) {
      try {
        const [product, event] = await Promise.all([loadProduct(d.product_id), loadEvent(d.event_id)]);
        // Product deleted or hidden since queueing: nothing valid to announce.
        if (!product || product.status === 'hidden') {
          await markDelivery(d.id, { status: 'failed', permanent_failure: true, failure_reason: 'Product is no longer available.' });
          summary.skipped += 1;
          continue;
        }

        const user = await getUserInfo(d.user_id);
        if (user.gone || user.deleted || user.banned || !isValidEmail(user.email)) {
          await markDelivery(d.id, { status: 'failed', permanent_failure: true, failure_reason: 'Recipient is no longer eligible (deleted, banned or invalid email).' });
          summary.skipped += 1;
          continue;
        }

        // Respect an opt-out made AFTER the delivery was queued.
        const prof = await supabaseRest('GET', 'user_profiles', {
          query: { select: 'product_notifications_enabled', id: `eq.${d.user_id}`, limit: '1' },
        });
        if (prof.ok && Array.isArray(prof.data) && prof.data[0]?.product_notifications_enabled === false) {
          await markDelivery(d.id, { status: 'failed', permanent_failure: true, failure_reason: 'User disabled product notifications.' });
          summary.skipped += 1;
          continue;
        }

        const imageUrl = await validateImageUrl(Array.isArray(product.images) ? product.images[0] : null);
        const email = buildEmail({
          type: d.notification_type,
          firstName: firstName(user.name, user.email),
          product,
          imageUrl,
          updateSummary: event?.change_summary?.replace(/^Updated:\s*/i, '') || '',
          productUrl: `${base}/product/${encodeURIComponent(product.id)}`,
          settingsUrl: `${base}/account/notifications`,
        });

        const sent = await sendEmail({ to: user.email, ...email, idempotencyKey: `pn-${d.id}` });
        if (sent.ok) {
          await markDelivery(d.id, { status: 'sent', sent_at: new Date().toISOString(), provider_message_id: sent.messageId, failure_reason: null });
          summary.sent += 1;
        } else if (sent.retryable && d.attempts < MAX_ATTEMPTS) {
          const delay = RETRY_DELAYS_MIN[Math.min(d.attempts - 1, RETRY_DELAYS_MIN.length - 1)];
          await markDelivery(d.id, {
            status: 'pending',
            failure_reason: sent.reason,
            next_attempt_at: new Date(Date.now() + delay * 60_000).toISOString(),
          });
          summary.retried += 1;
        } else {
          await markDelivery(d.id, { status: 'failed', permanent_failure: !sent.retryable, failure_reason: sent.reason });
          summary.failed += 1;
        }
      } catch (err) {
        // Never let one bad row stop the batch; put it back for a retry.
        const reason = `Processing error: ${String(err?.message || err).slice(0, 200)}`;
        if (d.attempts < MAX_ATTEMPTS) {
          const delay = RETRY_DELAYS_MIN[Math.min(d.attempts - 1, RETRY_DELAYS_MIN.length - 1)];
          await markDelivery(d.id, { status: 'pending', failure_reason: reason, next_attempt_at: new Date(Date.now() + delay * 60_000).toISOString() });
          summary.retried += 1;
        } else {
          await markDelivery(d.id, { status: 'failed', failure_reason: reason });
          summary.failed += 1;
        }
      }
    }
  }

  await rpc('finalize_product_notification_events');
  return summary;
}
