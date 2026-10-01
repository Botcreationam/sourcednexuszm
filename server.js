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

// Helmet security headers middleware
const helmetHandler = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https://*.supabase.co",
        "https://media.base44.com",
        "https://*.base44.com",
        "https://images.unsplash.com"
      ],
      connectSrc: [
        "'self'",
        "https://*.supabase.co",
        "wss://*.supabase.co",
        "https://*.base44.com",
        "https://api.base44.com"
      ],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
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

  // 4. Rate limiting check
  const ip = getClientIp(req);
  const rawUrl = req.url || '/';
  const isSensitive = rawUrl.includes('system-admin-portal') || rawUrl.includes('/admin') || rawUrl.includes('/login');

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

          res.writeHead(200, headers);
          res.end(content);
          return;
        }

        // SPA Fallback for client-side routing
        if (!path.extname(reqUrl)) {
          const indexPath = path.join(DIST_DIR, 'index.html');
          fs.readFile(indexPath, (indexErr, indexHtml) => {
            if (!indexErr) {
              res.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'public, max-age=0, must-revalidate',
              });
              res.end(indexHtml);
              return;
            }
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found (dist/index.html missing, run npm run build first)');
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

