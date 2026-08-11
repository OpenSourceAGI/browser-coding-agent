import { createOpenDSRouter } from "../server/router.js";
import { R2BindingStore, type R2BucketLike } from "../server/object-store.js";
import { createCloudflareSandbox } from "../server/sandbox.js";
import type {
  Authorize,
  OpenDSServerConfig,
  SandboxServerConfig,
} from "../server/types.js";
import type {
  SandboxInstanceLike,
  SandboxNamespaceLike,
} from "../server/sandbox.js";

export interface OpenDSWorkerEnv {
  /** R2 bucket holding every workspace. */
  WORKSPACES?: R2BucketLike;
  /** Static assets: the vscode-web build plus the bridge extension. */
  ASSETS?: { fetch(request: Request): Promise<Response> };
  /** Durable Object namespace for `@cloudflare/sandbox`. */
  Sandbox?: SandboxNamespaceLike;
  SHELL_TICKET_SECRET?: string;
  R2_BUCKET_NAME?: string;
  R2_ACCOUNT_ID?: string;
  [key: string]: unknown;
}

export interface OpenDSWorkerOptions
  extends Omit<OpenDSServerConfig, "authorize" | "store" | "sandbox"> {
  authorize: Authorize;
  /**
   * `getSandbox` from `@cloudflare/sandbox`. Pass it only if you want cloud
   * terminals — leaving it out keeps the SDK out of the bundle entirely, so the
   * Worker has no container binding to cold-start.
   */
  getSandbox?: (
    namespace: SandboxNamespaceLike,
    id: string,
    options?: Record<string, unknown>,
  ) => SandboxInstanceLike;
}

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
 */
export function createOpenDSWorker(options: OpenDSWorkerOptions): {
  fetch(request: Request, env: OpenDSWorkerEnv): Promise<Response>;
} {
  const basePath = options.basePath ?? "/api/opends";

  return {
    async fetch(request: Request, env: OpenDSWorkerEnv): Promise<Response> {
      const url = new URL(request.url);

      if (!url.pathname.startsWith(basePath)) {
        if (env.ASSETS) return env.ASSETS.fetch(request);
        return new Response("not found", { status: 404 });
      }

      const sandbox = buildSandboxConfig(env, options);

      const handle = createOpenDSRouter({
        ...options,
        basePath,
        ...(env.WORKSPACES ? { store: new R2BindingStore(env.WORKSPACES) } : {}),
        ...(sandbox ? { sandbox } : {}),
      });

      return handle(request);
    },
  };
}

function buildSandboxConfig(
  env: OpenDSWorkerEnv,
  options: OpenDSWorkerOptions,
): SandboxServerConfig | undefined {
  if (!options.getSandbox || !env.Sandbox) return undefined;
  if (!env.SHELL_TICKET_SECRET) {
    // Failing closed is the right call: without a secret the WebSocket ticket
    // would be forgeable, and that ticket is the only thing standing between a
    // stranger and a shell in someone else's workspace.
    console.warn(
      "[opends] SHELL_TICKET_SECRET is not set — cloud terminals are disabled",
    );
    return undefined;
  }

  return createCloudflareSandbox({
    namespace: env.Sandbox,
    getSandbox: options.getSandbox,
    ticketSecret: env.SHELL_TICKET_SECRET,
    ...(env.R2_BUCKET_NAME ? { bucketName: env.R2_BUCKET_NAME } : {}),
    ...(env.R2_ACCOUNT_ID
      ? { endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` }
      : {}),
    ...(options.keyPrefix ? { keyPrefix: options.keyPrefix } : {}),
  });
}

export type { OpenDSServerConfig } from "../server/types.js";
