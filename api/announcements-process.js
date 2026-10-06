// ============================================================================
// POST /api/announcements/process   (Vercel serverless mirror)
//   body {}                      -> queue + send pending announcements
//   body { action: "test", ... } -> send ONE preview to the signed-in admin only
// Admin session only for "test"; admin or CRON_SECRET for the queue run.
// Returns aggregate counts only, never recipient addresses.
// ============================================================================
import { authorizeProcessor } from '../lib/product-notifications.mjs';
import { processAnnouncements, sendAnnouncementTest } from '../lib/announcements.mjs';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
    const auth = await authorizeProcessor(req);
    if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

    const body = req.method === 'POST' && req.body && typeof req.body === 'object' ? req.body : {};
    if (body.action === 'test') {
      if (auth.via !== 'admin') return res.status(403).json({ success: false, error: 'Administrator access required.' });
      const subject = String(body.subject || '').trim().slice(0, 150);
      const message = String(body.message || '').trim().slice(0, 5000);
      if (!subject || !message) return res.status(400).json({ success: false, error: 'Subject and message are required.' });
      const r = await sendAnnouncementTest(req, {
        subject, message, buttonLabel: body.buttonLabel, buttonUrl: body.buttonUrl, adminUserId: auth.userId,
      });
      return res.status(r.ok ? 200 : 502).json({ success: r.ok, ...(r.ok ? {} : { error: r.error }) });
    }

    const result = await processAnnouncements(req);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('[announcements] error:', err.message);
    return res.status(500).json({ success: false, error: 'Could not process announcements.' });
  }
}
