#!/usr/bin/env node
// Copies the built Nodepod IDE assets (out/) into wedit/public/
// so that Next.js can serve vscode.html and its asset bundle.
// Run this before starting the wedit dev server or after rebuilding the IDE.

import { cpSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "out");
const dest = resolve(root, "wedit", "public");

if (!existsSync(src)) {
  console.error(
    `[copy-ide-assets] ERROR: ${src} not found.\n` +
      `Run "npm run build:ide" from the repo root first to build the IDE bundle.`
  );
  process.exit(1);
}

// Copy assets/ dir and vscode.html
cpSync(resolve(src, "assets"), resolve(dest, "assets"), { recursive: true });
cpSync(resolve(src, "vscode.html"), resolve(dest, "vscode.html"));

// Copy the service worker (needed for Nodepod WASM threads)
const swSrc = resolve(src, "__sw__.js");
const swDest = resolve(dest, "__sw__.js");
if (existsSync(swSrc)) {
  cpSync(swSrc, swDest);
}

console.log(`[copy-ide-assets] Copied IDE assets from ${src} → ${dest}`);
