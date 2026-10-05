// ============================================================================
// POST /api/notifications/process   (Vercel serverless mirror)
// Sends queued product-update emails. Callable ONLY by a signed-in admin or by
// the server cron (Authorization: Bearer <CRON_SECRET>). Returns aggregate
// counts only - never recipient email addresses.
// ============================================================================
import { authorizeProcessor, processNotificationQueue } from '../lib/product-notifications.mjs';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  // Vercel Cron issues GET with the CRON_SECRET bearer; the admin panel uses POST.
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
    const auth = await authorizeProcessor(req);
    if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });
    const result = await processNotificationQueue(req);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('[notifications] process error:', err.message);
    return res.status(500).json({ success: false, error: 'Could not process notifications.' });
  }
}
