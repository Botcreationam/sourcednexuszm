// ============================================================================
// SOURCED NEXUS - Shop API handlers shared by BOTH backends
// ----------------------------------------------------------------------------
//   - server.js  (Render)  and  api/shop.js (Vercel) call handleShopRequest().
//   - One implementation = the two deployments can never disagree.
//
// ENDPOINTS (all JSON, all no-store)
//   POST /api/shop/quote            signed in   server-authoritative cart total
//   GET  /api/shop/orders           signed in   the caller's own orders
//   GET  /api/shop/receipt?order=   signed in   the caller's own receipt
//   POST /api/shop/receipt/resend   signed in   re-send the caller's own receipt
//   POST|GET /api/shop/receipts/process  admin / CRON_SECRET  email retry worker
//
// SECURITY
//   - Every read is filtered by the VERIFIED user id from the access token,
//     never by an id the browser sends. Another user's order or receipt looks
//     exactly like "not found" (404), so ids cannot be probed.
//   - The quote never reads a price from the browser.
// ============================================================================

import {
  getAuthUser,
  sanitizeCheckoutItems,
  quoteCartLines,
  supabaseRest,
  supabaseServiceConfigured,
} from './payza-shared.mjs';
import { authorizeProcessor } from './product-notifications.mjs';
import {
  processReceiptEmails,
  sendReceiptEmail,
  publicReceipt,
} from './order-receipts.mjs';

const ORDER_NUMBER_RE = /^SN-[A-Za-z0-9-]{4,40}$/;

/** Read a JSON body from a Node request with a size cap. */
export function readBody(req, limit = 32000) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let s = '';
    let over = false;
    req.on('data', (c) => {
      s += c;
      if (s.length > limit) { over = true; req.destroy(); resolve(null); }
    });
    req.on('end', () => {
      if (over) return;
      try { resolve(JSON.parse(s || '{}')); } catch { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

/**
 * @returns {Promise<{status:number, body:object}>}
 */
export async function handleShopRequest(req, pathname, query = {}) {
  const method = req.method;
  if (!supabaseServiceConfigured()) {
    return { status: 503, body: { success: false, error: 'The shop is not available right now.' } };
  }

  // ---------------------------------------------------------------- quote
  if (pathname === '/api/shop/quote' && method === 'POST') {
    // A quote reveals only public catalog prices, but it is limited to signed
    // in customers so it cannot be used to hammer the products table.
    const user = await getAuthUser(req.headers['authorization']);
    if (!user) return { status: 401, body: { success: false, error: 'Please sign in.' } };
    const body = await readBody(req);
    if (!body) return { status: 400, body: { success: false, error: 'Invalid request.' } };
    const { lines, error } = sanitizeCheckoutItems(body.items);
    if (error) return { status: 400, body: { success: false, error } };
    const quote = await quoteCartLines(lines);
    if (quote.error) return { status: 503, body: { success: false, error: quote.error } };
    return { status: 200, body: { success: true, ...quote } };
  }

  // --------------------------------------------------------------- orders
  if (pathname === '/api/shop/orders' && method === 'GET') {
    const user = await getAuthUser(req.headers['authorization']);
    if (!user) return { status: 401, body: { success: false, error: 'Please sign in.' } };

    const orders = await supabaseRest('GET', 'orders', {
      query: {
        select: 'id,order_number,status,payment_status,subtotal,currency,created_at,paid_at',
        user_id: `eq.${user.id}`,
        order: 'created_at.desc',
        limit: '100',
      },
    });
    if (!orders.ok || !Array.isArray(orders.data)) {
      return { status: 502, body: { success: false, error: 'Could not load your orders.' } };
    }
    const ids = orders.data.map((o) => o.id);
    let itemsByOrder = {};
    let receiptByOrder = {};
    if (ids.length > 0) {
      const inList = `in.(${ids.join(',')})`;
      const [items, receipts] = await Promise.all([
        supabaseRest('GET', 'order_items', {
          query: { select: 'order_id,product_name,grade_name,quantity,unit_price,line_total', order_id: inList, limit: '1000' },
        }),
        supabaseRest('GET', 'order_receipts', {
          query: { select: 'order_id,receipt_number,email_status', order_id: inList, limit: '200' },
        }),
      ]);
      for (const it of Array.isArray(items.data) ? items.data : []) (itemsByOrder[it.order_id] ||= []).push(it);
      for (const r of Array.isArray(receipts.data) ? receipts.data : []) receiptByOrder[r.order_id] = r;
    }
    return {
      status: 200,
      body: {
        success: true,
        orders: orders.data.map((o) => ({
          orderNumber: o.order_number,
          status: o.status,
          paymentStatus: o.payment_status,
          total: Number(o.subtotal),
          currency: o.currency,
          createdAt: o.created_at,
          paidAt: o.paid_at,
          itemCount: (itemsByOrder[o.id] || []).reduce((s, i) => s + Number(i.quantity || 0), 0),
          items: (itemsByOrder[o.id] || []).map((i) => ({
            name: i.product_name,
            grade: i.grade_name || null,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unit_price),
            lineTotal: Number(i.line_total),
          })),
          hasReceipt: Boolean(receiptByOrder[o.id]),
          receiptNumber: receiptByOrder[o.id]?.receipt_number || null,
          emailStatus: receiptByOrder[o.id]?.email_status || null,
        })),
      },
    };
  }

  // -------------------------------------------------------------- receipt
  if (pathname === '/api/shop/receipt' && method === 'GET') {
    const user = await getAuthUser(req.headers['authorization']);
    if (!user) return { status: 401, body: { success: false, error: 'Please sign in.' } };
    const orderNumber = String(query.order || '').trim();
    if (!ORDER_NUMBER_RE.test(orderNumber)) {
      return { status: 400, body: { success: false, error: 'Invalid order number.' } };
    }
    // Filtered by the verified user id: someone else's receipt is "not found".
    const r = await supabaseRest('GET', 'order_receipts', {
      query: { select: '*', order_number: `eq.${orderNumber}`, user_id: `eq.${user.id}`, limit: '1' },
    });
    if (!r.ok || !Array.isArray(r.data) || !r.data[0]) {
      return { status: 404, body: { success: false, error: 'Receipt not found.' } };
    }
    return { status: 200, body: { success: true, receipt: publicReceipt(r.data[0]) } };
  }

  if (pathname === '/api/shop/receipt/resend' && method === 'POST') {
    const user = await getAuthUser(req.headers['authorization']);
    if (!user) return { status: 401, body: { success: false, error: 'Please sign in.' } };
    const body = await readBody(req);
    const orderNumber = String(body?.orderNumber || '').trim();
    if (!ORDER_NUMBER_RE.test(orderNumber)) {
      return { status: 400, body: { success: false, error: 'Invalid order number.' } };
    }
    const r = await supabaseRest('GET', 'order_receipts', {
      query: { select: '*', order_number: `eq.${orderNumber}`, user_id: `eq.${user.id}`, limit: '1' },
    });
    const receipt = r.ok && Array.isArray(r.data) ? r.data[0] : null;
    if (!receipt) return { status: 404, body: { success: false, error: 'Receipt not found.' } };

    // Throttle: a customer may ask again at most once every 2 minutes, so
    // the button cannot be used to spam an inbox.
    const last = receipt.email_sent_at ? new Date(receipt.email_sent_at).getTime() : 0;
    if (receipt.email_status === 'sent' && Date.now() - last < 120_000) {
      return { status: 429, body: { success: false, error: 'Receipt was just sent. Please check your inbox, or try again in a couple of minutes.' } };
    }
    // Resends go to the address ON THE ORDER, never to an address in the request.
    const sent = await sendReceiptEmail({ ...receipt, email_status: 'pending' }, { req });
    return {
      status: 200,
      body: { success: true, emailed: Boolean(sent.ok), emailStatus: sent.receipt?.email_status || (sent.ok ? 'sent' : 'failed') },
    };
  }

  // ----------------------------------------------------- retry worker (ops)
  if (pathname === '/api/shop/receipts/process' && (method === 'POST' || method === 'GET')) {
    const auth = await authorizeProcessor(req);
    if (!auth.ok) return { status: auth.status, body: { success: false, error: auth.error } };
    const result = await processReceiptEmails({ req });
    return { status: 200, body: { success: true, ...result } };
  }

  return { status: 404, body: { success: false, error: 'Not found.' } };
}
