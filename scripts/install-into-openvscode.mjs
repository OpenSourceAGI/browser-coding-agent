#!/usr/bin/env node
/**
 * Installs the bridge as a *built-in* extension of an openvscode / VS Code
 * source checkout, for hosts that compile the fork themselves.
 *
 * This is optional. The normal path loads the bridge at runtime through
 * `additionalBuiltinExtensions`, which needs no fork and no rebuild — use this
 * only when you want the extension baked into the web build.
 *
 * Usage:
 *   node scripts/install-into-openvscode.mjs --repo ../openvscode
 */

import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");

const args = parseArgs(process.argv.slice(2));
const repo = resolve(args.repo ?? "../openvscode");
const extensionName = "opends-bridge";

if (!existsSync(repo)) {
  throw new Error(`openvscode checkout not found: ${repo}`);
}

const bundle = join(packageRoot, "extension", "dist", "extension.js");
if (!existsSync(bundle)) {
  throw new Error(
    "extension/dist/extension.js is missing — run `npm run build:extension` first",
  );
}

const target = join(repo, "extensions", extensionName);
mkdirSync(join(target, "dist"), { recursive: true });
copyFileSync(join(packageRoot, "extension", "package.json"), join(target, "package.json"));
cpSync(join(packageRoot, "extension", "dist"), join(target, "dist"), {
  recursive: true,
});
console.log(`Copied the bridge extension to ${target}`);

patchProductJson(join(repo, "product.json"));

console.log(`
Done. Next:
  1. Build the browser-only target (a 'vscode-web-*' gulp task, NOT
     'vscode-reh-web-*' — the REH targets bundle a remote extension host
     server that this architecture does not use).
  2. Stage the output:
       node scripts/fetch-workbench.mjs --out ./public/vscode \\
         --source ${repo}/out-vscode-web-min
`);

/* -------------------------------------------------------------------------- */

function patchProductJson(productPath) {
  if (!existsSync(productPath)) {
    console.warn(`! ${productPath} not found — register the extension manually.`);
    return;
  }

  const product = JSON.parse(readFileSync(productPath, "utf8"));
  const entry = {
    name: `opensourceagi.${extensionName}`,
    path: `extensions/${extensionName}`,
  };

  const builtIn = Array.isArray(product.builtInExtensions)
    ? product.builtInExtensions
    : [];
  if (!builtIn.some((item) => item?.name === entry.name)) {
    builtIn.push(entry);
    product.builtInExtensions = builtIn;
  }

  // Quick Open and global search in a virtual workspace go through proposed
  // APIs; without this grant they return nothing at all.
  product.extensionEnabledApiProposals = {
    ...product.extensionEnabledApiProposals,
    "opensourceagi.opends-bridge": ["fileSearchProvider", "textSearchProvider"],
  };

  writeFileSync(productPath, `${JSON.stringify(product, null, "\t")}\n`);
  console.log(`Patched ${productPath}`);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    if (key) out[key] = argv[i + 1];
  }
  return out;
}
