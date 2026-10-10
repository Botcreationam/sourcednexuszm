// ============================================================================
// Payment confirmation emails: customer receipt + admin notification.
// Runs the REAL production code on a REAL Postgres (real migrations, real
// UNIQUE constraints, real claim functions). Payza and the email provider are
// faked over local HTTP. The webhook is driven through the real handler with a
// real HMAC signature. No real money, no real email.
//
//   PG_MODULE_ROOT=<folder with node_modules/pg> \
//   PG_TEST_SOCKET=/tmp PG_TEST_PORT=54329 PG_TEST_DB=sn_pay_mig \
//   node tests/payza-payments/test-payment-notifications.mjs
//
// The database must have ALL migrations applied, including
// 20261009000000_payment_admin_notifications.sql.
// ============================================================================
import http from 'node:http';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { startPgShim } from './pg-rest-shim.mjs';
import {
  sanitizeCheckoutItems, createPendingOrder, applyPaymentResult, verifyPayzaPayment, sanitizeCustomer,
} from '../../lib/payza-shared.mjs';
import { processReceiptEmails } from '../../lib/order-receipts.mjs';
import { processAdminPaymentNotifications, paymentAdminRecipients } from '../../lib/payment-notifications.mjs';
import { handleShopRequest } from '../../lib/shop-api.mjs';
import webhook from '../../api/payza-webhook.js';

const PG = {
  host: process.env.PG_TEST_SOCKET || '/tmp',
  port: Number(process.env.PG_TEST_PORT || 54329),
  user: 'postgres',
  database: process.env.PG_TEST_DB || 'sn_pay_mig',
};
const ADMINS = ['frankmwalu04@gmail.com', 'sourcednexus@gmail.com', 'joshuankuba04@gmail.com'];
const SECRET = 'whsec_notify_test';

let passed = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  PASS  ${name}`); } else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
};

// ------------------------------------------------------------ fake Payza/email
const payza = { payments: {} };
const pz = http.createServer((req, res) => {
  const respond = (c, d) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); };
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.method === 'POST' && req.url === '/api/v1/pay') {
      const p = JSON.parse(body);
      payza.payments[p.reference] = { status: 'pending', amount: p.amount, currency: 'ZMW', method: 'airtel_money' };
      return respond(200, { success: true, data: { reference: p.reference, payment_url: `https://checkout.example/${p.reference}` } });
    }
    const m = req.url.match(/^\/api\/v1\/verify\/(.+)$/);
    if (m) {
      const rec = payza.payments[decodeURIComponent(m[1])];
      if (!rec) return respond(404, { success: false });
      return respond(200, { success: true, data: {
        reference: decodeURIComponent(m[1]), status: rec.status, amount: rec.amount, currency: rec.currency,
        actual_gateway: rec.method, paid_at: rec.status === 'success' ? new Date().toISOString() : null,
      } });
    }
    respond(404, {});
  });
});

// failMode: null | 'temp' (503, retryable) | { to: 'addr', mode: 'temp' } (only one recipient fails)
const mail = { sent: [], failMode: null, seenKeys: new Set() };
const em = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const respond = (c, d) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); };
    const p = JSON.parse(body);
    const to = Array.isArray(p.to) ? p.to[0] : p.to;
    const fm = mail.failMode;
    if (fm === 'temp' || (fm && typeof fm === 'object' && fm.to === to)) return respond(503, { message: 'provider down' });
    const key = req.headers['idempotency-key'];
    if (process.env.IGNORE_KEYS !== '1' && key && mail.seenKeys.has(key)) return respond(200, { id: `dup-${key}` });
    if (key) mail.seenKeys.add(key);
    mail.sent.push({ to, subject: p.subject, html: p.html, text: p.text, key });
    respond(200, { id: `msg-${mail.sent.length}` });
  });
});

const BASE = 'https://shop.example';

// Drive the REAL webhook handler with a signed raw body (no browser involved).
async function deliverWebhook(reference, { event = 'payment.success', signature } = {}) {
  const raw = JSON.stringify({ event, reference });
  const sig = signature ?? crypto.createHmac('sha256', SECRET).update(raw, 'utf8').digest('hex');
  const req = new EventEmitter();
  req.method = 'POST';
  req.headers = { 'x-payza-signature': sig, host: 'shop.example' };
  req.destroy = () => {};
  const out = { status: 0, body: null };
  const res = { status(c) { out.status = c; return res; }, json(b) { out.body = b; return res; } };
  const done = webhook(req, res);
  process.nextTick(() => { req.emit('data', raw); req.emit('end'); });
  await done;
  return out;
}

async function main() {
  const shim = await startPgShim({ port: 4650, pg: PG });
  const q = (sql, args) => shim.client.query(sql, args).then((r) => r.rows);
  await Promise.all([new Promise((r) => pz.listen(4652, r)), new Promise((r) => em.listen(4653, r))]);
  Object.assign(process.env, {
    VITE_SUPABASE_URL: 'http://localhost:4650', VITE_SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc',
    PAYZA_PUBLIC_KEY: 'pk_test_x', PAYZA_SECRET_KEY: 'sk_test_x', PAYZA_WEBHOOK_SECRET: SECRET,
    PAYZA_API_BASE_URL: 'http://localhost:4652/api/v1',
    EMAIL_API_KEY: 'k', EMAIL_FROM_ADDRESS: 'orders@sourcednexus.online', EMAIL_API_URL: 'http://localhost:4653/send', EMAIL_PROVIDER: 'resend',
    SITE_BASE_URL: 'https://sourcednexus.online',
  });
  delete process.env.PAYMENT_ADMIN_EMAILS; // use the built-in defaults

  const hasTable = (await q(`select to_regclass('public.payment_admin_notifications') is not null as t`))[0].t;
  if (!hasTable) { console.error('Database lacks migration 20261009000000. Apply it first.'); process.exit(2); }

  // ---------------------------------------------------------------- seed
  await q(`truncate public.payment_admin_notifications, public.order_item_components, public.order_receipts, public.payments, public.order_items, public.orders, public.bundle_items, public.bundles, public.products cascade`);
  await q(`truncate auth.users cascade`);
  const [user] = await q(`insert into auth.users(email) values ('john@example.com') returning id`);
  await q(`insert into public.user_profiles(id, cart) values ($1,'[]')`, [user.id]);
  const USER = { id: user.id, email: 'john@example.com' };
  const CUSTOMER = { email: 'john@example.com', phone: '+260 97 123 4567', firstName: 'John', lastName: 'Banda' };

  const prod = async (name, category, price) => (await q(
    `insert into public.products(name, category, price, status) values ($1,$2,$3,'available') returning *`, [name, category, price],
  ))[0];
  const DRESS = await prod('Evening Dress', 'Dresses', 'K400');
  const LAMP = await prod('Desk Lamp', 'Home Appliances and Gadgets', 'K600');
  const HAT = await prod('Straw Hat', 'Hats', 'K250');

  const place = async (items, customer = CUSTOMER) => {
    const s = sanitizeCheckoutItems(items);
    if (s.error) return { error: s.error };
    return createPendingOrder({ user: USER, lines: s.lines, customer, baseUrl: BASE });
  };
  const setPayza = (ref, patch) => Object.assign(payza.payments[ref], patch);
  const clean = async () => {
    await q(`truncate public.payment_admin_notifications, public.order_receipts, public.payments, public.order_items, public.orders cascade`);
    mail.sent.length = 0; mail.seenKeys.clear(); mail.failMode = null;
  };
  const toAdmin = (a) => mail.sent.filter((m) => m.to === a);
  const toCustomer = () => mail.sent.filter((m) => m.to === 'john@example.com');
  const notifRows = () => q(`select * from public.payment_admin_notifications order by recipient_email`);

  // ====================================================================== 1
  console.log('\n[SCENARIO 1] customer buys ONE product');
  await clean();
  let o = await place([{ productId: DRESS.id, quantity: 1 }]);
  check('order created', !o.error, o.error);
  let ref = o.payment.reference;
  check('before payment: order is NOT paid', (await q(`select payment_status from orders`))[0].payment_status !== 'paid');
  check('before payment: no emails at all', mail.sent.length === 0);
  setPayza(ref, { status: 'success' });
  let r = await deliverWebhook(ref);
  check('webhook acknowledged 200', r.status === 200);
  check('payment verified server-side -> PAID', (await q(`select status from payments`))[0].status === 'paid');
  check('order marked paid', (await q(`select payment_status, paid_at is not null as t from orders`))[0].payment_status === 'paid');
  check('customer receipt emailed to the order customer', toCustomer().length === 1);
  check('admin #1 (frankmwalu04@gmail.com) notified once', toAdmin(ADMINS[0]).length === 1);
  check('admin #2 (sourcednexus@gmail.com) notified once', toAdmin(ADMINS[1]).length === 1);
  check('exactly 4 emails (1 customer + 3 admins)', mail.sent.length === 4, `got ${mail.sent.length}`);
  let a = toAdmin(ADMINS[0])[0];
  check('admin subject says New Payment Received', a.subject.startsWith('New Payment Received \u2014 Sourced Nexus'), a.subject);
  check('admin email: customer NAME', a.html.includes('John Banda') && a.text.includes('Name: John Banda'));
  check('admin email: customer EMAIL', a.text.includes('Email: john@example.com'));
  check('admin email: customer PHONE', a.html.includes('+260 97 123 4567') && a.text.includes('Phone: +260 97 123 4567'));
  check('admin email: order id', a.text.includes(`Order ID: #${o.order.orderNumber}`));
  check('admin email: transaction reference', a.text.includes(`Transaction reference: ${ref}`));
  check('admin email: provider/method', a.text.includes('Payza') && a.text.includes('Airtel Money'));
  check('admin email: date/time', /\d{2} \w{3} \d{4}/.test(a.text) && a.text.includes('(CAT)'));
  check('admin email: payment + order status', a.text.includes('Payment status: PAID') && a.text.includes('Order status: Processing'));
  check('admin email: currency + total K400', a.text.includes('TOTAL PAID: K400 ZMW'));
  check('admin email: dashboard link', a.text.includes('https://sourcednexus.online/admin/orders'));
  check('admin email: product + quantity', a.text.includes('Evening Dress') && a.text.includes('1 x K400 = K400'));
  const c = toCustomer()[0];
  check('receipt: Sourced Nexus branding', c.html.includes('SOURCED NEXUS') && c.html.includes('Sourced Nexus'));
  check('receipt: customer name/email/phone', c.text.includes('Customer: John Banda') && c.text.includes('Email: john@example.com') && c.text.includes('Phone: +260 97 123 4567'));
  check('receipt: order, reference, status, method, currency, total',
    c.text.includes(`Order: #${o.order.orderNumber}`) && c.text.includes(`Payment reference: ${ref}`) && c.text.includes('Payment status: PAID')
    && c.text.includes('Airtel Money') && c.text.includes('TOTAL PAID: K400 ZMW'));
  const blob = JSON.stringify(mail.sent);
  check('no secrets in any email (keys / webhook secret / card words)',
    !blob.includes('sk_test_x') && !blob.includes('pk_test_x') && !blob.includes(SECRET) && !/cvv|card number|password/i.test(blob));
  let nrows = await notifRows();
  check('admin notification rows recorded as SENT (2)', nrows.length === 2 && nrows.every((n) => n.email_status === 'sent'));
  check('receipt row stored the customer phone', (await q(`select customer_phone from order_receipts`))[0].customer_phone === '+260 97 123 4567');

  // ====================================================================== 2
  console.log('\n[SCENARIO 2] customer buys MULTIPLE products');
  await clean();
  o = await place([{ productId: DRESS.id, quantity: 1 }, { productId: LAMP.id, quantity: 1 }, { productId: HAT.id, quantity: 1 }]);
  ref = o.payment.reference; setPayza(ref, { status: 'success' });
  await deliverWebhook(ref);
  a = toAdmin(ADMINS[0])[0];
  check('3 distinct products listed', a.text.includes('Evening Dress') && a.text.includes('Desk Lamp') && a.text.includes('Straw Hat'));
  check('individual subtotals K400 / K600 / K250', a.text.includes('1 x K400 = K400') && a.text.includes('1 x K600 = K600') && a.text.includes('1 x K250 = K250'));
  check('total = K1,250', a.text.includes('TOTAL PAID: K1,250 ZMW') && toCustomer()[0].text.includes('TOTAL PAID: K1,250 ZMW'));
  check('payment amount = 1250', Number((await q(`select amount from payments`))[0].amount) === 1250);

  // ====================================================================== 3
  console.log('\n[SCENARIO 3] MULTIPLE quantities of one product (unit price x quantity)');
  await clean();
  o = await place([{ productId: LAMP.id, quantity: 3 }]);
  ref = o.payment.reference; setPayza(ref, { status: 'success' });
  await deliverWebhook(ref);
  a = toAdmin(ADMINS[1])[0];
  check('admin: 3 x K600 = K1,800', a.text.includes('3 x K600 = K1,800'));
  check('admin + customer total K1,800', a.text.includes('TOTAL PAID: K1,800 ZMW') && toCustomer()[0].text.includes('TOTAL PAID: K1,800 ZMW'));
  check('customer receipt line: 3 x K600 = K1,800', toCustomer()[0].text.includes('3 x K600 = K1,800'));

  // ====================================================================== 4 + 5
  console.log('\n[SCENARIO 4+5] browser closed AND admin offline: the webhook alone does everything');
  await clean();
  o = await place([{ productId: DRESS.id, quantity: 2 }]);
  ref = o.payment.reference; setPayza(ref, { status: 'success' });
  // No verify call from the browser, no admin session, no dashboard, no WhatsApp:
  // the ONLY thing that happens is Payza calling our webhook.
  r = await deliverWebhook(ref);
  check('webhook alone marks the payment PAID', (await q(`select status from payments`))[0].status === 'paid');
  check('webhook alone marks the order paid', (await q(`select payment_status from orders`))[0].payment_status === 'paid');
  check('customer receipt sent with no browser open', toCustomer().length === 1);
  check('both admins emailed with no admin online / dashboard open', toAdmin(ADMINS[0]).length === 1 && toAdmin(ADMINS[1]).length === 1);
  check('no admin_users session is involved (no admin rows needed)', (await q(`select count(*)::int n from admin_users`))[0].n === 0);

  // ====================================================================== 6
  console.log('\n[SCENARIO 6] DUPLICATE webhook (and verify) deliveries');
  const before = { orders: (await q(`select count(*)::int n from orders`))[0].n, mails: mail.sent.length };
  const dups = await Promise.all([deliverWebhook(ref), deliverWebhook(ref), deliverWebhook(ref), deliverWebhook(ref)]);
  await deliverWebhook(ref);
  const v = await verifyPayzaPayment(ref); await applyPaymentResult(ref, v, { source: 'verify' });
  check('all duplicate deliveries acknowledged', dups.every((x) => x.status === 200));
  check('still ONE order', (await q(`select count(*)::int n from orders`))[0].n === before.orders);
  check('still ONE payment', (await q(`select count(*)::int n from payments`))[0].n === 1);
  check('still ONE receipt', (await q(`select count(*)::int n from order_receipts`))[0].n === 1);
  check('still exactly 2 admin notification rows', (await q(`select count(*)::int n from payment_admin_notifications`))[0].n === 2);
  check('NO new emails after 6 duplicate deliveries', mail.sent.length === before.mails, `${before.mails} -> ${mail.sent.length}`);
  check('each admin still got exactly ONE email', toAdmin(ADMINS[0]).length === 1 && toAdmin(ADMINS[1]).length === 1);
  check('customer still got exactly ONE receipt', toCustomer().length === 1);
  // The database itself refuses a second row for the same payment + admin:
  let dupErr = null;
  try {
    await q(`insert into payment_admin_notifications(order_id,payment_id,recipient_email) select order_id,payment_id,recipient_email from payment_admin_notifications limit 1`);
  } catch (e) { dupErr = e; }
  check('DB UNIQUE(payment_id, recipient_email) rejects a duplicate row', dupErr && dupErr.code === '23505', String(dupErr));

  // ============================================================ crash window
  console.log('\n[CRASH WINDOW] process dies after the receipt is saved, before admins are queued');
  await clean();
  o = await place([{ productId: DRESS.id, quantity: 1 }]);
  ref = o.payment.reference; setPayza(ref, { status: 'success' });
  await deliverWebhook(ref);
  // Simulate the crash: the admins were never queued and nothing was emailed to them.
  await q(`delete from payment_admin_notifications`);
  const mailsBefore = mail.sent.length;
  mail.sent.splice(0, mail.sent.length, ...mail.sent.filter((m) => m.to === 'john@example.com'));
  mail.seenKeys.clear();
  await deliverWebhook(ref); // Payza retries the webhook
  check('retried webhook re-queues the missing admin notifications', (await q(`select count(*)::int n from payment_admin_notifications`))[0].n === 2);
  check('both admins are told after the retry', toAdmin(ADMINS[0]).length === 1 && toAdmin(ADMINS[1]).length === 1);
  check('customer is NOT sent a second receipt', toCustomer().length === 1);
  await deliverWebhook(ref); await deliverWebhook(ref);
  check('further retries send nothing more', mail.sent.length === 3, `got ${mail.sent.length}`);

  // ====================================================================== 7
  console.log('\n[SCENARIO 7] email provider temporarily FAILS');
  await clean();
  mail.failMode = 'temp';
  o = await place([{ productId: HAT.id, quantity: 2 }]);
  ref = o.payment.reference; setPayza(ref, { status: 'success' });
  r = await deliverWebhook(ref);
  check('webhook still acknowledged 200', r.status === 200);
  check('payment stays PAID although every email failed', (await q(`select status from payments`))[0].status === 'paid');
  check('order stays PAID', (await q(`select payment_status from orders`))[0].payment_status === 'paid');
  check('no email went out', mail.sent.length === 0);
  const rc = (await q(`select email_status, email_attempts, email_last_error from order_receipts`))[0];
  check('customer receipt failure RECORDED', rc.email_status === 'failed' && /503|down/i.test(rc.email_last_error || ''), JSON.stringify(rc));
  nrows = await notifRows();
  check('admin failures RECORDED for both admins', nrows.length === 2 && nrows.every((n) => n.email_status === 'failed' && n.email_attempts === 1 && n.email_last_error));
  check('receipt still readable from customer history (row exists)', (await q(`select count(*)::int n from order_receipts`))[0].n === 1);
  // not due yet: a worker run right now must not hammer the provider
  let w = await processAdminPaymentNotifications({});
  check('retry is backed off (nothing due immediately)', w.claimed === 0, JSON.stringify(w));
  // provider recovers; make the retries due, then run the worker
  mail.failMode = null;
  await q(`update payment_admin_notifications set email_next_attempt_at = now() - interval '1 minute'`);
  await q(`update order_receipts set email_next_attempt_at = now() - interval '1 minute'`);
  const wr = await processReceiptEmails({});
  w = await processAdminPaymentNotifications({});
  check('retry worker delivers the customer receipt', wr.sent === 1 && toCustomer().length === 1, JSON.stringify(wr));
  check('retry worker delivers BOTH admin notifications', w.sent === 2 && toAdmin(ADMINS[0]).length === 1 && toAdmin(ADMINS[1]).length === 1, JSON.stringify(w));
  nrows = await notifRows();
  check('rows now SENT, error cleared', nrows.every((n) => n.email_status === 'sent' && n.email_last_error === null));
  check('payment never left PAID', (await q(`select status from payments`))[0].status === 'paid');
  w = await processAdminPaymentNotifications({});
  check('running the worker again sends nothing more', w.claimed === 0 && mail.sent.length === 3, `sent=${mail.sent.length}`);

  console.log('\n[SCENARIO 7b] only ONE admin mailbox fails; the other still gets it');
  await clean();
  mail.failMode = { to: ADMINS[0], mode: 'temp' };
  o = await place([{ productId: DRESS.id, quantity: 1 }]);
  ref = o.payment.reference; setPayza(ref, { status: 'success' });
  await deliverWebhook(ref);
  nrows = await notifRows();
  const byAddr = Object.fromEntries(nrows.map((n) => [n.recipient_email, n.email_status]));
  check('failing admin recorded failed', byAddr[ADMINS[0]] === 'failed');
  check('other admin SENT regardless', byAddr[ADMINS[1]] === 'sent' && toAdmin(ADMINS[1]).length === 1);
  check('customer receipt unaffected', toCustomer().length === 1);
  mail.failMode = null;
  await q(`update payment_admin_notifications set email_next_attempt_at = now() - interval '1 minute' where email_status='failed'`);
  await processAdminPaymentNotifications({});
  check('retry reaches the failed admin only; the other is not re-sent', toAdmin(ADMINS[0]).length === 1 && toAdmin(ADMINS[1]).length === 1);

  // ====================================================================== 8
  console.log('\n[SCENARIO 8] payment FAILED / CANCELLED / PENDING / MISMATCHED / UNSIGNED: no success emails');
  const noSuccessMail = async (label, setup, deliver) => {
    await clean();
    const od = await place([{ productId: DRESS.id, quantity: 1 }]);
    const rf = od.payment.reference;
    await setup(rf);
    await deliver(rf);
    const paid = (await q(`select status from payments`))[0].status === 'paid';
    check(`${label}: NOT marked paid`, !paid);
    check(`${label}: no customer receipt`, toCustomer().length === 0);
    check(`${label}: no admin notification`, mail.sent.length === 0);
    check(`${label}: no receipt / notification rows`,
      (await q(`select count(*)::int n from order_receipts`))[0].n === 0 && (await q(`select count(*)::int n from payment_admin_notifications`))[0].n === 0);
  };
  await noSuccessMail('FAILED', (rf) => setPayza(rf, { status: 'failed' }), (rf) => deliverWebhook(rf, { event: 'payment.failed' }));
  await noSuccessMail('CANCELLED', (rf) => setPayza(rf, { status: 'cancelled' }), (rf) => deliverWebhook(rf, { event: 'payment.cancelled' }));
  await noSuccessMail('PENDING', (rf) => setPayza(rf, { status: 'pending' }), (rf) => deliverWebhook(rf, { event: 'payment.pending' }));
  await noSuccessMail('AMOUNT MISMATCH', (rf) => setPayza(rf, { status: 'success', amount: 1 }), (rf) => deliverWebhook(rf));
  await noSuccessMail('WRONG CURRENCY', (rf) => setPayza(rf, { status: 'success', currency: 'USD' }), (rf) => deliverWebhook(rf));
  await noSuccessMail('FORGED webhook (bad signature) claiming success', (rf) => setPayza(rf, { status: 'pending' }), (rf) => deliverWebhook(rf, { signature: 'deadbeef'.repeat(8) }));
  await noSuccessMail('UNKNOWN reference', () => {}, async () => { await deliverWebhook('SNPAY-DOES-NOT-EXIST'); });
  // A browser that merely SAYS "success" (the frontend) cannot trigger anything:
  await clean();
  o = await place([{ productId: DRESS.id, quantity: 1 }]);
  const resp = await handleShopRequest({ method: 'POST', headers: {}, body: { reference: o.payment.reference, status: 'success' } }, '/api/shop/orders', {}).catch(() => ({ status: 0 }));
  check('frontend claiming "success" sends nothing', mail.sent.length === 0 && (await q(`select status from payments`))[0].status !== 'paid');

  // ============================================================ phone + config
  console.log('\n[CUSTOMER DATA] phone is captured and validated');
  check('missing phone rejected', !!sanitizeCustomer({ email: 'a@b.co' }).error);
  check('letters rejected', !!sanitizeCustomer({ email: 'a@b.co', phone: 'call-me' }).error);
  check('too short rejected', !!sanitizeCustomer({ email: 'a@b.co', phone: '12345' }).error);
  check('Zambian local number accepted', !sanitizeCustomer({ email: 'a@b.co', phone: '0971234567' }).error);
  check('international format accepted', !sanitizeCustomer({ email: 'a@b.co', phone: '+260 97 123 4567' }).error);
  const stored = (await q(`select customer_phone, customer_email from orders limit 1`))[0];
  check('order row stores the real phone + email', stored.customer_phone === '+260 97 123 4567' && stored.customer_email === 'john@example.com');

  console.log('\n[CONFIG] recipients come from the server only');
  check('default recipients are the two authorized admins', JSON.stringify(paymentAdminRecipients()) === JSON.stringify(ADMINS));
  process.env.PAYMENT_ADMIN_EMAILS = 'ops@example.com, bad-address, OPS@example.com';
  check('env override works, invalid dropped, de-duplicated', JSON.stringify(paymentAdminRecipients()) === JSON.stringify(['ops@example.com']));
  delete process.env.PAYMENT_ADMIN_EMAILS;

  console.log('\n[SECURITY] retry endpoint is not public');
  const noAuth = await handleShopRequest({ method: 'POST', headers: {} }, '/api/shop/receipts/process', {});
  check('retry worker rejects anonymous callers', noAuth.status === 401 || noAuth.status === 403, String(noAuth.status));
  process.env.CRON_SECRET = 'cron-secret-x';
  const cron = await handleShopRequest({ method: 'GET', headers: { authorization: 'Bearer cron-secret-x' } }, '/api/shop/receipts/process', {});
  check('retry worker accepts the cron secret and reports admin notifications', cron.status === 200 && cron.body.adminNotifications && cron.body.adminNotifications.ok === true, JSON.stringify(cron.body).slice(0, 160));
  check('worker response exposes counts only, no addresses', !JSON.stringify(cron.body).includes('@'));

  console.log(`\n=============================\nPAYMENT NOTIFICATION RESULTS: ${passed} passed, ${failed} failed\n=============================`);
  await shim.close?.();
  pz.close(); em.close();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(1); });
