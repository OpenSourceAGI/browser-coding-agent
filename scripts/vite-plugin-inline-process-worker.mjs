// Vite plugin that pre-bundles src/threading/process-worker-entry.ts into a
// self-contained JS string, exposed as `virtual:process-worker-bundle`.
// Consumers of nodepod (Next.js, Webpack, etc.) can't resolve Vite-specific
// worker chunk URLs, so the entire worker bundle is embedded as a string and
// Blob URL workers are created at runtime. Shared by vite.lib.config.js
// (library build) and vite.ide.config.ts (IDE app build).

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { build as esbuild } from "esbuild";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function inlineProcessWorkerPlugin() {
  const VIRTUAL_ID = "virtual:process-worker-bundle";
  const RESOLVED_ID = "\0" + VIRTUAL_ID;
  let workerBundle = "";

  return {
    name: "inline-process-worker",
    async buildStart() {
      const result = await esbuild({
        entryPoints: [resolve(repoRoot, "src/threading/process-worker-entry.ts")],
        bundle: true,
        format: "iife",
        platform: "browser",
        target: "esnext",
        write: false,
        minify: false,
        sourcemap: false,
        // Don't externalize anything — the worker must be fully self-contained
      });
      workerBundle = result.outputFiles[0].text;
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },
    load(id) {
      if (id === RESOLVED_ID) {
        return `export const PROCESS_WORKER_BUNDLE = ${JSON.stringify(workerBundle)};`;
      }
    },
  };
}

export default inlineProcessWorkerPlugin;
