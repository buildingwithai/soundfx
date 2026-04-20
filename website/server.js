import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function resolvePath(urlPath) {
  const cleanPath = urlPath === '/' ? '/index.html' : urlPath;
  const normalized = path.normalize(cleanPath).replace(/^(\.\.[\\/])+/, '');
  return path.join(__dirname, normalized);
}

const server = http.createServer((req, res) => {
  const targetPath = resolvePath(req.url || '/');

  fs.readFile(targetPath, (error, data) => {
    if (error) {
      if (error.code === 'ENOENT') {
        const fallbackPath = path.join(__dirname, 'index.html');
        fs.readFile(fallbackPath, (fallbackError, fallbackData) => {
          if (fallbackError) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Internal server error');
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(fallbackData);
        });
        return;
      }

      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal server error');
      return;
    }

    const ext = path.extname(targetPath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`soundfx website running at http://127.0.0.1:${PORT}`);
});
