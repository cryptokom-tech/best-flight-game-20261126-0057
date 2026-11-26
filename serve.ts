// Local play server for Arus Langit: serves game/ on http://localhost:8080
// so the game can be opened in a desktop browser. Node standard library
// only; the entry itself needs no server beyond any static file host.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'game');
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

const server = createServer((req, res) => {
  const path = req.url.split('?')[0];
  const file = join(root, path === '/' ? 'index.html' : path);
  if (!existsSync(file) || !file.startsWith(root)) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  try {
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(500);
    res.end('error');
  }
});
server.listen(8080, '127.0.0.1', () => console.log('Arus Langit at http://localhost:8080'));
