// ============================================================================
// /api/shop/*  (Vercel serverless mirror of the Render routes in server.js)
// One function serves quote, orders, receipt, resend and the receipt-email
// retry worker. All logic lives in lib/shop-api.mjs, shared with server.js.
// ============================================================================
import { handleShopRequest } from '../lib/shop-api.mjs';

export default async function handler(req, res) {
  try {
    // vercel.json rewrites /api/shop/<x> -> /api/shop?p=<x>
    const url = new URL(req.url, 'http://x');
    const sub = (url.searchParams.get('p') || '').replace(/^\/+/, '').replace(/[^A-Za-z0-9/_-]/g, '');
    const pathname = `/api/shop/${sub}`;
    const query = Object.fromEntries(url.searchParams.entries());
    delete query.p;
    const { status, body } = await handleShopRequest(req, pathname, query);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(status).json(body);
  } catch (err) {
    console.error('[shop] error:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
}
