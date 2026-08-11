import { defineConfig } from "vite";

/**
 * The workbench is built on its own, straight to `public/workbench/`.
 *
 * Keeping it out of the vinext/RSC build is deliberate: monaco-vscode-api
 * pulls in thousands of modules, its own web workers, and CSS that assumes a
 * plain browser entry. Bundling it separately means a change to the marketing
 * page can never break the IDE, and vice versa.
 */
export default defineConfig({
  base: "/workbench/",
  build: {
    outDir: "public/workbench",
    emptyOutDir: true,
    target: "es2022",
    // The workbench is one large app; splitting it further just adds
    // round-trips before the first paint.
    chunkSizeWarningLimit: 8000,
    rollupOptions: {
      input: { workbench: "workbench.html" },
    },
  },
  worker: {
    // VS Code's workers use ESM imports; the classic worker format cannot
    // load them.
    format: "es",
  },
  optimizeDeps: {
    // These packages ship thousands of small ESM files. Without pre-bundling,
    // a dev server cold start issues one request per module.
    include: ["vscode-textmate", "vscode-oniguruma"],
    esbuildOptions: { target: "es2022" },
  },
  define: {
    // Nodepod's bundled polyfills check this; leaving it undefined throws
    // inside the module graph at import time.
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV ?? "production",
    ),
  },
  server: {
    headers: {
      // SharedArrayBuffer powers Nodepod's synchronous cross-worker VFS.
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    },
  },
});
