import { createRequire } from 'node:module';
const puppeteer = createRequire('/tmp/univo-headless/')('puppeteer');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const B='http://localhost:4671';
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
let pass=0, fail=0; const ok=(c,n)=>{ c?pass++:fail++; console.log((c?'PASS ':'FAIL ')+n); };
async function open(w,h,reduce){
  const page = await browser.newPage(); await page.setViewport({ width:w, height:h, isMobile:w<700, hasTouch:w<700 });
  if (reduce) await page.emulateMediaFeatures([{ name:'prefers-reduced-motion', value:'reduce' }]);
  await page.evaluateOnNewDocument(()=>{ localStorage.setItem('sn_onboarding_dismissed','true'); });
  const errs=[]; page.on('pageerror', e=>errs.push(e.message.slice(0,120))); page._errs=errs;
  return page;
}
// ---------- desktop, motion ON ----------
let page = await open(1280,800,false);
await page.goto(B+'/',{waitUntil:'domcontentloaded'});
await page.waitForSelector('.sn-word',{timeout:15000});
const early = await page.evaluate(()=>[...document.querySelectorAll('.sn-word')].map(e=>+getComputedStyle(e).opacity));
await sleep(2600);
const late = await page.evaluate(()=>[...document.querySelectorAll('.sn-word')].map(e=>+getComputedStyle(e).opacity));
ok(early.length>=6, `headline split into ${early.length} animated words`);
ok(early.some(o=>o<0.95), 'words are mid-animation shortly after load (staggered)');
ok(late.every(o=>o===1), 'all words fully visible once the animation ends');
const h1 = await page.evaluate(()=>({ label:document.querySelector('h1 [aria-label]')?.getAttribute('aria-label'), text:document.querySelector('h1').innerText.replace(/\s+/g,' ') }));
ok(h1.label==='Your Style & Tech. Sourced For You.', 'screen readers get the full headline once ('+h1.label+')');
ok(h1.text.includes('Your Style & Tech.') && h1.text.includes('Sourced For You.'), 'visible headline text is intact');
const ul = await page.evaluate(()=>{ const u=document.querySelector('.sn-underline'); const a=getComputedStyle(u,'::after'); return { n:document.querySelectorAll('.sn-underline').length, tf:a.transform, w:u.getBoundingClientRect().width }; });
ok(ul.n===1 && ul.tf!=='none' && ul.tf!=='matrix(0, 0, 0, 1, 0, 0)', `one continuous underline drawn under the phrase (transform ${ul.tf}, ${Math.round(ul.w)}px wide)`);
// progress bar
const p0 = await page.evaluate(()=>+getComputedStyle(document.documentElement).getPropertyValue('--sn-progress')||0);
await page.evaluate(()=>window.scrollTo(0, document.documentElement.scrollHeight/2)); await sleep(400);
const p1 = await page.evaluate(()=>+getComputedStyle(document.documentElement).getPropertyValue('--sn-progress'));
await page.evaluate(()=>window.scrollTo(0, document.documentElement.scrollHeight)); await sleep(400);
const p2 = await page.evaluate(()=>+getComputedStyle(document.documentElement).getPropertyValue('--sn-progress'));
ok(p0===0 && p1>0.3 && p1<0.7 && p2>0.97, `scroll progress bar fills with scrolling (${p0} -> ${p1} -> ${p2})`);
// connector
await page.evaluate(()=>document.getElementById('how-it-works').scrollIntoView({block:'center'})); await sleep(2200);
const conn = await page.evaluate(()=>{ const c=document.querySelector('.sn-connector'); return c&&{ cls:c.className, tf:getComputedStyle(c).transform, vis:getComputedStyle(c.parentElement).display }; });
ok(conn && /is-in/.test(conn.cls) && conn.tf==='matrix(1, 0, 0, 1, 0, 0)', 'step connector line draws in when How It Works is visible');
// tile hover
const tile = await page.$('.sn-tile'); await tile.hover(); await sleep(600);
const th = await page.evaluate(()=>{ const t=document.querySelector('.sn-tile'); return getComputedStyle(t).backgroundColor; });
ok(th!=='rgba(0, 0, 0, 0)' , 'step icon tile reacts on hover ('+th+')');
ok(page._errs.length===0, 'no JavaScript errors on the landing page '+page._errs.join('|'));
await page.close();

// ---------- reduced motion ----------
page = await open(1280,800,true);
await page.goto(B+'/',{waitUntil:'domcontentloaded'}); await page.waitForSelector('.sn-word');
await sleep(150);
const rm = await page.evaluate(()=>({ words:[...document.querySelectorAll('.sn-word')].map(e=>+getComputedStyle(e).opacity), bar:getComputedStyle(document.querySelector('.sn-progress')).display, ul:getComputedStyle(document.querySelector('.sn-underline'),'::after').transform }));
ok(rm.words.every(o=>o===1), 'REDUCED MOTION: headline visible immediately, no animation');
ok(rm.bar==='none', 'REDUCED MOTION: scroll progress bar hidden');
ok(rm.ul==='matrix(1, 0, 0, 1, 0, 0)' || rm.ul==='none', 'REDUCED MOTION: underline shown statically ('+rm.ul+')');
await page.close();

// ---------- phone ----------
page = await open(390,844,false);
await page.goto(B+'/',{waitUntil:'networkidle2'}); await sleep(2600);
const ph = await page.evaluate(()=>{ const de=document.documentElement; const h=document.querySelector('h1').getBoundingClientRect(); return { sw:de.scrollWidth, iw:innerWidth, h1w:Math.round(h.width), h1r:Math.round(h.right), lines:document.querySelectorAll('h1 .block').length }; });
ok(ph.sw<=ph.iw+1, `PHONE 390px: no sideways scroll (${ph.sw}/${ph.iw})`);
ok(ph.h1r<=ph.iw, `PHONE: headline fits on screen (right edge ${ph.h1r}px)`);
await page.screenshot({ path:'motion-phone.png' });
// route fade
await page.goto(B+'/catalog',{waitUntil:'networkidle2'}); await sleep(900);
const rt = await page.evaluate(()=>{ const m=document.querySelector('main'); return { cls:m.className, op:+getComputedStyle(m).opacity }; });
ok(/sn-route/.test(rt.cls) && rt.op===1, 'page content fades in on route change and ends fully visible');
ok(page._errs.length===0, 'no JavaScript errors on phone '+page._errs.join('|'));
await page.close();

// ---------- product card hover (desktop) ----------
page = await open(1280,800,false);
await page.goto(B+'/catalog',{waitUntil:'networkidle2'}); await sleep(2500);
const hasCard = await page.$('.sn-card');
if (hasCard) {
  await hasCard.hover(); await sleep(700);
  const tf = await page.evaluate(()=>getComputedStyle(document.querySelector('.sn-card')).transform);
  ok(tf!=='none' && tf!=='matrix(1, 0, 0, 1, 0, 0)', 'product card lifts on hover ('+tf+')');
} else console.log('SKIP product card hover: no products in this test database view');
await page.close();
console.log(`RESULT ${pass} passed ${fail} failed`);
await browser.close();
