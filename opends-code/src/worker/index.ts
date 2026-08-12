import { createOpenDSRouter } from "../server/router.js";
import { asWorkerEnv, openDSConfigFromEnv } from "./env.js";
import type { OpenDSEnvOptions, OpenDSWorkerEnv } from "./env.js";
import type { OpenDSServerConfig } from "../server/types.js";

export type { OpenDSWorkerEnv, GetSandbox } from "./env.js";
export { openDSConfigFromEnv } from "./env.js";

export interface OpenDSWorkerOptions<
  Env extends object = OpenDSWorkerEnv,
> extends Omit<OpenDSServerConfig, "authorize" | "store" | "sandbox">,
    OpenDSEnvOptions<Env> {}

/**
 * Cloudflare Worker entry.
 *
 * ```js
 * // worker/index.js
 * import { createOpenDSWorker } from "@opensourceagi/opends-code/worker";
 * import { Sandbox, getSandbox } from "@cloudflare/sandbox";
 *
 * export { Sandbox };
 * export default createOpenDSWorker({
 *   authorize: (request) => verifySession(request),
 *   getSandbox,
 * });
 * ```
 *
 * Everything that is not an OpenDS route falls through to the `ASSETS`
 * binding, which serves the workbench build — so the editor is plain static
 * hosting and the Worker only wakes for storage and terminals.
 *
 * For a Worker that also runs a Next.js app (vinext), use
 * `@opensourceagi/opends-code/vinext` instead: same routes, but the fallback is
 * the app router rather than the asset binding.
 */
export function createOpenDSWorker<
  Env extends object = OpenDSWorkerEnv,
>(
  options: OpenDSWorkerOptions<Env>,
): {
  fetch(request: Request, env: Env): Promise<Response>;
} {
  const basePath = options.basePath ?? "/api/opends";

  // One router per `env` object rather than per request: `env` is stable for
  // the life of an isolate, and rebuilding the route table on every fetch would
  // re-allocate the storage wrapper for no reason.
  const routers = new WeakMap<object, (request: Request) => Promise<Response>>();

  function routerFor(env: Env) {
    let handle = routers.get(env);
    if (!handle) {
      handle = createOpenDSRouter({
        ...options,
        basePath,
        authorize: (request) => options.authorize(request, env),
        ...openDSConfigFromEnv(asWorkerEnv(env), options),
      });
      routers.set(env, handle);
    }
    return handle;
  }

  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);

      if (!url.pathname.startsWith(basePath)) {
        const assets = asWorkerEnv(env)?.ASSETS;
        if (assets) return assets.fetch(request);
        return new Response("not found", { status: 404 });
      }

      return routerFor(env)(request);
    },
  };
}

export type { OpenDSServerConfig } from "../server/types.js";
