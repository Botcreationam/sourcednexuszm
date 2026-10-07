// ============================================================================
// SOURCED NEXUS - Payment receipts (server-side only)
// ----------------------------------------------------------------------------
// Used by BOTH backend surfaces (same pattern as lib/payza-shared.mjs):
//   - server.js  (Render)
//   - api/*.js   (Vercel serverless mirrors)
//
// FLOW
//   payment VERIFIED (amount + currency + reference checked, atomic
//   pending -> paid transition won)  ->  createReceiptForPayment():
//        1. read the CONFIRMED order + frozen order_items (never the cart)
//        2. insert ONE order_receipts row (payment_id is UNIQUE = idempotent)
//        3. try to email it once, right now
//   email failed/slow?  ->  processReceiptEmails() retries with back-off.
//
// GUARANTEES
//   - A receipt exists only for a payment that was verified as paid.
//   - A duplicate webhook / verify call hits the UNIQUE(payment_id) guard and
//     can never create a second receipt or send a second email.
//   - Email problems NEVER change payment or order state. The payment stays
//     PAID; only order_receipts.email_status moves (pending/failed -> retry).
//   - The receipt shows the numbers stored at purchase time. A later cart
//     change or catalog price change cannot alter it.
// ============================================================================

import crypto from 'node:crypto';
import { supabaseRest } from './payza-shared.mjs';
import {
  sendEmail,
  escapeHtml,
  firstName,
  emailLogoUrl,
  siteBaseUrl,
  emailConfig,
  isValidEmail,
  rpc,
} from './product-notifications.mjs';

// Retry schedule (minutes) after attempt 1..5 fails with a temporary error.
export const RECEIPT_RETRY_DELAYS_MIN = [2, 10, 30, 120, 360];
export const RECEIPT_MAX_ATTEMPTS = 6;

// ---------------------------------------------------------------------------
// Formatting (one place, so email + API + UI text always agree)
// ---------------------------------------------------------------------------

/** "K1,400" for whole amounts, "K1,400.50" otherwise. ZMW only. */
export function formatKwacha(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 'K0';
  const hasCents = Math.abs(n - Math.round(n)) > 0.004;
  return `K${n.toLocaleString('en-US', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatPaidDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'Africa/Lusaka',
  }) + ' (CAT)';
}

export function paymentMethodLabel(method) {
  const m = String(method || '').toLowerCase();
  if (!m) return 'Mobile money (Payza)';
  if (m.includes('airtel')) return 'Airtel Money';
  if (m.includes('mtn')) return 'MTN Mobile Money';
  if (m.includes('zamtel')) return 'Zamtel Kwacha';
  if (m.includes('card')) return 'Card';
  if (m.includes('mobile')) return 'Mobile money (Payza)';
  return String(method).slice(0, 40);
}

function receiptNumberFor(orderNumber) {
  // Stable and human friendly; unique because order_number is unique and a
  // paid order has exactly one verified payment.
  return `RC-${String(orderNumber).replace(/^SN-/, '')}`;
}

// ---------------------------------------------------------------------------
// Receipt creation (called once per verified payment)
// ---------------------------------------------------------------------------

/**
 * Freeze a receipt from the CONFIRMED order and try the first email.
 * Safe to call more than once for the same payment: the second call finds the
 * existing receipt and does nothing (no new row, no new email).
 *
 * @param {object} payment  the payments row that just became 'paid'
 * @returns {{ receipt, created: boolean, emailed: boolean }|{ error }}
 */
export async function createReceiptForPayment(payment, { req } = {}) {
  if (!payment || payment.status !== 'paid') {
    return { error: 'A receipt can only be created for a paid payment.' };
  }

  // Already issued? (duplicate webhook / verify / manual retry)
  const existing = await supabaseRest('GET', 'order_receipts', {
    query: { select: '*', payment_id: `eq.${payment.id}`, limit: '1' },
  });
  if (existing.ok && Array.isArray(existing.data) && existing.data[0]) {
    return { receipt: existing.data[0], created: false, emailed: existing.data[0].email_status === 'sent' };
  }

  const [orderRes, itemsRes] = await Promise.all([
    supabaseRest('GET', 'orders', { query: { select: '*', id: `eq.${payment.order_id}`, limit: '1' } }),
    supabaseRest('GET', 'order_items', {
      query: { select: '*', order_id: `eq.${payment.order_id}`, order: 'created_at.asc', limit: '200' },
    }),
  ]);
  const order = Array.isArray(orderRes.data) ? orderRes.data[0] : null;
  const items = Array.isArray(itemsRes.data) ? itemsRes.data : [];

  // Frozen contents of any bundle lines. Failure to read (e.g. migration not
  // applied) only means "no bundle lines", never a failed receipt.
  const bundleItemIds = items.filter((i) => i.is_bundle).map((i) => i.id);
  const componentsByItem = {};
  if (bundleItemIds.length) {
    const compRes = await supabaseRest('GET', 'order_item_components', {
      query: { select: '*', order_item_id: `in.(${bundleItemIds.join(',')})`, order: 'created_at.asc', limit: '500' },
    });
    for (const c of Array.isArray(compRes.data) ? compRes.data : []) {
      (componentsByItem[c.order_item_id] ||= []).push(c);
    }
  }
  if (!order || items.length === 0) return { error: 'Confirmed order not found for receipt.' };

  // Integrity: what we print must equal what was charged and verified.
  const itemsTotal = Math.round(items.reduce((s, i) => s + Number(i.line_total || 0), 0) * 100) / 100;
  const charged = Math.round(Number(payment.amount) * 100) / 100;
  if (Math.abs(itemsTotal - charged) > 0.009 || Math.abs(Number(order.subtotal) - charged) > 0.009) {
    // Should be impossible (the amount check already ran). Never print a
    // receipt whose numbers disagree; surface it for admin review instead.
    console.error('[receipt] total mismatch', { order: order.order_number, itemsTotal, charged });
    return { error: 'Receipt totals did not match the verified payment.' };
  }

  const customerName = [order.customer_first_name, order.customer_last_name].filter(Boolean).join(' ').trim() || null;
  const row = {
    order_id: order.id,
    payment_id: payment.id,
    user_id: order.user_id,
    receipt_number: receiptNumberFor(order.order_number),
    order_number: order.order_number,
    payment_reference: payment.reference,
    payment_method: payment.payment_method || null,
    provider: payment.provider || 'payza',
    currency: 'ZMW',
    total: charged,
    customer_name: customerName,
    customer_email: order.customer_email,
    items: items.map((i) => ({
      name: i.is_bundle ? (i.bundle_name || i.product_name) : i.product_name,
      grade: i.grade_name || null,
      size: i.selected_size || null,
      color: i.selected_color || null,
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
      line_total: Number(i.line_total),
      // size verification snapshot (only present when relevant)
      ...(i.sizing_standard ? { sizing_standard: i.sizing_standard } : {}),
      ...(i.size_verified ? { size_verified: true } : {}),
      // bundle snapshot: name + exactly what was inside it
      ...(i.is_bundle ? {
        is_bundle: true,
        bundle_savings: Number(i.bundle_savings || 0),
        bundle_separate_total: Number(i.bundle_separate_total || 0),
        components: (componentsByItem[i.id] || []).map((c) => ({
          name: c.product_name,
          quantity: Number(c.quantity),
          unit_price: Number(c.unit_price),
          grade: c.grade_name || null,
          size: c.selected_size || null,
          color: c.selected_color || null,
          ...(c.sizing_standard ? { sizing_standard: c.sizing_standard } : {}),
          ...(c.size_verified ? { size_verified: true } : {}),
        })),
      } : {}),
    })),
    paid_at: payment.completed_at || new Date().toISOString(),
    email_status: 'pending',
    email_attempts: 0,
    email_next_attempt_at: new Date().toISOString(),
  };

  const inserted = await supabaseRest('POST', 'order_receipts', { body: row, prefer: 'return=representation' });
  if (!inserted.ok || !Array.isArray(inserted.data) || !inserted.data[0]) {
    // Lost a race to a parallel call? Then the receipt exists: not an error.
    const again = await supabaseRest('GET', 'order_receipts', {
      query: { select: '*', payment_id: `eq.${payment.id}`, limit: '1' },
    });
    if (again.ok && Array.isArray(again.data) && again.data[0]) {
      return { receipt: again.data[0], created: false, emailed: again.data[0].email_status === 'sent' };
    }
    console.error('[receipt] insert failed', inserted.status);
    return { error: 'Could not store the receipt.' };
  }

  // Record the confirmation on the order (audit + "paid at" for My Orders).
  await supabaseRest('PATCH', 'orders', {
    query: { id: `eq.${order.id}` },
    body: { paid_at: row.paid_at, paid_amount: charged, paid_payment_id: payment.id },
  });

  // First send attempt, inline. Any failure here is recorded, never thrown:
  // payment stays PAID and the worker retries.
  const receipt = inserted.data[0];
  const sent = await sendReceiptEmail(receipt, { req }).catch((err) => ({ ok: false, reason: String(err?.message || err) }));
  return { receipt: sent.receipt || receipt, created: true, emailed: Boolean(sent.ok) };
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export function buildReceiptEmail(receipt, { siteUrl } = {}) {
  const base = (siteUrl || 'https://sourcednexus.online').replace(/\/$/, '');
  const name = firstName(receipt.customer_name, receipt.customer_email);
  const subject = `Payment Receipt \u2014 Sourced Nexus \u2014 Order #${receipt.order_number}`;
  const items = Array.isArray(receipt.items) ? receipt.items : [];

  const optionText = (i) => [i.grade, i.size && `Size ${i.size}`, i.color].filter(Boolean).join(' \u2022 ');
  // "Size: EU 52 | Sizing standard: Global / International | Size verification: Confirmed"
  const sizeLines = (i) => (i.size ? [
    `Size: ${i.size}`,
    i.sizing_standard ? `Sizing standard: ${i.sizing_standard}` : null,
    i.size_verified ? 'Size verification: Confirmed' : null,
  ].filter(Boolean) : []);
  const bundleHtml = (i) => (i.is_bundle && Array.isArray(i.components) ? `
            <div style="margin-top:6px;padding:8px 10px;background:#faf8f4;border-left:2px solid #C5A059;font-size:12px;color:#57534e;">
              <div style="letter-spacing:.08em;text-transform:uppercase;font-size:11px;color:#78716c;margin-bottom:4px;"><strong>Bundle includes</strong></div>
              ${i.components.map((c) => `<div style="margin:2px 0;">${escapeHtml(c.quantity)} x ${escapeHtml(c.name)}${sizeLines(c).length ? ` <span style="color:#78716c;">(${escapeHtml(sizeLines(c).join(' | '))})</span>` : ''}</div>`).join('')}
              ${i.bundle_savings > 0 ? `<div style="margin-top:4px;color:#15803d;">You saved ${escapeHtml(formatKwacha(i.bundle_savings * i.quantity))}</div>` : ''}
            </div>` : '');
  const sizeHtml = (i) => (!i.is_bundle && sizeLines(i).length ? `
            <div style="font-size:12px;color:#57534e;margin-top:3px;">${sizeLines(i).map((l) => escapeHtml(l)).join('<br>')}</div>` : '');

  const rows = items.map((i) => `
        <tr>
          <td style="padding:12px 8px;border-bottom:1px solid #eee9e0;font-size:14px;color:#1c1917;">
            ${escapeHtml(i.name)}${i.is_bundle ? ' <span style="font-size:11px;color:#a8802f;letter-spacing:.08em;text-transform:uppercase;">Bundle</span>' : ''}
            ${!i.is_bundle && optionText(i) ? `<div style="font-size:12px;color:#78716c;margin-top:2px;">${escapeHtml([i.grade, i.color].filter(Boolean).join(' \u2022 '))}</div>` : ''}${sizeHtml(i)}${bundleHtml(i)}
          </td>
          <td align="right" style="padding:12px 8px;border-bottom:1px solid #eee9e0;font-size:14px;color:#44403c;">${escapeHtml(i.quantity)}</td>
          <td align="right" style="padding:12px 8px;border-bottom:1px solid #eee9e0;font-size:14px;color:#44403c;white-space:nowrap;">${escapeHtml(formatKwacha(i.unit_price))}</td>
          <td align="right" style="padding:12px 8px;border-bottom:1px solid #eee9e0;font-size:14px;color:#1c1917;white-space:nowrap;"><strong>${escapeHtml(formatKwacha(i.line_total))}</strong></td>
        </tr>`).join('');

  const detail = (label, value) => `
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#78716c;width:42%;">${label}</td>
          <td style="padding:4px 0;font-size:14px;color:#1c1917;"><strong>${value}</strong></td>
        </tr>`;

  const ordersUrl = `${base}/account/orders`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f3ef;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ef;"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e7e2da;font-family:Helvetica,Arial,sans-serif;">
    <tr><td align="center" style="padding:28px 32px 20px 32px;border-bottom:1px solid #e7e2da;">
      <img src="${escapeHtml(emailLogoUrl(base))}" alt="Sourced Nexus" width="72" height="72" style="display:block;margin:0 auto 14px auto;width:72px;height:72px;border:0;">
      <span style="font-size:20px;letter-spacing:.32em;font-weight:700;color:#1c1917;">SOURCED NEXUS</span>
    </td></tr>
    <tr><td style="padding:28px 32px 8px 32px;">
      <p style="margin:0 0 6px 0;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#a8802f;"><strong>Payment Successful</strong></p>
      <h1 style="margin:0 0 16px 0;font-size:24px;font-weight:600;color:#1c1917;">Thank you for your purchase</h1>
      <p style="margin:0 0 6px 0;font-size:15px;line-height:1.6;color:#44403c;">Hello <strong>${escapeHtml(name)}</strong>,</p>
      <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#44403c;">Your payment has been successfully confirmed. Here is your receipt.</p>
    </td></tr>
    <tr><td style="padding:0 32px 8px 32px;">
      <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#78716c;"><strong>Order details</strong></p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${detail('Order', `#${escapeHtml(receipt.order_number)}`)}
        ${detail('Receipt', escapeHtml(receipt.receipt_number))}
        ${detail('Payment reference', escapeHtml(receipt.payment_reference))}
        ${detail('Date', escapeHtml(formatPaidDate(receipt.paid_at)))}
        ${detail('Payment status', '<span style="color:#15803d;">PAID</span>')}
        ${detail('Payment method', escapeHtml(paymentMethodLabel(receipt.payment_method)))}
      </table>
    </td></tr>
    <tr><td style="padding:20px 32px 0 32px;">
      <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#78716c;"><strong>Items</strong></p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #1c1917;">
        <tr>
          <th align="left" style="padding:10px 8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#78716c;">Product</th>
          <th align="right" style="padding:10px 8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#78716c;">Qty</th>
          <th align="right" style="padding:10px 8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#78716c;">Unit price</th>
          <th align="right" style="padding:10px 8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#78716c;">Subtotal</th>
        </tr>${rows}
      </table>
    </td></tr>
    <tr><td style="padding:18px 32px 8px 32px;" align="right">
      <p style="margin:0;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#78716c;"><strong>Total paid</strong></p>
      <p style="margin:4px 0 0 0;font-size:30px;font-weight:700;color:#1c1917;">${escapeHtml(formatKwacha(receipt.total))}</p>
      <p style="margin:2px 0 0 0;font-size:12px;color:#78716c;">${escapeHtml(receipt.currency)}</p>
    </td></tr>
    <tr><td align="center" style="padding:24px 32px 8px 32px;">
      <a href="${escapeHtml(ordersUrl)}" style="display:inline-block;background:#C5A059;color:#000000;text-decoration:none;font-size:12px;letter-spacing:.14em;text-transform:uppercase;padding:14px 28px;"><strong>View my orders</strong></a>
    </td></tr>
    <tr><td style="padding:20px 32px 28px 32px;border-top:1px solid #e7e2da;">
      <p style="margin:0 0 6px 0;font-size:14px;line-height:1.6;color:#44403c;">Thank you for shopping with <strong>Sourced Nexus</strong>.</p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:#a8a29e;">Keep this email as your proof of payment. You can also view this receipt any time in your account under My Orders.</p>
      <p style="margin:12px 0 0 0;font-size:12px;color:#a8a29e;">&copy; Sourced Nexus</p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const text = [
    'SOURCED NEXUS',
    'Payment Successful',
    '',
    `Hello ${name},`,
    'Thank you for your purchase from Sourced Nexus. Your payment has been successfully confirmed.',
    '',
    `Order: #${receipt.order_number}`,
    `Receipt: ${receipt.receipt_number}`,
    `Payment reference: ${receipt.payment_reference}`,
    `Date: ${formatPaidDate(receipt.paid_at)}`,
    'Payment status: PAID',
    `Payment method: ${paymentMethodLabel(receipt.payment_method)}`,
    '',
    'ITEMS',
    ...items.flatMap((i) => {
      const opt = i.is_bundle ? '' : optionText(i);
      const head = `- ${i.is_bundle ? '[BUNDLE] ' : ''}${i.name}${opt ? ` (${opt})` : ''}: ${i.quantity} x ${formatKwacha(i.unit_price)} = ${formatKwacha(i.line_total)}`;
      const extra = i.is_bundle
        ? [
            '    Bundle includes:',
            ...(i.components || []).map((c) => `      * ${c.quantity} x ${c.name}${sizeLines(c).length ? ` (${sizeLines(c).join(' | ')})` : ''}`),
            ...(i.bundle_savings > 0 ? [`    You saved ${formatKwacha(i.bundle_savings * i.quantity)}`] : []),
          ]
        : sizeLines(i).map((l) => `    ${l}`);
      return [head, ...extra];
    }),
    '',
    `TOTAL PAID: ${formatKwacha(receipt.total)} ${receipt.currency}`,
    '',
    `View your orders: ${ordersUrl}`,
    '',
    'Thank you for shopping with Sourced Nexus.',
    '(c) Sourced Nexus',
  ].join('\n');

  return { subject, html, text };
}

/**
 * Send one receipt email and record the outcome on the receipt row.
 * Never throws for provider problems and never touches payment/order state.
 */
export async function sendReceiptEmail(receipt, { req } = {}) {
  const cfg = emailConfig();
  const attempts = Number(receipt.email_attempts || 0) + (receipt.email_status === 'sending' ? 0 : 1);

  const fail = async (reason, retryable) => {
    const exhausted = !retryable || attempts >= RECEIPT_MAX_ATTEMPTS;
    const delayMin = RECEIPT_RETRY_DELAYS_MIN[Math.min(attempts - 1, RECEIPT_RETRY_DELAYS_MIN.length - 1)] || 360;
    const patch = {
      email_status: 'failed',
      email_attempts: attempts,
      email_last_error: String(reason).slice(0, 300),
      // permanent/exhausted failures are parked far in the future; the
      // receipt stays available in the customer's account either way.
      email_next_attempt_at: new Date(Date.now() + (exhausted ? 365 * 24 * 3600 * 1000 : delayMin * 60 * 1000)).toISOString(),
    };
    const upd = await supabaseRest('PATCH', 'order_receipts', {
      query: { id: `eq.${receipt.id}` }, body: patch, prefer: 'return=representation',
    });
    return { ok: false, reason, receipt: Array.isArray(upd.data) ? upd.data[0] : receipt };
  };

  if (!cfg.configured) return fail('Email provider is not configured.', true);
  if (!isValidEmail(receipt.customer_email)) return fail('Customer email address is invalid.', false);

  const { subject, html, text } = buildReceiptEmail(receipt, { siteUrl: siteBaseUrl(req) });
  // The idempotency key makes the provider itself refuse a double send if a
  // retry races a slow first attempt.
  const idempotencyKey = `receipt-${receipt.payment_id}`;
  const result = await sendEmail({ to: receipt.customer_email, subject, html, text, idempotencyKey });
  if (!result.ok) return fail(result.reason, result.retryable);

  const upd = await supabaseRest('PATCH', 'order_receipts', {
    query: { id: `eq.${receipt.id}` },
    body: {
      email_status: 'sent',
      email_attempts: attempts,
      email_last_error: null,
      email_sent_at: new Date().toISOString(),
      email_message_id: result.messageId || null,
    },
    prefer: 'return=representation',
  });
  return { ok: true, receipt: Array.isArray(upd.data) ? upd.data[0] : receipt };
}

// ---------------------------------------------------------------------------
// Retry worker
// ---------------------------------------------------------------------------

/**
 * Send receipts whose email is pending/failed and due. Safe to run from
 * several workers at once (claim_receipt_emails uses SKIP LOCKED).
 */
export async function processReceiptEmails({ req, limit = 20 } = {}) {
  const claimed = await rpc('claim_receipt_emails', { p_limit: limit });
  if (!claimed.ok || !Array.isArray(claimed.data)) {
    return { ok: false, error: 'Could not claim receipts.', sent: 0, failed: 0 };
  }
  let sent = 0;
  let failed = 0;
  for (const receipt of claimed.data) {
    // claim already incremented attempts and set 'sending'
    const r = await sendReceiptEmail(receipt, { req }).catch(() => ({ ok: false }));
    if (r.ok) sent += 1; else failed += 1;
  }
  return { ok: true, claimed: claimed.data.length, sent, failed };
}

/** Short, safe view of a receipt for API responses (no internal ids). */
export function publicReceipt(r) {
  return {
    receiptNumber: r.receipt_number,
    orderNumber: r.order_number,
    paymentReference: r.payment_reference,
    paymentMethod: paymentMethodLabel(r.payment_method),
    currency: r.currency,
    total: Number(r.total),
    customerName: r.customer_name,
    customerEmail: r.customer_email,
    items: r.items,
    paidAt: r.paid_at,
    emailStatus: r.email_status,
  };
}

export function newIdempotencyToken() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Frozen order lines (with bundle contents and size snapshots) for display, for
 * one or many orders. Returns Map(orderId -> items[]). Reads the stored order
 * rows only, never the live catalog, so later edits cannot change history.
 * Falls back to the original column list if the size/bundle migration has not
 * been applied yet.
 */
export async function loadOrderItemsForDisplay(orderIds) {
  const result = new Map();
  if (!orderIds.length) return result;
  const FULL = 'id,order_id,product_name,selected_size,selected_color,grade_name,unit_price,quantity,line_total,is_bundle,bundle_name,bundle_savings,sizing_standard,size_verified';
  const BASE = 'id,order_id,product_name,selected_size,selected_color,grade_name,unit_price,quantity,line_total';
  const q = (select) => supabaseRest('GET', 'order_items', {
    query: { select, order_id: `in.(${orderIds.join(',')})`, order: 'created_at.asc', limit: '1000' },
  });
  let itemsRes = await q(FULL);
  if (!itemsRes.ok) itemsRes = await q(BASE);
  const rows = Array.isArray(itemsRes.data) ? itemsRes.data : [];

  const bundleIds = rows.filter((r) => r.is_bundle).map((r) => r.id);
  const comps = {};
  if (bundleIds.length) {
    const cr = await supabaseRest('GET', 'order_item_components', {
      query: { select: 'order_item_id,product_name,quantity,selected_size,sizing_standard,size_verified', order_item_id: `in.(${bundleIds.join(',')})`, order: 'created_at.asc', limit: '2000' },
    });
    for (const c of Array.isArray(cr.data) ? cr.data : []) (comps[c.order_item_id] ||= []).push(c);
  }
  for (const i of rows) {
    const item = {
      name: i.is_bundle ? (i.bundle_name || i.product_name) : i.product_name,
      size: i.selected_size || null,
      color: i.selected_color || null,
      grade: i.grade_name || null,
      unitPrice: Number(i.unit_price),
      quantity: Number(i.quantity),
      lineTotal: Number(i.line_total),
      ...(i.sizing_standard ? { sizingStandard: i.sizing_standard } : {}),
      ...(i.size_verified ? { sizeVerified: true } : {}),
      ...(i.is_bundle ? {
        isBundle: true,
        savings: Number(i.bundle_savings || 0),
        components: (comps[i.id] || []).map((c) => ({
          name: c.product_name,
          quantity: Number(c.quantity),
          size: c.selected_size || null,
          sizingStandard: c.sizing_standard || null,
          sizeVerified: Boolean(c.size_verified),
        })),
      } : {}),
    };
    (result.get(i.order_id) || result.set(i.order_id, []).get(i.order_id)).push(item);
  }
  return result;
}

/**
 * What the success page needs after a verify call: the CONFIRMED order total,
 * and whether the receipt email really went out. The page must not claim
 * "receipt sent" unless emailStatus === 'sent'.
 */
export async function confirmedOrderSummary(orderId) {
  const [orderRes, receiptRes] = await Promise.all([
    supabaseRest('GET', 'orders', {
      query: { select: 'order_number,status,payment_status,subtotal,currency,customer_email', id: `eq.${orderId}`, limit: '1' },
    }),
    supabaseRest('GET', 'order_receipts', {
      query: { select: 'receipt_number,payment_reference,total,email_status,customer_email', order_id: `eq.${orderId}`, limit: '1' },
    }),
  ]);
  const order = Array.isArray(orderRes.data) ? orderRes.data[0] : null;
  const receipt = Array.isArray(receiptRes.data) ? receiptRes.data[0] : null;
  // Frozen line items from the stored order. Only returned for a paid order so
  // the "send product details to WhatsApp" option can never appear before the
  // payment is confirmed.
  let items = [];
  if (order && order.payment_status === 'paid') {
    items = (await loadOrderItemsForDisplay([orderId])).get(orderId) || [];
  }
  return {
    items,
    order,
    receipt: receipt
      ? {
          receiptNumber: receipt.receipt_number,
          paymentReference: receipt.payment_reference,
          total: Number(receipt.total),
          emailStatus: receipt.email_status,
          email: receipt.customer_email,
        }
      : null,
  };
}
