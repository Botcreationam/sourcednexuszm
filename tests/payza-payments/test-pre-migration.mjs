// ============================================================================
// PRE-MIGRATION SAFETY: the new code must keep ordinary checkout working on a
// database that does NOT have migration 20261008000000 yet (no bundles tables,
// no size-snapshot columns). Needs a database named sn_old with the OLD schema.
//   PG_MODULE_ROOT=<dir with node_modules/pg> node tests/payza-payments/test-pre-migration.mjs
// ============================================================================
import http from 'node:http';
import { startPgShim } from './pg-rest-shim.mjs';
import { sanitizeCheckoutItems, createPendingOrder, applyPaymentResult, verifyPayzaPayment, quoteCartLines } from '../../lib/payza-shared.mjs';
const payza = { p: {} };
const pz = http.createServer((req,res)=>{ let b=''; req.on('data',c=>b+=c); req.on('end',()=>{ const ok=(d)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(d))};
 if(req.url==='/api/v1/pay'){const p=JSON.parse(b);payza.p[p.reference]={status:'pending',amount:p.amount};return ok({success:true,data:{reference:p.reference,payment_url:'https://x/'+p.reference}})}
 const m=req.url.match(/verify\/(.+)$/); const r=payza.p[m[1]]; ok({success:true,data:{reference:m[1],status:r.status,amount:r.amount,currency:'ZMW',actual_gateway:'airtel_money',paid_at:new Date().toISOString()}}) })}).listen(4642);
const em = http.createServer((req,res)=>{req.on('data',()=>{});req.on('end',()=>{res.writeHead(200,{'content-type':'application/json'});res.end('{"id":"m1"}')})}).listen(4643);
const shim = await startPgShim({ port: 4640, pg: { host:'/tmp', port:54329, user:'postgres', database:'sn_old' } });
Object.assign(process.env,{VITE_SUPABASE_URL:'http://localhost:4640',VITE_SUPABASE_ANON_KEY:'a',SUPABASE_SERVICE_ROLE_KEY:'s',PAYZA_PUBLIC_KEY:'pk',PAYZA_SECRET_KEY:'sk',PAYZA_WEBHOOK_SECRET:'w',PAYZA_API_BASE_URL:'http://localhost:4642/api/v1',EMAIL_API_KEY:'k',EMAIL_FROM_ADDRESS:'o@x.com',EMAIL_API_URL:'http://localhost:4643/send',EMAIL_PROVIDER:'resend',SITE_BASE_URL:'https://x.online'});
const q=(s,a)=>shim.client.query(s,a).then(r=>r.rows);
await q(`truncate public.order_receipts, public.payments, public.order_items, public.orders, public.user_profiles, public.products cascade`); await q('truncate auth.users cascade');
const [u]=await q(`insert into auth.users(email) values ('a@b.com') returning id`); await q(`insert into user_profiles(id) values ($1)`,[u.id]);
const [lamp]=await q(`insert into products(name,category,price,status) values ('Lamp','Home','K250','available') returning id`);
const [dress]=await q(`insert into products(name,category,price,status,sizes) values ('Dress','Dresses','K400','available','{M,L}') returning id`);
let ok=0,bad=0; const chk=(n,c,x='')=>{c?ok++:bad++;console.log((c?'  PASS  ':'  FAIL  ')+n,c?'':x)};
const place=async(items)=>{const s=sanitizeCheckoutItems(items); return createPendingOrder({user:{id:u.id,email:'a@b.com'},lines:s.lines,customer:{email:'a@b.com',firstName:'A',lastName:'B'},baseUrl:'https://x.online'})};
let r = await place([{productId:lamp.id,quantity:2},{productId:dress.id,quantity:1,size:'M',sizeVerified:true}]);
chk('OLD schema: multi-item checkout still works', !r.error, r.error);
chk('OLD schema: total = 2*250 + 400 = 900', r.order?.subtotal===900, r.order?.subtotal);
const qt = await quoteCartLines(sanitizeCheckoutItems([{productId:lamp.id,quantity:1}]).lines);
chk('OLD schema: quote works', qt.total===250, JSON.stringify(qt));
payza.p[r.payment.reference].status='success';
const v=await verifyPayzaPayment(r.payment.reference); const a=await applyPaymentResult(r.payment.reference,v,{source:'t'});
chk('OLD schema: payment applied + receipt issued', !a.error && (await q('select count(*)::int n from order_receipts'))[0].n===1, JSON.stringify(a));
r = await place([{bundleId:'11111111-1111-4111-8111-111111111111',quantity:1,componentSelections:[]}]);
chk('OLD schema: a bundle is refused cleanly (no crash, no order)', !!r.error && (await q('select count(*)::int n from orders'))[0].n===1, r.error);
console.log(`OLD-SCHEMA RESULTS: ${ok} passed, ${bad} failed`);
await shim.close(); pz.close(); em.close(); process.exit(bad?1:0);
