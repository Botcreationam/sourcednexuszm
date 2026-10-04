// ============================================================================
// POST /api/payments/lenco/create-order  (Vercel serverless mirror)
// See lib/lenco-shared.mjs and server.js for the full security model.
// ============================================================================
import {
  lencoConfig,
  getAuthUser,
  sanitizeCheckoutItems,
  sanitizeCustomer,
  createPendingOrder,
} from '../lib/lenco-shared.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
    const cfg = lencoConfig();
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

    const result = await createPendingOrder({ user: authUser, lines, customer });
    if (result.error) return res.status(409).json({ success: false, error: result.error });

    return res.status(201).json({
      success: true,
      reference: result.payment.reference,
      amount: result.payment.amount,
      currency: 'ZMW',
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      publicKey: cfg.publicKey,
      environment: cfg.env,
      widgetUrl: cfg.widgetUrl,
    });
  } catch (err) {
    console.error('[lenco] create-order error:', err.message);
    return res.status(500).json({ success: false, error: 'Could not start the payment. Please try again.' });
  }
}
