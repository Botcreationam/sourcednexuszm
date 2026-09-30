import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, 'dist');
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

const server = http.createServer((req, res) => {
  // Normalize URL and remove query params
  const reqUrl = (req.url || '/').split('?')[0];
  const safePath = path.normalize(reqUrl).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(DIST_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    fs.readFile(filePath, (readErr, content) => {
      if (!readErr) {
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        
        // Cache immutable hashed assets for 1 year, others no-cache
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

      // If file not found and doesn't look like a static asset, serve index.html (SPA Fallback)
      if (!path.extname(reqUrl)) {
        const indexPath = path.join(DIST_DIR, 'index.html');
        fs.readFile(indexPath, (indexErr, indexHtml) => {
          if (!indexErr) {
            res.writeHead(200, {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'public, max-age=0, must-revalidate'
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

server.listen(PORT, HOST, () => {
  console.log(`[production-server] Serving Sourced Nexus on http://${HOST}:${PORT}`);
});
