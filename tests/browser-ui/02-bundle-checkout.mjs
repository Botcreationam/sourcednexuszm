import { createRequire } from 'node:module';
import fs from 'node:fs';
const puppeteer = createRequire('/tmp/univo-headless/')('puppeteer');
const ids = JSON.parse(fs.readFileSync('/tmp/uitest/ids.json','utf8'));
const B='http://localhost:4660', sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage(); await page.setViewport({ width: 1100, height: 1000 });
let pass=0, fail=0; const ok=(c,n)=>{ c?pass++:fail++; console.log((c?'PASS ':'FAIL ')+n); };
const txt=()=>page.evaluate(()=>document.body.innerText);
const session = { access_token:'tok-'+ids.user, refresh_token:'r', token_type:'bearer', expires_in:99999, expires_at:Math.floor(Date.now()/1000)+99999,
  user:{ id:ids.user, email:'john@example.com', aud:'authenticated', role:'authenticated', app_metadata:{}, user_metadata:{full_name:'John Banda'} } };
await page.evaluateOnNewDocument((s)=>{ localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)); localStorage.setItem('sn_onboarding_dismissed','true'); }, session);

await page.goto(B+'/bundles/'+ids.gent,{waitUntil:'networkidle0'}); await sleep(2500); // let sign-in cart sync finish first, like a real customer
// choose sizes: click size buttons inside the suit and shirt rows
const pick = async (productName, size) => page.evaluate((pn, sz)=>{
  const li=[...document.querySelectorAll('[data-testid="bundle-components"] li')].find(l=>l.innerText.includes(pn));
  const b=[...li.querySelectorAll('button')].find(x=>x.innerText.trim()===sz); b.click(); return !!b; }, productName, size);
ok(await pick('Black Three-Piece Suit','40R'),'picked suit size 40R');
ok(await pick('White Dress Shirt','M'),'picked shirt size M');
await page.evaluate(()=>document.querySelector('[data-testid="add-bundle"]').scrollIntoView({block:'center'})); await sleep(300); await page.click('[data-testid="add-bundle"]'); await sleep(900);
let t=await txt(); ok(/Bundle added to cart|Gentleman Starter Bundle/i.test(t),'bundle added to cart');
const cart = await page.evaluate(()=>localStorage.getItem('sn_cart_v2'));
ok(!!cart && cart.includes('"isBundle":true'),'cart stores a bundle line');

await page.goto(B+'/checkout',{waitUntil:'networkidle0'}); await sleep(1500);
t=await txt();
await page.screenshot({path:'/tmp/uitest/s3-checkout.png', fullPage:true});
ok(t.includes('Gentleman Starter Bundle'),'checkout lists the bundle');
ok(/40R/.test(t) && /\bM\b/.test(t),'checkout shows the chosen sizes inside the bundle');
ok(/K2,?900/.test(t),'checkout total shows K2,900 (bundle price)');
const hasBox = await page.$('[data-testid="size-confirm-checkbox"]'); ok(!!hasBox,'mandatory size checkbox is shown');
const payBtn = async()=>page.evaluate(()=>{ const b=[...document.querySelectorAll('button')].find(x=>/pay/i.test(x.innerText)&&!/payment method/i.test(x.innerText)); return b?{text:b.innerText.trim(),disabled:b.disabled}:null; });
let pb=await payBtn(); console.log('   pay button:',JSON.stringify(pb));
ok(pb && pb.disabled===true,'Pay button is LOCKED before ticking the checkbox');
await page.click('[data-testid="size-confirm-checkbox"]'); await sleep(400);
pb=await payBtn(); console.log('   pay button:',JSON.stringify(pb));
ok(pb && pb.disabled===false,'Pay button UNLOCKS after ticking the checkbox');
await page.click('[data-testid="size-confirm-checkbox"]'); await sleep(300);
pb=await payBtn(); ok(pb && pb.disabled===true,'Pay button locks again if unticked');
console.log(`RESULT ${pass} passed ${fail} failed`);
await browser.close();
