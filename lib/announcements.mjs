// ============================================================================
// Admin announcements: custom messages emailed to customers.
//
// Reuses the tested email provider, retry/backoff rules and opt-out check from
// product-notifications.mjs. Delivery rows live in announcement_deliveries
// (unique per announcement + user), so a message can never be sent twice to the
// same person. Returns aggregate counts only; recipient addresses never leave
// the server.
// ============================================================================

import { supabaseRest, supabaseServiceConfigured } from './payza-shared.mjs';
import {
  emailConfig, siteBaseUrl, sendEmail, escapeHtml, firstName, rpc, getUserInfo,
  isValidEmail, MAX_ATTEMPTS, BATCH_SIZE, RETRY_DELAYS_MIN,
} from './product-notifications.mjs';

/** Turn the admin's plain text into safe HTML paragraphs (escape first, then format). */
function messageToHtml(message) {
  return String(message)
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#44403c;">${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('\n      ');
}

function safeHttpsUrl(url) {
  try {
    const u = new URL(String(url || ''));
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export function buildAnnouncementEmail({ subject, message, buttonLabel, buttonUrl, firstName: name, settingsUrl }) {
  const url = safeHttpsUrl(buttonUrl);
  const label = (buttonLabel || '').trim() || 'Visit Sourced Nexus';
  const button = url
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 32px 0;"><tr><td style="background:#1c1917;">
        <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 32px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a>
      </td></tr></table>`
    : '<div style="height:16px;"></div>';

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f3ef;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ef;"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e7e2da;font-family:Helvetica,Arial,sans-serif;color:#1c1917;">
    <tr><td align="center" style="padding:28px 32px 20px 32px;border-bottom:1px solid #e7e2da;">
      <span style="font-size:20px;letter-spacing:.32em;font-weight:700;color:#1c1917;">SOURCED NEXUS</span>
    </td></tr>
    <tr><td style="padding:28px 32px 8px 32px;">
      <h1 style="margin:0 0 14px 0;font-size:24px;line-height:1.3;font-weight:600;color:#1c1917;">${escapeHtml(subject)}</h1>
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#44403c;">Hello <strong>${escapeHtml(name)}</strong>,</p>
      ${messageToHtml(message)}
      ${button}
    </td></tr>
    <tr><td style="padding:20px 32px 28px 32px;border-top:1px solid #e7e2da;background:#faf9f7;">
      <p style="margin:0 0 10px 0;font-size:12px;line-height:1.6;color:#78716c;">You're receiving this email because email notifications are enabled on your Sourced Nexus account.</p>
      <p style="margin:0 0 10px 0;font-size:12px;line-height:1.6;"><a href="${escapeHtml(settingsUrl)}" style="color:#1c1917;text-decoration:underline;">Manage Notification Preferences</a></p>
      <p style="margin:0;font-size:12px;color:#a8a29e;">\u00a9 Sourced Nexus</p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;

  const text = [
    'SOURCED NEXUS',
    '',
    subject,
    '',
    `Hello ${name},`,
    '',
    String(message).trim(),
    '',
    ...(url ? [`${label}: ${url}`, ''] : []),
    "You're receiving this email because email notifications are enabled on your Sourced Nexus account.",
    `Manage Notification Preferences: ${settingsUrl}`,
    '',
    '\u00a9 Sourced Nexus',
  ].join('\n');

  return { subject, html, text };
}

async function markDelivery(id, patch) {
  await supabaseRest('PATCH', 'announcement_deliveries', { query: { id: `eq.${id}` }, body: patch });
}

/** Queue pending announcements and send due deliveries. Safe to call repeatedly. */
export async function processAnnouncements(req, { maxBatches = 5 } = {}) {
  const summary = { announcementsQueued: 0, recipientsQueued: 0, sent: 0, failed: 0, retried: 0, skipped: 0, emailConfigured: emailConfig().configured };
  if (!supabaseServiceConfigured()) return { ...summary, error: 'Server database access is not configured.' };

  const pending = await supabaseRest('GET', 'admin_announcements', {
    query: { select: 'id', status: 'eq.pending', order: 'created_at.asc', limit: '10' },
  });
  if (pending.ok && Array.isArray(pending.data)) {
    for (const a of pending.data) {
      const r = await rpc('queue_announcement', { p_announcement_id: a.id });
      if (r.ok && typeof r.data === 'number') {
        summary.announcementsQueued += 1;
        summary.recipientsQueued += r.data;
      }
    }
  }

  if (!summary.emailConfigured) {
    await rpc('finalize_announcements');
    return summary;
  }

  const base = siteBaseUrl(req);
  const cache = new Map();
  const loadAnnouncement = async (id) => {
    if (cache.has(id)) return cache.get(id);
    const r = await supabaseRest('GET', 'admin_announcements', {
      query: { select: 'id,subject,message,button_label,button_url', id: `eq.${id}`, limit: '1' },
    });
    const a = r.ok && Array.isArray(r.data) ? r.data[0] || null : null;
    cache.set(id, a);
    return a;
  };

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const claimed = await rpc('claim_announcement_deliveries', { p_limit: BATCH_SIZE });
    const rows = claimed.ok && Array.isArray(claimed.data) ? claimed.data : [];
    if (rows.length === 0) break;

    for (const d of rows) {
      try {
        const ann = await loadAnnouncement(d.announcement_id);
        if (!ann) {
          await markDelivery(d.id, { status: 'failed', permanent_failure: true, failure_reason: 'Announcement no longer exists.' });
          summary.skipped += 1;
          continue;
        }
        const user = await getUserInfo(d.user_id);
        if (user.gone || user.deleted || user.banned || !isValidEmail(user.email)) {
          await markDelivery(d.id, { status: 'failed', permanent_failure: true, failure_reason: 'Recipient is no longer eligible (deleted, banned or invalid email).' });
          summary.skipped += 1;
          continue;
        }
        // Honour an opt-out made after queueing.
        const prof = await supabaseRest('GET', 'user_profiles', {
          query: { select: 'product_notifications_enabled', id: `eq.${d.user_id}`, limit: '1' },
        });
        if (prof.ok && Array.isArray(prof.data) && prof.data[0] && prof.data[0].product_notifications_enabled === false) {
          await markDelivery(d.id, { status: 'failed', permanent_failure: true, failure_reason: 'Recipient turned off email notifications.' });
          summary.skipped += 1;
          continue;
        }

        const email = buildAnnouncementEmail({
          subject: ann.subject,
          message: ann.message,
          buttonLabel: ann.button_label,
          buttonUrl: ann.button_url,
          firstName: firstName(user.name, user.email),
          settingsUrl: `${base}/account/notifications`,
        });
        const sent = await sendEmail({ to: user.email, ...email, idempotencyKey: `an-${d.id}` });
        if (sent.ok) {
          await markDelivery(d.id, { status: 'sent', sent_at: new Date().toISOString(), provider_message_id: sent.messageId, failure_reason: null });
          summary.sent += 1;
        } else if (sent.retryable && d.attempts < MAX_ATTEMPTS) {
          const delay = RETRY_DELAYS_MIN[Math.min(d.attempts - 1, RETRY_DELAYS_MIN.length - 1)];
          await markDelivery(d.id, { status: 'pending', failure_reason: sent.reason, next_attempt_at: new Date(Date.now() + delay * 60_000).toISOString() });
          summary.retried += 1;
        } else {
          await markDelivery(d.id, { status: 'failed', permanent_failure: !sent.retryable, failure_reason: sent.reason });
          summary.failed += 1;
        }
      } catch (err) {
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

  await rpc('finalize_announcements');
  return summary;
}

/**
 * Send ONE preview of an announcement to the admin's own address. The address
 * comes from the verified session, never from the request body, so this cannot
 * be used to mail anyone else.
 */
export async function sendAnnouncementTest(req, { subject, message, buttonLabel, buttonUrl, adminUserId }) {
  const cfg = emailConfig();
  if (!cfg.configured) return { ok: false, error: 'Email provider is not configured.' };
  const me = await getUserInfo(adminUserId);
  if (me.gone || !isValidEmail(me.email)) return { ok: false, error: 'Your account has no valid email address.' };
  const email = buildAnnouncementEmail({
    subject: `[TEST] ${subject}`,
    message,
    buttonLabel,
    buttonUrl,
    firstName: firstName(me.name, me.email),
    settingsUrl: `${siteBaseUrl(req)}/account/notifications`,
  });
  const sent = await sendEmail({ to: me.email, ...email });
  return sent.ok ? { ok: true } : { ok: false, error: sent.reason };
}
