// ============================================================================
// Security regression tests (offline: no network, no real credentials/data).
//   node tests/security/test-security-hardening.mjs
// Exits non-zero if any check fails.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  safeImageUrl, isValidEmailAddress, isUuid, trustedClientIp, createRateLimiter,
} from '../../lib/security-utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) { passed += 1; } else { failed += 1; console.error('  FAIL:', name); }
}
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// ---- safeImageUrl: block script/data/file schemes ---------------------------
check('https image accepted', safeImageUrl('https://x.supabase.co/a.jpg') === 'https://x.supabase.co/a.jpg');
check('javascript: rejected', safeImageUrl('javascript:alert(1)') === null);
check('data: rejected', safeImageUrl('data:text/html,<script>1</script>') === null);
check('file: rejected', safeImageUrl('file:///etc/passwd') === null);
check('garbage rejected', safeImageUrl('not a url') === null);
check('non-string rejected', safeImageUrl({ a: 1 }) === null);

// ---- email validation / header injection ------------------------------------
check('valid email ok', isValidEmailAddress('a@b.co'));
check('CRLF injection rejected', !isValidEmailAddress('a@b.co\r\nBcc: evil@x.com'));
check('space rejected', !isValidEmailAddress('a b@c.com'));
check('overlong rejected', !isValidEmailAddress(`${'a'.repeat(300)}@b.com`));

// ---- uuid ---------------------------------------------------------------------
check('uuid ok', isUuid('123e4567-e89b-12d3-a456-426614174000'));
check('uuid injection rejected', !isUuid("1' or '1'='1"));

// ---- client IP: spoofed first XFF entry must NOT win ----------------------------
check('XFF spoof ignored (last hop used)',
  trustedClientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 9.9.9.9' }, socket: {} }) === '9.9.9.9');
check('platform header preferred',
  trustedClientIp({ headers: { 'x-real-ip': '8.8.8.8', 'x-forwarded-for': '1.1.1.1' }, socket: {} }) === '8.8.8.8');
check('socket fallback', trustedClientIp({ headers: {}, socket: { remoteAddress: '7.7.7.7' } }) === '7.7.7.7');

// ---- rate limiter -----------------------------------------------------------
{
  const allow = createRateLimiter({ windowMs: 60_000, max: 3 });
  const r = [allow('ip'), allow('ip'), allow('ip'), allow('ip')];
  check('limiter allows up to max', r[0] && r[1] && r[2]);
  check('limiter blocks over max', r[3] === false);
  check('limiter isolates keys', allow('other') === true);
}

// ---- static guards on the code that must not regress ------------------------
const inq = read('api/inquiries.js');
check('inquiries: user_id is NOT taken from request body', !/user_id:\s*payload\.user_id/.test(inq));
check('inquiries: identity verified via getAuthUser', /getAuthUser\(req\.headers\['authorization'\]\)/.test(inq));
check('inquiries: rate limited', /allowInquiry\(/.test(inq));
check('inquiries: image URL scheme validated', /safeImageUrl\(item\.image\)/.test(inq));

const srv = read('server.js');
check('server: no wildcard CORS', !/Access-Control-Allow-Origin'\s*:\s*'\*'/.test(srv));
check('server: client IP does not trust first XFF entry', !/xForwardedFor\.split\(','\)\[0\]/.test(srv));
check('server: turnstile fails closed in production', /refusing to bypass/.test(srv));

const ts = read('api/verify-turnstile.js');
check('turnstile api: fails closed in production', /refusing to bypass/.test(ts));
check('turnstile api: no provider error codes echoed', !/details:\s*result\['error-codes'\]/.test(ts));

const vercel = JSON.parse(read('vercel.json'));
const hk = vercel.headers[0].headers.map((h) => h.key);
check('vercel: CSP present', hk.includes('Content-Security-Policy-Report-Only') || hk.includes('Content-Security-Policy'));
check('vercel: HSTS present', hk.includes('Strict-Transport-Security'));
check('vercel: no unsafe-eval in CSP',
  !vercel.headers[0].headers.find((h) => /Content-Security-Policy/.test(h.key)).value.includes('unsafe-eval'));

const mig = read('supabase/migrations/20261010000000_security_audit_hardening.sql');
check('migration: product_views public read dropped', /drop policy if exists "Allow public read on product_views"/.test(mig));
check('migration: inquiry insert binds user_id', /user_id is null or user_id = auth\.uid\(\)/.test(mig));
check('migration: preorder bucket private', /public = false where id = 'preorder-uploads'/.test(mig));
check('migration: no destructive data statements', !/\b(delete from|truncate|drop table)\b/i.test(mig));

// ---- payment invariants (already enforced; guard against regression) ----------
const shared = read('lib/payza-shared.mjs');
check('payments: webhook compare is timing-safe', /timingSafeEqual/.test(shared));
check('payments: webhook HMAC SHA-256', /createHmac\('sha256'/.test(shared));
const hook = read('api/payza-webhook.js');
check('payments: webhook re-verifies with provider', /verifyPayzaPayment\(reference\)/.test(hook));
check('payments: webhook rejects bad signature', /Invalid signature/.test(hook));

console.log(`\nSECURITY REGRESSION RESULTS: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
