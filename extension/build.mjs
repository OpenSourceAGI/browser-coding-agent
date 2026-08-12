import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import esbuild from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");

/**
 * The extension runs in VS Code's *web* extension host — a Web Worker. No Node
 * built-ins, no `require` of anything outside the bundle, and `vscode` is
 * provided by the host at runtime, so it stays external.
 */
const options = {
  entryPoints: [resolve(here, "src/extension.ts")],
  outfile: resolve(here, "dist/extension.js"),
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: ["es2021"],
  external: ["vscode"],
  sourcemap: true,
  minify: !watch,
  logLevel: "info",
  define: { "process.env.NODE_ENV": watch ? '"development"' : '"production"' },
};

if (watch) {
  const context = await esbuild.context(options);
  await context.watch();
  console.log("[opends-bridge] watching…");
} else {
  await esbuild.build(options);
  console.log("[opends-bridge] built dist/extension.js");
}
