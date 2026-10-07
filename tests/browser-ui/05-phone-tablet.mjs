import { createRequire } from 'node:module';
import fs from 'node:fs';
const puppeteer = createRequire('/tmp/univo-headless/')('puppeteer');
const ids = JSON.parse(fs.readFileSync('/tmp/uitest/ids.json','utf8'));
const B='http://localhost:4660', sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
let pass=0, fail=0; const ok=(c,n)=>{ c?pass++:fail++; console.log((c?'PASS ':'FAIL ')+n); };
const session = { access_token:'tok-'+ids.user, refresh_token:'r', token_type:'bearer', expires_in:99999, expires_at:Math.floor(Date.now()/1000)+99999, user:{ id:ids.user, email:'john@example.com', aud:'authenticated', role:'authenticated', app_metadata:{}, user_metadata:{} } };
for (const [w,h,label] of [[360,740,'small phone'],[390,844,'phone'],[768,1024,'tablet']]) {
  const page = await browser.newPage(); await page.setViewport({ width:w, height:h, isMobile:w<700, hasTouch:w<700 });
  await page.evaluateOnNewDocument((s)=>{ localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)); localStorage.setItem('sn_onboarding_dismissed','true'); }, session);
  const overflow = async()=>page.evaluate(()=>{ const de=document.documentElement; const bad=[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect(); return r.width>0 && r.right>innerWidth+2 && getComputedStyle(e).position!=='fixed' && !e.closest('[class*="overflow-x"],[class*="overflow-auto"],[class*="scrollbar"]');}).slice(0,3).map(e=>e.tagName+'.'+String(e.className).slice(0,40)); return { sw:de.scrollWidth, iw:innerWidth, bad }; });
  await page.goto(B+'/bundles',{waitUntil:'networkidle0'}); await sleep(1200);
  let o=await overflow(); ok(o.sw<=o.iw+1,`${label} ${w}px: /bundles no sideways scroll (${o.sw}/${o.iw}) ${o.bad.join('|')}`);
  await page.goto(B+'/bundles/'+ids.gent,{waitUntil:'networkidle0'}); await sleep(2200);
  o=await overflow(); ok(o.sw<=o.iw+1,`${label} ${w}px: bundle page no sideways scroll (${o.sw}/${o.iw}) ${o.bad.join('|')}`);
  await page.evaluate(()=>{ for (const pn of [['Black Three-Piece Suit','40R'],['White Dress Shirt','M']]) { const li=[...document.querySelectorAll('[data-testid="bundle-components"] li')].find(l=>l.innerText.includes(pn[0])); [...li.querySelectorAll('button')].find(x=>x.innerText.trim()===pn[1]).click(); } document.querySelector('[data-testid="add-bundle"]').scrollIntoView({block:'center'}); });
  await sleep(400);
  const tap = await page.evaluate(()=>{ const b=document.querySelector('[data-testid="add-bundle"]'); const r=b.getBoundingClientRect(); const el=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return b===el||b.contains(el); });
  const cover = await page.evaluate(()=>{ const b=document.querySelector('[data-testid="add-bundle"]'); const r=b.getBoundingClientRect(); const el=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return el? (el.tagName+'.'+String(el.className).slice(0,50)+' | dialog:'+(document.querySelector('[role=dialog]')?document.querySelector('[role=dialog]').innerText.slice(0,40):'none')) : 'null'; });
ok(tap,`${label}: Add button is tappable (covered by: ${tap?'nothing':cover})`);
  await page.click('[data-testid="add-bundle"]'); await sleep(900);
  await page.goto(B+'/checkout',{waitUntil:'networkidle0'}); await sleep(1800);
  o=await overflow(); ok(o.sw<=o.iw+1,`${label} ${w}px: checkout no sideways scroll (${o.sw}/${o.iw}) ${o.bad.join('|')}`);
  const info = await page.evaluate(()=>{ const c=document.querySelector('[data-testid="size-confirm-checkbox"]'); c.scrollIntoView({block:'center'}); const r=c.getBoundingClientRect(); const el=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); const lab=c.closest('label'); const lr=lab&&lab.getBoundingClientRect(); return { box:[Math.round(r.width),Math.round(r.height)], atPoint: el&&(el.tagName+'.'+String(el.className).slice(0,50)), insideLabel: !!lab, labelSize: lr?[Math.round(lr.width),Math.round(lr.height)]:null, labelTop: lr?Math.round(lr.top):null, vh: innerHeight }; });
  console.log('   checkbox', label, JSON.stringify(info));
  // the real test: tap it like a finger, then see if the Pay button unlocks
  await page.click('[data-testid="size-confirm-checkbox"]'); await sleep(300);
  const unlocked = await page.evaluate(()=>{ const b=[...document.querySelectorAll('button')].find(x=>/pay k/i.test(x.innerText)); return b && !b.disabled; });
  ok(unlocked,`${label}: tapping the checkbox unlocks Pay`);
  if (w===390) await page.screenshot({path:'phone-checkout.png', fullPage:true});
  await page.close();
}
console.log(`RESULT ${pass} passed ${fail} failed`);
await browser.close();
