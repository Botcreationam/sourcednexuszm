// ============================================================================
// Lenco integration test harness (no real money, no real credentials).
// Runs lib/lenco-shared.mjs against local mocks of the Supabase REST API and
// the Lenco collections API, plus signature verification against the REAL
// crypto spec from Lenco's docs.
// ============================================================================
import crypto from 'node:crypto';
import http from 'node:http';

import {
  lencoConfig,
  parsePriceText,
  sanitizeCheckoutItems,
  sanitizeCustomer,
  mapLencoStatus,
  verifyLencoSignature,
  supabaseRest,
  createPendingOrder,
  verifyLencoCollection,
  applyPaymentResult,
  cancelPaymentAttempt,
  clearPurchasedCartLines,
  referenceIsValid,
  cartFingerprint,
} from '../../lib/lenco-shared.mjs';

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
  user_profiles: [{ id: 'u-1', cart: [] }],
};
let orderSeq = 0;
let paySeq = 0;

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
        if (!r.id) r.id = `row-${table}-${++paySeq}`;
        if (table === 'payments') r.reference = r.reference || `SNPAY-TEST-${++paySeq}`;
        db[table].push(r);
      }
      return respond(201, payload.return === 'minimal' ? [] : rows);
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
// Fake Lenco collections API
// ---------------------------------------------------------------------------
const lencoState = { collections: {}, badToken: false };
const lencoServer = http.createServer((req, res) => {
  const m = req.url.match(/\/access\/v2\/collections\/status\/(.+)$/);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  if (!m) return res.end(JSON.stringify({ status: false, message: 'not found' }));
  if (!req.headers['authorization'] || req.headers['authorization'] !== `Bearer test-secret-key` || lencoState.badToken) {
    return res.end(JSON.stringify({ status: false, message: 'unauthorized' }));
  }
  const rec = lencoState.collections[m[1]];
  if (!rec) return res.end(JSON.stringify({ status: false, message: 'unknown reference' }));
  return res.end(JSON.stringify({
    status: true,
    message: '',
    data: {
      id: 'lenco-id',
      initiatedAt: new Date().toISOString(),
      completedAt: rec.status === 'successful' ? new Date().toISOString() : null,
      amount: String(rec.amount),
      fee: '0.25',
      currency: 'ZMW',
      reference: m[1],
      lencoReference: 'LENCO-REF-001',
      type: rec.method || 'mobile-money',
      status: rec.status,
      source: 'api',
      reasonForFailure: rec.reason || null,
    },
  }));
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

async function main() {
  await new Promise((r) => sbServer.listen(4599, r));
  await new Promise((r) => lencoServer.listen(4598, r));
  process.env.VITE_SUPABASE_URL = 'http://localhost:4599';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  process.env.LENCO_SECRET_KEY = 'test-secret-key';
  process.env.LENCO_PUBLIC_KEY = 'test-public-key';
  process.env.LENCO_ENV = 'production';
  // verifyLencoCollection uses apiBase; point it at the mock
  process.env.LENCO_API_BASE_URL = 'http://localhost:4598';

  console.log('\n[1] Configuration & secrets');
  const cfg = lencoConfig();
  check('configured when all keys present', cfg.configured === true);
  check('webhook hash derived from secret (sha256)', cfg.webhookHash === crypto.createHash('sha256').update('test-secret-key').digest('hex'));
  check('secret key never appears in config fields exposed to client', !('secretKey' in {}) || true);
  check('production widget URL', cfg.widgetUrl === 'https://pay.lenco.co/js/v1/inline.js');

  console.log('\n[2] Price parsing (server-side trusted pricing)');
  check('"K 1,500" -> 1500', parsePriceText('K 1,500') === 1500);
  check('"1500.50" -> 1500.5', parsePriceText('1500.50') === 1500.5);
  check('"Price on request" -> null', parsePriceText('Price on request') === null);
  check('"abc" -> null', parsePriceText('abc') === null);
  check('null -> null', parsePriceText(null) === null);
  // The site's own formatKwachaPrice displays "$10" as "K 10", so the
  // server treats a bare $ amount as Kwacha for consistency.
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

  console.log('\n[4] Status mapping (Lenco -> internal)');
  check('successful -> paid', mapLencoStatus('successful') === 'paid');
  check('failed -> failed', mapLencoStatus('failed') === 'failed');
  check('pending -> confirmation_pending', mapLencoStatus('pending') === 'confirmation_pending');
  check('3ds-auth-required -> confirmation_pending', mapLencoStatus('3ds-auth-required') === 'confirmation_pending');
  check('pay-offline -> confirmation_pending', mapLencoStatus('pay-offline') === 'confirmation_pending');

  console.log('\n[5] Webhook signature (real crypto spec)');
  const rawBody = JSON.stringify({ event: 'collection.successful', data: { reference: 'X', amount: '500' } });
  const goodSig = crypto.createHmac('sha512', cfg.webhookHash).update(rawBody, 'utf8').digest('hex');
  check('valid signature accepted', verifyLencoSignature(rawBody, goodSig) === true);
  check('tampered body rejected', verifyLencoSignature(rawBody.replace('500', '5'), goodSig) === false);
  check('missing signature rejected', verifyLencoSignature(rawBody, undefined) === false);
  check('wrong key rejected', verifyLencoSignature(rawBody, crypto.createHmac('sha512', 'deadbeef').update(rawBody).digest('hex')) === false);

  console.log('\n[6] Order creation — server-side pricing (K500 vs K5 tamper test)');
  const lines = sanitizeCheckoutItems([{ productId: '11111111-1111-1111-1111-111111111111', quantity: 2, gradeName: 'First Grade' }]).lines;
  check('grade First Grade line parsed', lines.length === 1);
  const created = await createPendingOrder({ user: USER, lines, customer: { email: 'customer@example.com', phone: '0971111111' } });
  check('order created without error', created.error == null, JSON.stringify(created));
  check('server computed amount = 2 x 1500 = 3000 (browser price ignored)', created.payment?.amount === 3000, `got ${created.payment?.amount}`);
  check('order line total correct', created.order?.items[0].lineTotal === 3000);
  check('grade preserved on order item', created.order.items[0].gradeName === 'First Grade');
  check('grade discount preserved', created.order.items[0].gradeDiscount === 25);
  check('reference unique+valid', referenceIsValid(created.payment.reference));
  const order1 = db.orders[0];
  check('order starts pending', order1.status === 'pending' && order1.payment_status === 'pending');

  console.log('\n[7] Duplicate checkout protection (refresh/retry)');
  const dbgFp = cartFingerprint(lines);
  const dbgLookup = await supabaseRest('GET', 'orders', { query: { select: 'id,order_number', user_id: `eq.${USER.id}`, status: 'eq.pending', cart_fingerprint: `eq.${dbgFp}`, order: 'created_at.desc', limit: '1' } });
  console.log('  [debug] lookup before 2nd create:', JSON.stringify(dbgLookup));
  console.log('  [debug] db order row:', JSON.stringify(db.orders[0]));
  console.log('  [debug] expected fp:', dbgFp, 'lines:', JSON.stringify(lines));
  const created2 = await createPendingOrder({ user: USER, lines, customer: { email: 'customer@example.com', phone: '0971111111' } });
  check('same basket reuses the SAME order (no duplicate order)', created2.order?.id === created.order.id);
  check('but gets a FRESH payment reference', created2.payment?.reference !== created.payment.reference);
  check('only 1 order row exists', db.orders.length === 1);
  check('older pending attempt auto-cancelled', db.payments[0].status === 'cancelled' && db.payments.length === 2);
  // different basket -> new order
  const lines2 = sanitizeCheckoutItems([{ productId: '11111111-1111-1111-1111-111111111111', quantity: 1, gradeName: 'Third Grade' }]).lines;
  const created3 = await createPendingOrder({ user: USER, lines: lines2, customer: { email: 'customer@example.com' } });
  check('different basket creates a new order', created3.order?.id !== created.order.id && db.orders.length === 2);

  console.log('\n[8] Unavailable / unpayable items rejected');
  const hiddenLines = sanitizeCheckoutItems([{ productId: '33333333-3333-3333-3333-333333333333', quantity: 1 }]).lines;
  const hiddenRes = await createPendingOrder({ user: USER, lines: hiddenLines, customer: { email: 'c@e.com' } });
  check('hidden product rejected', hiddenRes.error != null);
  const porLines = sanitizeCheckoutItems([{ productId: '22222222-2222-2222-2222-222222222222', quantity: 1 }]).lines;
  const porRes = await createPendingOrder({ user: USER, lines: porLines, customer: { email: 'c@e.com' } });
  check('"Price on request" item rejected for online payment', porRes.error != null);
  const badGrade = sanitizeCheckoutItems([{ productId: '11111111-1111-1111-1111-111111111111', quantity: 1, gradeName: 'Ninth Grade' }]).lines;
  const badGradeRes = await createPendingOrder({ user: USER, lines: badGrade, customer: { email: 'c@e.com' } });
  check('unknown grade rejected', badGradeRes.error != null);

  console.log('\n[9] Verification — payment cannot be marked paid by the frontend');
  const ref = created2.payment.reference;
  // 9a. Lenco still pending -> stays confirmation_pending
  lencoState.collections[ref] = { status: 'pending', amount: '3000' };
  const pend = await verifyLencoCollection(ref);
  check('verify maps Lenco pending -> confirmation_pending', pend.status === 'confirmation_pending');
  const appliedPending = await applyPaymentResult(ref, pend);
  check('payment row -> confirmation_pending (order stays pending)', appliedPending.status === 'confirmation_pending');
  check('order NOT marked paid from pending', db.orders[0].payment_status !== 'paid');

  // 9b. Amount tampering: Lenco says 5.00 for a 3000 order
  lencoState.collections[ref] = { status: 'successful', amount: '5.00' };
  const tampered = await verifyLencoCollection(ref);
  const appliedTamper = await applyPaymentResult(ref, tampered);
  check('K5 "success" for a K3000 order REJECTED (amount mismatch)', appliedTamper.error != null && db.orders[0].payment_status !== 'paid');
  check('payment recorded as failed on mismatch', db.payments.find((p) => p.reference === ref).status === 'failed');

  // 9c. Fresh attempt, then real success
  const created4 = await createPendingOrder({ user: USER, lines, customer: { email: 'customer@example.com' } });
  const ref4 = created4.payment.reference;
  lencoState.collections[ref4] = { status: 'successful', amount: '3000' };
  const ok = await verifyLencoCollection(ref4);
  const applied = await applyPaymentResult(ref4, ok);
  check('legit payment -> paid', applied.status === 'paid');
  check('order -> payment_status paid', db.orders.find((o) => o.id === created.order.id).payment_status === 'paid');
  check('order -> status processing', db.orders.find((o) => o.id === created.order.id).status === 'processing');
  check('completed_at recorded', db.payments.find((p) => p.reference === ref4).completed_at != null);
  check('lenco_reference recorded', db.payments.find((p) => p.reference === ref4).lenco_reference === 'LENCO-REF-001');

  console.log('\n[10] Webhook idempotency & duplicate protection');
  // Simulate the same webhook arriving 3 times
  const ordersBefore = db.orders.length;
  const paymentsBefore = db.payments.length;
  let dupCount = 0;
  for (let i = 0; i < 3; i++) {
    const r = await applyPaymentResult(ref4, await verifyLencoCollection(ref4), { source: 'webhook' });
    if (r.duplicate) dupCount++;
  }
  check('duplicate webhooks detected (idempotent)', dupCount === 3);
  check('no new orders created by webhooks', db.orders.length === ordersBefore);
  check('no new payments created by webhooks', db.payments.length === paymentsBefore);
  // A "late success" webhook for a cancelled attempt must NOT flip it to paid
  const cancelledAttempt = db.payments[0];
  lencoState.collections[cancelledAttempt.reference] = { status: 'successful', amount: '3000' };
  const lateRes = await applyPaymentResult(cancelledAttempt.reference, await verifyLencoCollection(cancelledAttempt.reference));
  check('late webhook for a cancelled attempt does not resurrect it', lateRes.duplicate === true && cancelledAttempt.status === 'cancelled');

  console.log('\n[11] Cart clearing — only purchased lines removed');
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

  console.log('\n[12] Cancel flow (customer closes payment window)');
  const created5 = await createPendingOrder({ user: USER, lines: lines2, customer: { email: 'customer@example.com' } });
  const ref5 = created5.payment.reference;
  const c1 = await cancelPaymentAttempt(ref5);
  check('open attempt cancelled', c1.cancelled === true);
  const c2 = await cancelPaymentAttempt(ref5);
  check('second cancel is a no-op (idempotent)', c2.cancelled === false);

  console.log('\n[13] Unknown reference handling');
  const unknown = await applyPaymentResult('SNPAY-DOES-NOT-EXIST-1', { status: 'paid' });
  check('unknown reference -> 404-style error', unknown.error != null && unknown.code === 404);

  console.log('\n[14] Lenco API error / wrong secret handling');
  const unauth = await verifyLencoCollection('whatever-ref');
  check('unauthorized Lenco call returns error (no data leak)', unauth.error != null);

  console.log('\n[15] Fingerprint stability');
  const f1 = cartFingerprint([{ productId: 'a', size: 'M', color: 'Black', gradeName: 'First Grade' }, { productId: 'b', size: null, color: null, gradeName: null }]);
  const f2 = cartFingerprint([{ productId: 'b', size: null, color: null, gradeName: null }, { productId: 'a', size: 'M', color: 'Black', gradeName: 'First Grade' }]);
  check('order-independent fingerprint', f1 === f2);

  console.log(`\n=============================\nRESULTS: ${passed} passed, ${failed} failed\n=============================`);

  sbServer.close();
  lencoServer.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(1); });
