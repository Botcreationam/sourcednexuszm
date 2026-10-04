// ============================================================================
// E2E test: the REAL server.js Lenco endpoints against local mocks of
// Supabase (REST + auth) and the Lenco API. No real credentials, no money.
// ============================================================================
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- fake Supabase -----------------------------------------------------------
const db = {
  products: [{
    id: '11111111-1111-1111-1111-111111111111', name: 'Executive Wool Suit',
    category: 'Suits', price: 'K 1,500', status: 'available', images: [],
    grades: [{ name: 'First Grade', price: '1500', original_price: '2000', discount_percentage: 25 }],
  }],
  orders: [], order_items: [], payments: [],
  user_profiles: [{ id: 'u-customer', cart: [] }],
};

function applyFilters(rows, params) {
  let out = rows;
  for (const [key, value] of Object.entries(params)) {
    if (['select', 'order', 'limit'].includes(key)) continue;
    let op = 'eq'; let val = value;
    let m = String(value).match(/^(\w+)\.\((.*)\)$/);
    if (!m) m = String(value).match(/^(\w+)\.(.+)$/);
    if (m) { op = m[1]; val = m[2]; }
    if (op === 'eq') out = out.filter((r) => String(r[key]) === val);
  }
  if (params.order) {
    const [f, d] = params.order.split('.');
    out = [...out].sort((a, b) => d === 'desc' ? String(b[f]).localeCompare(String(a[f])) : String(a[f]).localeCompare(String(b[f])));
  }
  if (params.limit) out = out.slice(0, Number(params.limit));
  return out;
}

let seq = 0;
const sb = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const json = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const payload = body ? JSON.parse(body) : null;

    // auth endpoint
    if (url.pathname === '/auth/v1/user') {
      const auth = req.headers['authorization'];
      if (auth === 'Bearer customer-token') return json(200, { id: 'u-customer', email: 'customer@example.com' });
      if (auth === 'Bearer other-user-token') return json(200, { id: 'u-other', email: 'other@example.com' });
      return json(401, { error: 'invalid' });
    }

    const table = url.pathname.replace('/rest/v1/', '');
    const params = Object.fromEntries(url.searchParams.entries());
    if (req.method === 'GET') return json(200, applyFilters(db[table] || [], params));
    if (req.method === 'POST') {
      const rows = Array.isArray(payload) ? payload : [payload];
      for (const r of rows) { if (!r.id) r.id = `${table}-${++seq}`; db[table].push(r); }
      return json(201, rows);
    }
    if (req.method === 'PATCH') {
      const targets = applyFilters(db[table] || [], params);
      for (const t of targets) Object.assign(t, payload);
      return json(200, targets);
    }
    if (req.method === 'DELETE') {
      const matches = applyFilters(db[table] || [], params);
      db[table] = (db[table] || []).filter((r) => !matches.includes(r));
      return res.writeHead(204), res.end();
    }
    json(405, {});
  });
});

// --- fake Lenco --------------------------------------------------------------
const lenco = { status: { }, amount: {} };
const lencoServer = http.createServer((req, res) => {
  const m = req.url.match(/\/access\/v2\/collections\/status\/(.+)$/);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  if (!m || !lenco.status[m[1]]) return res.end(JSON.stringify({ status: false, message: 'not found' }));
  return res.end(JSON.stringify({
    status: true, message: '', data: {
      amount: String(lenco.amount[m[1]]), currency: 'ZMW', reference: m[1],
      lencoReference: 'LNC-1', type: 'card', status: lenco.status[m[1]],
      completedAt: lenco.status[m[1]] === 'successful' ? new Date().toISOString() : null,
    },
  }));
});

let passed = 0, failed = 0;
const check = (n, c, e = '') => { if (c) { passed++; console.log(`  PASS  ${n}`); } else { failed++; console.log(`  FAIL  ${n} ${e}`); } };

async function api(path, { method = 'POST', token, body, rawBody, headers = {} } = {}) {
  const res = await fetch(`http://localhost:4610${path}`, {
    method,
    headers: {
      ...(body != null ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: rawBody ?? (body != null ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch {}
  return { status: res.status, data };
}

async function main() {
  await new Promise((r) => sb.listen(4601, r));
  await new Promise((r) => lencoServer.listen(4602, r));

  process.env.VITE_SUPABASE_URL = 'http://localhost:4601';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
  process.env.LENCO_SECRET_KEY = 'e2e-secret';
  process.env.LENCO_PUBLIC_KEY = 'e2e-public';
  process.env.LENCO_API_BASE_URL = 'http://localhost:4602';
  process.env.PORT = '4610';

  const { spawn } = await import('node:child_process');
  const server = spawn('node', ['/app/conversations/6ac22147782c7e7f81d70d86/sourcednexuszm/server.js'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let serverErr = '';
  server.stderr.on('data', (d) => { serverErr += d.toString(); });
  await new Promise((r) => setTimeout(r, 1200));

  const lines = [{ productId: '11111111-1111-1111-1111-111111111111', quantity: 2, gradeName: 'First Grade' }];

  console.log('\n[E1] Auth required for order creation');
  const noAuth = await api('/api/payments/lenco/create-order', { body: { items: lines, customer: { email: 'x@y.com' } } });
  check('401 without a valid session', noAuth.status === 401);

  console.log('\n[E2] Price tampering — browser amount fields ignored');
  const created = await api('/api/payments/lenco/create-order', {
    token: 'customer-token',
    body: {
      items: [{ ...lines[0], price: 5, amount: 5, total: 5 }], // forged fields
      customer: { email: 'Customer@Example.com', phone: '0971111111', firstName: 'Frank' },
    },
  });
  check('201 created', created.status === 201, JSON.stringify(created));
  check('server-side amount = 3000 (forged K5 ignored)', created.data.amount === 3000, JSON.stringify(created.data));
  check('public key returned for widget (secret NOT in response)', created.data.publicKey === 'e2e-public' && !JSON.stringify(created.data).includes('e2e-secret'));
  const ref = created.data.reference;

  console.log('\n[E3] Ownership — another user cannot verify this payment');
  const foreign = await api('/api/payments/lenco/verify', { token: 'other-user-token', body: { reference: ref } });
  check('403 for another user', foreign.status === 403, JSON.stringify(foreign));
  const bogus = await api('/api/payments/lenco/verify', { token: 'customer-token', body: { reference: 'SNPAY-NOT-REAL-XYZ' } });
  check('404 for unknown reference', bogus.status === 404);

  console.log('\n[E4] Verify — pending stays confirmation_pending, order not paid');
  lenco.status[ref] = 'pending'; lenco.amount[ref] = 3000;
  const v1 = await api('/api/payments/lenco/verify', { token: 'customer-token', body: { reference: ref } });
  check('verify ok, paymentStatus confirmation_pending', v1.status === 200 && v1.data.paymentStatus === 'confirmation_pending', JSON.stringify(v1.data));
  check('order status still pending', v1.data.orderStatus === 'pending');

  console.log('\n[E5] Amount mismatch via Lenco verification');
  lenco.status[ref] = 'successful'; lenco.amount[ref] = 5; // attacker paid K5
  const v2 = await api('/api/payments/lenco/verify', { token: 'customer-token', body: { reference: ref } });
  check('409 rejected on amount mismatch', v2.status === 409, JSON.stringify(v2));
  check('payment recorded failed', db.payments[0].status === 'failed');

  console.log('\n[E6] Retry with correct amount — new attempt, same order');
  const created2 = await api('/api/payments/lenco/create-order', {
    token: 'customer-token',
    body: { items: lines, customer: { email: 'customer@example.com' } },
  });
  check('new reference issued', created2.status === 201 && created2.data.reference !== ref);
  check('same order reused (no duplicate)', created2.data.orderNumber === created.data.orderNumber);
  // ref was already 'failed' from E5 — a terminal state is preserved as history;
  // only OPEN (pending) attempts get cancelled when superseded.
  check('terminal attempt preserved (only open attempts get cancelled)', db.payments.find((p) => p.reference === ref).status === 'failed');
  const ref2 = created2.data.reference;

  console.log('\n[E7] Success path — verified, order processing, cart cleared');
  db.user_profiles[0].cart = [
    { id: lines[0].productId, gradeName: 'First Grade', selectedSize: null, selectedColor: null, itemKey: 'buy' },
    { id: lines[0].productId, gradeName: 'Second Grade', selectedSize: null, selectedColor: null, itemKey: 'keep' },
  ];
  lenco.status[ref2] = 'successful'; lenco.amount[ref2] = 3000;
  const v3 = await api('/api/payments/lenco/verify', { token: 'customer-token', body: { reference: ref2 } });
  check('paymentStatus paid', v3.data.paymentStatus === 'paid', JSON.stringify(v3.data));
  check('orderStatus processing', v3.data.orderStatus === 'processing');
  check('purchased line removed from persisted cart', db.user_profiles[0].cart.some((i) => i.itemKey === 'buy') === false);
  check('other cart line kept', db.user_profiles[0].cart.some((i) => i.itemKey === 'keep') === true);

  console.log('\n[E8] Webhook — signature, idempotency, duplicate protection');
  // make a new pending attempt to receive the webhook
  const created3 = await api('/api/payments/lenco/create-order', {
    token: 'customer-token',
    body: { items: lines, customer: { email: 'customer@example.com' } },
  });
  const ref3 = created3.data.reference;
  lenco.status[ref3] = 'successful'; lenco.amount[ref3] = 3000;
  const event = JSON.stringify({ event: 'collection.successful', data: { reference: ref3, amount: '3000' } });
  const key = crypto.createHash('sha256').update('e2e-secret').digest('hex');
  const sig = crypto.createHmac('sha512', key).update(event).digest('hex');

  const badSig = await api('/api/webhooks/lenco', { rawBody: event, headers: { 'X-Lenco-Signature': 'deadbeef' } });
  check('invalid signature -> 401', badSig.status === 401, JSON.stringify(badSig));
  const paymentsBefore = db.payments.length, ordersBefore = db.orders.length;
  const good1 = await api('/api/webhooks/lenco', { rawBody: event, headers: { 'X-Lenco-Signature': sig } });
  check('valid webhook -> 200', good1.status === 200);
  check('webhook marked payment paid', db.payments.find((p) => p.reference === ref3).status === 'paid');
  const good2 = await api('/api/webhooks/lenco', { rawBody: event, headers: { 'X-Lenco-Signature': sig } });
  const good3 = await api('/api/webhooks/lenco', { rawBody: event, headers: { 'X-Lenco-Signature': sig } });
  check('duplicate webhooks still 200 (ack)', good2.status === 200 && good3.status === 200);
  check('no duplicate orders/payments created', db.payments.length === paymentsBefore && db.orders.length === ordersBefore);

  console.log('\n[E9] Cancel flow');
  const created4 = await api('/api/payments/lenco/create-order', {
    token: 'customer-token',
    body: { items: lines, customer: { email: 'customer@example.com' } },
  });
  const ref4 = created4.data.reference;
  const cancelForeign = await api('/api/payments/lenco/cancel', { token: 'other-user-token', body: { reference: ref4 } });
  check('other user cannot cancel -> 403', cancelForeign.status === 403);
  const cancelOwn = await api('/api/payments/lenco/cancel', { token: 'customer-token', body: { reference: ref4 } });
  check('own cancel ok', cancelOwn.status === 200 && cancelOwn.data.cancelled === true);

  console.log('\n[E10] Secret never appears in any response body');
  const allResponses = JSON.stringify([noAuth.data, created.data, foreign.data, v1.data, v2.data, created2.data, v3.data, good1.data]);
  check('secret key absent from all payloads', !allResponses.includes('e2e-secret'));
  check('service role key absent from all payloads', !allResponses.includes('svc'));

  server.kill();
  sb.close();
  lencoServer.close();
  console.log(`\n=============================\nE2E RESULTS: ${passed} passed, ${failed} failed\n=============================`);
  if (serverErr.includes('Error')) console.log('SERVER STDERR (excerpt):', serverErr.slice(0, 400));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('E2E HARNESS ERROR:', e); process.exit(1); });
