import type {
  AuthContext,
  SandboxServerConfig,
  SandboxStartOptions,
} from "./types.js";

/**
 * Cloudflare Sandbox wiring for the on-demand terminal.
 *
 * Kept in its own module, and reached only from the `/sandbox/*` routes, so the
 * import graph itself enforces the central property of this design: nothing
 * that serves the editor or its files can pull in the Sandbox SDK, and a user
 * who never opens a cloud terminal never causes a container to exist.
 *
 * The SDK is injected rather than imported so this package does not depend on
 * `@cloudflare/sandbox` — Next.js-on-Node deployments never load it at all.
 */

export interface SandboxInstanceLike {
  exec(command: string): Promise<unknown>;
  mountBucket(
    bucket: string,
    mountPath: string,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
  createSession(options: {
    id: string;
    cwd?: string;
    env?: Record<string, string>;
  }): Promise<unknown>;
  terminal(request: Request, options?: { session?: unknown }): Promise<Response>;
  writeFile?(path: string, contents: string | Uint8Array): Promise<unknown>;
}

export interface SandboxNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): unknown;
}

export interface CloudflareSandboxOptions {
  /** The Durable Object namespace binding, i.e. `env.Sandbox`. */
  namespace: SandboxNamespaceLike;
  /** `getSandbox` from `@cloudflare/sandbox`, passed in by the Worker. */
  getSandbox: (
    namespace: SandboxNamespaceLike,
    id: string,
    options?: Record<string, unknown>,
  ) => SandboxInstanceLike;
  /** Secret used to sign the short-lived WebSocket ticket. 32+ bytes. */
  ticketSecret: string;
  /** R2 bucket mounted inside the container so the shell sees the same files. */
  bucketName?: string;
  /** e.g. `https://<account>.r2.cloudflarestorage.com` */
  endpoint?: string;
  /** Where the bucket is mounted. Defaults to `/mnt/r2`. */
  mountRoot?: string;
  /** Key prefix used by the file routes. Defaults to `workspaces`. */
  keyPrefix?: string;
  /** Container idle timeout. Defaults to `20m`. */
  sleepAfter?: string;
  /** Path of the WebSocket route, relative to `basePath`. Defaults to `/sandbox/ws`. */
  wsPath?: string;
  /** How long a minted ticket stays valid. Defaults to 60 seconds. */
  ticketTtlMs?: number;
}

const DEFAULT_MOUNT_ROOT = "/mnt/r2";
const DEFAULT_TICKET_TTL_MS = 60_000;

export function createCloudflareSandbox(
  options: CloudflareSandboxOptions,
): SandboxServerConfig {
  const mountRoot = options.mountRoot ?? DEFAULT_MOUNT_ROOT;
  const keyPrefix = (options.keyPrefix ?? "workspaces").replace(/^\/+|\/+$/g, "");
  const wsPath = options.wsPath ?? "/sandbox/ws";

  const sandboxIdFor = (context: AuthContext) =>
    `shell-${context.workspaceId ?? context.userId}`;

  const workspacePrefix = (context: AuthContext) =>
    `${keyPrefix}/${encodeURIComponent(context.userId)}/${encodeURIComponent(
      context.workspaceId ?? context.userId,
    )}`;

  async function ensureReady(context: AuthContext): Promise<SandboxInstanceLike> {
    const sandbox = options.getSandbox(options.namespace, sandboxIdFor(context), {
      sleepAfter: options.sleepAfter ?? "20m",
    });

    if (options.bucketName) {
      try {
        await sandbox.mountBucket(options.bucketName, mountRoot, {
          ...(options.endpoint ? { endpoint: options.endpoint } : {}),
          credentialProxy: true,
        });
      } catch (error) {
        // Mounting twice is expected on a warm container.
        if (!/already mounted/i.test(String(error))) throw error;
      }

      // Prefix-scoped mounts are not supported by the SDK yet, so the whole
      // bucket is mounted and this user's own prefix is symlinked to
      // /workspace. That hides siblings from casual browsing but is NOT a hard
      // boundary — a user who deliberately walks into the mount root can read
      // other prefixes. Use a bucket per user if that matters to you.
      await sandbox.exec(
        `mkdir -p ${mountRoot}/${workspacePrefix(context)} && ` +
          `ln -sfn ${mountRoot}/${workspacePrefix(context)} /workspace`,
      );
    }

    return sandbox;
  }

  return {
    enabled: true,

    async start(context: AuthContext, startOptions: SandboxStartOptions) {
      await ensureReady(context);

      // A browser cannot set headers on a WebSocket handshake, so authorisation
      // travels as a short-lived signed ticket in the URL instead of a cookie.
      const ticket = await mintTicket(
        options.ticketSecret,
        context,
        options.ticketTtlMs ?? DEFAULT_TICKET_TTL_MS,
      );

      const url = new URL(startOptions.request.url);
      const basePath = url.pathname.replace(/\/sandbox\/start$/, "");
      url.pathname = `${basePath}${wsPath}`;
      url.search = "";
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.searchParams.set("ticket", ticket);
      url.searchParams.set("cols", String(startOptions.cols));
      url.searchParams.set("rows", String(startOptions.rows));

      return { wsUrl: url.toString(), sessionId: sandboxIdFor(context) };
    },

    async terminal(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const context = await verifyTicket(
        options.ticketSecret,
        url.searchParams.get("ticket"),
      );
      if (!context) return new Response("unauthorized", { status: 401 });

      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("expected websocket upgrade", { status: 400 });
      }

      const sandbox = options.getSandbox(
        options.namespace,
        sandboxIdFor(context),
      );

      // One long-lived session per workspace: reloading the tab reattaches to
      // the same shell (and its scrollback) instead of starting over.
      const session = await sandbox.createSession({
        id: "main",
        cwd: "/workspace",
      });

      return sandbox.terminal(request, { session });
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Signed tickets                                                              */
/* -------------------------------------------------------------------------- */

interface TicketPayload {
  u: string;
  w: string;
  exp: number;
}

export async function mintTicket(
  secret: string,
  context: AuthContext,
  ttlMs: number,
): Promise<string> {
  const payload: TicketPayload = {
    u: context.userId,
    w: context.workspaceId ?? context.userId,
    exp: Date.now() + ttlMs,
  };
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await sign(secret, body);
  return `${body}.${signature}`;
}

export async function verifyTicket(
  secret: string,
  ticket: string | null,
): Promise<AuthContext | null> {
  if (!ticket) return null;
  const separator = ticket.lastIndexOf(".");
  if (separator <= 0) return null;

  const body = ticket.slice(0, separator);
  const signature = ticket.slice(separator + 1);

  const expected = await sign(secret, body);
  if (!timingSafeEqual(expected, signature)) return null;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(body)),
    ) as TicketPayload;
    if (!payload.u || Date.now() > payload.exp) return null;
    return { userId: payload.u, workspaceId: payload.w };
  } catch {
    return null;
  }
}

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return base64UrlEncode(new Uint8Array(signature));
}

/** Constant-time compare so a ticket cannot be brute-forced byte by byte. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
