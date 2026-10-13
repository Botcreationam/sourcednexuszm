// ============================================================================
// /catalog, /categories, /bundles, ... (Vercel). Serves the SPA shell with the
// page's OWN <head> metadata so crawlers do not see the homepage's canonical on
// every route. Visitors get the identical app: only the head tags differ.
// ============================================================================
import { SITE_ORIGIN } from '../lib/product-meta.mjs';
import { matchStaticPath, applyStaticMeta } from '../lib/static-page-meta.mjs';

let shell = { html: null, at: 0 };
const SHELL_TTL_MS = 60_000;

async function getShell(req) {
  if (shell.html && Date.now() - shell.at < SHELL_TTL_MS) return shell.html;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const bases = [host ? `https://${host}` : null, SITE_ORIGIN].filter(Boolean);
  for (const base of bases) {
    try {
      const r = await fetch(`${base}/index.html`, { headers: { 'x-sn-shell': '1' }, signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        const html = await r.text();
        if (html.includes('id="root"')) { shell = { html, at: Date.now() }; return html; }
      }
    } catch { /* try next */ }
  }
  return shell.html;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); return res.end();
  }
  try {
    const url = new URL(req.url, 'http://x');
    const key = matchStaticPath(url.searchParams.get('p') || '');
    const html = await getShell(req);
    if (!html) { res.statusCode = 302; res.setHeader('Location', '/index.html'); return res.end(); }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
    res.statusCode = 200;
    return res.end(req.method === 'HEAD' ? undefined : (key ? applyStaticMeta(html, key) : html));
  } catch (err) {
    console.error('[static-page] error:', err?.message || err);
    res.statusCode = 302; res.setHeader('Location', '/index.html'); return res.end();
  }
}
