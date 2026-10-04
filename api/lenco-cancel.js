// ============================================================================
// POST /api/payments/lenco/cancel  (Vercel serverless mirror)
// Customer closed the Lenco window before paying — cancels the open attempt.
// ============================================================================
import {
  getAuthUser,
  cancelPaymentAttempt,
  referenceIsValid,
  supabaseRest,
} from '../lib/lenco-shared.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
    const authUser = await getAuthUser(req.headers['authorization']);
    if (!authUser) {
      return res.status(401).json({ success: false, error: 'Please sign in first.' });
    }
    const payload = req.body || {};
    const reference = typeof payload.reference === 'string' ? payload.reference.trim() : '';
    if (!referenceIsValid(reference)) {
      return res.status(400).json({ success: false, error: 'Invalid payment reference.' });
    }
    const own = await supabaseRest('GET', 'payments', {
      query: { select: 'id,user_id,status', reference: `eq.${reference}`, limit: '1' },
    });
    if (!own.ok || !Array.isArray(own.data) || own.data.length === 0) {
      return res.status(404).json({ success: false, error: 'Payment not found.' });
    }
    if (own.data[0].user_id !== authUser.id) {
      return res.status(403).json({ success: false, error: 'You can only manage your own payments.' });
    }
    await cancelPaymentAttempt(reference);
    return res.status(200).json({ success: true, cancelled: true });
  } catch (err) {
    console.error('[lenco] cancel error:', err.message);
    return res.status(500).json({ success: false, error: 'Could not update the payment attempt.' });
  }
}
