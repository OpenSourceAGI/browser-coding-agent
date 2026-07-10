#!/usr/bin/env node
// Custom Next.js dev/start server that injects COOP + COEP headers on
// every response — including static files from public/ (vscode.html,
// __sw__.js, assets/).  SharedArrayBuffer requires both headers on EVERY
// document and worker, including the iframe that hosts vscode.html.

import { createServer } from "http";
import { parse } from "url";
import next from "next";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT ?? "3001", 10);
const app = next({ dev });
const handle = app.getRequestHandler();

const COOP_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

await app.prepare();

const server = createServer((req, res) => {
  for (const [k, v] of Object.entries(COOP_HEADERS)) {
    res.setHeader(k, v);
  }
  const parsedUrl = parse(req.url, true);
  handle(req, res, parsedUrl);
});

server.listen(port, () => {
  console.log(`> Ready on http://localhost:${port} (${dev ? "dev" : "prod"})`);
  console.log(`> OpenVSCode IDE: http://localhost:${port}/vscode`);
});
