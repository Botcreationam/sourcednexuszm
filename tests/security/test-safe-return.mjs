// Open-redirect regression test for post-login returnTo.  node tests/security/test-safe-return.mjs
import { safeReturnTo } from '../../src/lib/safeReturn.js';
let ok = 0, bad = 0;
const t = (n, c) => (c ? ok++ : (bad++, console.error('  FAIL:', n)));
for (const evil of ['//evil.com', '/\\evil.com', 'https://evil.com', 'http://evil.com/x', 'javascript:alert(1)',
  '%2F%2Fevil.com', '/%5Cevil.com', '///evil.com', '/\t/evil.com', 'data:text/html,x', '\\\\evil.com', '/javascript:alert(1)', '', null, undefined, 42, '%E0%A4%A', '/' + 'a'.repeat(600)])
  t('blocked: ' + String(evil).slice(0, 30), safeReturnTo(evil) === '/');
for (const good of ['/', '/checkout', '/product/abc-123', '/orders?tab=paid', '/cart#top'])
  t('allowed: ' + good, safeReturnTo(good) === good);
t('custom fallback', safeReturnTo('//evil.com', '/home') === '/home');
console.log(`SAFE-RETURN RESULTS: ${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
