import { createOpenDSRouter } from "../server/router.js";
import { asWorkerEnv, openDSConfigFromEnv } from "../worker/env.js";
import {
  applyIsolationHeaders,
  CROSS_ORIGIN_ISOLATION_HEADERS,
} from "../workbench/html.js";
import type { OpenDSEnvOptions, OpenDSWorkerEnv } from "../worker/env.js";
import type { OpenDSServerConfig } from "../server/types.js";

/**
 * vinext (Next.js on Vite) running on Cloudflare Workers.
 *
 * `/next` targets a Next.js server that owns the request: `next.config`
 * `headers()` covers every response and route handlers are the only server
 * code. On Workers neither holds.
 *
 *   • Static assets are served by the `ASSETS` binding *before* the Worker
 *     runs, so nothing in the app can put COOP/COEP on them. Nodepod needs
 *     `SharedArrayBuffer`, `SharedArrayBuffer` needs cross-origin isolation,
 *     and isolation is a property of the whole origin — one un-isolated
 *     document is enough to lose it. `_headers` fixes it at the asset layer;
 *     `opendsVinext()` emits that file, and the Worker below covers everything
 *     the asset layer does not answer.
 *   • Bindings (R2, the Sandbox namespace) live on `env`, which a route handler
 *     never sees. The Worker entry has it, so the storage config is built there
 *     and the routes are served before the app router is consulted.
 *
 * The result is one Worker: OpenDS routes first, the Next app after, isolation
 * on both.
 */

export interface FetchHandlerLike {
  fetch(
    request: Request,
    env?: unknown,
    ctx?: unknown,
  ): Promise<Response> | Response;
}

export interface OpenDSVinextOptions<
  Env extends object = OpenDSWorkerEnv,
> extends Omit<OpenDSServerConfig, "authorize" | "store" | "sandbox">,
    OpenDSEnvOptions<Env> {
  /**
   * vinext's App Router entry — the handler this Worker falls through to.
   *
   * ```ts
   * import handler from "vinext/server/app-router-entry";
   * ```
   */
  handler: FetchHandlerLike;

  /**
   * `serveSW` from `@scelar/nodepod/server`, mounted at `serviceWorkerPath`.
   *
   * **Not for Workers.** That helper locates `__sw__.js` with `node:fs` and
   * `import.meta.url`, neither of which survives the workerd bundle — it throws
   * at request time. On Cloudflare, copy the file into `public/` instead:
   *
   * ```sh
   * cp node_modules/@scelar/nodepod/dist/__sw__.js public/__sw__.js
   * ```
   *
   * The asset layer then serves it (with the `Service-Worker-Allowed` header
   * `opendsVinext()` writes) and this option stays unused. It is kept for hosts
   * that run the same Worker entry on Node, e.g. under `vinext start`.
   */
  serveSW?: (request: Request) => Promise<Response> | Response;

  /** Where the Nodepod service worker is served. Defaults to `/__sw__.js`. */
  serviceWorkerPath?: string;

  /**
   * Stamp COOP/COEP/CORP onto every response this Worker returns. Defaults to
   * true. Turn it off only if something upstream (a `_headers` file covering
   * the whole origin, a CDN rule) already does it.
   */
  crossOriginIsolation?: boolean;
}

/**
 * Worker entry for a vinext app that embeds the editor.
 *
 * ```ts
 * // worker/index.ts
 * import handler from "vinext/server/app-router-entry";
 * import { createOpenDSVinextWorker } from "@opensourceagi/opends-code/vinext";
 * import { serveSW } from "@scelar/nodepod/server";
 * import { Sandbox, getSandbox } from "@cloudflare/sandbox";
 *
 * export { Sandbox };
 * export default createOpenDSVinextWorker({
 *   handler,
 *   serveSW,
 *   getSandbox,
 *   authorize: (request) => verifySession(request),
 * });
 * ```
 *
 * Point `main` in `wrangler.jsonc` at that file; vinext uses `worker/index.ts`
 * as the Worker entry when it exists, in place of its own.
 */
export function createOpenDSVinextWorker<
  Env extends object = OpenDSWorkerEnv,
>(
  options: OpenDSVinextOptions<Env>,
): {
  fetch(request: Request, env?: Env, ctx?: unknown): Promise<Response>;
} {
  const basePath = (options.basePath ?? "/api/opends").replace(/\/+$/, "");
  const swPath = options.serviceWorkerPath ?? "/__sw__.js";
  const isolate =
    options.crossOriginIsolation === false
      ? (response: Response) => response
      : applyIsolationHeaders;

  // `env` is stable for the life of an isolate, so the route table (and the R2
  // wrapper it closes over) is built once rather than per request.
  const routers = new WeakMap<object, (request: Request) => Promise<Response>>();

  function routerFor(env: Env | undefined) {
    const config = (): OpenDSServerConfig => ({
      ...options,
      basePath,
      authorize: (request) => options.authorize(request, env),
      ...openDSConfigFromEnv(asWorkerEnv(env), options),
    });
    if (!env) return createOpenDSRouter(config());

    let handle = routers.get(env);
    if (!handle) {
      handle = createOpenDSRouter(config());
      routers.set(env, handle);
    }
    return handle;
  }

  return {
    async fetch(
      request: Request,
      env?: Env,
      ctx?: unknown,
    ): Promise<Response> {
      const url = new URL(request.url);

      if (options.serveSW && url.pathname === swPath) {
        return isolate(await options.serveSW(request));
      }

      if (isUnder(url.pathname, basePath)) {
        return isolate(await routerFor(env)(request));
      }

      return isolate(await options.handler.fetch(request, env, ctx));
    },
  };
}

/**
 * App Router handlers for hosts that would rather mount the routes as a
 * catch-all route than in the Worker entry.
 *
 * The config is resolved per request so the R2 binding can be read from
 * `cloudflare:workers` — which is the only way a route handler reaches it:
 *
 * ```ts
 * // app/api/opends/[...path]/route.ts
 * import { env } from "cloudflare:workers";
 * import { createOpenDSVinextHandlers } from "@opensourceagi/opends-code/vinext";
 *
 * export const { GET, POST, PUT, DELETE } = createOpenDSVinextHandlers({
 *   env: () => env,
 *   authorize: (request) => verifySession(request),
 * });
 * ```
 *
 * Note that this covers the routes only. Static assets still bypass the app
 * entirely, so `opendsVinext()` (or a hand-written `_headers`) is required
 * either way.
 */
export function createOpenDSVinextHandlers<
  Env extends object = OpenDSWorkerEnv,
>(
  options: Omit<OpenDSVinextOptions<Env>, "handler" | "serveSW"> & {
    /** Reads the Worker `env`, e.g. `() => env` from `cloudflare:workers`. */
    env?: () => Env | undefined;
  },
): {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
  PUT: (request: Request) => Promise<Response>;
  DELETE: (request: Request) => Promise<Response>;
  HEAD: (request: Request) => Promise<Response>;
  OPTIONS: (request: Request) => Promise<Response>;
} {
  const basePath = (options.basePath ?? "/api/opends").replace(/\/+$/, "");
  const isolate =
    options.crossOriginIsolation === false
      ? (response: Response) => response
      : applyIsolationHeaders;

  const handle = createOpenDSRouter(() => {
    const env = options.env?.();
    return {
      ...options,
      basePath,
      authorize: (request: Request) => options.authorize(request, env),
      ...openDSConfigFromEnv(asWorkerEnv(env), options),
    };
  });

  const wrapped = async (request: Request) => isolate(await handle(request));
  return {
    GET: wrapped,
    POST: wrapped,
    PUT: wrapped,
    DELETE: wrapped,
    HEAD: wrapped,
    OPTIONS: wrapped,
  };
}

/* -------------------------------------------------------------------------- */
/* Build-time: the Vite plugin                                                 */
/* -------------------------------------------------------------------------- */

export interface OpenDSVitePluginOptions {
  /**
   * Serve the dev and preview servers cross-origin isolated. Defaults to true.
   * Without it `vite dev` has no `SharedArrayBuffer`, so the editor boots into
   * its slower fallback and `execSync`-style calls fail — a difference from
   * production that is easy to mistake for a bug in the app.
   */
  crossOriginIsolation?: boolean;

  /**
   * Emit a `_headers` file into the client build so Cloudflare's asset layer
   * serves the workbench isolated. Defaults to true. A `public/_headers` of
   * your own is copied over this one, so it stays overridable.
   */
  emitHeadersFile?: boolean;

  /** Paths the isolation rules apply to. Defaults to the whole origin. */
  headerPaths?: string[];

  /**
   * Path the Nodepod service worker is staged at, given a
   * `Service-Worker-Allowed: /` rule so it can claim the whole origin from a
   * nested path. Defaults to `/__sw__.js`; pass `null` to emit no rule.
   */
  serviceWorkerPath?: string | null;

  /**
   * Dependencies kept out of Vite's dependency pre-bundling. Defaults to
   * `["@scelar/nodepod"]`: the runtime resolves its own worker and WASM assets
   * relative to its module URL, and pre-bundling rewrites those URLs.
   */
  excludeFromOptimize?: string[];
}

/** The slice of Rollup's plugin context this plugin uses. */
interface EmitContext {
  emitFile(file: { type: "asset"; fileName: string; source: string }): void;
  environment?: { name?: string };
}

export interface OpenDSVitePlugin {
  name: string;
  config(): Record<string, unknown>;
  generateBundle(this: EmitContext): void;
}

/**
 * Vite plugin for a vinext app that embeds the editor.
 *
 * ```ts
 * // vite.config.ts
 * import { cloudflare } from "@cloudflare/vite-plugin";
 * import { defineConfig } from "vite";
 * import vinext from "vinext";
 * import { opendsVinext } from "@opensourceagi/opends-code/vinext";
 *
 * export default defineConfig({
 *   plugins: [
 *     vinext(),
 *     opendsVinext(),
 *     cloudflare({ viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] } }),
 *   ],
 * });
 * ```
 *
 * It does the two build-time things the runtime cannot: isolate the dev server,
 * and write the `_headers` that isolates deployed static assets.
 */
export function opendsVinext(
  options: OpenDSVitePluginOptions = {},
): OpenDSVitePlugin {
  const isolate = options.crossOriginIsolation !== false;
  const emitHeaders = options.emitHeadersFile !== false;
  const exclude = options.excludeFromOptimize ?? ["@scelar/nodepod"];

  return {
    name: "opends-code:vinext",

    config() {
      const headers = isolate ? { ...CROSS_ORIGIN_ISOLATION_HEADERS } : {};
      return {
        ...(isolate
          ? { server: { headers }, preview: { headers } }
          : {}),
        ...(exclude.length ? { optimizeDeps: { exclude } } : {}),
      };
    },

    generateBundle(this: EmitContext) {
      if (!emitHeaders) return;
      // vinext builds three environments (client, ssr, rsc). Only the client
      // one becomes the asset directory Cloudflare serves.
      const environment = this.environment?.name;
      if (environment && environment !== "client") return;

      this.emitFile({
        type: "asset",
        fileName: "_headers",
        source: openDSAssetHeaders({
          ...(options.headerPaths ? { paths: options.headerPaths } : {}),
          ...(options.serviceWorkerPath !== undefined
            ? { serviceWorkerPath: options.serviceWorkerPath }
            : {}),
        }),
      });
    },
  };
}

export interface OpenDSAssetHeaderOptions {
  /** Paths the isolation rules apply to. Defaults to `["/*"]`. */
  paths?: string[];
  /** Path of the staged Nodepod service worker, or `null` for no rule. */
  serviceWorkerPath?: string | null;
}

/**
 * The `_headers` file contents.
 *
 * Cloudflare's static-asset layer answers matching requests without ever
 * invoking the Worker, so this — not the Worker, and not `next.config`
 * `headers()` — is what isolates the workbench bundle, the bridge extension and
 * every other file under `public/`.
 *
 * The service worker gets one rule of its own. Nodepod's `__sw__.js` is copied
 * into `public/` rather than served by the Worker (its Node helper reads the
 * file off disk, which workerd cannot do), and `Service-Worker-Allowed` is what
 * lets a script served from a path claim a broader scope.
 */
export function openDSAssetHeaders(
  options: OpenDSAssetHeaderOptions = {},
): string {
  const paths = options.paths ?? ["/*"];
  const swPath =
    options.serviceWorkerPath === undefined
      ? "/__sw__.js"
      : options.serviceWorkerPath;

  const isolation = Object.entries(CROSS_ORIGIN_ISOLATION_HEADERS)
    .map(([key, value]) => `  ${key}: ${value}`)
    .join("\n");

  const blocks = paths.map((path) => `${path}\n${isolation}`);
  if (swPath) blocks.push(`${swPath}\n  Service-Worker-Allowed: /`);

  return `${blocks.join("\n\n")}\n`;
}

function isUnder(pathname: string, basePath: string): boolean {
  if (!basePath) return true;
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

export {
  applyIsolationHeaders,
  CROSS_ORIGIN_ISOLATION_HEADERS,
} from "../workbench/html.js";
export { openDSHeaders } from "../next/index.js";
export type { OpenDSWorkerEnv } from "../worker/env.js";
export type { OpenDSServerConfig } from "../server/types.js";
