import { createRequire } from 'node:module';
const puppeteer = createRequire('/tmp/univo-headless/')('puppeteer');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
let pass=0, fail=0; const ok=(c,n)=>{ c?pass++:fail++; console.log((c?'PASS ':'FAIL ')+n); };
const page = await browser.newPage(); await page.setViewport({ width:1280, height:800 });
await page.evaluateOnNewDocument(()=>localStorage.setItem('sn_onboarding_dismissed','true'));
// Rewrite "(hover: hover)" to "all" in the served CSS only, so the rules apply as they would on a mouse device.
await page.setRequestInterception(true);
page.on('request', async r => {
  if (r.url().endsWith('.css')) {
    const res = await fetch(r.url()); let css = await res.text();
    const n = (css.match(/\(hover:\s*hover\)/g)||[]).length;
    css = css.replace(/@media\s*\(hover:\s*hover\)/g, '@media all');
    console.log('   css rewritten, hover guards replaced:', n);
    return r.respond({ status:200, contentType:'text/css', body:css });
  }
  r.continue();
});
await page.goto('http://localhost:4671/catalog',{waitUntil:'networkidle2'}); await sleep(2500);
const card = await page.$('.sn-card'); await card.evaluate(e=>e.scrollIntoView({block:'center'})); await sleep(300);
const before = await page.evaluate(()=>getComputedStyle(document.querySelector('.sn-card')).transform);
await card.hover(); await sleep(900);
const after = await page.evaluate(()=>{ const c=document.querySelector('.sn-card'); return { tf:getComputedStyle(c).transform, sh:getComputedStyle(c.querySelector('.sn-card-media')).boxShadow }; });
ok(before==='none'||before==='matrix(1, 0, 0, 1, 0, 0)', 'card at rest is not lifted');
ok(/matrix\(1, 0, 0, 1, 0, -6\)/.test(after.tf), 'card lifts 6px on hover ('+after.tf+')');
ok(after.sh && after.sh!=='none', 'card image gets a soft shadow on hover');
const img = await page.evaluate(()=>{ const i=document.querySelector('.sn-card img'); return i && getComputedStyle(i).transform; });
ok(img && img!=='none', 'product photo still zooms on hover as before ('+img+')');
await page.mouse.move(5,5); await sleep(900);
const back = await page.evaluate(()=>getComputedStyle(document.querySelector('.sn-card')).transform);
ok(back==='none'||back==='matrix(1, 0, 0, 1, 0, 0)', 'card settles back when the mouse leaves');
console.log(`RESULT ${pass} passed ${fail} failed`);
await browser.close();
