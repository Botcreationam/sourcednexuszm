// ============================================================================
// /product/:param  (Vercel). Serves the SPA shell with PRODUCT-SPECIFIC
// <head> metadata so WhatsApp / Facebook / Telegram / X / LinkedIn previews
// show the exact product that was shared. Mirror of the Render handler in
// server.js; both call lib/product-meta.mjs.
// ============================================================================
import { resolveProductRequest, SITE_ORIGIN } from '../lib/product-meta.mjs';

// The built index.html (hashed asset names change on every deploy). Fetched
// from this deployment's own static output and kept for a short time.
let shell = { html: null, at: 0 };
const SHELL_TTL_MS = 60_000;

async function getShell(req) {
  if (shell.html && Date.now() - shell.at < SHELL_TTL_MS) return shell.html;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  // Prefer this very deployment (asset hashes match it); fall back to the site.
  const bases = [host ? `https://${host}` : null, SITE_ORIGIN].filter(Boolean);
  for (const base of bases) {
    try {
      const r = await fetch(`${base}/index.html`, { headers: { 'x-sn-shell': '1' }, signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        const html = await r.text();
        if (html.includes('<div id="root"') || html.includes('id="root"')) {
          shell = { html, at: Date.now() };
          return html;
        }
      }
    } catch { /* try next */ }
  }
  return shell.html; // stale copy beats nothing
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD'); return res.end();
  }
  try {
    const url = new URL(req.url, 'http://x');
    const param = (url.searchParams.get('p') || '').split('/')[0];
    const html = await getShell(req);
    if (!html) {
      // Cannot build the shell: send the visitor to the normal SPA route
      res.statusCode = 302; res.setHeader('Location', '/index.html'); return res.end();
    }
    const result = await resolveProductRequest(param, html);

    if (result.type === 'redirect') {
      res.statusCode = result.status;
      res.setHeader('Location', result.location);
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
      return res.end();
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Edge-cache briefly, then revalidate in the background: an admin edit to a
    // name / image / price / description reaches crawlers within about a minute.
    res.setHeader(
      'Cache-Control',
      result.type === 'html' && result.status === 200
        ? 'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
        : 'public, max-age=0, s-maxage=30',
    );
    res.statusCode = result.type === 'html' ? result.status : 200;
    return res.end(req.method === 'HEAD' ? undefined : (result.type === 'html' ? result.html : html));
  } catch (err) {
    console.error('[product-page] error:', err?.message || err);
    res.statusCode = 302; res.setHeader('Location', '/index.html'); return res.end();
  }
}
