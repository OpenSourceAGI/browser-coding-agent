import { cloudflare } from "@cloudflare/vite-plugin";
import { opendsVinext } from "@opensourceagi/opends-code/vinext";
import { defineConfig } from "vite";
import vinext from "vinext";

/**
 * Three plugins, in this order.
 *
 * `vinext()` builds the Next app (RSC + SSR + client). `opendsVinext()` adds
 * the two things the app cannot do for itself: cross-origin isolation on the
 * dev server, and a `_headers` file in the client build so Cloudflare's asset
 * layer serves the workbench isolated in production. `cloudflare()` runs the
 * result in workerd, using `main` from wrangler.jsonc — our Worker entry, which
 * mounts the OpenDS routes in front of the app router.
 */
export default defineConfig({
  plugins: [
    vinext(),
    opendsVinext(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
    }),
  ],
});
