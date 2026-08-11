import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import vinext from "vinext";

/**
 * The host app only. The workbench is built by `vite.workbench.config.ts`
 * into `public/workbench/` and served as a static asset — keeping VS Code's
 * module graph out of the RSC build.
 */
export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
    }),
  ],
  server: {
    headers: {
      // Required for SharedArrayBuffer, which Nodepod uses for synchronous
      // cross-worker filesystem access.
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    },
  },
});
