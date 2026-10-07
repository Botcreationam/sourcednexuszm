// ============================================================================
// Payza integration test harness (no real money, no real credentials).
// Runs lib/payza-shared.mjs against local mocks of the Supabase REST API and
// the Payza REST API (POST /pay + GET /verify/:ref), plus signature
// verification against the REAL crypto spec from Payza's docs
// (X-Payza-Signature = HMAC-SHA256 of the raw body, hex, keyed with the
// account's Webhook Signing Secret).
// ============================================================================
import crypto from 'node:crypto';
import http from 'node:http';

import {
  payzaConfig,
  parsePriceText,
  sanitizeCheckoutItems,
  sanitizeCustomer,
  mapPayzaStatus,
  verifyPayzaSignature,
  supabaseRest,
  createPendingOrder,
  createPayzaPayment,
  verifyPayzaPayment,
  applyPaymentResult,
  cancelPaymentAttempt,
  clearPurchasedCartLines,
  referenceIsValid,
  cartFingerprint,
} from '../../lib/payza-shared.mjs';

// ---------------------------------------------------------------------------
// In-memory fake databases
// ---------------------------------------------------------------------------
const db = {
  products: [
    {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Executive Wool Suit',
      category: 'Suits',
      price: 'K 1,500',
      status: 'available',
      images: ['https://example.com/suit.jpg'],
      grades: [
        { name: 'First Grade', price: '1500', original_price: '2000', discount_percentage: 25 },
        { name: 'Second Grade', price: '900' },
        { name: 'Third Grade', price: '500' },
      ],
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      name: 'Leather Oxfords',
      category: 'Shoes',
      price: 'Price on request',
      status: 'available',
      images: [],
      grades: [],
    },
    {
      id: '33333333-3333-3333-3333-333333333333',
      name: 'Hidden Watch',
      category: 'Watches',
      price: 'K 700',
      status: 'hidden',
      images: [],
      grades: [],
    },
  ],
  orders: [],
  order_items: [],
  payments: [],
  order_receipts: [],
  payment_admin_notifications: [],
  user_profiles: [{ id: 'u-1', cart: [] }],
};
let rowSeq = 0;

// ---------------------------------------------------------------------------
// Fake Supabase REST (just enough PostgREST for the shared module)
// ---------------------------------------------------------------------------
function applyFilters(rows, params) {
  let out = rows;
  for (const [key, value] of Object.entries(params)) {
    if (key === 'select' || key === 'order' || key === 'limit') continue;
    let op = 'eq';
    let val = value;
    let m = String(value).match(/^(\w+)\.\((.*)\)$/);
    if (!m) m = String(value).match(/^(\w+)\.(.+)$/);
    if (m) { op = m[1]; val = m[2]; }
    if (op === 'eq') out = out.filter((r) => String(r[key]) === val);
    else if (op === 'in') {
      const allowed = val.split(',').map((v) => v.trim());
      out = out.filter((r) => allowed.includes(String(r[key])));
    } else throw new Error(`unsupported op ${op}`);
  }
  if (params.order) {
    const [field, dir] = params.order.split('.');
    out = [...out].sort((a, b) => (dir === 'desc' ? String(b[field]).localeCompare(String(a[field])) : String(a[field]).localeCompare(String(b[field]))));
  }
  if (params.limit) out = out.slice(0, Number(params.limit));
  return out;
}

const sbServer = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname.replace('/rest/v1/', '');
  const params = Object.fromEntries(url.searchParams.entries());
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const payload = body ? JSON.parse(body) : null;
    const table = path;
    const respond = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };

    if (req.method === 'GET') {
      return respond(200, applyFilters(db[table] || [], params));
    }
    if (req.method === 'POST') {
      const rows = Array.isArray(payload) ? payload : [payload];
      for (const r of rows) {
        if (!r.id) r.id = `row-${table}-${++rowSeq}`;
        db[table].push(r);
      }
      return respond(201, rows);
    }
    if (req.method === 'PATCH') {
      const targets = applyFilters(db[table] || [], params);
      for (const t of targets) Object.assign(t, payload);
      return respond(200, targets);
    }
    if (req.method === 'DELETE') {
      const matches = applyFilters(db[table] || [], params);
      db[table] = (db[table] || []).filter((r) => !matches.includes(r));
      return respond(204, null);
    }
    respond(405, {});
  });
});

// ---------------------------------------------------------------------------
// Fake Payza REST API (POST /api/v1/pay + GET /api/v1/verify/:reference)
// ---------------------------------------------------------------------------
const payzaState = {
  // reference -> { status, amount, method, paidAt }
  payments: {},
  // every POST /pay request body, for assertions
  payRequests: [],
  // failure injection
  failNext: false,
  badKeys: false,
  // references already used (Payza rejects reuse with 409)
  usedReferences: new Set(),
};
const payzaServer = http.createServer((req, res) => {
  const respond = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
  const authOk =
    req.headers['x-public-key'] === 'pk_test_mock' &&
    req.headers['x-secret-key'] === 'sk_test_mock' &&
    !payzaState.badKeys;
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.method === 'POST' && req.url === '/api/v1/pay') {
      if (!authOk) return respond(401, { success: false, message: 'Invalid API credentials.' });
      if (payzaState.failNext) {
        payzaState.failNext = false;
        return respond(500, { success: false, message: 'payza unavailable' });
      }
      const p = JSON.parse(body);
      payzaState.payRequests.push(p);
      if (!p.reference || !p.amount || !p.customer?.email || !p.callback_url) {
        return respond(422, { success: false, message: 'A required field is missing.' });
      }
      if (payzaState.usedReferences.has(p.reference)) {
        return respond(409, { success: false, message: 'reference already exists. Use a unique value.' });
      }
      payzaState.usedReferences.add(p.reference);
      payzaState.payments[p.reference] = { status: 'pending', amount: p.amount, method: 'mobile_money' };
      return respond(200, {
        success: true,
        data: { reference: p.reference, payment_url: `https://checkout.payzaapi.co.ke/pay/${p.reference}`, expires_at: new Date(Date.now() + 30 * 60_000).toISOString() },
      });
    }
    const m = req.url.match(/^\/api\/v1\/verify\/(.+)$/);
    if (req.method === 'GET' && m) {
      if (!authOk) return respond(401, { success: false, message: 'Invalid API credentials.' });
      const rec = payzaState.payments[decodeURIComponent(m[1])];
      if (!rec) return respond(404, { success: false, message: 'Payment not found.' });
      return respond(200, {
        success: true,
        data: {
          reference: decodeURIComponent(m[1]),
          status: rec.status,
          amount: rec.amount,
          fee: 0,
          net_amount: rec.amount,
          currency: 'ZMW',
          gateway: 'payzaapi',
          actual_gateway: rec.method || 'mobile_money',
          customer_email: 'customer@example.com',
          paid_at: rec.status === 'success' ? (rec.paidAt || new Date().toISOString()) : null,
        },
      });
    }
    respond(404, { success: false, message: 'not found' });
  });
});

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
let passed = 0, failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

const USER = { id: 'u-1', email: 'customer@example.com' };
const BASE = 'https://shop.example';

async function main() {
  await new Promise((r) => sbServer.listen(4599, r));
  await new Promise((r) => payzaServer.listen(4598, r));
  process.env.VITE_SUPABASE_URL = 'http://localhost:4599';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  process.env.PAYZA_PUBLIC_KEY = 'pk_test_mock';
  process.env.PAYZA_SECRET_KEY = 'sk_test_mock';
  process.env.PAYZA_WEBHOOK_SECRET = 'whsec_mock';
  // Point the shared module's API client at the mock
  process.env.PAYZA_API_BASE_URL = 'http://localhost:4598/api/v1';

  console.log('\n[1] Configuration & mode detection');
  const cfg = payzaConfig();
  check('configured when all keys present', cfg.configured === true);
  check('webhook secret configured separately', cfg.webhookConfigured === true);
  check('test mode detected from key prefix (pk_test_)', cfg.env === 'test');
  check('api base overridable for tests', cfg.apiBase === 'http://localhost:4598/api/v1');

  console.log('\n[2] Price parsing (server-side trusted pricing)');
  check('"K 1,500" -> 1500', parsePriceText('K 1,500') === 1500);
  check('"1500.50" -> 1500.5', parsePriceText('1500.50') === 1500.5);
  check('"Price on request" -> null', parsePriceText('Price on request') === null);
  check('"abc" -> null', parsePriceText('abc') === null);
  check('null -> null', parsePriceText(null) === null);
  check('"$10" -> 10 (matches site display convention)', parsePriceText('$10') === 10);
  check('negative/zero rejected', parsePriceText('0') === null && parsePriceText('-5') === null);

  console.log('\n[3] Input validation');
  const badItems = sanitizeCheckoutItems([]);
  check('empty cart rejected', badItems.error != null);
  const badProduct = sanitizeCheckoutItems([{ productId: 'not-a-uuid', quantity: 1 }]);
  check('non-uuid product rejected', badProduct.error != null);
  const dup = sanitizeCheckoutItems([
    { productId: '11111111-1111-1111-1111-111111111111', quantity: 2, gradeName: 'First Grade' },
    { productId: '11111111-1111-1111-1111-111111111111', quantity: 3, gradeName: 'First Grade' },
  ]);
  check('duplicate lines merged (no double charge)', dup.lines?.length === 1 && dup.lines[0].quantity === 3);
  const qty = sanitizeCheckoutItems([{ productId: '11111111-1111-1111-1111-111111111111', quantity: 9999 }]);
  check('quantity clamped to 100', qty.lines[0].quantity === 100);
  const badCustomer = sanitizeCustomer({ email: 'nope' });
  check('invalid email rejected', badCustomer.error != null);
  const okCustomer = sanitizeCustomer({ email: ' Customer@Example.com ', phone: '0971111111' });
  check('email normalized', okCustomer.customer.email === 'customer@example.com');
  check('reference format enforced', referenceIsValid('SNPAY-ABC-123') && !referenceIsValid('../etc') && !referenceIsValid('a b c'));

  console.log('\n[4] Status mapping (Payza -> internal)');
  check('success -> paid', mapPayzaStatus('success') === 'paid');
  check('failed -> failed', mapPayzaStatus('failed') === 'failed');
  check('cancelled -> cancelled', mapPayzaStatus('cancelled') === 'cancelled');
  check('pending -> confirmation_pending', mapPayzaStatus('pending') === 'confirmation_pending');
  check('unknown -> confirmation_pending', mapPayzaStatus('whatever') === 'confirmation_pending');

  console.log('\n[5] Webhook signature (real Payza crypto spec: HMAC-SHA256 raw body)');
  const rawBody = JSON.stringify({ event: 'payment.success', reference: 'SNPAY-X-1', amount: 3000, currency: 'ZMW' });
  const goodSig = crypto.createHmac('sha256', 'whsec_mock').update(rawBody, 'utf8').digest('hex');
  check('valid signature accepted', verifyPayzaSignature(rawBody, goodSig) === true);
  check('tampered body rejected', verifyPayzaSignature(rawBody.replace('3000', '3'), goodSig) === false);
  check('missing signature rejected', verifyPayzaSignature(rawBody, undefined) === false);
  check('wrong signing secret rejected', verifyPayzaSignature(rawBody, crypto.createHmac('sha256', 'deadbeef').update(rawBody).digest('hex')) === false);

  console.log('\n[6] Order creation — server-side pricing + Payza /pay request');
  const lines = sanitizeCheckoutItems([{ productId: '11111111-1111-1111-1111-111111111111', quantity: 2, gradeName: 'First Grade' }]).lines;
  const created = await createPendingOrder({
    user: USER, lines,
    customer: { email: 'customer@example.com', phone: '0971111111', firstName: 'Jane', lastName: 'Mwansa' },
    baseUrl: BASE,
  });
  check('order created without error', created.error == null, JSON.stringify(created));
  check('server computed amount = 2 x 1500 = 3000 (browser price ignored)', created.payment?.amount === 3000, `got ${created.payment?.amount}`);
  check('order line total correct', created.order?.items[0].lineTotal === 3000);
  check('grade preserved on order item', created.order.items[0].gradeName === 'First Grade');
  check('grade discount preserved', created.order.items[0].gradeDiscount === 25);
  check('reference unique+valid', referenceIsValid(created.payment.reference));
  check('hosted checkout payment_url returned', typeof created.payment.paymentUrl === 'string' && created.payment.paymentUrl.startsWith('https://checkout.payzaapi.co.ke/'));
  const payReq = payzaState.payRequests[payzaState.payRequests.length - 1];
  check('Payza /pay received exact amount 3000', payReq?.amount === 3000, JSON.stringify(payReq));
  check('Payza /pay currency ZMW', payReq?.currency === 'ZMW');
  check('Payza /pay reference matches ours', payReq?.reference === created.payment.reference);
  check('Payza /pay webhook URL built from baseUrl', payReq?.callback_url === `${BASE}/api/webhooks/payza`);
  check('Payza /pay redirect URL points back at /checkout with ref', payReq?.redirect_url === `${BASE}/checkout?payza=return&ref=${encodeURIComponent(created.payment.reference)}`);
  check('Payza /pay cancel URL points back at /checkout', payReq?.cancel_url === `${BASE}/checkout?payza=cancelled&ref=${encodeURIComponent(created.payment.reference)}`);
  check('customer email forwarded', payReq?.customer?.email === 'customer@example.com');
  check('customer name assembled from first/last', payReq?.customer?.name === 'Jane Mwansa');
  check('metadata carries order id + number', payReq?.metadata?.order_id === created.order.id && payReq?.metadata?.order_number === created.order.orderNumber);
  const order1 = db.orders[0];
  check('order starts pending', order1.status === 'pending' && order1.payment_status === 'pending');
  check('payment provider recorded as payza', db.payments[0].provider === 'payza');

  console.log('\n[7] Duplicate checkout protection (refresh/retry)');
  const created2 = await createPendingOrder({ user: USER, lines, customer: { email: 'customer@example.com' }, baseUrl: BASE });
  check('same basket reuses the SAME order (no duplicate order)', created2.order?.id === created.order.id);
  check('but gets a FRESH payment reference', created2.payment?.reference !== created.payment.reference);
  check('only 1 order row exists', db.orders.length === 1);
  check('older pending attempt auto-cancelled', db.payments[0].status === 'cancelled' && db.payments.length === 2);
  check('Payza never receives a reused reference (409-proof)', new Set(payzaState.payRequests.map((r) => r.reference)).size === payzaState.payRequests.length);
  // different basket -> new order
  const lines2 = sanitizeCheckoutItems([{ productId: '11111111-1111-1111-1111-111111111111', quantity: 1, gradeName: 'Third Grade' }]).lines;
  const created3 = await createPendingOrder({ user: USER, lines: lines2, customer: { email: 'customer@example.com' }, baseUrl: BASE });
  check('different basket creates a new order', created3.order?.id !== created.order.id && db.orders.length === 2);

  console.log('\n[8] Unavailable / unpayable items rejected');
  const hiddenLines = sanitizeCheckoutItems([{ productId: '33333333-3333-3333-3333-333333333333', quantity: 1 }]).lines;
  const hiddenRes = await createPendingOrder({ user: USER, lines: hiddenLines, customer: { email: 'c@e.com' }, baseUrl: BASE });
  check('hidden product rejected', hiddenRes.error != null);
  const porLines = sanitizeCheckoutItems([{ productId: '22222222-2222-2222-2222-222222222222', quantity: 1 }]).lines;
  const porRes = await createPendingOrder({ user: USER, lines: porLines, customer: { email: 'c@e.com' }, baseUrl: BASE });
  check('"Price on request" item rejected for online payment', porRes.error != null);
  const badGrade = sanitizeCheckoutItems([{ productId: '11111111-1111-1111-1111-111111111111', quantity: 1, gradeName: 'Ninth Grade' }]).lines;
  const badGradeRes = await createPendingOrder({ user: USER, lines: badGrade, customer: { email: 'c@e.com' }, baseUrl: BASE });
  check('unknown grade rejected', badGradeRes.error != null);

  console.log('\n[9] Verification — payment cannot be marked paid by the frontend');
  const ref = created2.payment.reference;
  // 9a. Payza still pending -> stays confirmation_pending
  payzaState.payments[ref] = { status: 'pending', amount: 3000 };
  const pend = await verifyPayzaPayment(ref);
  check('verify maps Payza pending -> confirmation_pending', pend.status === 'confirmation_pending');
  const appliedPending = await applyPaymentResult(ref, pend);
  check('payment row -> confirmation_pending (order stays pending)', appliedPending.status === 'confirmation_pending');
  check('order NOT marked paid from pending', db.orders[0].payment_status !== 'paid');

  // 9b. Amount tampering: Payza says 5.00 for a 3000 order
  payzaState.payments[ref] = { status: 'success', amount: '5.00' };
  const tampered = await verifyPayzaPayment(ref);
  const appliedTamper = await applyPaymentResult(ref, tampered);
  check('K5 "success" for a K3000 order REJECTED (amount mismatch)', appliedTamper.error != null && db.orders[0].payment_status !== 'paid');
  check('payment recorded as failed on mismatch', db.payments.find((p) => p.reference === ref).status === 'failed');

  // 9c. Fresh attempt, then real success
  const created4 = await createPendingOrder({ user: USER, lines, customer: { email: 'customer@example.com' }, baseUrl: BASE });
  const ref4 = created4.payment.reference;
  payzaState.payments[ref4] = { status: 'success', amount: '3000', method: 'mobile_money' };
  const ok = await verifyPayzaPayment(ref4);
  const applied = await applyPaymentResult(ref4, ok);
  check('legit payment -> paid', applied.status === 'paid');
  check('order -> payment_status paid', db.orders.find((o) => o.id === created.order.id).payment_status === 'paid');
  check('order -> status processing', db.orders.find((o) => o.id === created.order.id).status === 'processing');
  check('completed_at recorded', db.payments.find((p) => p.reference === ref4).completed_at != null);
  check('payment_method recorded from gateway', db.payments.find((p) => p.reference === ref4).payment_method === 'mobile_money');

  console.log('\n[10] Webhook idempotency & duplicate protection');
  const ordersBefore = db.orders.length;
  const paymentsBefore = db.payments.length;
  let dupCount = 0;
  for (let i = 0; i < 3; i++) {
    const r = await applyPaymentResult(ref4, await verifyPayzaPayment(ref4), { source: 'webhook' });
    if (r.duplicate) dupCount++;
  }
  check('duplicate webhooks detected (idempotent)', dupCount === 3);
  check('no new orders created by webhooks', db.orders.length === ordersBefore);
  check('no new payments created by webhooks', db.payments.length === paymentsBefore);
  // A "late success" webhook for a cancelled attempt must NOT flip it to paid
  const cancelledAttempt = db.payments[0];
  payzaState.payments[cancelledAttempt.reference] = { status: 'success', amount: 3000 };
  const lateRes = await applyPaymentResult(cancelledAttempt.reference, await verifyPayzaPayment(cancelledAttempt.reference));
  check('late webhook for a cancelled attempt does not resurrect it', lateRes.duplicate === true && cancelledAttempt.status === 'cancelled');

  console.log('\n[11] Payza payment.cancelled event mapping');
  const created6 = await createPendingOrder({ user: USER, lines: lines2, customer: { email: 'customer@example.com' }, baseUrl: BASE });
  const ref6 = created6.payment.reference;
  payzaState.payments[ref6] = { status: 'cancelled', amount: 500 };
  const cancelledRes = await applyPaymentResult(ref6, await verifyPayzaPayment(ref6), { source: 'webhook' });
  check('cancelled webhook maps to cancelled status', cancelledRes.status === 'cancelled');
  check('order NOT moved to processing on cancel', db.orders.find((o) => o.id === created6.order.id).status === 'pending');

  console.log('\n[12] Cart clearing — only purchased lines removed');
  db.user_profiles[0].cart = [
    { id: '11111111-1111-1111-1111-111111111111', gradeName: 'First Grade', selectedSize: null, selectedColor: null, quantity: 2, itemKey: 'k1' },
    { id: '11111111-1111-1111-1111-111111111111', gradeName: 'Third Grade', selectedSize: null, selectedColor: null, quantity: 1, itemKey: 'k2' },
    { id: '22222222-2222-2222-2222-222222222222', selectedSize: null, selectedColor: null, quantity: 1, itemKey: 'k3' },
  ];
  await clearPurchasedCartLines('u-1', created.order.id);
  const cart = db.user_profiles[0].cart;
  check('purchased First Grade line removed', cart.some((i) => i.itemKey === 'k1') === false);
  check('unpurchased Third Grade line kept', cart.some((i) => i.itemKey === 'k2') === true);
  check('unrelated product kept', cart.some((i) => i.itemKey === 'k3') === true);

  console.log('\n[13] Cancel flow (customer cancels hosted checkout)');
  const created5 = await createPendingOrder({ user: USER, lines: lines2, customer: { email: 'customer@example.com' }, baseUrl: BASE });
  const ref5 = created5.payment.reference;
  const c1 = await cancelPaymentAttempt(ref5);
  check('open attempt cancelled', c1.cancelled === true);
  const c2 = await cancelPaymentAttempt(ref5);
  check('second cancel is a no-op (idempotent)', c2.cancelled === false);

  console.log('\n[14] Unknown reference & provider API error handling');
  const unknown = await applyPaymentResult('SNPAY-DOES-NOT-EXIST-1', { status: 'paid' });
  check('unknown reference -> 404-style error', unknown.error != null && unknown.code === 404);
  const unauth = await verifyPayzaPayment('whatever-ref');
  check('unknown reference at Payza returns error (no data leak)', unauth.error != null);
  const reused = await createPayzaPayment({ reference: created.payment.reference, amount: 3000, customer: { email: 'customer@example.com' }, baseUrl: BASE });
  check('reusing a Payza reference surfaces the 409 cleanly (we always generate fresh ones)', reused.error != null);
  // If Payza is unreachable, the attempt must be recorded as failed, not dangle
  payzaState.failNext = true;
  const downRes = await createPendingOrder({ user: USER, lines, customer: { email: 'customer@example.com' }, baseUrl: BASE });
  check('Payza outage -> order creation returns an error', downRes.error != null);
  const lastAttempt = db.payments[db.payments.length - 1];
  check('attempt recorded as failed (retry-safe)', lastAttempt.status === 'failed' && lastAttempt.failure_reason != null);
  const noBase = await createPendingOrder({ user: USER, lines, customer: { email: 'customer@example.com' }, baseUrl: '' });
  check('missing public base URL rejected', noBase.error != null);

  console.log('\n[15] Fingerprint stability');
  const f1 = cartFingerprint([{ productId: 'a', size: 'M', color: 'Black', gradeName: 'First Grade' }, { productId: 'b', size: null, color: null, gradeName: null }]);
  const f2 = cartFingerprint([{ productId: 'b', size: null, color: null, gradeName: null }, { productId: 'a', size: 'M', color: 'Black', gradeName: 'First Grade' }]);
  check('order-independent fingerprint', f1 === f2);

  console.log(`\n=============================\nRESULTS: ${passed} passed, ${failed} failed\n=============================`);

  sbServer.close();
  payzaServer.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(1); });
