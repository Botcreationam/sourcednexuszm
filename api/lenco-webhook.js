// ============================================================================
// POST /api/webhooks/lenco  (Vercel serverless mirror)
// Lenco payment events. Authenticity is proven by X-Lenco-Signature
// (HMAC-SHA512 of the RAW body keyed with the sha256 of the secret key).
// Vercel parses JSON bodies; we re-serialize canonically — same key order is
// guaranteed by Vercel's parsed object — but signature verification prefers
// the raw payload. To keep byte-exact verification, we use the raw body when
// available.
// ============================================================================
import {
  verifyLencoSignature,
  verifyLencoCollection,
  applyPaymentResult,
  referenceIsValid,
} from '../lib/lenco-shared.mjs';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  let raw = '';
  try {
    await new Promise((resolve, reject) => {
      req.on('data', (chunk) => {
        raw += chunk;
        if (raw.length > 64000) {
          req.destroy();
          reject(new Error('Payload too large'));
        }
      });
      req.on('end', resolve);
      req.on('error', reject);
    });
  } catch {
    return res.status(413).json({ success: false, error: 'Payload too large' });
  }

  try {
    const signature = req.headers['x-lenco-signature'];
    if (!verifyLencoSignature(raw, signature)) {
      return res.status(401).json({ success: false, error: 'Invalid signature' });
    }
    const event = JSON.parse(raw || '{}');
    const eventType = typeof event?.event === 'string' ? event.event : '';
    const reference = typeof event?.data?.reference === 'string' ? event.data.reference : '';
    if (eventType.startsWith('collection.') && referenceIsValid(reference)) {
      // Defense in depth: re-verify with Lenco before applying any state change.
      const lencoResult = await verifyLencoCollection(reference);
      if (!lencoResult.error) {
        await applyPaymentResult(reference, lencoResult, { source: 'webhook' });
      }
    }
    // Always acknowledge valid events so Lenco stops retrying.
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[lenco] webhook error:', err.message);
    return res.status(200).json({ received: true });
  }
}
