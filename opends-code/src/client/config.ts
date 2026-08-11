import type { NodepodBootFn, NodepodLike } from "./nodepod-types.js";
import type { StorageAdapter } from "../storage/types.js";

/**
 * Everything the host application configures. Login is deliberately absent:
 * this package never authenticates anyone. The host passes `apiBase` plus
 * whatever headers its own auth layer needs (`Authorization`, a session cookie
 * via `credentials: "include"`, …) and the server routes hand the request to
 * the host's own `authorize()` hook.
 */
export interface OpenDSCodeConfig {
  /**
   * Stable id for this editing session. Used as the bridge channel name and,
   * when persistence is on, as the storage prefix. Defaults to a random id,
   * which means a fresh (empty) workspace on every reload — pass a real value
   * to get persistence.
   */
  sessionId?: string;

  /** Root of the virtual workspace inside the VFS. Defaults to `/workspace`. */
  workspaceRoot?: string;

  /** URI scheme registered by the bridge extension. Defaults to `opends`. */
  scheme?: string;

  /** Human-readable folder name shown in the explorer. Defaults to `workspace`. */
  workspaceName?: string;

  /**
   * Where the workbench assets live — the `dist/` of a `vscode-web` build or an
   * openvscode-server web build. Must be same-origin so the web extension host
   * iframe stays same-origin (that is what makes the BroadcastChannel bridge
   * work). Defaults to `/vscode`.
   */
  workbenchBaseUrl?: string;

  /**
   * Base URL of the server routes (`/api/opends` by default). Only needed for
   * R2 persistence and the sandbox terminal; pure in-browser sessions work with
   * no server at all.
   */
  apiBase?: string;

  /** Extra headers attached to every server call — this is the auth seam. */
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);

  /** Forwarded to `fetch`. Defaults to `"include"` so cookie auth works. */
  credentials?: RequestCredentials;

  /** Files seeded into an empty workspace on first boot. */
  initialFiles?: Record<string, string | Uint8Array>;

  /**
   * Persistence backend. Omit for an ephemeral in-memory workspace. Use
   * `createHttpStorage()` to talk to the bundled R2 routes.
   */
  storage?: StorageAdapter;

  /** Debounce before flushing dirty files to storage. Defaults to 1500ms. */
  syncDebounceMs?: number;

  /**
   * Enable the "Cloud Sandbox" terminal profile. Requires `apiBase` and the
   * sandbox routes to be deployed. The container is not booted until a user
   * actually opens one of these terminals.
   */
  sandbox?: SandboxConfig;

  /**
   * Supply a booted runtime instead of letting the package boot one. Useful
   * when the host app already runs Nodepod for other features.
   */
  nodepod?: NodepodLike;

  /**
   * How to boot Nodepod when `nodepod` is not supplied. Defaults to a dynamic
   * `import("@scelar/nodepod")`, which keeps the ~MB runtime out of the host's
   * main bundle until the editor mounts.
   */
  bootNodepod?: NodepodBootFn;

  /** Options merged into `Nodepod.boot()`. */
  nodepodOptions?: Record<string, unknown>;

  /** VS Code settings applied as defaults for the workbench. */
  settings?: Record<string, unknown>;

  /**
   * Extra built-in extensions to load into the workbench, as URLs to extension
   * folders served from the same origin.
   */
  additionalBuiltinExtensions?: string[];

  /** Overrides merged into the generated `product.json`. */
  productOverrides?: Record<string, unknown>;

  /** Called for bridge log lines and internal warnings. */
  onLog?: (level: "info" | "warn" | "error", message: string) => void;

  /** Called when a virtual HTTP server starts inside Nodepod. */
  onServerReady?: (port: number, url: string) => void;
}

export interface SandboxConfig {
  enabled: boolean;
  /**
   * Path (relative to `apiBase`) of the terminal start route.
   * Defaults to `/sandbox/start`.
   */
  startPath?: string;
  /**
   * Push every dirty editor file into the container before attaching the PTY,
   * so `node index.js` in the sandbox runs what is on screen. Defaults to true.
   */
  syncBeforeAttach?: boolean;
  /** Working directory inside the container. Defaults to `/workspace`. */
  cwd?: string;
}

export interface ResolvedConfig {
  sessionId: string;
  workspaceRoot: string;
  scheme: string;
  workspaceName: string;
  workbenchBaseUrl: string;
  apiBase: string | undefined;
  credentials: RequestCredentials;
  syncDebounceMs: number;
  sandbox: Required<Omit<SandboxConfig, "enabled">> & { enabled: boolean };
}

export function resolveConfig(config: OpenDSCodeConfig): ResolvedConfig {
  const sandbox = config.sandbox ?? { enabled: false };
  return {
    sessionId: config.sessionId ?? randomSessionId(),
    workspaceRoot: trimTrailingSlash(config.workspaceRoot ?? "/workspace"),
    scheme: config.scheme ?? "opends",
    workspaceName: config.workspaceName ?? "workspace",
    workbenchBaseUrl: trimTrailingSlash(config.workbenchBaseUrl ?? "/vscode"),
    apiBase: config.apiBase ? trimTrailingSlash(config.apiBase) : undefined,
    credentials: config.credentials ?? "include",
    syncDebounceMs: config.syncDebounceMs ?? 1500,
    sandbox: {
      enabled: Boolean(sandbox.enabled),
      startPath: sandbox.startPath ?? "/sandbox/start",
      syncBeforeAttach: sandbox.syncBeforeAttach ?? true,
      cwd: sandbox.cwd ?? "/workspace",
    },
  };
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "") || "/";
}

export function randomSessionId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Resolves the possibly-async `headers` option into a plain record. */
export async function resolveHeaders(
  config: OpenDSCodeConfig,
): Promise<Record<string, string>> {
  const headers = config.headers;
  if (!headers) return {};
  return typeof headers === "function" ? await headers() : headers;
}
