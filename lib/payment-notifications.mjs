// ============================================================================
// SOURCED NEXUS - Admin payment notifications (server-side only)
// ----------------------------------------------------------------------------
// Used by BOTH backend surfaces (same pattern as lib/order-receipts.mjs):
//   - server.js  (Render)
//   - api/*.js   (Vercel serverless mirrors)
//
// FLOW
//   payment VERIFIED (amount + currency + reference checked, atomic
//   pending -> paid transition won)  ->  createReceiptForPayment()
//        -> notifyAdminsOfPayment(receipt):
//        1. one payment_admin_notifications row PER admin recipient
//           (UNIQUE payment_id + recipient_email = idempotent)
//        2. try to email each recipient once, right now
//   email failed/slow?  ->  processAdminPaymentNotifications() retries with
//   back-off (run by the same worker/cron as receipt retries).
//
// GUARANTEES
//   - Runs only for a verified-paid payment. Nothing here is reachable from
//     the browser, and the recipients come from the server, never a request.
//   - Needs no admin to be online, no dashboard open, no WhatsApp and no
//     customer browser. It is triggered by the payment provider's webhook.
//   - A duplicate webhook / verify call hits the UNIQUE guard and can never
//     create a second row or send a second email to the same admin.
//   - Email problems NEVER change payment or order state. The payment stays
//     PAID; only payment_admin_notifications.email_status moves.
//   - The email carries what is needed to identify the order and customer.
//     No card data, tokens, keys or payment credentials are ever included.
// ============================================================================

import { supabaseRest } from './payza-shared.mjs';
import {
  sendEmail,
  escapeHtml,
  emailLogoUrl,
  siteBaseUrl,
  emailConfig,
  isValidEmail,
  rpc,
} from './product-notifications.mjs';
import { formatKwacha, paymentMethodLabel } from './order-receipts.mjs';

// Same schedule as receipts: minutes to wait after attempt 1..5 fails.
export const ADMIN_RETRY_DELAYS_MIN = [2, 10, 30, 120, 360];
export const ADMIN_MAX_ATTEMPTS = 6;

// The two authorized administrators who must be told about every payment.
// Override on the server with PAYMENT_ADMIN_EMAILS="a@x.com,b@y.com".
export const DEFAULT_PAYMENT_ADMIN_EMAILS = ['frankmwalu04@gmail.com', 'sourcednexus@gmail.com'];

/** Authorized admin recipients: valid, lower-cased, de-duplicated. */
export function paymentAdminRecipients() {
  const fromEnv = String(process.env.PAYMENT_ADMIN_EMAILS || '')
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const list = fromEnv.length ? fromEnv : DEFAULT_PAYMENT_ADMIN_EMAILS;
  return [...new Set(list.map((e) => e.toLowerCase()))].filter((e) => isValidEmail(e));
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

// ---------------------------------------------------------------------------
// Email content
// ---------------------------------------------------------------------------

/**
 * Build the "New Payment Received" email from the frozen receipt snapshot of
 * the CONFIRMED order (never from a cart).
 */
export function buildAdminPaymentEmail(receipt, { siteUrl, orderStatus } = {}) {
  const base = (siteUrl || 'https://sourcednexus.online').replace(/\/$/, '');
  const items = Array.isArray(receipt.items) ? receipt.items : [];
  const name = receipt.customer_name || 'Not provided';
  const phone = receipt.customer_phone || 'Not provided';
  const status = orderStatus || 'Processing';
  const subject = `New Payment Received \u2014 Sourced Nexus \u2014 Order #${receipt.order_number}`;
  // Link to the order in the admin dashboard (the dashboard enforces its own sign-in).
  const adminUrl = `${base}/admin/orders`;

  const optionText = (i) => [i.grade, i.size && `Size ${i.size}`, i.color].filter(Boolean).join(' \u2022 ');
  const rows = items.map((i) => `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #eee9e0;font-size:14px;color:#1c1917;">
            ${escapeHtml(i.name)}${i.is_bundle ? ' <span style="font-size:11px;color:#a8802f;letter-spacing:.08em;text-transform:uppercase;">Bundle</span>' : ''}
            ${!i.is_bundle && optionText(i) ? `<div style="font-size:12px;color:#78716c;margin-top:2px;">${escapeHtml(optionText(i))}</div>` : ''}
          </td>
          <td align="right" style="padding:10px 8px;border-bottom:1px solid #eee9e0;font-size:14px;color:#44403c;">${escapeHtml(i.quantity)}</td>
          <td align="right" style="padding:10px 8px;border-bottom:1px solid #eee9e0;font-size:14px;color:#44403c;white-space:nowrap;">${escapeHtml(formatKwacha(i.unit_price))}</td>
          <td align="right" style="padding:10px 8px;border-bottom:1px solid #eee9e0;font-size:14px;color:#1c1917;white-space:nowrap;"><strong>${escapeHtml(formatKwacha(i.line_total))}</strong></td>
        </tr>`).join('');

  const detail = (label, value) => `
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#78716c;width:40%;vertical-align:top;">${label}</td>
          <td style="padding:4px 0;font-size:14px;color:#1c1917;"><strong>${value}</strong></td>
        </tr>`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f3ef;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ef;"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e7e2da;font-family:Helvetica,Arial,sans-serif;">
    <tr><td align="center" style="padding:24px 32px 16px 32px;border-bottom:1px solid #e7e2da;">
      <img src="${escapeHtml(emailLogoUrl(base))}" alt="Sourced Nexus" width="56" height="56" style="display:block;margin:0 auto 10px auto;width:56px;height:56px;border:0;border-radius:50%;">
      <span style="font-size:16px;letter-spacing:.3em;font-weight:700;color:#1c1917;">SOURCED NEXUS</span>
    </td></tr>
    <tr><td style="padding:24px 32px 8px 32px;">
      <p style="margin:0 0 6px 0;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#15803d;"><strong>Payment confirmed</strong></p>
      <h1 style="margin:0 0 12px 0;font-size:22px;font-weight:600;color:#1c1917;">New Payment Received \u2014 Sourced Nexus</h1>
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#44403c;">A customer has successfully paid for an order. The payment was verified by the server with the payment provider.</p>
    </td></tr>
    <tr><td style="padding:0 32px 8px 32px;">
      <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#78716c;"><strong>Customer</strong></p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${detail('Name', escapeHtml(name))}
        ${detail('Email', escapeHtml(receipt.customer_email))}
        ${detail('Phone', escapeHtml(phone))}
      </table>
    </td></tr>
    <tr><td style="padding:16px 32px 8px 32px;">
      <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#78716c;"><strong>Payment</strong></p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${detail('Order ID', `#${escapeHtml(receipt.order_number)}`)}
        ${detail('Transaction reference', escapeHtml(receipt.payment_reference))}
        ${detail('Provider / method', `${escapeHtml(receipt.provider === 'payza' ? 'Payza' : receipt.provider)} \u2022 ${escapeHtml(paymentMethodLabel(receipt.payment_method))}`)}
        ${detail('Date and time', escapeHtml(formatPaidDate(receipt.paid_at)))}
        ${detail('Payment status', '<span style="color:#15803d;">PAID</span>')}
        ${detail('Order status', escapeHtml(status))}
        ${detail('Currency', escapeHtml(receipt.currency))}
      </table>
    </td></tr>
    <tr><td style="padding:16px 32px 0 32px;">
      <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#78716c;"><strong>Products purchased</strong></p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #1c1917;">
        <tr>
          <th align="left" style="padding:8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#78716c;">Product</th>
          <th align="right" style="padding:8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#78716c;">Qty</th>
          <th align="right" style="padding:8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#78716c;">Unit</th>
          <th align="right" style="padding:8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#78716c;">Subtotal</th>
        </tr>${rows}
      </table>
    </td></tr>
    <tr><td style="padding:16px 32px 8px 32px;" align="right">
      <p style="margin:0;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#78716c;"><strong>Total paid</strong></p>
      <p style="margin:4px 0 0 0;font-size:28px;font-weight:700;color:#1c1917;">${escapeHtml(formatKwacha(receipt.total))} <span style="font-size:13px;font-weight:400;color:#78716c;">${escapeHtml(receipt.currency)}</span></p>
    </td></tr>
    <tr><td align="center" style="padding:20px 32px 8px 32px;">
      <a href="${escapeHtml(adminUrl)}" style="display:inline-block;background:#C5A059;color:#000000;text-decoration:none;font-size:12px;letter-spacing:.14em;text-transform:uppercase;padding:14px 26px;font-weight:700;">View order in dashboard</a>
    </td></tr>
    <tr><td style="padding:18px 32px 24px 32px;border-top:1px solid #e7e2da;">
      <p style="margin:0;font-size:12px;line-height:1.6;color:#a8a29e;">This is an automatic notification from the Sourced Nexus payment system. You will receive it even when the dashboard is closed. It contains no card or payment credentials.</p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const text = [
    'SOURCED NEXUS',
    'New Payment Received \u2014 Sourced Nexus',
    '',
    'A customer has successfully paid for an order (verified by the server with the payment provider).',
    '',
    'CUSTOMER',
    `Name: ${name}`,
    `Email: ${receipt.customer_email}`,
    `Phone: ${phone}`,
    '',
    'PAYMENT',
    `Order ID: #${receipt.order_number}`,
    `Transaction reference: ${receipt.payment_reference}`,
    `Provider / method: ${receipt.provider === 'payza' ? 'Payza' : receipt.provider} - ${paymentMethodLabel(receipt.payment_method)}`,
    `Date and time: ${formatPaidDate(receipt.paid_at)}`,
    'Payment status: PAID',
    `Order status: ${status}`,
    `Currency: ${receipt.currency}`,
    '',
    'PRODUCTS PURCHASED',
    ...items.map((i) => {
      const opt = i.is_bundle ? '' : optionText(i);
      return `- ${i.is_bundle ? '[BUNDLE] ' : ''}${i.name}${opt ? ` (${opt})` : ''}: ${i.quantity} x ${formatKwacha(i.unit_price)} = ${formatKwacha(i.line_total)}`;
    }),
    '',
    `TOTAL PAID: ${formatKwacha(receipt.total)} ${receipt.currency}`,
    '',
    `View order in dashboard: ${adminUrl}`,
  ].join('\n');

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Create + send (called once per verified payment)
// ---------------------------------------------------------------------------

/**
 * Queue one notification per admin recipient for this verified payment and
 * try to send each right now. Safe to call more than once for the same
 * payment: existing rows are left alone, so no row and no email is repeated.
 *
 * @param {object} receipt  the order_receipts row for the verified payment
 * @returns {{ created: number, sent: number, failed: number }}
 */
export async function notifyAdminsOfPayment(receipt, { req } = {}) {
  if (!receipt || !receipt.payment_id || !receipt.order_id) {
    return { created: 0, sent: 0, failed: 0, error: 'A paid receipt is required.' };
  }
  const recipients = paymentAdminRecipients();
  if (recipients.length === 0) {
    console.error('[admin-notify] no valid admin recipients configured');
    return { created: 0, sent: 0, failed: 0, error: 'No admin recipients.' };
  }

  // Which recipients already have a row for this payment? (duplicate webhook)
  const existing = await supabaseRest('GET', 'payment_admin_notifications', {
    query: { select: 'recipient_email', payment_id: `eq.${receipt.payment_id}`, limit: '50' },
  });
  const have = new Set((Array.isArray(existing.data) ? existing.data : []).map((r) => String(r.recipient_email).toLowerCase()));

  let created = 0;
  const fresh = [];
  for (const recipient of recipients) {
    if (have.has(recipient)) continue;
    const ins = await supabaseRest('POST', 'payment_admin_notifications', {
      body: {
        order_id: receipt.order_id,
        payment_id: receipt.payment_id,
        receipt_id: receipt.id || null,
        recipient_email: recipient,
        email_status: 'pending',
        email_attempts: 0,
        email_next_attempt_at: new Date().toISOString(),
      },
      prefer: 'return=representation',
    });
    // 409 = a parallel call inserted it first: that call sends it, not us.
    if (ins.ok && Array.isArray(ins.data) && ins.data[0]) {
      created += 1;
      fresh.push(ins.data[0]);
    }
  }

  // First send attempt, inline, ONLY for rows this call created. Failures are
  // recorded on the row and retried; they never touch payment/order state.
  let sent = 0;
  let failed = 0;
  for (const row of fresh) {
    const r = await sendAdminPaymentEmail(row, receipt, { req }).catch((err) => ({ ok: false, reason: String(err?.message || err) }));
    if (r.ok) sent += 1; else failed += 1;
  }
  return { created, sent, failed };
}

/**
 * Send one admin notification and record the outcome on its row.
 * Never throws for provider problems and never touches payment/order state.
 */
export async function sendAdminPaymentEmail(row, receipt, { req } = {}) {
  const cfg = emailConfig();
  const attempts = Number(row.email_attempts || 0) + (row.email_status === 'sending' ? 0 : 1);

  const fail = async (reason, retryable) => {
    const exhausted = !retryable || attempts >= ADMIN_MAX_ATTEMPTS;
    const delayMin = ADMIN_RETRY_DELAYS_MIN[Math.min(attempts - 1, ADMIN_RETRY_DELAYS_MIN.length - 1)] || 360;
    await supabaseRest('PATCH', 'payment_admin_notifications', {
      query: { id: `eq.${row.id}` },
      body: {
        email_status: 'failed',
        email_attempts: attempts,
        email_last_error: String(reason).slice(0, 300),
        email_next_attempt_at: new Date(Date.now() + (exhausted ? 365 * 24 * 3600 * 1000 : delayMin * 60 * 1000)).toISOString(),
      },
    });
    console.error('[admin-notify] not sent:', String(reason).slice(0, 120));
    return { ok: false, reason };
  };

  if (!cfg.configured) return fail('Email provider is not configured.', true);
  if (!isValidEmail(row.recipient_email)) return fail('Admin email address is invalid.', false);

  // Order status comes from the stored order, so the email reflects reality.
  let orderStatus = 'Processing';
  const o = await supabaseRest('GET', 'orders', { query: { select: 'status', id: `eq.${row.order_id}`, limit: '1' } });
  if (Array.isArray(o.data) && o.data[0]?.status) {
    orderStatus = String(o.data[0].status).replace(/^./, (c) => c.toUpperCase());
  }

  const { subject, html, text } = buildAdminPaymentEmail(receipt, { siteUrl: siteBaseUrl(req), orderStatus });
  // One key per payment AND recipient: the provider itself refuses a double
  // send if a retry races a slow first attempt.
  const idempotencyKey = `admin-pay-${row.payment_id}-${row.recipient_email}`;
  const result = await sendEmail({ to: row.recipient_email, subject, html, text, idempotencyKey });
  if (!result.ok) return fail(result.reason, result.retryable);

  await supabaseRest('PATCH', 'payment_admin_notifications', {
    query: { id: `eq.${row.id}` },
    body: {
      email_status: 'sent',
      email_attempts: attempts,
      email_last_error: null,
      email_sent_at: new Date().toISOString(),
      email_message_id: result.messageId || null,
    },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Retry worker
// ---------------------------------------------------------------------------

/**
 * Send admin notifications whose email is pending/failed and due. Safe to run
 * from several workers at once (claim uses SKIP LOCKED). Returns counts only,
 * never recipient addresses.
 */
export async function processAdminPaymentNotifications({ req, limit = 20 } = {}) {
  const claimed = await rpc('claim_payment_admin_notifications', { p_limit: limit });
  if (!claimed.ok || !Array.isArray(claimed.data)) {
    return { ok: false, error: 'Could not claim admin notifications.', sent: 0, failed: 0 };
  }
  let sent = 0;
  let failed = 0;
  for (const row of claimed.data) {
    // The email is rebuilt from the frozen receipt, never from a cart.
    const rec = await supabaseRest('GET', 'order_receipts', {
      query: { select: '*', payment_id: `eq.${row.payment_id}`, limit: '1' },
    });
    const receipt = Array.isArray(rec.data) ? rec.data[0] : null;
    if (!receipt) { failed += 1; continue; }
    const r = await sendAdminPaymentEmail(row, receipt, { req }).catch(() => ({ ok: false }));
    if (r.ok) sent += 1; else failed += 1;
  }
  return { ok: true, claimed: claimed.data.length, sent, failed };
}
