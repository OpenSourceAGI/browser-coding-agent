import { R2BindingStore, type R2BucketLike } from "../server/object-store.js";
import { createCloudflareSandbox } from "../server/sandbox.js";
import type {
  SandboxInstanceLike,
  SandboxNamespaceLike,
} from "../server/sandbox.js";
import type { Authorize, SandboxServerConfig } from "../server/types.js";
import type { ObjectStore } from "../server/object-store.js";

/**
 * Turning a Worker `env` into server config.
 *
 * Shared by the two Worker entries (`/worker` for a Worker that owns the whole
 * origin, `/vinext` for one that sits in front of a Next-on-Vite app) so that
 * "which bindings mean what" is written down exactly once.
 */

export interface OpenDSWorkerEnv {
  /** R2 bucket holding every workspace. */
  WORKSPACES?: R2BucketLike;
  /** Static assets: the vscode-web build plus the bridge extension. */
  ASSETS?: { fetch(request: Request): Promise<Response> | Response };
  /** Durable Object namespace for `@cloudflare/sandbox`. */
  Sandbox?: SandboxNamespaceLike;
  SHELL_TICKET_SECRET?: string;
  R2_BUCKET_NAME?: string;
  R2_ACCOUNT_ID?: string;
  [key: string]: unknown;
}

/**
 * `getSandbox` as exported by `@cloudflare/sandbox`.
 *
 * The namespace parameter is deliberately untyped. The real signature is
 * generic over the host's own `DurableObjectNamespace<Sandbox>`, and a
 * structural stand-in can never be assignable to it in parameter position —
 * declaring it narrowly would make the SDK's own function fail to type-check at
 * every call site. What the namespace *is* is checked where it is used, in
 * `createCloudflareSandbox`.
 */
export type GetSandbox = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  namespace: any,
  id: string,
  options?: Record<string, unknown>,
) => SandboxInstanceLike;

/**
 * The host's own `Env`, seen as the bindings this package looks for.
 *
 * Worker entries are generic over `Env extends object` rather than
 * `Env extends OpenDSWorkerEnv`, so an app can keep its generated wrangler
 * types — `WORKSPACES: R2Bucket`, `Sandbox: DurableObjectNamespace<Sandbox>` —
 * without them having to be structurally assignable to the loose stand-ins
 * used here. Every read below is optional and guarded, so a binding that is
 * absent or of another shape disables the feature that needs it rather than
 * breaking the request.
 */
export function asWorkerEnv(env: object | undefined): OpenDSWorkerEnv | undefined {
  return env as OpenDSWorkerEnv | undefined;
}

/**
 * `authorize`, plus the bindings.
 *
 * Session lookups on Workers usually need one — a KV namespace, D1, a JWT
 * secret in `env` — and a route handler is called too late to reach for it. The
 * plain `Authorize` signature is assignable to this one, so hosts that only
 * look at the request are unaffected.
 */
export type WorkerAuthorize<Env extends object = OpenDSWorkerEnv> = (
  request: Request,
  env?: Env,
) => ReturnType<Authorize>;

export interface OpenDSEnvOptions<
  Env extends object = OpenDSWorkerEnv,
> {
  authorize: WorkerAuthorize<Env>;
  /**
   * `getSandbox` from `@cloudflare/sandbox`. Pass it only if you want cloud
   * terminals — leaving it out keeps the SDK out of the bundle entirely, so the
   * Worker has no container binding to cold-start.
   */
  getSandbox?: GetSandbox;
  /** Key prefix inside the bucket. Defaults to `workspaces`. */
  keyPrefix?: string;
}

/** The part of the options `openDSConfigFromEnv` actually reads. */
export type SandboxEnvOptions = Pick<
  OpenDSEnvOptions,
  "getSandbox" | "keyPrefix"
>;

/**
 * The bindings-derived half of the server config: storage and, if the
 * deployment asked for it, the container terminal. Everything else (auth,
 * workbench options) comes from the host and is merged over this.
 */
export function openDSConfigFromEnv(
  env: OpenDSWorkerEnv | undefined,
  options: SandboxEnvOptions,
): { store?: ObjectStore; sandbox?: SandboxServerConfig } {
  if (!env) return {};

  const sandbox = sandboxFromEnv(env, options);
  return {
    ...(env.WORKSPACES ? { store: new R2BindingStore(env.WORKSPACES) } : {}),
    ...(sandbox ? { sandbox } : {}),
  };
}

function sandboxFromEnv(
  env: OpenDSWorkerEnv,
  options: SandboxEnvOptions,
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
