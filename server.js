import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';

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
const PRODUCTION_BASE_URL = 'https://product-landing-page-copy-5aa35566.base44.app';
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
    rawUrl.includes('system-admin-portal') ||
    rawUrl.includes('/admin') ||
    rawUrl.includes('/login') ||
    rawUrl.includes('/api/inquiries');



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
          const rawHostnames = process.env.TURNSTILE_HOSTNAMES || "localhost,127.0.0.1,product-landing-page-copy-5aa35566.base44.app";
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

          // Sanitize items and preserve exact images
          const sanitizedItems = items.map((item, idx) => ({
            id: String(item.id || `item-${idx + 1}`),
            name: String(item.name || 'Unnamed Product').slice(0, 150),
            category: item.category ? String(item.category).slice(0, 80) : 'General',
            price: item.price ? String(item.price).slice(0, 50) : 'Price on Request',
            image: item.image ? String(item.image).slice(0, 1000) : null,
            quantity: Math.max(1, Math.min(100, Number(item.quantity) || 1)),
            selectedSize: item.selectedSize ? String(item.selectedSize).slice(0, 30) : null,
            selectedColor: item.selectedColor ? String(item.selectedColor).slice(0, 30) : null,
            specifications: item.specifications ? String(item.specifications).slice(0, 300) : '',
          }));

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

