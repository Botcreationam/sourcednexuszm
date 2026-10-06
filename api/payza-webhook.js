// ============================================================================
// POST /api/webhooks/payza  (Vercel serverless mirror)
// Payza payment events. Authenticity is proven by X-Payza-Signature
// (HMAC-SHA256 of the RAW body keyed with the account's Webhook Signing
// Secret). bodyParser is disabled so the exact raw bytes can be verified.
// ============================================================================
import {
  verifyPayzaSignature,
  verifyPayzaPayment,
  applyPaymentResult,
  referenceIsValid,
} from '../lib/payza-shared.mjs';

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
    const signature = req.headers['x-payza-signature'];
    if (!verifyPayzaSignature(raw, signature)) {
      return res.status(401).json({ success: false, error: 'Invalid signature' });
    }
    const event = JSON.parse(raw || '{}');
    const eventType = typeof event?.event === 'string' ? event.event : '';
    // Payza's webhook body carries our reference at the top level.
    const reference = typeof event?.reference === 'string' ? event.reference : '';
    if (eventType.startsWith('payment.') && referenceIsValid(reference)) {
      // Defense in depth: re-verify with Payza before applying any state change.
      const payzaResult = await verifyPayzaPayment(reference);
      if (!payzaResult.error) {
        await applyPaymentResult(reference, payzaResult, { source: 'webhook', req });
      }
    }
    // Always acknowledge valid events so Payza stops retrying.
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[payza] webhook error:', err.message);
    return res.status(200).json({ received: true });
  }
}
