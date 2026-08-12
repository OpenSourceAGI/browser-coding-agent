import { createOpenDSVinextWorker } from "@opensourceagi/opends-code/vinext";
import type { AuthContext } from "@opensourceagi/opends-code/server";
import handler from "vinext/server/app-router-entry";

// Remove these two lines together with the `containers`, `durable_objects` and
// `migrations` blocks in wrangler.jsonc to deploy without cloud terminals. The
// editor — files, search, local terminal, npm, persistence — is unaffected.
import { Sandbox, getSandbox } from "@cloudflare/sandbox";
export { Sandbox };

interface Env {
  WORKSPACES?: R2Bucket;
  ASSETS?: Fetcher;
  Sandbox?: DurableObjectNamespace;
  SHELL_TICKET_SECRET?: string;
  ALLOW_ANONYMOUS?: string;
}

/**
 * The only authentication seam.
 *
 * `userId` becomes the R2 key prefix, so it decides which workspace the caller
 * gets — return it from whatever session the app already has (NextAuth, Clerk,
 * better-auth, a signed cookie). `env` is passed through for the common case
 * where that lookup needs a binding.
 *
 * This example has no login, so it fails closed unless `ALLOW_ANONYMOUS` is
 * set: a deployment that hands every visitor the same `userId` is a deployment
 * where every visitor shares one workspace.
 */
async function authorize(
  request: Request,
  env?: Env,
): Promise<AuthContext | null> {
  if (env?.ALLOW_ANONYMOUS !== "1") return null;

  const requested = new URL(request.url).searchParams.get("user") ?? "demo";
  return { userId: requested.replace(/[^a-zA-Z0-9_-]/g, "") || "demo" };
}

/**
 * OpenDS routes first, the Next app after, cross-origin isolation on both.
 *
 * `main` in wrangler.jsonc points here; vinext uses `worker/index.ts` as the
 * Worker entry when it exists, in place of its own.
 */
export default createOpenDSVinextWorker({
  handler,

  // Note what is *not* here: Nodepod's service worker. `serveSW()` reads
  // `__sw__.js` off disk, which workerd cannot do, so `stage:workbench` copies
  // the file into public/ and the asset layer serves it — with the
  // `Service-Worker-Allowed` rule `opendsVinext()` writes into `_headers`.
  authorize,
  getSandbox,

  basePath: "/api/opends",
  workbenchBaseUrl: "/vscode",
  bridgeExtensionUrl: "/opends/extension",
});
