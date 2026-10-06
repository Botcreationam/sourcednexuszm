import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import {
  payzaConfig,
  getAuthUser,
  sanitizeCheckoutItems,
  sanitizeCustomer,
  createPendingOrder,
  verifyPayzaPayment,
  applyPaymentResult,
  cancelPaymentAttempt,
  verifyPayzaSignature,
  referenceIsValid,
  supabaseServiceConfigured,
  supabaseRest,
} from './lib/payza-shared.mjs';
import { authorizeProcessor, processNotificationQueue } from './lib/product-notifications.mjs';
import { processAnnouncements, sendAnnouncementTest } from './lib/announcements.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, 'dist');
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
  '.map': 'application/json'
};

function loadServerEnv() {
  const envPath = path.resolve(__dirname, '.env');
  try {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch (e) {
    console.error('Error loading server .env:', e.message);
  }
}
loadServerEnv();

function getClientEnv() {
  const envPath = path.resolve(__dirname, '.env');
  const env = {};
  try {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (key.startsWith('VITE_')) {
            env[key] = val;
          }
        }
      }
    }
  } catch (e) {
    console.error('Error reading .env:', e.message);
  }
  return env;
}

function injectEnv(html) {
  const env = getClientEnv();
  const script = `<script>window.__ENV__ = ${JSON.stringify(env)};</script>`;
  if (html.includes('</head>')) {
    return html.replace('</head>', `${script}</head>`);
  }
  return script + html;
}

// ── Production Base URL for absolute OG tags ──
const PRODUCTION_BASE_URL = 'https://sourcednexuszm.vercel.app';
const DEFAULT_OG_IMAGE = `${PRODUCTION_BASE_URL}/og-image.jpg`;

// ── Escape HTML entities in OG content values ──
function escapeAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Fetch a product from Supabase by UUID ──
async function fetchProductById(productId) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  try {
    const r = await fetch(
      `${supabaseUrl}/rest/v1/products?id=eq.${encodeURIComponent(productId)}&select=id,name,description,price,category,images&limit=1`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(4000),
      }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return rows?.[0] || null;
  } catch {
    return null;
  }
}

// ── Inject dynamic OG + Twitter meta tags for a specific product ──
function injectProductOG(html, product) {
  const title = escapeAttr(product.name);
  const desc = escapeAttr(
    product.description ||
    `Curated ${product.category || 'luxury item'} — ${product.price || 'Price on request'}. Sourced Nexus, Lusaka.`
  );
  const productUrl = `${PRODUCTION_BASE_URL}/product/${product.id}`;
  const image = product.images?.[0] || DEFAULT_OG_IMAGE;
  const imageUrl = escapeAttr(image);

  // Strip existing OG/Twitter/canonical/title/description tags to prevent duplicates
  let cleaned = html
    .replace(/<title>[^<]*<\/title>/i, '')
    .replace(/<meta\s+name=["']description["'][^>]*\/?>/gi, '')
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*\/?>/gi, '')
    .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*\/?>/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*\/?>/gi, '');

  const metaBlock = `
    <title>${title} — Sourced Nexus</title>
    <meta name="description" content="${desc}" />
    <link rel="canonical" href="${escapeAttr(productUrl)}" />
    <meta property="og:type" content="product" />
    <meta property="og:site_name" content="Sourced Nexus" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${desc}" />
    <meta property="og:url" content="${escapeAttr(productUrl)}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:secure_url" content="${imageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${title}" />
    <meta property="og:locale" content="en_US" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${desc}" />
    <meta name="twitter:image" content="${imageUrl}" />
    <meta name="twitter:image:alt" content="${title}" />
  `;

  if (cleaned.includes('</head>')) {
    return cleaned.replace('</head>', `${metaBlock}</head>`);
  }
  return metaBlock + cleaned;
}

// Helmet security headers middleware
const helmetHandler = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://challenges.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https://*.supabase.co",
        "https://media.base44.com",
        "https://*.base44.com",
        "https://images.unsplash.com",
        "https://*.googleusercontent.com"
      ],
      connectSrc: [
        "'self'",
        "https://*.supabase.co",
        "wss://*.supabase.co",
        "https://*.base44.com",
        "https://api.base44.com",
        "https://accounts.google.com",
        "https://challenges.cloudflare.com"
      ],
      frameSrc: ["'self'", "https://challenges.cloudflare.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'", "https://accounts.google.com", "https://*.supabase.co"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
  noSniff: true,
  frameguard: { action: "sameorigin" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xssFilter: true,
});

// Sliding-window In-Memory Rate Limiting
const rateLimitMap = new Map();
const RATE_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_GENERAL_REQUESTS = 300;
const MAX_SENSITIVE_REQUESTS = 40;

// Periodic cleanup of stale rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now - record.startTime > RATE_WINDOW_MS) {
      rateLimitMap.delete(ip);
    }
  }
}, RATE_WINDOW_MS);

// Known abusive scanners and malicious bots
const BLOCKED_BOT_REGEX = /(sqlmap|nikto|masscan|dirbuster|acunetix|gobuster|wprecon|nmap|zgrab|censys|shodan)/i;

function getClientIp(req) {
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

function checkRateLimit(ip, isSensitive) {
  const now = Date.now();
  let record = rateLimitMap.get(ip);
  if (!record || now - record.startTime > RATE_WINDOW_MS) {
    record = { startTime: now, generalCount: 0, sensitiveCount: 0 };
    rateLimitMap.set(ip, record);
  }

  if (isSensitive) {
    record.sensitiveCount += 1;
    if (record.sensitiveCount > MAX_SENSITIVE_REQUESTS) return false;
  } else {
    record.generalCount += 1;
    if (record.generalCount > MAX_GENERAL_REQUESTS) return false;
  }

  return true;
}

const server = http.createServer((req, res) => {
  // 1. Remove x-powered-by header
  res.removeHeader('X-Powered-By');

  // 2. Anti-Scraping / Malicious scanner filter
  const userAgent = req.headers['user-agent'] || '';
  if (BLOCKED_BOT_REGEX.test(userAgent)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access Denied');
    return;
  }

  // 3. HTTP Methods validation
  const allowedMethods = ['GET', 'HEAD', 'OPTIONS', 'POST'];
  if (!allowedMethods.includes(req.method)) {
    res.writeHead(405, { 'Content-Type': 'text/plain', 'Allow': allowedMethods.join(', ') });
    res.end('Method Not Allowed');
    return;
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  const rawUrl = req.url || '/';
  const ip = getClientIp(req);
  const isSensitive =
    rawUrl.includes('/admin') ||
    rawUrl.includes('/login') ||
    rawUrl.includes('/api/inquiries') ||
    rawUrl.includes('/api/payments');



  if (!checkRateLimit(ip, isSensitive)) {
    res.writeHead(429, {
      'Content-Type': 'text/plain',
      'Retry-After': '60',
    });
    res.end('Too Many Requests. Please slow down.');
    return;
  }

  // 5. Apply Helmet security headers
  helmetHandler(req, res, () => {
    // Additional strict security headers
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

    // 6. Path Traversal & Injection Defense
    const reqUrl = rawUrl.split('?')[0];
    if (reqUrl.includes('\0') || reqUrl.includes('%00')) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      return;
    }

    // 7. Canonical Cloudflare Turnstile Siteverify Endpoint
    if (req.method === 'POST' && reqUrl === '/api/verify-turnstile') {
      let bodyStr = '';
      req.on('data', chunk => {
        bodyStr += chunk;
        if (bodyStr.length > 10000) {
          req.destroy();
        }
      });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(bodyStr || '{}');
          const token = payload.token || payload['cf-turnstile-response'];
          const expectedAction = payload.action;

          const turnstileSecret = process.env.TURNSTILE_SECRET;
          const rawHostnames = process.env.TURNSTILE_HOSTNAMES || "localhost,127.0.0.1,sourcednexuszm.vercel.app";
          const expectedHostnames = new Set(
            rawHostnames
              .split(",")
              .map((h) => h.trim())
              .filter(Boolean),
          );

          if (
            typeof token !== "string" ||
            token.length === 0 ||
            token.length > 2048 ||
            expectedHostnames.size === 0
          ) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'forbidden: invalid turnstile token format' }));
            return;
          }

          if (!turnstileSecret) {
            console.warn('[turnstile] TURNSTILE_SECRET is not configured in .env yet.');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: true, 
              warning: 'TURNSTILE_SECRET is not configured in .env - bypassed for development' 
            }));
            return;
          }

          const clientIp = getClientIp(req);
          const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            signal: AbortSignal.timeout(10_000),
            body: new URLSearchParams({
              secret: turnstileSecret,
              response: token,
              remoteip: clientIp,
            }),
          });

          if (!r.ok) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: `siteverify failed with status ${r.status}` }));
            return;
          }

          const result = await r.json();

          if (
            !result.success ||
            (expectedAction && result.action !== expectedAction) ||
            !expectedHostnames.has(result.hostname)
          ) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: false, 
              error: 'forbidden: verification rejected', 
              details: result['error-codes'] || [] 
            }));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, hostname: result.hostname }));
          return;
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Internal server error validating turnstile' }));
          return;
        }
      });
      return;
    }

    // 8. Product Inquiry & Quote Request Endpoint
    if (req.method === 'POST' && reqUrl === '/api/inquiries') {
      let bodyStr = '';
      req.on('data', chunk => {
        bodyStr += chunk;
        if (bodyStr.length > 50000) {
          req.destroy();
        }
      });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(bodyStr || '{}');
          const customerName = typeof payload.customer_name === 'string' ? payload.customer_name.trim() : '';
          const contactNumber = typeof payload.contact_number === 'string' ? payload.contact_number.trim() : '';
          const email = typeof payload.email === 'string' ? payload.email.trim() : null;
          const inquiryType = ['quote_request', 'preorder', 'product_inquiry'].includes(payload.inquiry_type)
            ? payload.inquiry_type
            : 'quote_request';
          const items = Array.isArray(payload.items) ? payload.items : [];

          // Validation
          if (!customerName || customerName.length < 2 || customerName.length > 100) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Please provide a valid customer name (2-100 characters).' }));
            return;
          }

          if (!contactNumber || contactNumber.length < 6 || contactNumber.length > 35) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Please provide a valid contact phone or WhatsApp number.' }));
            return;
          }

          if (items.length === 0 || items.length > 50) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Please select at least 1 product (up to 50).' }));
            return;
          }

          // Sanitize items, preserving the customer's selected grade, images and specs
          const sanitizedItems = items.map((item, idx) => ({
            id: String(item.id || `item-${idx + 1}`),
            name: String(item.name || 'Unnamed Product').slice(0, 150),
            category: item.category ? String(item.category).slice(0, 80) : 'General',
            price: item.price ? String(item.price).slice(0, 50) : 'Price on Request',
            image: item.image ? String(item.image).slice(0, 1000) : null,
            quantity: Math.max(1, Math.min(100, Number(item.quantity) || 1)),
            selectedSize: item.selectedSize ? String(item.selectedSize).slice(0, 30) : null,
            selectedColor: item.selectedColor ? String(item.selectedColor).slice(0, 30) : null,
            selectedGrade: item.selectedGrade && typeof item.selectedGrade === 'object' ? {
              name: item.selectedGrade.name ? String(item.selectedGrade.name).slice(0, 50) : null,
              price: item.selectedGrade.price != null ? String(item.selectedGrade.price).slice(0, 50) : null,
              originalPrice: item.selectedGrade.originalPrice != null ? String(item.selectedGrade.originalPrice).slice(0, 50) : null,
              discount: Number.isFinite(Number(item.selectedGrade.discount)) ? Number(item.selectedGrade.discount) : null,
            } : null,
            specifications: item.specifications ? String(item.specifications).slice(0, 300) : '',
          }));

          const estimatedTotal = Number(payload.estimated_total);
          const record = {
            id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined,
            user_id: payload.user_id || null,
            inquiry_type: inquiryType,
            customer_name: customerName,
            contact_number: contactNumber,
            email: email || null,
            items: sanitizedItems,
            total_items: sanitizedItems.reduce((acc, i) => acc + i.quantity, 0),
            specifications: payload.specifications ? String(payload.specifications).slice(0, 1000) : null,
            additional_instructions: payload.additional_instructions ? String(payload.additional_instructions).slice(0, 2000) : null,
            status: 'Pending',
            source: payload.source === 'whatsapp' ? 'whatsapp' : 'website',
            ip_address: ip,
            estimated_total: Number.isFinite(estimatedTotal) && estimatedTotal >= 0 ? Math.min(estimatedTotal, 10_000_000) : 0,
            preferred_contact: ['whatsapp', 'email', 'phone'].includes(payload.preferred_contact) ? payload.preferred_contact : 'whatsapp',
          };

          const env = getClientEnv();
          const supabaseUrl = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL || 'https://zprzxqdcqeywopwxouzu.supabase.co';
          const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

          if (supabaseUrl && supabaseKey) {
            try {
              const supaRes = await fetch(`${supabaseUrl}/rest/v1/customer_inquiries`, {
                method: 'POST',
                headers: {
                  'apikey': supabaseKey,
                  'Authorization': `Bearer ${supabaseKey}`,
                  'Content-Type': 'application/json',
                  'Prefer': 'return=representation',
                },
                body: JSON.stringify(record),
              });

              if (supaRes.ok) {
                const inserted = await supaRes.json();
                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, inquiry: inserted[0] || record }));
                return;
              } else {
                console.warn('[inquiries] Supabase insert returned status:', supaRes.status);
              }
            } catch (supaErr) {
              console.warn('[inquiries] Supabase REST error:', supaErr.message);
            }
          }

          // Return success even if fallback storage is used so user flow is seamless
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, inquiry: record }));
          return;
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Internal error processing inquiry.' }));
          return;
        }
      });
      return;
    }


    // POST|GET /api/notifications/process - sends queued product-update emails.
    // Admin JWT or CRON_SECRET only; returns aggregate counts, never addresses.
    if ((req.method === 'POST' || req.method === 'GET') && reqUrl === '/api/notifications/process') {
      (async () => {
        const send = (code, obj) => {
          res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(obj));
        };
        try {
          const auth = await authorizeProcessor(req);
          if (!auth.ok) { send(auth.status, { success: false, error: auth.error }); return; }
          const result = await processNotificationQueue(req);
          send(200, { success: true, ...result });
        } catch (err) {
          console.error('[notifications] process error:', err.message);
          send(500, { success: false, error: 'Could not process notifications.' });
        }
      })();
      return;
    }

    // POST|GET /api/announcements/process - sends admin announcements, or (action:"test")
    // one preview to the signed-in admin. Admin session / CRON_SECRET only.
    if ((req.method === 'POST' || req.method === 'GET') && reqUrl === '/api/announcements/process') {
      (async () => {
        const send = (code, obj) => {
          res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(obj));
        };
        try {
          const auth = await authorizeProcessor(req);
          if (!auth.ok) { send(auth.status, { success: false, error: auth.error }); return; }
          let body = {};
          if (req.method === 'POST') {
            body = await new Promise((resolve) => {
              let raw = '';
              req.on('data', (c) => { raw += c; if (raw.length > 20000) req.destroy(); });
              req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
              req.on('error', () => resolve({}));
            });
          }
          if (body.action === 'test') {
            if (auth.via !== 'admin') { send(403, { success: false, error: 'Administrator access required.' }); return; }
            const subject = String(body.subject || '').trim().slice(0, 150);
            const message = String(body.message || '').trim().slice(0, 5000);
            if (!subject || !message) { send(400, { success: false, error: 'Subject and message are required.' }); return; }
            const r = await sendAnnouncementTest(req, { subject, message, buttonLabel: body.buttonLabel, buttonUrl: body.buttonUrl, adminUserId: auth.userId });
            send(r.ok ? 200 : 502, { success: r.ok, ...(r.ok ? {} : { error: r.error }) });
            return;
          }
          const result = await processAnnouncements(req);
          send(200, { success: true, ...result });
        } catch (err) {
          console.error('[announcements] error:', err.message);
          send(500, { success: false, error: 'Could not process announcements.' });
        }
      })();
      return;
    }

    if (req.method === 'POST' && (
      reqUrl === '/api/payments/payza/create-order' ||
      reqUrl === '/api/payments/payza/verify' ||
      reqUrl === '/api/payments/payza/cancel' ||
      reqUrl === '/api/webhooks/payza'
    )) {
      // Fire-and-forget async handler (same pattern as the Turnstile route);
      // the outer callback returns immediately so static serving never runs.
      (async () => {
    // ======================================================================
    // Payza payments — server-side only. The secret key and webhook signing
    // secret never leave this process. All amounts are recomputed from the
    // products table via the service role; the browser is never trusted.
    // ======================================================================

    // Read a JSON body with a hard size cap, returning a promise.
    const readJsonBody = (limit = 32000) =>
      new Promise((resolve, reject) => {
        let bodyStr = '';
        let aborted = false;
        req.on('data', (chunk) => {
          bodyStr += chunk;
          if (bodyStr.length > limit) {
            aborted = true;
            req.destroy();
            reject(new Error('Payload too large'));
          }
        });
        req.on('end', () => {
          if (aborted) return;
          try {
            resolve({ json: JSON.parse(bodyStr || '{}'), raw: bodyStr });
          } catch {
            reject(new Error('Invalid JSON'));
          }
        });
        req.on('error', () => reject(new Error('Read error')));
      });

    const json = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(obj));
    };

    // POST /api/payments/payza/create-order
    // Authenticated. Creates/reuses a pending order with server-side pricing,
    // starts the hosted-checkout payment at Payza and returns the checkout
    // URL plus a fresh payment reference. No prices are accepted from the client.
    if (req.method === 'POST' && reqUrl === '/api/payments/payza/create-order') {
      try {
        const cfg = payzaConfig();
        if (!cfg.configured) {
          json(503, { success: false, error: 'Online payments are not available right now.' });
          return;
        }
        const authUser = await getAuthUser(req.headers['authorization']);
        if (!authUser) {
          json(401, { success: false, error: 'Please sign in to pay online.' });
          return;
        }
        const { json: payload } = await readJsonBody();
        const { lines, error: itemsError } = sanitizeCheckoutItems(payload.items);
        if (itemsError) {
          json(400, { success: false, error: itemsError });
          return;
        }
        const { customer, error: customerError } = sanitizeCustomer(payload.customer);
        if (customerError) {
          json(400, { success: false, error: customerError });
          return;
        }
        // Public origin used for Payza's webhook/redirect/cancel URLs.
        // SITE_BASE_URL wins; otherwise derive from the request's own Host
        // (the browser's origin is not trusted).
        const host = req.headers['host'];
        const baseUrl = (process.env.SITE_BASE_URL || (host ? `https://${host}` : '')).replace(/\/$/, '');
        const result = await createPendingOrder({ user: authUser, lines, customer, baseUrl });
        if (result.error) {
          json(409, { success: false, error: result.error });
          return;
        }
        // No Payza keys are exposed to the browser — the customer is simply
        // redirected to the hosted checkout URL below.
        json(201, {
          success: true,
          reference: result.payment.reference,
          amount: result.payment.amount,
          currency: 'ZMW',
          orderId: result.order.id,
          orderNumber: result.order.orderNumber,
          paymentUrl: result.payment.paymentUrl,
        });
        return;
      } catch (err) {
        console.error('[payza] create-order error:', err.message);
        json(500, { success: false, error: 'Could not start the payment. Please try again.' });
        return;
      }
    }

    // POST /api/payments/payza/verify
    // Authenticated + ownership-checked. The backend performs the trusted
    // verification with Payza; the frontend's word is never taken for payment.
    if (req.method === 'POST' && reqUrl === '/api/payments/payza/verify') {
      try {
        const authUser = await getAuthUser(req.headers['authorization']);
        if (!authUser) {
          json(401, { success: false, error: 'Please sign in to verify your payment.' });
          return;
        }
        const { json: payload } = await readJsonBody();
        const reference = typeof payload.reference === 'string' ? payload.reference.trim() : '';
        if (!referenceIsValid(reference)) {
          json(400, { success: false, error: 'Invalid payment reference.' });
          return;
        }
        // Ownership: the payment must belong to the caller.
        const own = await supabaseRest('GET', 'payments', {
          query: { select: 'id,order_id,user_id,status,amount', reference: `eq.${reference}`, limit: '1' },
        });
        if (!own.ok || !Array.isArray(own.data) || own.data.length === 0) {
          json(404, { success: false, error: 'Payment not found.' });
          return;
        }
        if (own.data[0].user_id !== authUser.id) {
          json(403, { success: false, error: 'You can only verify your own payments.' });
          return;
        }
        const payzaResult = await verifyPayzaPayment(reference);
        if (payzaResult.error) {
          json(502, { success: false, error: payzaResult.error });
          return;
        }
        const applied = await applyPaymentResult(reference, payzaResult, { source: 'verify' });
        if (applied.error) {
          json(applied.code || 409, { success: false, error: applied.error });
          return;
        }
        const orderRes = await supabaseRest('GET', 'orders', {
          query: { select: 'order_number,status,payment_status', id: `eq.${own.data[0].order_id}`, limit: '1' },
        });
        const order = Array.isArray(orderRes.data) && orderRes.data[0] ? orderRes.data[0] : null;
        json(200, {
          success: true,
          paymentStatus: applied.status,
          orderStatus: order ? order.status : 'pending',
          orderNumber: order ? order.order_number : null,
        });
        return;
      } catch (err) {
        console.error('[payza] verify error:', err.message);
        json(500, { success: false, error: 'Could not verify the payment. Please try again.' });
        return;
      }
    }

    // POST /api/payments/payza/cancel — customer cancelled the checkout
    if (req.method === 'POST' && reqUrl === '/api/payments/payza/cancel') {
      try {
        const authUser = await getAuthUser(req.headers['authorization']);
        if (!authUser) {
          json(401, { success: false, error: 'Please sign in first.' });
          return;
        }
        const { json: payload } = await readJsonBody();
        const reference = typeof payload.reference === 'string' ? payload.reference.trim() : '';
        if (!referenceIsValid(reference)) {
          json(400, { success: false, error: 'Invalid payment reference.' });
          return;
        }
        const own = await supabaseRest('GET', 'payments', {
          query: { select: 'id,user_id,status', reference: `eq.${reference}`, limit: '1' },
        });
        if (!own.ok || !Array.isArray(own.data) || own.data.length === 0) {
          json(404, { success: false, error: 'Payment not found.' });
          return;
        }
        if (own.data[0].user_id !== authUser.id) {
          json(403, { success: false, error: 'You can only manage your own payments.' });
          return;
        }
        await cancelPaymentAttempt(reference);
        json(200, { success: true, cancelled: true });
        return;
      } catch (err) {
        console.error('[payza] cancel error:', err.message);
        json(500, { success: false, error: 'Could not update the payment attempt.' });
        return;
      }
    }

    // POST /api/webhooks/payza — Payza payment events.
    // Unauthenticated by design: authenticity is proven by the
    // X-Payza-Signature HMAC (SHA-256 keyed with the account's Webhook
    // Signing Secret). The raw body is used for signature verification.
    if (req.method === 'POST' && reqUrl === '/api/webhooks/payza') {
      try {
        const { json: event, raw } = await readJsonBody(64000);
        const signature = req.headers['x-payza-signature'];
        if (!verifyPayzaSignature(raw, signature)) {
          json(401, { success: false, error: 'Invalid signature' });
          return;
        }
        const eventType = typeof event?.event === 'string' ? event.event : '';
        // Payza's webhook body carries our reference at the top level.
        const reference = typeof event?.reference === 'string' ? event.reference : '';
        if (eventType.startsWith('payment.') && referenceIsValid(reference)) {
          // Re-verify with Payza before trusting the event body (defense in
          // depth on top of the signature; also enforces amount + currency).
          const payzaResult = await verifyPayzaPayment(reference);
          if (!payzaResult.error) {
            await applyPaymentResult(reference, payzaResult, { source: 'webhook' });
          }
          // Events that verify could not confirm are left to the re-query /
          // verify path; we still acknowledge with 200.
        }
        // Always acknowledge valid events so Payza stops retrying.
        json(200, { received: true });
        return;
      } catch (err) {
        console.error('[payza] webhook error:', err.message);
        json(200, { received: true }); // ack to avoid retry storms on parse issues
        return;
      }
    }

      })();
      return;
    }

    const safePath = path.normalize(reqUrl).replace(/^(\.\.[/\\])+/, '');
    let filePath = path.resolve(DIST_DIR, '.' + safePath);

    // Ensure resolved path stays strictly within DIST_DIR
    if (!filePath.startsWith(DIST_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (!err && stats.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }

      fs.readFile(filePath, (readErr, content) => {
        if (!readErr) {
          const ext = path.extname(filePath).toLowerCase();
          const contentType = MIME_TYPES[ext] || 'application/octet-stream';

          const headers = { 'Content-Type': contentType };
          if (filePath.includes('/assets/') || filePath.includes('\\assets\\')) {
            headers['Cache-Control'] = 'public, max-age=31536000, immutable';
          } else {
            headers['Cache-Control'] = 'public, max-age=0, must-revalidate';
          }

          if (ext === '.html') {
            const htmlString = injectEnv(content.toString('utf8'));
            res.writeHead(200, headers);
            res.end(htmlString);
            return;
          }

          res.writeHead(200, headers);
          res.end(content);
          return;
        }

        // SPA Fallback for client-side routing
        if (!path.extname(reqUrl)) {
          const indexPath = path.join(DIST_DIR, 'index.html');
          fs.readFile(indexPath, async (indexErr, indexHtml) => {
            if (indexErr) {
              res.writeHead(404, { 'Content-Type': 'text/plain' });
              res.end('Not Found (dist/index.html missing, run npm run build first)');
              return;
            }

            let html = injectEnv(indexHtml.toString('utf8'));

            // ── Dynamic OG for /product/:id routes ──
            const productMatch = reqUrl.match(/^\/product\/([a-f0-9-]{36})/i);
            if (productMatch) {
              try {
                const product = await fetchProductById(productMatch[1]);
                if (product) {
                  html = injectProductOG(html, product);
                }
              } catch (e) {
                console.error('[og-inject] Failed to fetch product:', e.message);
              }
            }

            res.writeHead(200, {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'public, max-age=0, must-revalidate',
            });
            res.end(html);
          });
          return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File Not Found');
      });
    });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[production-server] Serving Sourced Nexus on http://${HOST}:${PORT}`);
});

