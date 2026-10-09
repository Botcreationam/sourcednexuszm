// Live E2E for the hardened /api/inquiries (real server.js + mock Supabase). Offline, no real data.
//   node tests/security/test-inquiry-e2e.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
const captured = [];
// Mock Supabase: /auth/v1/user validates a fake token; /rest/v1/customer_inquiries captures inserts.
const mock = http.createServer((req, res) => {
  let b=''; req.on('data',c=>b+=c); req.on('end',()=>{
    if (req.url.startsWith('/auth/v1/user')) {
      if (req.headers.authorization === 'Bearer GOOD_TOKEN_USER_A') { res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify({id:'aaaaaaaa-0000-0000-0000-000000000001',email:'a@x.com'})); }
      res.writeHead(401); return res.end('{}');
    }
    if (req.url.startsWith('/rest/v1/customer_inquiries')) { const rec=JSON.parse(b); captured.push(rec); res.writeHead(201,{'content-type':'application/json'}); return res.end(JSON.stringify([{...rec,id:'row-1',created_at:'now',secret_internal:'x'}])); }
    res.writeHead(404); res.end('{}');
  });
}).listen(0, async () => {
  const mp = mock.address().port;
  const app = spawn('node',['server.js'],{env:{...process.env,PORT:'18555',VITE_SUPABASE_URL:`http://127.0.0.1:${mp}`,SUPABASE_SERVICE_ROLE_KEY:'svc',VITE_SUPABASE_ANON_KEY:'anon',NODE_ENV:'test'},stdio:'ignore'});
  await new Promise(r=>setTimeout(r,1500));
  const post=(body,headers={})=>fetch('http://127.0.0.1:18555/api/inquiries',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
  const base={customer_name:'Test Person',contact_number:'+260970000000',items:[{id:'p1',name:'Watch',quantity:1,image:'javascript:alert(1)'}]};
  let ok=0,bad=0; const t=(n,c)=>{c?ok++:(bad++,console.log('FAIL',n))};

  // 1. Spoofed user_id, no token => must be stored as anonymous (null), never the victim's id
  let r=await post({...base,user_id:'victim-0000-0000-0000-000000000009'}); t('spoof anon status 201',r.status===201);
  t('spoofed user_id discarded (anon)', captured.at(-1)?.user_id===null);
  // 2. Valid token => bound to the VERIFIED id, even if body claims another
  r=await post({...base,user_id:'victim-0000-0000-0000-000000000009'},{authorization:'Bearer GOOD_TOKEN_USER_A'});
  t('verified user bound', captured.at(-1)?.user_id==='aaaaaaaa-0000-0000-0000-000000000001');
  // 3. Forged token => treated as anonymous
  r=await post(base,{authorization:'Bearer FORGED'}); t('forged token => anon', captured.at(-1)?.user_id===null);
  // 4. javascript: image URL stripped
  t('javascript: image stripped', captured.at(-1)?.items?.[0]?.image===null);
  // 5. Response does not echo internal columns
  const j=await (await post(base)).json(); t('no internal columns echoed', j.inquiry && !('secret_internal' in j.inquiry));
  // 6. Bad email rejected
  r=await post({...base,email:'a@b.co\r\nBcc: x@y.com'}); t('CRLF email rejected 400', r.status===400);
  // 7. CORS: evil origin gets no allow-origin; own origin does
  let o=await fetch('http://127.0.0.1:18555/api/inquiries',{method:'OPTIONS',headers:{origin:'https://evil.example'}});
  t('evil origin not allowed', !o.headers.get('access-control-allow-origin'));
  o=await fetch('http://127.0.0.1:18555/api/inquiries',{method:'OPTIONS',headers:{origin:'https://sourcednexus.online'}});
  t('own origin allowed', o.headers.get('access-control-allow-origin')==='https://sourcednexus.online');
  // 8. Security headers present
  const h=await fetch('http://127.0.0.1:18555/'); t('CSP header on server.js', !!h.headers.get('content-security-policy'));
  console.log(`LIVE INQUIRY E2E: ${ok} passed, ${bad} failed`);
  app.kill(); mock.close(); process.exit(bad?1:0);
});
