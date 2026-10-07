// ============================================================================
// Bundles + size verification: end-to-end server tests on a REAL Postgres.
//
//   PG_MODULE_ROOT=<folder with node_modules/pg> \
//   PG_TEST_SOCKET=/tmp PG_TEST_PORT=54329 PG_TEST_DB=sn_test \
//   node tests/payza-payments/test-bundles-sizes.mjs
//
// The REAL production code runs (sanitize -> price -> create order -> Payza
// verify -> mark paid -> receipt -> email) against a throwaway database that
// has the REAL migrations' tables, constraints and foreign keys.
// Payza and the email provider are faked over local HTTP. No real money.
// ============================================================================
import http from 'node:http';
import { startPgShim } from './pg-rest-shim.mjs';
import {
  sanitizeCheckoutItems, createPendingOrder, applyPaymentResult, verifyPayzaPayment, quoteCartLines,
} from '../../lib/payza-shared.mjs';
import { buildReceiptEmail } from '../../lib/order-receipts.mjs';
import { handleShopRequest } from '../../lib/shop-api.mjs';
import { requiresSizeVerification, validateSizeSelection } from '../../lib/size-policy.mjs';

const PG = {
  host: process.env.PG_TEST_SOCKET || '/tmp',
  port: Number(process.env.PG_TEST_PORT || 54329),
  user: 'postgres',
  database: process.env.PG_TEST_DB || 'sn_test',
};

let passed = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  PASS  ${name}`); } else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
};

// ------------------------------------------------------------ fake Payza/email
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
const mail = { sent: [] };
const em = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const p = JSON.parse(body);
    mail.sent.push({ to: p.to, subject: p.subject, html: p.html, text: p.text });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: `msg-${mail.sent.length}` }));
  });
});

const BASE = 'https://shop.example';
const customer = { email: 'john@example.com', firstName: 'John', lastName: 'Banda' };

async function main() {
  const shim = await startPgShim({ port: 4630, pg: PG });
  const q = (sql, args) => shim.client.query(sql, args).then((r) => r.rows);
  await Promise.all([new Promise((r) => pz.listen(4632, r)), new Promise((r) => em.listen(4633, r))]);
  Object.assign(process.env, {
    VITE_SUPABASE_URL: 'http://localhost:4630', VITE_SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc',
    PAYZA_PUBLIC_KEY: 'pk_test_x', PAYZA_SECRET_KEY: 'sk_test_x', PAYZA_WEBHOOK_SECRET: 'whsec',
    PAYZA_API_BASE_URL: 'http://localhost:4632/api/v1',
    EMAIL_API_KEY: 'k', EMAIL_FROM_ADDRESS: 'orders@sourcednexus.online', EMAIL_API_URL: 'http://localhost:4633/send', EMAIL_PROVIDER: 'resend',
    SITE_BASE_URL: 'https://sourcednexus.online',
  });

  // ---------------------------------------------------------------- seed
  await q(`truncate public.order_item_components, public.order_receipts, public.payments, public.order_items, public.orders, public.bundle_items, public.bundles, public.products, public.user_profiles cascade`);
  await q(`truncate auth.users cascade`);
  const [user] = await q(`insert into auth.users(email) values ('john@example.com') returning id`);
  const [other] = await q(`insert into auth.users(email) values ('mary@example.com') returning id`);
  await q(`insert into public.user_profiles(id, cart) values ($1,'[]'),($2,'[]')`, [user.id, other.id]);
  const USER = { id: user.id, email: 'john@example.com' };

  const prod = async (name, category, price, extra = {}) => (await q(
    `insert into public.products(name, category, price, sizes, status, grades, sizing_standard)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [name, category, price, extra.sizes || [], extra.status || 'available', JSON.stringify(extra.grades || []), extra.sizing_standard || null],
  ))[0];
  const SUIT = await prod('Black Three-Piece Suit', 'Suits', 'K2,000', { sizes: ['38R', '40R', '42R'] });
  const SHIRT = await prod('White Dress Shirt', 'General Clothing', 'K300', { sizes: ['S', 'M', 'L'], sizing_standard: 'Global / International' });
  const SHOES = await prod('Brogue Oxford Shoes', 'Shoes', 'K500', { sizes: ['41', '42', '43'] });
  const LAMP = await prod('Desk Lamp', 'Home Appliances and Gadgets', 'K250');
  const SOLD = await prod('Sold Out Tie', 'Accessories', 'K100', { status: 'soldout' });
  const GRADED = await prod('Graded Coat', 'Coats', 'K900', {
    sizes: ['M', 'L'],
    grades: [{ name: 'First Grade', price: 'K1,200', stock_status: 'In Stock' }, { name: 'Second Grade', price: 'K800', stock_status: 'Out of Stock' }],
  });

  const mkBundle = async (name, price, comps, active = true) => {
    const [b] = await q(`insert into public.bundles(name, bundle_price, is_active, images) values ($1,$2,$3,'{https://img.example/b.jpg}') returning *`, [name, price, active]);
    let i = 0;
    for (const c of comps) {
      await q(`insert into public.bundle_items(bundle_id, product_id, quantity, grade_name, sort_order) values ($1,$2,$3,$4,$5)`, [b.id, c.p.id, c.qty || 1, c.grade || null, i++]);
    }
    return b;
  };
  // separate = 2000 + 300*2 + 500 + 250 = 3350 ; bundle price 2,900 ; saving 450
  const GENT = await mkBundle('Gentleman Starter Bundle', 2900, [{ p: SUIT }, { p: SHIRT, qty: 2 }, { p: SHOES }, { p: LAMP }]);
  const BAD = await mkBundle('Bundle With Sold Out Part', 500, [{ p: LAMP }, { p: SOLD }]);
  const OFF = await mkBundle('Inactive Bundle', 100, [{ p: LAMP }], false);
  const GRD = await mkBundle('Graded Bundle', 2000, [{ p: GRADED, grade: 'Second Grade' }]);

  const gentSel = (over = {}) => [
    { productId: SUIT.id, size: '40R', sizeVerified: true },
    { productId: SHIRT.id, size: 'M', sizeVerified: true },
    { productId: SHOES.id, size: '42', sizeVerified: true },
    { productId: LAMP.id },
  ].map((s) => ({ ...s, ...(over[s.productId] || {}) }));

  const place = async (items) => {
    const s = sanitizeCheckoutItems(items);
    if (s.error) return { error: s.error };
    return createPendingOrder({ user: USER, lines: s.lines, customer, baseUrl: BASE });
  };
  const pay = async (reference) => {
    payza.payments[reference].status = 'success';
    const v = await verifyPayzaPayment(reference);
    return applyPaymentResult(reference, v, { source: 'test' });
  };
  const counts = async () => (await q(`select (select count(*)::int from orders) o, (select count(*)::int from order_items) i, (select count(*)::int from order_item_components) c, (select count(*)::int from payments) p`))[0];
  const clean = async () => q(`truncate public.order_item_components, public.order_receipts, public.payments, public.order_items, public.orders cascade`);

  // ================================================================ 1
  console.log('\n[1] Size policy: which real products need verification');
  check('Suit with sizes requires verification', requiresSizeVerification(SUIT));
  check('Dress shirt (General Clothing) requires verification', requiresSizeVerification(SHIRT));
  check('Shoes do NOT require clothing verification', !requiresSizeVerification(SHOES));
  check('Lamp does NOT', !requiresSizeVerification(LAMP));
  check('Clothing with no sizes does not', !requiresSizeVerification({ category: 'Suits', sizes: [] }));
  check('Explicit admin override ON works for shoes', requiresSizeVerification({ ...SHOES, requires_size_verification: true }));

  // ================================================================ 2
  console.log('\n[2] Product line: size verification is enforced SERVER-SIDE');
  await clean();
  let r = await place([{ productId: SUIT.id, quantity: 1, size: '40R' }]);
  check('suit without verification is rejected', !!r.error && /verified your size/i.test(r.error), r.error);
  r = await place([{ productId: SUIT.id, quantity: 1 }]);
  check('suit without any size is rejected', !!r.error && /select a size/i.test(r.error), r.error);
  r = await place([{ productId: SUIT.id, quantity: 1, size: '99X', sizeVerified: true }]);
  check('a size the product does not offer is rejected (never substituted)', !!r.error && /not available/i.test(r.error), r.error);
  let c = await counts();
  check('rejected attempts created NO order/payment rows', c.o === 0 && c.p === 0, JSON.stringify(c));
  r = await place([{ productId: SUIT.id, quantity: 1, size: '40R', sizeVerified: true }]);
  check('suit with size + verification is accepted', !r.error, r.error);
  check('total = K2,000', r.order?.subtotal === 2000, r.order?.subtotal);
  let [oi] = await q(`select * from order_items`);
  check('order_items.selected_size is EXACTLY "40R"', oi.selected_size === '40R', oi.selected_size);
  check('order_items.sizing_standard = Global / International', oi.sizing_standard === 'Global / International', oi.sizing_standard);
  check('order_items.size_verified = true', oi.size_verified === true);
  check('size_verified_at is set', !!oi.size_verified_at);

  console.log('\n[3] Non-clothing products are unaffected');
  await clean();
  r = await place([{ productId: LAMP.id, quantity: 2 }, { productId: SHOES.id, quantity: 1, size: '42' }]);
  check('lamp + shoes need no verification', !r.error, r.error);
  check('total = 2*250 + 500 = K1,000', r.order?.subtotal === 1000, r.order?.subtotal);
  [oi] = await q(`select * from order_items where product_name='Desk Lamp'`);
  check('lamp row has no size record', oi.sizing_standard === null && oi.size_verified === false);

  // ================================================================ 4
  console.log('\n[4] BUNDLE: server-side price, never the browser\'s');
  await clean();
  const quote = await quoteCartLines(sanitizeCheckoutItems([{ bundleId: GENT.id, quantity: 2, price: 1, unitPrice: 1, total: 1 }]).lines);
  check('quote unit price = K2,900 (browser price ignored)', quote.lines[0].unitPrice === 2900, quote.lines[0].unitPrice);
  check('quote line total for qty 2 = K5,800', quote.lines[0].lineTotal === 5800);
  check('quote reports savings K450 per bundle', quote.lines[0].savings === 450, quote.lines[0].savings);
  check('quote lists 4 components', quote.lines[0].components.length === 4);

  r = await place([{ bundleId: GENT.id, quantity: 2, componentSelections: gentSel(), price: 1, total: 1 }]);
  check('bundle order accepted', !r.error, r.error);
  check('order total = 2 x K2,900 = K5,800', r.order?.subtotal === 5800, r.order?.subtotal);
  check('payment amount sent to Payza = 5800', payza.reqs.at(-1).amount === 5800, payza.reqs.at(-1)?.amount);
  [oi] = await q(`select * from order_items`);
  check('single bundle order_item row', (await counts()).i === 1);
  check('is_bundle = true, bundle_name stored', oi.is_bundle === true && oi.bundle_name === 'Gentleman Starter Bundle');
  check('bundle_id references the bundle', oi.bundle_id === GENT.id);
  check('product_id is null (no duplicate product record)', oi.product_id === null);
  check('bundle_separate_total = 3350 and savings = 450', Number(oi.bundle_separate_total) === 3350 && Number(oi.bundle_savings) === 450, `${oi.bundle_separate_total}/${oi.bundle_savings}`);
  const comps = await q(`select * from order_item_components where order_item_id=$1 order by product_name`, [oi.id]);
  check('4 component rows frozen', comps.length === 4, comps.length);
  const cSuit = comps.find((x) => x.product_id === SUIT.id);
  check('suit component: size 40R, Global / International, verified', cSuit.selected_size === '40R' && cSuit.sizing_standard === 'Global / International' && cSuit.size_verified === true);
  check('shirt component quantity 2 (bundle composition)', comps.find((x) => x.product_id === SHIRT.id).quantity === 2);
  const cShoes = comps.find((x) => x.product_id === SHOES.id);
  check('shoe component: size 42 kept exactly', cShoes.selected_size === '42');
  check('components reference EXISTING product ids', comps.every((x) => [SUIT.id, SHIRT.id, SHOES.id, LAMP.id].includes(x.product_id)));
  check('products table still has exactly 6 rows (nothing duplicated)', (await q(`select count(*)::int n from products`))[0].n === 6);

  console.log('\n[5] BUNDLE availability = inventory rule');
  await clean();
  r = await place([{ bundleId: BAD.id, quantity: 1, componentSelections: [] }]);
  check('bundle with a sold-out component is NOT purchasable', !!r.error && /Sold Out Tie/.test(r.error) && /sold out/i.test(r.error), r.error);
  r = await place([{ bundleId: OFF.id, quantity: 1, componentSelections: [] }]);
  check('inactive bundle is NOT purchasable', !!r.error && /no longer available/i.test(r.error), r.error);
  r = await place([{ bundleId: GRD.id, quantity: 1, componentSelections: [{ productId: GRADED.id, gradeName: 'Second Grade', size: 'M', sizeVerified: true }] }]);
  check('bundle needing an out-of-stock GRADE is NOT purchasable', !!r.error && /sold out/i.test(r.error), r.error);
  c = await counts();
  check('blocked bundles created no order rows', c.o === 0 && c.i === 0 && c.p === 0, JSON.stringify(c));
  const qb = await quoteCartLines(sanitizeCheckoutItems([{ bundleId: BAD.id, quantity: 1 }]).lines);
  check('quote marks unavailable bundle as not payable with a reason', qb.lines[0].payable === false && /sold out/i.test(qb.lines[0].message || ''), JSON.stringify(qb.lines[0]));
  check('unavailable bundle adds nothing to the quote total', qb.total === 0);

  console.log('\n[6] Becoming unavailable AFTER being added to cart');
  await q(`update products set status='soldout' where id=$1`, [LAMP.id]);
  r = await place([{ bundleId: GENT.id, quantity: 1, componentSelections: gentSel() }]);
  check('Gentleman bundle blocked once its lamp sells out', !!r.error && /Desk Lamp/.test(r.error), r.error);
  await q(`update products set status='available' where id=$1`, [LAMP.id]);
  r = await place([{ bundleId: GENT.id, quantity: 1, componentSelections: gentSel() }]);
  check('purchasable again when the lamp is back', !r.error, r.error);

  console.log('\n[7] BUNDLE size verification (garments inside the bundle)');
  await clean();
  r = await place([{ bundleId: GENT.id, quantity: 1, componentSelections: gentSel({ [SUIT.id]: { sizeVerified: false } }) }]);
  check('unverified suit inside a bundle is rejected', !!r.error && /verified your size/i.test(r.error), r.error);
  r = await place([{ bundleId: GENT.id, quantity: 1, componentSelections: gentSel({ [SHIRT.id]: { size: undefined } }) }]);
  check('missing size for a shirt inside a bundle is rejected', !!r.error && /select a size/i.test(r.error), r.error);
  r = await place([{ bundleId: GENT.id, quantity: 1, componentSelections: gentSel({ [SUIT.id]: { size: '50' } }) }]);
  check('a size the suit does not offer is rejected', !!r.error && /not available/i.test(r.error), r.error);
  check('still no rows written', (await counts()).o === 0);

  // ================================================================ 8
  console.log('\n[8] Mixed cart: normal product + bundle + verified garment');
  await clean();
  const mixed = [
    { productId: LAMP.id, quantity: 3 },
    { productId: SUIT.id, quantity: 1, size: '42R', sizeVerified: true },
    { bundleId: GENT.id, quantity: 1, componentSelections: gentSel() },
  ];
  r = await place(mixed);
  check('mixed order accepted', !r.error, r.error);
  check('total = 750 + 2000 + 2900 = K5,650', r.order?.subtotal === 5650, r.order?.subtotal);
  check('3 order_items rows', (await counts()).i === 3);
  const payRef = r.payment.reference;

  console.log('\n[9] Retry reuses the pending order (no duplicates, no orphan components)');
  r = await place(mixed);
  const c2 = await counts();
  check('still ONE order after retry', c2.o === 1, c2.o);
  check('still 3 items and 4 components (old ones replaced)', c2.i === 3 && c2.c === 4, JSON.stringify(c2));
  check('older payment attempt superseded', (await q(`select count(*)::int n from payments where status='cancelled'`))[0].n === 1);

  // ================================================================ 10
  console.log('\n[10] Payment -> paid order -> receipt -> email');
  const ref2 = r.payment.reference;
  const paid = await pay(ref2);
  check('payment applied', !paid.error, JSON.stringify(paid));
  const [ord] = await q(`select * from orders`);
  check('order payment_status = paid', ord.payment_status === 'paid', ord.payment_status);
  const [rc] = await q(`select * from order_receipts`);
  check('exactly one receipt created', !!rc);
  check('receipt total = K5,650', Number(rc.total) === 5650, rc.total);
  const bItem = rc.items.find((i) => i.is_bundle);
  check('receipt shows bundle NAME', bItem?.name === 'Gentleman Starter Bundle', bItem?.name);
  check('receipt lists all 4 included products', bItem?.components?.length === 4);
  check('receipt bundle component has size + standard + verified', bItem.components.some((x) => x.name === 'Black Three-Piece Suit' && x.size === '40R' && x.sizing_standard === 'Global / International' && x.size_verified === true));
  check('receipt records bundle saving K450', bItem.bundle_savings === 450);
  const sItem = rc.items.find((i) => i.name === 'Black Three-Piece Suit');
  check('receipt product line stores Size 42R + standard + Confirmed', sItem.size === '42R' && sItem.sizing_standard === 'Global / International' && sItem.size_verified === true);
  check('receipt items sum equals total paid', Math.round(rc.items.reduce((s, i) => s + i.line_total, 0) * 100) / 100 === 5650);
  check('email sent to customer', mail.sent.length === 1 && mail.sent[0].to === 'john@example.com' || (mail.sent[0]?.to || []).includes?.('john@example.com'), JSON.stringify(mail.sent[0]?.to));
  const html = mail.sent[0].html, text = mail.sent[0].text;
  check('email HTML names the bundle', html.includes('Gentleman Starter Bundle'));
  check('email HTML lists bundle contents', html.includes('Bundle includes') && html.includes('White Dress Shirt') && html.includes('Desk Lamp'));
  check('email HTML shows size, standard, verification', html.includes('Size: 42R') && html.includes('Sizing standard: Global / International') && html.includes('Size verification: Confirmed'));
  check('email text names bundle + contents', text.includes('[BUNDLE] Gentleman Starter Bundle') && text.includes('Bundle includes:') && text.includes('2 x White Dress Shirt'));
  check('email text shows size verification', text.includes('Size: 42R') && text.includes('Size verification: Confirmed'));

  console.log('\n[11] Idempotency: duplicate webhook/verify must not duplicate anything');
  await pay(ref2);
  check('still one receipt', (await q(`select count(*)::int n from order_receipts`))[0].n === 1);
  const adminAddrs = ['frankmwalu04@gmail.com', 'sourcednexus@gmail.com'];
  check('still one customer email', mail.sent.filter((m) => !adminAddrs.includes([].concat(m.to)[0])).length === 1, mail.sent.length);
  check('duplicate delivery added no admin email beyond one per admin', mail.sent.filter((m) => adminAddrs.includes([].concat(m.to)[0])).length <= 2, mail.sent.length);

  console.log('\n[12] Snapshots are permanent: editing/deleting the bundle & products later');
  await q(`update bundles set name='RENAMED', bundle_price=1 where id=$1`, [GENT.id]);
  await q(`update products set name='Renamed Suit', price='K1' where id=$1`, [SUIT.id]);
  await q(`delete from bundles where id=$1`, [GENT.id]);
  await q(`delete from products where id=$1`, [SHIRT.id]);
  const [oi2] = await q(`select * from order_items where is_bundle`);
  check('order still says "Gentleman Starter Bundle"', oi2.bundle_name === 'Gentleman Starter Bundle');
  check('order price unchanged (K2,900 x1)', Number(oi2.unit_price) === 2900);
  check('bundle_id nulled but order row survives', oi2.bundle_id === null);
  const comps2 = await q(`select * from order_item_components where order_item_id=$1`, [oi2.id]);
  check('all 4 component rows survive (names frozen)', comps2.length === 4 && comps2.some((x) => x.product_name === 'White Dress Shirt'));
  check('deleted product -> component product_id nulled, name kept', comps2.find((x) => x.product_name === 'White Dress Shirt').product_id === null);
  check('receipt JSON unaffected', (await q(`select items from order_receipts`))[0].items.some((i) => i.name === 'Gentleman Starter Bundle'));

  // ================================================================ 13
  console.log('\n[13] Managing bundles never touches the underlying products');
  const before = JSON.stringify(await q(`select id,name,price,status,sizes from products order by id`));
  const B2 = await mkBundle('Temp Bundle', 100, [{ p: LAMP }]);
  await q(`update bundles set is_active=false where id=$1`, [B2.id]);
  await q(`update bundles set is_active=true, bundle_price=120 where id=$1`, [B2.id]);
  await q(`delete from bundle_items where bundle_id=$1`, [B2.id]);
  await q(`delete from bundles where id=$1`, [B2.id]);
  check('products table byte-identical after create/edit/deactivate/reactivate/delete', before === JSON.stringify(await q(`select id,name,price,status,sizes from products order by id`)));
  let bad;
  try { await q(`insert into bundles(name,bundle_price) values ('x', 0)`); bad = false; } catch { bad = true; }
  check('DB rejects a bundle priced at 0', bad);
  try { await q(`insert into bundle_items(bundle_id, product_id, quantity) values ($1,$2,0)`, [OFF.id, LAMP.id]); bad = false; } catch { bad = true; }
  check('DB rejects bundle item quantity 0', bad);

  // ================================================================ 14
  console.log('\n[14] Customer order list API exposes the new data to the owner only');
  const shop = (method, path, { token, body, query } = {}) =>
    handleShopRequest({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, body }, path, query || {});
  const mine = await shop('GET', '/api/shop/receipt', { token: `tok-${user.id}`, query: { order: ord.order_number } });
  check('owner can fetch receipt', mine.status === 200 && mine.body?.receipt?.items?.some((i) => i.is_bundle), JSON.stringify(mine.body).slice(0, 120));
  const theirs = await shop('GET', '/api/shop/receipt', { token: `tok-${other.id}`, query: { order: ord.order_number } });
  check('another user gets 404', theirs.status === 404, theirs.status);
  const html2 = buildReceiptEmail(rc).html;
  check('buildReceiptEmail pure function renders bundle', html2.includes('Gentleman Starter Bundle'));

  console.log('\n[15] Backwards compatibility: legacy-shaped order (no new columns used)');
  await clean();
  r = await place([{ productId: LAMP.id, quantity: 1 }]);
  const legacy = await q(`select * from order_items`);
  check('plain product order unchanged: not a bundle, no size record', legacy[0].is_bundle === false && legacy[0].sizing_standard === null);
  await pay(r.payment.reference);
  const legacyReceipt = (await q(`select items from order_receipts`))[0].items[0];
  check('legacy receipt item has no bundle/size keys', !('is_bundle' in legacyReceipt) && !('sizing_standard' in legacyReceipt), JSON.stringify(legacyReceipt));

  await shim.close();
  pz.close(); em.close();
  console.log(`\n=============================\nBUNDLES+SIZES RESULTS: ${passed} passed, ${failed} failed\n=============================`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
