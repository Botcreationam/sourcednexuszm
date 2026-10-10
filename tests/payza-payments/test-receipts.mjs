// ============================================================================
// Receipt + multi-item cart total tests (offline).
// Runs the REAL server code (lib/*.mjs, and the shared shop API handler)
// against in-memory mocks of Supabase REST, Payza and the email provider.
// No credentials, no network, no real money.
//
//   node tests/payza-payments/test-receipts.mjs
// ============================================================================
import http from 'node:http';
import {
  sanitizeCheckoutItems,
  createPendingOrder,
  applyPaymentResult,
  verifyPayzaPayment,
  quoteCartLines,
} from '../../lib/payza-shared.mjs';
import {
  createReceiptForPayment,
  processReceiptEmails,
  buildReceiptEmail,
  formatKwacha,
  confirmedOrderSummary,
} from '../../lib/order-receipts.mjs';
import { handleShopRequest } from '../../lib/shop-api.mjs';

// ---------------------------------------------------------------- fake DB
const id = (n) => `aaaaaaaa-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
const DRESS = id(1), LAMP = id(2), SHOES = id(3), BAG = id(4), HAT = id(5), POR = id(6), BUNDLE = id(7);
const db = {
  products: [
    { id: DRESS, name: 'Dress', category: 'Dresses', price: 'K400', status: 'available', images: [], grades: [] },
    { id: LAMP, name: 'Lamp', category: 'Home', price: 'k600', status: 'available', images: [], grades: [] },
    { id: SHOES, name: 'Shoes', category: 'Shoes', price: 'K250', status: 'available', images: [], grades: [] },
    { id: BAG, name: 'Bag', category: 'Bags', price: 'k11,500', status: 'available', images: [], grades: [] },
    { id: HAT, name: 'Hat', category: 'Hats', price: 'K99.50', status: 'available', images: [], grades: [] },
    { id: POR, name: 'Custom Suit', category: 'Suits', price: 'Price on request', status: 'available', images: [], grades: [] },
    { id: BUNDLE, name: 'Socks', category: 'Socks', price: 'K600 for 6', status: 'available', images: [], grades: [] },
  ],
  orders: [], order_items: [], payments: [], order_receipts: [], payment_admin_notifications: [],
  user_profiles: [{ id: 'u-1', cart: [] }, { id: 'u-2', cart: [] }],
};
let seq = 0;

function applyFilters(rows, params) {
  let out = rows;
  for (const [key, value] of Object.entries(params)) {
    if (['select', 'order', 'limit'].includes(key)) continue;
    let op = 'eq', val = value;
    let m = String(value).match(/^(\w+)\.\((.*)\)$/);
    if (!m) m = String(value).match(/^(\w+)\.(.+)$/);
    if (m) { op = m[1]; val = m[2]; }
    if (op === 'eq') out = out.filter((r) => String(r[key]) === val);
    else if (op === 'in') { const a = val.split(',').map((v) => v.trim()); out = out.filter((r) => a.includes(String(r[key]))); }
    else throw new Error(`unsupported op ${op}`);
  }
  if (params.order) {
    const [f, dir] = params.order.split('.');
    out = [...out].sort((a, b) => (dir === 'desc' ? String(b[f]).localeCompare(String(a[f])) : String(a[f]).localeCompare(String(b[f]))));
  }
  if (params.limit) out = out.slice(0, Number(params.limit));
  return out;
}

const sb = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const respond = (c, d) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); };
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const payload = body ? JSON.parse(body) : null;
    // auth: GET /auth/v1/user  (token = "tok-<userId>")
    if (url.pathname === '/auth/v1/user') {
      const t = (req.headers.authorization || '').replace('Bearer ', '');
      const m = t.match(/^tok-(.+)$/);
      return m ? respond(200, { id: m[1], email: `${m[1]}@example.com` }) : respond(401, {});
    }
    // rpc: claim_receipt_emails (mirrors the SQL function)
    if (url.pathname === '/rest/v1/rpc/claim_receipt_emails') {
      const now = Date.now();
      const due = db.order_receipts.filter((r) =>
        (['pending', 'failed'].includes(r.email_status) && new Date(r.email_next_attempt_at).getTime() <= now && r.email_attempts < 6) ||
        (r.email_status === 'sending' && new Date(r.email_next_attempt_at).getTime() <= now - 600000));
      for (const r of due) { r.email_status = 'sending'; r.email_attempts += 1; }
      return respond(200, due);
    }
    const table = url.pathname.replace('/rest/v1/', '');
    const params = Object.fromEntries(url.searchParams.entries());
    if (req.method === 'GET') return respond(200, applyFilters(db[table] || [], params));
    if (req.method === 'POST') {
      const rows = Array.isArray(payload) ? payload : [payload];
      for (const r of rows) {
        if (!r.id) r.id = `row-${table}-${++seq}`;
        // UNIQUE constraints that the real migration enforces
        if (table === 'order_receipts' && db.order_receipts.some((x) => x.payment_id === r.payment_id)) return respond(409, { code: '23505' });
        if (table === 'payments' && db.payments.some((x) => x.reference === r.reference)) return respond(409, { code: '23505' });
        db[table].push(r);
      }
      return respond(201, rows);
    }
    if (req.method === 'PATCH') {
      const t = applyFilters(db[table] || [], params);
      for (const x of t) Object.assign(x, payload);
      return respond(200, t);
    }
    if (req.method === 'DELETE') {
      const mm = applyFilters(db[table] || [], params);
      db[table] = (db[table] || []).filter((r) => !mm.includes(r));
      return respond(204, null);
    }
    respond(405, {});
  });
});

// ------------------------------------------------------------- fake Payza
const payza = { payments: {}, reqs: [] };
const pz = http.createServer((req, res) => {
  const respond = (c, d) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); };
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.method === 'POST' && req.url === '/api/v1/pay') {
      const p = JSON.parse(body);
      payza.reqs.push(p);
      payza.payments[p.reference] = { status: 'pending', amount: p.amount, currency: 'ZMW', method: 'airtel_money' };
      return respond(200, { success: true, data: { reference: p.reference, payment_url: `https://checkout.example/${p.reference}` } });
    }
    const m = req.url.match(/^\/api\/v1\/verify\/(.+)$/);
    if (m) {
      const rec = payza.payments[decodeURIComponent(m[1])];
      if (!rec) return respond(404, { success: false });
      return respond(200, { success: true, data: { reference: decodeURIComponent(m[1]), status: rec.status, amount: rec.amount, currency: rec.currency, actual_gateway: rec.method, paid_at: rec.status === 'success' ? new Date().toISOString() : null } });
    }
    respond(404, {});
  });
});

// ------------------------------------------------------------- fake email
const mail = { sent: [], failMode: null /* null | 'temp' | 'perm' */, seenKeys: new Set() };
const em = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const respond = (c, d) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); };
    if (mail.failMode === 'temp') return respond(503, { message: 'provider down' });
    if (mail.failMode === 'perm') return respond(422, { message: 'invalid recipient' });
    const key = req.headers['idempotency-key'];
    // Real providers (Resend) return the original result for a repeated key
    if (key && mail.seenKeys.has(key)) return respond(200, { id: `dup-${key}` });
    if (key) mail.seenKeys.add(key);
    const p = JSON.parse(body);
    mail.sent.push({ to: p.to, subject: p.subject, html: p.html, text: p.text, key });
    respond(200, { id: `msg-${mail.sent.length}` });
  });
});

// ----------------------------------------------------------------- runner
let passed = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  PASS  ${name}`); } else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
};
const USER = { id: 'u-1', email: 'u-1@example.com' };
const BASE = 'https://shop.example';
const reset = () => { db.orders.length = 0; db.order_items.length = 0; db.payments.length = 0; db.order_receipts.length = 0; mail.sent.length = 0; mail.seenKeys.clear(); mail.failMode = null; payza.reqs.length = 0; };

async function order(items, customer = { email: 'u-1@example.com', firstName: 'John', lastName: 'Banda' }, user = USER) {
  const s = sanitizeCheckoutItems(items);
  if (s.error) return { error: s.error };
  return createPendingOrder({ user, lines: s.lines, customer, baseUrl: BASE });
}
async function pay(reference, { status = 'success', amount, currency = 'ZMW' } = {}) {
  const rec = payza.payments[reference];
  rec.status = status;
  if (amount != null) rec.amount = amount;
  rec.currency = currency;
  const v = await verifyPayzaPayment(reference);
  return applyPaymentResult(reference, v, { source: 'test' });
}
const shop = async (method, path, { token, body, query } = {}) => {
  const req = { method, headers: token ? { authorization: `Bearer ${token}` } : {}, body };
  return handleShopRequest(req, path, query || {});
};

async function main() {
  await Promise.all([new Promise((r) => sb.listen(4611, r)), new Promise((r) => pz.listen(4612, r)), new Promise((r) => em.listen(4613, r))]);
  Object.assign(process.env, {
    VITE_SUPABASE_URL: 'http://localhost:4611', VITE_SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc',
    PAYZA_PUBLIC_KEY: 'pk_test_x', PAYZA_SECRET_KEY: 'sk_test_x', PAYZA_WEBHOOK_SECRET: 'whsec',
    PAYZA_API_BASE_URL: 'http://localhost:4612/api/v1',
    EMAIL_API_KEY: 'k', EMAIL_FROM_ADDRESS: 'orders@sourcednexus.online', EMAIL_API_URL: 'http://localhost:4613/send', EMAIL_PROVIDER: 'resend',
    SITE_BASE_URL: 'https://sourcednexus.online',
  });

  // ============ TOTALS (tests 1-5)
  console.log('\n[TEST 1] Dress K400 x1 + Lamp K600 x1 = K1,000');
  reset();
  let o = await order([{ productId: DRESS, quantity: 1 }, { productId: LAMP, quantity: 1 }]);
  check('order total = 1000', o.order.subtotal === 1000, o.order?.subtotal);
  check('payment amount sent to Payza = 1000', payza.reqs.at(-1).amount === 1000);
  check('payment row amount = 1000', db.payments[0].amount === 1000);
  check('2 order items stored', db.order_items.length === 2);

  console.log('\n[TEST 2] Dress K400 x2 + Lamp K600 x3 = K2,600');
  reset();
  o = await order([{ productId: DRESS, quantity: 2 }, { productId: LAMP, quantity: 3 }]);
  check('Dress line = 800', o.order.items[0].lineTotal === 800);
  check('Lamp line = 1800', o.order.items[1].lineTotal === 1800);
  check('order total = 2600', o.order.subtotal === 2600);
  check('payment amount sent to Payza = 2600', payza.reqs.at(-1).amount === 2600);

  console.log('\n[TEST 3] five different products, mixed quantities');
  reset();
  o = await order([
    { productId: DRESS, quantity: 1 }, { productId: LAMP, quantity: 2 }, { productId: SHOES, quantity: 3 },
    { productId: BAG, quantity: 1 }, { productId: HAT, quantity: 4 },
  ]);
  // 400 + 1200 + 750 + 11500 + 398 = 14248
  check('five lines stored', db.order_items.length === 5);
  check('line totals 400/1200/750/11500/398', JSON.stringify(o.order.items.map((i) => i.lineTotal)) === JSON.stringify([400, 1200, 750, 11500, 398]), JSON.stringify(o.order.items.map((i) => i.lineTotal)));
  check('grand total = 14248', o.order.subtotal === 14248);
  check('payment amount = grand total', payza.reqs.at(-1).amount === 14248);
  check('sum of stored items = order total', db.order_items.reduce((s, i) => s + i.line_total, 0) === db.orders[0].subtotal);

  console.log('\n[TEST 4] quantity 1 -> 3 updates quote, order and payment');
  reset();
  let q = await quoteCartLines(sanitizeCheckoutItems([{ productId: DRESS, quantity: 1 }, { productId: LAMP, quantity: 1 }]).lines);
  check('quote before = 1000', q.total === 1000);
  q = await quoteCartLines(sanitizeCheckoutItems([{ productId: DRESS, quantity: 3 }, { productId: LAMP, quantity: 1 }]).lines);
  check('quote after = 1800', q.total === 1800);
  await order([{ productId: DRESS, quantity: 1 }, { productId: LAMP, quantity: 1 }]);
  o = await order([{ productId: DRESS, quantity: 3 }, { productId: LAMP, quantity: 1 }]);
  check('reused order re-priced to 1800', o.order.subtotal === 1800 && db.orders.length === 1);
  check('new payment attempt sent 1800', payza.reqs.at(-1).amount === 1800);
  check('items of reused order replaced, not appended', db.order_items.length === 2);

  console.log('\n[TEST 5] removing a product updates everything');
  reset();
  o = await order([{ productId: DRESS, quantity: 3 }]);
  check('quote/order/payment = 1200', o.order.subtotal === 1200 && payza.reqs.at(-1).amount === 1200);

  console.log('\n[QUOTE] per-line answers for unpayable items');
  q = await quoteCartLines(sanitizeCheckoutItems([
    { productId: DRESS, quantity: 2 }, { productId: POR, quantity: 1 }, { productId: BUNDLE, quantity: 1 },
  ]).lines);
  check('Dress payable 800', q.lines[0].payable && q.lines[0].lineTotal === 800);
  check('price-on-request line not payable', q.lines[1].payable === false && q.lines[1].reason === 'price_on_request');
  check('bundle price "K600 for 6" not guessed', q.lines[2].payable === false);
  check('total counts only payable lines (800)', q.total === 800);
  check('quote currency is ZMW', q.currency === 'ZMW');

  // ============ PAYMENT + RECEIPT (tests 6-9)
  console.log('\n[TEST 6] successful payment -> verified, PAID, receipt generated + emailed');
  reset();
  o = await order([{ productId: DRESS, quantity: 2 }, { productId: LAMP, quantity: 1 }]);
  const ref = o.payment.reference;
  check('before payment: no receipt, no email', db.order_receipts.length === 0 && mail.sent.length === 0);
  let r = await pay(ref);
  check('payment marked paid', r.status === 'paid' && db.payments[0].status === 'paid');
  check('order marked paid/processing', db.orders[0].payment_status === 'paid' && db.orders[0].status === 'processing');
  check('exactly 1 receipt created', db.order_receipts.length === 1);
  const rc = db.order_receipts[0];
  check('receipt total = 1400 = order total = payment amount', rc.total === 1400 && db.orders[0].subtotal === 1400 && db.payments[0].amount === 1400);
  check('receipt items frozen (Dress x2 = 800, Lamp x1 = 600)', rc.items.length === 2 && rc.items[0].line_total === 800 && rc.items[1].line_total === 600);
  check('receipt payment reference stored', rc.payment_reference === ref);
  check('order records paid_at / paid_amount / payment id', db.orders[0].paid_amount === 1400 && !!db.orders[0].paid_at && db.orders[0].paid_payment_id === db.payments[0].id);
  const ADMINS = ['frankmwalu04@gmail.com', 'sourcednexus@gmail.com', 'joshuankuba04@gmail.com'];
  const toCustomer = mail.sent.filter((m) => !ADMINS.includes(m.to[0]));
  check('exactly 1 customer receipt email sent', toCustomer.length === 1);
  check('exactly 1 notification per admin (3 total)', mail.sent.filter((m) => ADMINS.includes(m.to[0])).length === 3);
  check('email goes to the order customer', mail.sent[0].to[0] === 'u-1@example.com');
  check('email subject', mail.sent[0].subject === `Payment Receipt \u2014 Sourced Nexus \u2014 Order #${db.orders[0].order_number}`, mail.sent[0].subject);
  check('email shows K1,400 total', mail.sent[0].html.includes('K1,400') && mail.sent[0].text.includes('TOTAL PAID: K1,400'));
  check('email lists items + subtotals', mail.sent[0].html.includes('Dress') && mail.sent[0].html.includes('K800') && mail.sent[0].html.includes('Lamp') && mail.sent[0].html.includes('K600'));
  check('email says PAID + names customer', mail.sent[0].html.includes('PAID') && mail.sent[0].html.includes('John'));
  check('email has reference', mail.sent[0].html.includes(ref));
  check('receipt email_status = sent', rc.email_status === 'sent' && !!rc.email_sent_at);
  const sum = await confirmedOrderSummary(db.orders[0].id);
  check('success summary: confirmed total + email status', sum.receipt.total === 1400 && sum.receipt.emailStatus === 'sent');

  console.log('\n[RECEIPT FROZEN] later catalog/cart changes cannot change the receipt');
  db.products.find((p) => p.id === DRESS).price = 'K9999';
  const rebuilt = buildReceiptEmail(db.order_receipts[0]);
  check('receipt still shows K400 unit price after catalog change', rebuilt.html.includes('K400') && !rebuilt.html.includes('9,999'));
  db.products.find((p) => p.id === DRESS).price = 'K400';

  console.log('\n[TEST 7] failed / cancelled / pending / wrong amount -> NOT paid, NO receipt');
  reset();
  o = await order([{ productId: DRESS, quantity: 1 }]);
  await pay(o.payment.reference, { status: 'failed' });
  check('failed: order not paid', db.orders[0].payment_status !== 'paid');
  check('failed: no receipt, no email', db.order_receipts.length === 0 && mail.sent.length === 0);
  reset();
  o = await order([{ productId: DRESS, quantity: 1 }]);
  await pay(o.payment.reference, { status: 'pending' });
  check('pending: no receipt, no email', db.order_receipts.length === 0 && mail.sent.length === 0 && db.orders[0].payment_status !== 'paid');
  reset();
  o = await order([{ productId: DRESS, quantity: 1 }]);
  await pay(o.payment.reference, { status: 'cancelled' });
  check('cancelled: no receipt, no email', db.order_receipts.length === 0 && mail.sent.length === 0);
  reset();
  o = await order([{ productId: DRESS, quantity: 2 }, { productId: LAMP, quantity: 1 }]); // 1400
  r = await pay(o.payment.reference, { amount: 700 });
  check('underpayment (K700 of K1,400): rejected', r.error != null && db.orders[0].payment_status !== 'paid');
  check('underpayment: no receipt, no email', db.order_receipts.length === 0 && mail.sent.length === 0);
  reset();
  o = await order([{ productId: DRESS, quantity: 1 }]);
  r = await pay(o.payment.reference, { currency: 'KES' });
  check('wrong currency: rejected, no receipt', r.error != null && db.order_receipts.length === 0 && mail.sent.length === 0);

  console.log('\n[TEST 8] payment succeeds but email fails -> PAID, receipt in account, retried');
  reset();
  mail.failMode = 'temp';
  o = await order([{ productId: DRESS, quantity: 1 }, { productId: LAMP, quantity: 1 }]);
  r = await pay(o.payment.reference);
  check('payment still PAID', r.status === 'paid' && db.payments[0].status === 'paid' && db.orders[0].payment_status === 'paid');
  check('receipt exists in account', db.order_receipts.length === 1);
  check('email status failed with a recorded reason', db.order_receipts[0].email_status === 'failed' && !!db.order_receipts[0].email_last_error);
  check('retry scheduled in the future', new Date(db.order_receipts[0].email_next_attempt_at).getTime() > Date.now());
  check('no email delivered yet', mail.sent.length === 0);
  let w = await processReceiptEmails({ limit: 10 });
  check('worker does not retry before it is due', w.claimed === 0);
  db.order_receipts[0].email_next_attempt_at = new Date(Date.now() - 1000).toISOString();
  mail.failMode = null;
  w = await processReceiptEmails({ limit: 10 });
  check('worker retries when due and succeeds', w.sent === 1 && db.order_receipts[0].email_status === 'sent' && mail.sent.length === 1);
  check('payment/order untouched by the email saga', db.orders[0].payment_status === 'paid' && db.payments[0].status === 'paid');
  w = await processReceiptEmails({ limit: 10 });
  check('sent receipt is never picked up again', w.claimed === 0 && mail.sent.length === 1);

  console.log('\n[EMAIL] permanent failure (bad address) is not retried forever');
  reset();
  mail.failMode = 'perm';
  o = await order([{ productId: DRESS, quantity: 1 }]);
  await pay(o.payment.reference);
  check('permanent failure parked, payment PAID', db.order_receipts[0].email_status === 'failed' && db.orders[0].payment_status === 'paid');
  check('next attempt parked far in the future', new Date(db.order_receipts[0].email_next_attempt_at).getTime() > Date.now() + 30 * 86400000);

  console.log('\n[TEST 9] webhook / verify delivered several times -> one order, one payment, one receipt, one email');
  reset();
  o = await order([{ productId: DRESS, quantity: 2 }, { productId: LAMP, quantity: 3 }]);
  const ref9 = o.payment.reference;
  const results = await Promise.all([pay(ref9), pay(ref9), pay(ref9), pay(ref9)]);
  await pay(ref9);
  await pay(ref9);
  check('one order', db.orders.length === 1);
  check('one paid payment', db.payments.filter((p) => p.status === 'paid').length === 1);
  check('ONE receipt', db.order_receipts.length === 1, `got ${db.order_receipts.length}`);
  check('ONE customer email despite 6 deliveries', mail.sent.filter((m) => m.to[0] === 'u-1@example.com').length === 1, `got ${mail.sent.length}`);
  check('ONE email per admin despite 6 deliveries', ['frankmwalu04@gmail.com', 'sourcednexus@gmail.com', 'joshuankuba04@gmail.com'].every((a) => mail.sent.filter((m) => m.to[0] === a).length === 1), `got ${mail.sent.length}`);
  check('4 emails in total (1 customer + 3 admins)', mail.sent.length === 4, `got ${mail.sent.length}`);
  check('exactly one concurrent call won the transition', results.filter((x) => !x.duplicate).length === 1);
  check('receipt total = 2600', db.order_receipts[0].total === 2600);

  console.log('\n[SELF-HEAL] paid payment missing its receipt gets one (once)');
  reset();
  o = await order([{ productId: DRESS, quantity: 1 }]);
  await pay(o.payment.reference);
  db.order_receipts.length = 0; mail.sent.length = 0; mail.seenKeys.clear(); // simulate a crash after "mark paid"
  await pay(o.payment.reference);
  check('late duplicate webhook issues the missing receipt', db.order_receipts.length === 1 && mail.sent.length === 1);
  await pay(o.payment.reference);
  check('and still only once', db.order_receipts.length === 1 && mail.sent.length === 1);

  // ============ ACCESS CONTROL
  console.log('\n[ACCESS] customers see only their own orders and receipts');
  reset();
  o = await order([{ productId: DRESS, quantity: 2 }, { productId: LAMP, quantity: 1 }]);
  await pay(o.payment.reference);
  const num = db.orders[0].order_number;
  let a = await shop('GET', '/api/shop/orders', { token: 'tok-u-1' });
  check('owner lists own order with total + receipt', a.status === 200 && a.body.orders.length === 1 && a.body.orders[0].total === 1400 && a.body.orders[0].hasReceipt);
  check('order list shows item count 3 (2 + 1)', a.body.orders[0].itemCount === 3);
  a = await shop('GET', '/api/shop/orders', { token: 'tok-u-2' });
  check('other customer sees no orders', a.status === 200 && a.body.orders.length === 0);
  a = await shop('GET', '/api/shop/receipt', { token: 'tok-u-1', query: { order: num } });
  check('owner reads own receipt', a.status === 200 && a.body.receipt.total === 1400 && a.body.receipt.items.length === 2);
  check('receipt payload has no internal ids', !('id' in a.body.receipt) && !('user_id' in a.body.receipt) && !('payment_id' in a.body.receipt));
  a = await shop('GET', '/api/shop/receipt', { token: 'tok-u-2', query: { order: num } });
  check("other customer cannot read someone else's receipt (404)", a.status === 404);
  a = await shop('GET', '/api/shop/receipt', { query: { order: num } });
  check('signed-out request rejected (401)', a.status === 401);
  a = await shop('GET', '/api/shop/receipt', { token: 'tok-u-1', query: { order: "SN-1' or '1'='1" } });
  check('malformed order number rejected (400)', a.status === 400);
  a = await shop('POST', '/api/shop/receipt/resend', { token: 'tok-u-2', body: { orderNumber: num } });
  check("other customer cannot trigger a resend of someone else's receipt", a.status === 404);

  console.log('\n[RESEND] throttled and sent to the order address only');
  mail.sent.length = 0; mail.seenKeys.clear();
  db.order_receipts[0].email_sent_at = new Date(Date.now() - 600000).toISOString();
  a = await shop('POST', '/api/shop/receipt/resend', { token: 'tok-u-1', body: { orderNumber: num, to: 'attacker@evil.com' } });
  check('resend works', a.status === 200 && a.body.emailed === true);
  check('resend goes to order email, ignoring any address in the request', mail.sent.at(-1).to[0] === 'u-1@example.com');
  a = await shop('POST', '/api/shop/receipt/resend', { token: 'tok-u-1', body: { orderNumber: num } });
  check('immediate second resend throttled (429)', a.status === 429);

  console.log('\n[QUOTE API] server-authoritative, ignores browser prices');
  a = await shop('POST', '/api/shop/quote', { token: 'tok-u-1', body: { items: [{ productId: DRESS, quantity: 2, price: 'K1' }, { productId: LAMP, quantity: 3, price: 'K1' }] } });
  check('quote total 2600 even though browser claimed K1', a.status === 200 && a.body.total === 2600);
  a = await shop('POST', '/api/shop/quote', { body: { items: [{ productId: DRESS, quantity: 1 }] } });
  check('quote requires sign-in', a.status === 401);
  a = await shop('POST', '/api/shop/quote', { token: 'tok-u-1', body: { items: [] } });
  check('empty cart rejected', a.status === 400);

  console.log('\n[FORMAT]');
  check('K1,400', formatKwacha(1400) === 'K1,400');
  check('K99.50', formatKwacha(99.5) === 'K99.50');
  check('K11,500', formatKwacha(11500) === 'K11,500');

  console.log(`\n=============================\nRECEIPT RESULTS: ${passed} passed, ${failed} failed\n=============================`);
  sb.close(); pz.close(); em.close();
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(1); });
