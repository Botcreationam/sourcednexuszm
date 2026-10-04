// ============================================================================
// POST /api/payments/payza/create-order  (Vercel serverless mirror)
// See lib/payza-shared.mjs and server.js for the full security model.
// ============================================================================
import {
  payzaConfig,
  getAuthUser,
  sanitizeCheckoutItems,
  sanitizeCustomer,
  createPendingOrder,
} from '../lib/payza-shared.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
    const cfg = payzaConfig();
    if (!cfg.configured) {
      return res.status(503).json({ success: false, error: 'Online payments are not available right now.' });
    }
    const authUser = await getAuthUser(req.headers['authorization']);
    if (!authUser) {
      return res.status(401).json({ success: false, error: 'Please sign in to pay online.' });
    }
    const payload = req.body || {};
    const { lines, error: itemsError } = sanitizeCheckoutItems(payload.items);
    if (itemsError) return res.status(400).json({ success: false, error: itemsError });
    const { customer, error: customerError } = sanitizeCustomer(payload.customer);
    if (customerError) return res.status(400).json({ success: false, error: customerError });

    // Public origin used for Payza's webhook/redirect/cancel URLs.
    // SITE_BASE_URL wins; otherwise derive from the request's own host.
    const host = req.headers['host'];
    const baseUrl = (process.env.SITE_BASE_URL || (host ? `https://${host}` : '')).replace(/\/$/, '');
    const result = await createPendingOrder({ user: authUser, lines, customer, baseUrl });
    if (result.error) return res.status(409).json({ success: false, error: result.error });

    // No Payza keys are exposed to the browser; the customer is redirected
    // to the hosted checkout URL.
    return res.status(201).json({
      success: true,
      reference: result.payment.reference,
      amount: result.payment.amount,
      currency: 'ZMW',
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      paymentUrl: result.payment.paymentUrl,
    });
  } catch (err) {
    console.error('[payza] create-order error:', err.message);
    return res.status(500).json({ success: false, error: 'Could not start the payment. Please try again.' });
  }
}
