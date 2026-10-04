// ============================================================================
// POST /api/payments/payza/verify  (Vercel serverless mirror)
// Authenticated + ownership-checked; the backend performs the trusted
// verification with Payza before any state change.
// ============================================================================
import {
  getAuthUser,
  verifyPayzaPayment,
  applyPaymentResult,
  referenceIsValid,
  supabaseRest,
} from '../lib/payza-shared.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
    const authUser = await getAuthUser(req.headers['authorization']);
    if (!authUser) {
      return res.status(401).json({ success: false, error: 'Please sign in to verify your payment.' });
    }
    const payload = req.body || {};
    const reference = typeof payload.reference === 'string' ? payload.reference.trim() : '';
    if (!referenceIsValid(reference)) {
      return res.status(400).json({ success: false, error: 'Invalid payment reference.' });
    }
    const own = await supabaseRest('GET', 'payments', {
      query: { select: 'id,order_id,user_id,status,amount', reference: `eq.${reference}`, limit: '1' },
    });
    if (!own.ok || !Array.isArray(own.data) || own.data.length === 0) {
      return res.status(404).json({ success: false, error: 'Payment not found.' });
    }
    if (own.data[0].user_id !== authUser.id) {
      return res.status(403).json({ success: false, error: 'You can only verify your own payments.' });
    }
    const payzaResult = await verifyPayzaPayment(reference);
    if (payzaResult.error) {
      return res.status(502).json({ success: false, error: payzaResult.error });
    }
    const applied = await applyPaymentResult(reference, payzaResult, { source: 'verify' });
    if (applied.error) {
      return res.status(applied.code || 409).json({ success: false, error: applied.error });
    }
    const orderRes = await supabaseRest('GET', 'orders', {
      query: { select: 'order_number,status,payment_status', id: `eq.${own.data[0].order_id}`, limit: '1' },
    });
    const order = Array.isArray(orderRes.data) && orderRes.data[0] ? orderRes.data[0] : null;
    return res.status(200).json({
      success: true,
      paymentStatus: applied.status,
      orderStatus: order ? order.status : 'pending',
      orderNumber: order ? order.order_number : null,
    });
  } catch (err) {
    console.error('[payza] verify error:', err.message);
    return res.status(500).json({ success: false, error: 'Could not verify the payment. Please try again.' });
  }
}
