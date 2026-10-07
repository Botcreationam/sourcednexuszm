import http from 'node:http';
import { startPgShim } from '/app/conversations/6ac22147782c7e7f81d70d86/sourcednexuszm/tests/payza-payments/pg-rest-shim.mjs';
const shim = await startPgShim({ port: 4650, pg: { host: '/tmp', port: 54329, user: 'postgres', database: 'sn_test' } });
const payza = {};
http.createServer((req, res) => { let b=''; req.on('data',c=>b+=c); req.on('end',()=>{
  const ok=(d)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(d))};
  if (req.url==='/api/v1/pay'){const p=JSON.parse(b);payza[p.reference]={status:'pending',amount:p.amount};return ok({success:true,data:{reference:p.reference,payment_url:'http://localhost:4652/pay/'+p.reference}})}
  const m=req.url.match(/verify\/(.+)$/); if(m){const r=payza[m[1]]; return ok({success:true,data:{reference:m[1],status:r.status,amount:r.amount,currency:'ZMW',actual_gateway:'airtel_money',paid_at:new Date().toISOString()}})}
  const pm=req.url.match(/^\/pay\/(.+)$/); if(pm){ if(payza[pm[1]]) payza[pm[1]].status='success'; res.writeHead(302,{location:'http://localhost:4660/checkout?payza=return&ref='+pm[1]}); return res.end(); }
  res.writeHead(404); res.end(); }); }).listen(4651);
http.createServer((req,res)=>{ // fake payza hosted page on 4652 -> same handler
  const pm=req.url.match(/^\/pay\/(.+)$/); if(pm){ if(payza[pm[1]]) payza[pm[1]].status='success'; res.writeHead(302,{location:'http://localhost:4660/checkout?payza=return&ref='+pm[1]}); return res.end(); } res.writeHead(404); res.end(); }).listen(4652);
http.createServer((req,res)=>{req.on('data',()=>{});req.on('end',()=>{res.writeHead(200,{'content-type':'application/json'});res.end('{"id":"m1"}')})}).listen(4653);
console.log('stack ready');
