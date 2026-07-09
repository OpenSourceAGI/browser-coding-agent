// Build config for the in-browser IDE app (ide/ -> out/).
// - nodepod() serves /__sw__.js in dev and emits it into out/ at build
//   time, so preview iframes and virtual HTTP servers work (plan 4.1).
// - COOP/COEP headers enable SharedArrayBuffer (execSync, threaded wasi).
// - The inline process-worker plugin provides virtual:process-worker-bundle,
//   which the runtime needs to spawn Blob URL workers.

import { defineConfig } from "vite";
import topLevelAwait from "vite-plugin-top-level-await";
import wasm from "vite-plugin-wasm";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inlineProcessWorkerPlugin } from "./scripts/vite-plugin-inline-process-worker.mjs";
import nodepod from "./src/integrations/vite";

const repoRoot = dirname(fileURLToPath(import.meta.url));

const crossOriginIsolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

export default defineConfig({
  root: resolve(repoRoot, "ide"),
  plugins: [wasm(), topLevelAwait(), inlineProcessWorkerPlugin(), nodepod()],
  server: {
    headers: crossOriginIsolationHeaders,
    fs: {
      // Allow serving files from openvscode directory
      allow: [
        resolve(repoRoot),
        resolve(repoRoot, "openvscode"),
      ],
    },
    proxy: {
      // Serve OpenVSCode files if they exist
      '/openvscode-server': {
        target: 'http://localhost:5173',
        rewrite: (path) => path.replace(/^\/openvscode-server/, '/openvscode'),
      },
    },
  },
  preview: {
    headers: crossOriginIsolationHeaders,
  },
  build: {
    outDir: resolve(repoRoot, "out"),
    emptyOutDir: true,
    target: "esnext",
    sourcemap: true,
    rollupOptions: {
      input: {
        vscode: resolve(repoRoot, "ide/vscode.html"),
        index: resolve(repoRoot, "ide/index.html"),
      },
    },
  },
  worker: {
    format: "es",
  },
  resolve: {
    alias: {
      '/openvscode-server': resolve(repoRoot, 'openvscode'),
    },
  },
});
