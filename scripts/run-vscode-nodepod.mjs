#!/usr/bin/env node
import { createServer } from 'http';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { dir: './out', port: 3000, entry: 'vscode.html', swSource: 'node_modules/@scelar/nodepod/dist/__sw__.js' };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dir' && args[i+1]) out.dir = args[++i];
    else if (a === '--port' && args[i+1]) out.port = Number(args[++i]);
    else if (a === '--entry' && args[i+1]) out.entry = args[++i];
    else if (a === '--sw' && args[i+1]) out.swSource = args[++i];
  }
  return out;
}

function contentTypeByExt(ext) {
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.wasm': 'application/wasm'
  }[ext] || 'application/octet-stream';
}

async function main() {
  const opts = parseArgs();
  const dir = path.resolve(opts.dir);
  const port = opts.port;
  const entry = opts.entry;
  const swSrc = path.resolve(opts.swSource);
  const swDest = path.join(dir, '__sw__.js');

  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (e) {}

  try {
    await fs.copyFile(swSrc, swDest);
    console.log('Copied service worker to', swDest);
  } catch (err) {
    console.error('Warning: could not copy service worker from', swSrc, '\n', err.message);
  }

  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url, `http://localhost`).pathname);
      let filePath = path.join(dir, urlPath);
      // If requesting root, serve entry
      if (urlPath === '/' || urlPath === '') {
        filePath = path.join(dir, entry);
      }
      // Prevent directory traversal
      if (!filePath.startsWith(dir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      const stat = await fs.stat(filePath).catch(() => null);
      if (!stat) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      if (stat.isDirectory()) {
        const indexFile = path.join(filePath, entry);
        const idxStat = await fs.stat(indexFile).catch(() => null);
        if (idxStat) filePath = indexFile;
        else {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
      }

      const data = await fs.readFile(filePath);
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': contentTypeByExt(ext) });
      res.end(data);
    } catch (err) {
      res.writeHead(500);
      res.end('Server error');
      console.error(err);
    }
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}/`;
    console.log('Serving', dir, 'at', url);
    console.log('Entry:', entry);
    // Try to open browser on Linux/macOS
    const opener = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    try {
      spawn(opener, [url], { stdio: 'ignore', detached: true }).unref();
    } catch (e) {}
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
