import type { ObjectStore } from "./object-store.js";

/**
 * The identity the routes operate as.
 *
 * This package does not authenticate anyone — the host application does, and
 * returns this from `authorize()`. That keeps login (NextAuth, Clerk,
 * better-auth, a bespoke JWT, a reverse proxy header) entirely external, which
 * is the point: OpenDS Code is a component, not an app.
 */
export interface AuthContext {
  /** Stable user id. Used as the storage prefix, so it must not be guessable-collision-prone. */
  userId: string;
  /**
   * Which workspace this request may touch. Defaults to `userId`, giving each
   * user a single workspace; return something else for multi-project hosts.
   */
  workspaceId?: string;
  /** When true, writes are rejected with 403. */
  readOnly?: boolean;
}

export type Authorize = (
  request: Request,
) => AuthContext | null | Promise<AuthContext | null>;

export interface SandboxServerConfig {
  enabled: boolean;
  /**
   * Boots (or resumes) a container for this user and returns a WebSocket URL
   * the browser can attach a PTY to.
   *
   * Implemented by the host so that `@cloudflare/sandbox` stays out of this
   * package's dependency graph — and, more importantly, out of the code path
   * that serves files. See `docker/` and the README for a ready-made
   * implementation.
   */
  start: (
    context: AuthContext,
    options: SandboxStartOptions,
  ) => Promise<{ wsUrl: string; sessionId?: string }>;

  /**
   * Proxies the WebSocket upgrade to the container PTY. Only reachable on
   * runtimes that can return a `101` (Cloudflare Workers); omit it on Node
   * hosts and point `start()` at a Worker that can.
   */
  terminal?: (request: Request) => Promise<Response>;

  /**
   * Boots (or resumes) `openvscode-server` inside the same container and
   * returns a URL to it — a real Node extension host, unlike the browser-only
   * workbench. Omit to keep the sandbox terminal-only.
   */
  openEditor?: (
    context: AuthContext,
    options: SandboxOpenEditorOptions,
  ) => Promise<{ url: string }>;
}

export interface SandboxOpenEditorOptions {
  request: Request;
}

export interface SandboxStartOptions {
  cols: number;
  rows: number;
  cwd: string;
  command?: string;
  terminalId?: string;
  request: Request;
}

export interface OpenDSServerConfig {
  /** Host-supplied authentication. Required. */
  authorize: Authorize;

  /** Durable storage. Omit to run the editor without persistence. */
  store?: ObjectStore;

  /** Key prefix inside the bucket. Defaults to `workspaces`. */
  keyPrefix?: string;

  /** Path the routes are mounted at, e.g. `/api/opends`. Defaults to `/api/opends`. */
  basePath?: string;

  /** Where the `vscode-web` build is served from. Defaults to `/vscode`. */
  workbenchBaseUrl?: string;

  /** URL of the bridge extension folder. Defaults to `/opends/extension`. */
  bridgeExtensionUrl?: string;

  /** Extra built-in extension folder URLs passed to the workbench. */
  additionalBuiltinExtensions?: string[];

  /** VS Code settings applied as workbench defaults. */
  settings?: Record<string, unknown>;

  /** Marketplace configuration; use `OPEN_VSX_GALLERY` or omit for none. */
  extensionGallery?: Record<string, string>;

  /** Overrides merged into the generated workbench product config. */
  productOverrides?: Record<string, unknown>;

  /** On-demand container terminals. Omit to keep the editor fully serverless. */
  sandbox?: SandboxServerConfig;

  /** Largest single file accepted by the write routes. Defaults to 10 MiB. */
  maxFileSize?: number;
}
