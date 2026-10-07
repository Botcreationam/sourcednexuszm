import { createRequire } from 'node:module';
import fs from 'node:fs';
const puppeteer = createRequire('/tmp/univo-headless/')('puppeteer');
const ids = JSON.parse(fs.readFileSync('/tmp/uitest/ids.json','utf8'));
const B='http://localhost:4660', sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage(); await page.setViewport({ width: 1100, height: 1000 });
let pass=0, fail=0; const ok=(c,n)=>{ c?pass++:fail++; console.log((c?'PASS ':'FAIL ')+n); };
const txt=()=>page.evaluate(()=>document.body.innerText);
const session = { access_token:'tok-'+ids.user, refresh_token:'r', token_type:'bearer', expires_in:99999, expires_at:Math.floor(Date.now()/1000)+99999, user:{ id:ids.user, email:'john@example.com', aud:'authenticated', role:'authenticated', app_metadata:{}, user_metadata:{full_name:'John Banda'} } };
await page.evaluateOnNewDocument((s)=>{ localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)); localStorage.setItem('sn_onboarding_dismissed','true'); }, session);

// --- A: sold-out-part bundle cannot be bought
await page.goto(B+'/bundles/'+ids.bad,{waitUntil:'networkidle0'}); await sleep(1500);
let t=await txt();
const btn = await page.evaluate(()=>{const b=document.querySelector('[data-testid="add-bundle"]'); return b?{disabled:b.disabled,text:b.innerText}:null;});
ok(/unavailable/i.test(t),'sold-out-part bundle page says unavailable');
ok(!btn || btn.disabled,'sold-out-part bundle: Add button missing or disabled ('+JSON.stringify(btn)+')');

// --- B: buy the good bundle
await page.goto(B+'/bundles/'+ids.gent,{waitUntil:'networkidle0'}); await sleep(2500);
await page.evaluate(()=>{ for (const pn of [['Black Three-Piece Suit','40R'],['White Dress Shirt','M']]) { const li=[...document.querySelectorAll('[data-testid="bundle-components"] li')].find(l=>l.innerText.includes(pn[0])); [...li.querySelectorAll('button')].find(x=>x.innerText.trim()===pn[1]).click(); } });
await page.evaluate(()=>document.querySelector('[data-testid="add-bundle"]').scrollIntoView({block:'center'})); await sleep(300);
await page.click('[data-testid="add-bundle"]'); await sleep(900);
await page.goto(B+'/checkout',{waitUntil:'networkidle0'}); await sleep(1500);
await page.evaluate(()=>document.querySelector('[data-testid="size-confirm-checkbox"]').scrollIntoView({block:'center'}));
await page.click('[data-testid="size-confirm-checkbox"]'); await sleep(300);
await page.evaluate(()=>{ const b=[...document.querySelectorAll('button')].find(x=>/pay k/i.test(x.innerText)); b.scrollIntoView({block:'center'}); });
await page.evaluate(()=>[...document.querySelectorAll('button')].find(x=>/pay k/i.test(x.innerText)).click());
await sleep(4000);
console.log('   url after pay:', page.url());
t=await txt();
ok(page.url().includes('/checkout') && /payment|received|thank|success|confirmed/i.test(t),'returned to success state after (fake) Payza');
const tt=t.replace(/\s+/g,' '); ok(/Order #\s*SN-/i.test(tt) && /Amount paid K2,900/i.test(tt),'success page shows order number and amount paid K2,900');
ok(/SEND PRODUCT DETAILS ON WHATSAPP/i.test(t),'success page offers the WhatsApp product-tracking button');
await page.screenshot({path:'/tmp/uitest/s6-success.png', fullPage:true});
console.log('   success text:', t.replace(/\s+/g,' ').slice(t.search(/payment|success/i), t.search(/payment|success/i)+420));

console.log(`RESULT ${pass} passed ${fail} failed`);
await browser.close();
