import { defineConfig } from "vite";
import topLevelAwait from "vite-plugin-top-level-await";
import wasm from "vite-plugin-wasm";
import { resolve } from "path";
import { readFileSync } from "fs";
import { inlineProcessWorkerPlugin } from "./scripts/vite-plugin-inline-process-worker.mjs";

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "package.json"), "utf-8"),
);
// Only peer deps and Node.js builtins are external.
// Runtime deps (pako, acorn, etc.) are inlined so the bundle is self-contained
// and works in any environment (bundler, browser, etc.) without extra config.
const peerDeps = Object.keys(pkg.peerDependencies || {});
const allExternal = [
  ...peerDeps,
  /^node:/,
  // Framework integrations: keep these external so users' own copies are
  // used and rollup doesn't choke on `next/server` when `next` isn't
  // installed locally.
  "vite",
  "next",
  "next/server",
];

export default defineConfig({
  plugins: [wasm(), topLevelAwait(), inlineProcessWorkerPlugin()],
  worker: {
    format: "es",
    rollupOptions: {
      external: allExternal,
    },
  },
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        // Each framework integration is its own subpath export (see
        // package.json `exports`). Slashes in the key push the output
        // under dist/integrations/*.
        "integrations/server": resolve(
          __dirname,
          "src/integrations/server.ts",
        ),
        "integrations/vite": resolve(__dirname, "src/integrations/vite.ts"),
        "integrations/next": resolve(__dirname, "src/integrations/next.ts"),
        // IDE kit (NodepodFileSystem, ProcessRunner, PreviewManager + UI)
        ide: resolve(__dirname, "src/ide/index.ts"),
      },
      formats: ["es", "cjs"],
      fileName: (format, entryName) => {
        const ext = format === "es" ? "mjs" : "cjs";
        return `${entryName}.${ext}`;
      },
    },
    rollupOptions: {
      external: allExternal,
    },
    sourcemap: true,
    minify: false,
  },
});
