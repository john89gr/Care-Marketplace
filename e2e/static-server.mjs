/**
 * Minimal static server for the built Angular app (dist/care-marketplace/browser).
 * - Real asset requests (paths with an extension) are served from disk, 404 if missing.
 * - Extensionless paths are client-side routes -> index.html (SPA fallback).
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const DIST = join(process.cwd(), 'dist', 'care-marketplace', 'browser');
const PORT = 4200;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') {
      pathname = '/index.html';
    }
    const filePath = normalize(join(DIST, pathname));
    if (!filePath.startsWith(DIST)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    let body;
    if (extname(pathname)) {
      // Real asset — do not fall back, a missing chunk must 404 loudly.
      try {
        body = await readFile(filePath);
      } catch {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[extname(pathname)] ?? 'application/octet-stream' });
    } else {
      // Client-side route (e.g. /register, /chat) — serve the SPA shell.
      body = await readFile(join(DIST, 'index.html'));
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
    }
    res.end(body);
  } catch (error) {
    res.writeHead(500);
    res.end(`Server error: ${error instanceof Error ? error.message : String(error)}`);
  }
});

server.listen(PORT, () => {
  console.log(`Static server: http://localhost:${PORT} (${DIST})`);
});
