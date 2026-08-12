#!/usr/bin/env node
// Static server for the built workbench, used for smoke tests and for looking
// at the IDE without deploying. It mirrors the three things the Cloudflare
// Worker does that the workbench actually depends on: COOP/COEP headers, the
// Nodepod service worker at the origin root, and the CORS proxy.

import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const WORKBENCH_DIR = join(ROOT, "public", "workbench");
const SW_PATH = join(
  ROOT,
  "node_modules",
  "@scelar",
  "nodepod",
  "dist",
  "__sw__.js",
);
const PORT = Number(process.env.PORT ?? 4321);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
};

// SharedArrayBuffer — and therefore Nodepod's synchronous cross-worker VFS —
// requires both of these on every document and worker response.
const ISOLATION_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  for (const [key, value] of Object.entries(ISOLATION_HEADERS)) {
    res.setHeader(key, value);
  }

  if (url.pathname === "/__sw__.js") {
    const body = await readFile(SW_PATH, "utf8");
    res.writeHead(200, {
      "Content-Type": "text/javascript; charset=utf-8",
      "Service-Worker-Allowed": "/",
      "Cache-Control": "no-cache",
    });
    res.end(body);
    return;
  }

  if (url.pathname.startsWith("/__np__/")) {
    await proxy(url.pathname.slice("/__np__/".length), req, res);
    return;
  }

  if (url.pathname === "/" || url.pathname === "/workbench/") {
    res.writeHead(302, { Location: "/workbench/workbench.html" });
    res.end();
    return;
  }

  const relative = url.pathname.replace(/^\/workbench\//, "");
  // normalize() collapses `..`, so a request cannot escape the build output.
  const filePath = join(WORKBENCH_DIR, normalize(relative));
  if (
    !filePath.startsWith(WORKBENCH_DIR) ||
    !existsSync(filePath) ||
    !statSync(filePath).isFile()
  ) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }

  res.writeHead(200, {
    "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  createReadStream(filePath).pipe(res);
});

async function proxy(encoded, req, res) {
  let target;
  try {
    target = new URL(decodeURIComponent(encoded));
  } catch {
    res.writeHead(400).end("bad proxy target");
    return;
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    res.writeHead(400).end("bad protocol");
    return;
  }
  const upstream = await fetch(target, {
    method: req.method,
    headers: { ...req.headers, host: target.host },
    body: req.method === "GET" || req.method === "HEAD" ? undefined : req,
    duplex: "half",
  });
  res.writeHead(upstream.status, {
    "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(Buffer.from(await upstream.arrayBuffer()));
}

server.listen(PORT, () => {
  console.log(`workbench: http://localhost:${PORT}/workbench/workbench.html`);
});
