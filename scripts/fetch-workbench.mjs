#!/usr/bin/env node
/**
 * Stages the static workbench assets a host app needs to serve.
 *
 * The editor is plain static hosting — no `vscode-server`, no remote extension
 * host — so "installing" it means dropping a build into `public/`.
 *
 * Two sources:
 *   --source npm            (default) the prebuilt `vscode-web` package
 *   --source <path>         a local build, e.g. openvscode's out-vscode-web-min
 *
 * Usage:
 *   node scripts/fetch-workbench.mjs --out ./public/vscode
 *   node scripts/fetch-workbench.mjs --out ./public/vscode --version 1.91.1
 *   node scripts/fetch-workbench.mjs --out ./public/vscode --source ../openvscode/out-vscode-web-min
 */

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const outDir = resolve(args.out ?? "./public/vscode");
const source = args.source ?? "npm";
const version = args.version ?? "1.91.1";

if (source === "npm") {
  fetchFromNpm();
} else {
  copyLocalBuild(resolve(source));
}

verify(outDir);
console.log(`\nWorkbench staged at ${outDir}`);
console.log(
  "Serve it at the same origin as your app and point `workbenchBaseUrl` at it.",
);

/* -------------------------------------------------------------------------- */

function fetchFromNpm() {
  const staging = mkdtempSync(join(tmpdir(), "opends-workbench-"));
  try {
    console.log(`Downloading vscode-web@${version}…`);
    const tarball = execFileSync(
      "npm",
      ["pack", `vscode-web@${version}`, "--silent", "--pack-destination", staging],
      { encoding: "utf8" },
    ).trim();

    execFileSync("tar", ["xzf", join(staging, tarball), "-C", staging]);

    const dist = join(staging, "package", "dist");
    if (!existsSync(dist)) {
      throw new Error(`unexpected package layout: ${dist} is missing`);
    }

    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    cpSync(dist, outDir, { recursive: true });
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function copyLocalBuild(dir) {
  if (!existsSync(dir)) throw new Error(`source directory not found: ${dir}`);
  console.log(`Copying workbench build from ${dir}…`);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(dir, outDir, { recursive: true });
}

/**
 * A missing `workbench.js` is the failure that produces a blank page with no
 * console error, so check for it here where the message can be useful.
 */
function verify(dir) {
  const required = [
    "out/vs/loader.js",
    "out/vs/webPackagePaths.js",
    "out/vs/workbench/workbench.web.main.js",
    "out/vs/workbench/workbench.web.main.css",
    "out/vs/code/browser/workbench/workbench.js",
  ];
  const missing = required.filter((file) => !existsSync(join(dir, file)));
  if (missing.length > 0) {
    throw new Error(
      `workbench build is incomplete — missing:\n  ${missing.join("\n  ")}`,
    );
  }
  console.log(`Verified ${required.length} workbench entry points.`);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    if (key) out[key] = argv[i + 1];
  }
  return out;
}
