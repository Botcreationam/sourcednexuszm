import { createRequire } from 'node:module';
const { Client } = createRequire('/app/conversations/6ac22147782c7e7f81d70d86/pgtest/')('pg');
const c = new Client({ host: '/tmp', port: 54329, user: 'postgres', database: 'sn_test' });
await c.connect();
await c.query(`truncate public.order_item_components, public.order_receipts, public.payments, public.order_items, public.orders, public.bundle_items, public.bundles, public.products, public.user_profiles, public.admin_users cascade`);
await c.query(`truncate auth.users cascade`);
const u = (await c.query(`insert into auth.users(id,email) values ('11111111-1111-4111-8111-111111111111','john@example.com') returning id`)).rows[0];
await c.query(`insert into public.user_profiles(id, cart) values ($1,'[]')`, [u.id]);
const P = async (name, cat, price, o = {}) => (await c.query(
  `insert into public.products(name,category,price,sizes,status,images,grades,sizing_standard) values ($1,$2,$3,$4,$5,$6,'[]',$7) returning id`,
  [name, cat, price, o.sizes || [], o.status || 'available', ['https://placehold.co/600x800/222/C5A059?text=' + encodeURIComponent(name)], o.std || null])).rows[0].id;
const suit = await P('Black Three-Piece Suit', 'Suits', 'K2,000', { sizes: ['38R','40R','42R'] });
const shirt = await P('White Dress Shirt', 'General Clothing', 'K300', { sizes: ['S','M','L'] });
const shoes = await P('Brogue Oxford Shoes', 'Shoes', 'K500', { sizes: ['41','42','43'] });
const lamp = await P('Desk Lamp', 'Home Appliances and Gadgets', 'K250');
const tie = await P('Sold Out Tie', 'Accessories', 'K100', { status: 'soldout' });
const mk = async (name, price, comps, active = true) => {
  const b = (await c.query(`insert into public.bundles(name,description,bundle_price,is_active,images) values ($1,$2,$3,$4,$5) returning id`, [name, 'A curated set for the modern gentleman.', price, active, ['https://placehold.co/800x600/222/C5A059?text=' + encodeURIComponent(name)]])).rows[0].id;
  let i = 0; for (const [pid, q] of comps) await c.query(`insert into public.bundle_items(bundle_id,product_id,quantity,sort_order) values ($1,$2,$3,$4)`, [b, pid, q, i++]);
  return b;
};
const gent = await mk('Gentleman Starter Bundle', 2900, [[suit,1],[shirt,2],[shoes,1],[lamp,1]]);
const bad = await mk('Bundle With Sold Out Part', 500, [[lamp,1],[tie,1]]);
console.log(JSON.stringify({ user: u.id, suit, shirt, shoes, lamp, gent, bad }));
await c.end();
