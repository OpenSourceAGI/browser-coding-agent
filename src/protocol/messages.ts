/**
 * Wire protocol shared by the host page (where the Nodepod runtime lives) and
 * the VS Code bridge extension (which runs inside the workbench's web
 * extension host worker).
 *
 * Everything here must survive `structuredClone`: plain objects, primitives and
 * `Uint8Array`. No class instances, no functions, no `vscode.Uri`.
 */

export const PROTOCOL_VERSION = 1;

/** Discriminator so unrelated BroadcastChannel traffic is ignored. */
export const ENVELOPE_TAG = "opends-code";

export type BridgeRole = "host" | "client";

/* -------------------------------------------------------------------------- */
/* Filesystem                                                                  */
/* -------------------------------------------------------------------------- */

/** Mirrors `vscode.FileType` so the extension can cast without a lookup table. */
export const FileTypeDTO = {
  Unknown: 0,
  File: 1,
  Directory: 2,
  SymbolicLink: 64,
} as const;

export type FileTypeDTO = (typeof FileTypeDTO)[keyof typeof FileTypeDTO];

export interface FileStatDTO {
  type: FileTypeDTO;
  ctime: number;
  mtime: number;
  size: number;
  /** Set when the entry is known to be read-only (e.g. pulled from storage in a read-only session). */
  permissions?: 1;
}

export type DirEntryDTO = [name: string, type: FileTypeDTO];

/** Mirrors `vscode.FileChangeType`. */
export const FileChangeTypeDTO = {
  Changed: 1,
  Created: 2,
  Deleted: 3,
} as const;

export type FileChangeTypeDTO =
  (typeof FileChangeTypeDTO)[keyof typeof FileChangeTypeDTO];

export interface FileChangeDTO {
  type: FileChangeTypeDTO;
  path: string;
}

/* -------------------------------------------------------------------------- */
/* Search                                                                      */
/* -------------------------------------------------------------------------- */

export interface FileSearchQueryDTO {
  pattern: string;
  includes?: string[];
  excludes?: string[];
  maxResults?: number;
}

export interface TextSearchQueryDTO {
  pattern: string;
  isRegExp?: boolean;
  isCaseSensitive?: boolean;
  isWordMatch?: boolean;
  includes?: string[];
  excludes?: string[];
  maxResults?: number;
  /** Files larger than this are skipped outright. Defaults to 8 MiB. */
  maxFileSize?: number;
}

export interface TextSearchHitDTO {
  path: string;
  /** 0-based line index within the file. */
  line: number;
  /** The full text of the matching line, clipped to a sane width. */
  preview: string;
  /** Match ranges within `preview`, as `[startColumn, endColumn]` pairs. */
  ranges: Array<[number, number]>;
}

/* -------------------------------------------------------------------------- */
/* Terminals                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `local` runs the shell in the browser through Nodepod — no container, no
 * network round trip. `sandbox` proxies a real PTY in a Cloudflare Sandbox
 * container, which is only booted when a sandbox terminal is actually opened.
 */
export type TerminalMode = "local" | "sandbox";

export interface TerminalOpenParams {
  id: string;
  mode: TerminalMode;
  cols: number;
  rows: number;
  cwd?: string;
  /** Run this command instead of an interactive shell, then keep the pty open. */
  command?: string;
}

export interface TerminalOpenResult {
  id: string;
  mode: TerminalMode;
  title: string;
  /** Present for sandbox terminals once the container has accepted the session. */
  sessionId?: string;
}

/* -------------------------------------------------------------------------- */
/* Processes and packages                                                      */
/* -------------------------------------------------------------------------- */

export interface ExecParams {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  mode?: TerminalMode;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface InstallParams {
  packages?: string[];
  cwd?: string;
  dev?: boolean;
}

export interface InstallResult {
  ok: boolean;
  message: string;
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                 */
/* -------------------------------------------------------------------------- */

export type SyncPhase = "idle" | "hydrating" | "pushing" | "pulling" | "error";

export interface SyncStatusDTO {
  phase: SyncPhase;
  /** Number of paths queued for upload. */
  pending: number;
  /** Epoch millis of the last successful push, or 0 if none yet. */
  lastPushedAt: number;
  /** Set when `phase === "error"`. */
  error?: string;
  /** False when the session was constructed without a storage adapter. */
  enabled: boolean;
}

/* -------------------------------------------------------------------------- */
/* Previews                                                                    */
/* -------------------------------------------------------------------------- */

export interface PreviewPortDTO {
  port: number;
  url: string;
}

/* -------------------------------------------------------------------------- */
/* Runtime                                                                     */
/* -------------------------------------------------------------------------- */

export interface RuntimeInfoDTO {
  protocolVersion: number;
  /** Root path of the virtual workspace, e.g. `/workspace`. */
  workspaceRoot: string;
  /** URI scheme the extension must register a FileSystemProvider for. */
  scheme: string;
  ready: boolean;
  /** True when a Cloudflare Sandbox endpoint is configured for this session. */
  sandboxAvailable: boolean;
  persistence: SyncStatusDTO;
}

/* -------------------------------------------------------------------------- */
/* Request map                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The single source of truth for the RPC surface. `BridgeRequests[M]` is the
 * parameter type of method `M`, `BridgeResponses[M]` its result type; both the
 * host dispatcher and the client proxy are typed off this map, so adding a
 * method in one place is a compile error until it is handled in the other.
 */
export interface BridgeRequests {
  "runtime.info": void;
  "runtime.ready": void;

  "fs.stat": { path: string };
  "fs.readDirectory": { path: string };
  "fs.readFile": { path: string };
  "fs.writeFile": {
    path: string;
    data: Uint8Array;
    create: boolean;
    overwrite: boolean;
  };
  "fs.rename": { from: string; to: string; overwrite: boolean };
  "fs.copy": { from: string; to: string; overwrite: boolean };
  "fs.delete": { path: string; recursive: boolean };
  "fs.createDirectory": { path: string };
  "fs.watch": {
    id: string;
    path: string;
    recursive: boolean;
    excludes?: string[];
  };
  "fs.unwatch": { id: string };

  "search.file": FileSearchQueryDTO;
  "search.text": TextSearchQueryDTO;

  "term.open": TerminalOpenParams;
  "term.input": { id: string; data: string };
  "term.resize": { id: string; cols: number; rows: number };
  "term.close": { id: string };

  "proc.exec": ExecParams;
  "npm.install": InstallParams;

  "sync.status": void;
  "sync.flush": void;
  "sync.pull": void;

  "preview.list": void;
}

export interface BridgeResponses {
  "runtime.info": RuntimeInfoDTO;
  "runtime.ready": RuntimeInfoDTO;

  "fs.stat": FileStatDTO;
  "fs.readDirectory": DirEntryDTO[];
  "fs.readFile": { data: Uint8Array };
  "fs.writeFile": void;
  "fs.rename": void;
  "fs.copy": void;
  "fs.delete": void;
  "fs.createDirectory": void;
  "fs.watch": void;
  "fs.unwatch": void;

  "search.file": string[];
  "search.text": TextSearchHitDTO[];

  "term.open": TerminalOpenResult;
  "term.input": void;
  "term.resize": void;
  "term.close": void;

  "proc.exec": ExecResult;
  "npm.install": InstallResult;

  "sync.status": SyncStatusDTO;
  "sync.flush": SyncStatusDTO;
  "sync.pull": SyncStatusDTO;

  "preview.list": PreviewPortDTO[];
}

export type BridgeMethod = keyof BridgeRequests;

/* -------------------------------------------------------------------------- */
/* Event map (host -> client, fire and forget)                                 */
/* -------------------------------------------------------------------------- */

export interface BridgeEvents {
  "fs.changed": { id: string; changes: FileChangeDTO[] };
  "term.data": { id: string; data: string };
  "term.exit": { id: string; code: number };
  "preview.ready": PreviewPortDTO;
  "sync.status": SyncStatusDTO;
  "runtime.state": RuntimeInfoDTO;
  /** Free-form log line surfaced in the extension's output channel. */
  log: { level: "info" | "warn" | "error"; message: string };
}

export type BridgeEventName = keyof BridgeEvents;

/* -------------------------------------------------------------------------- */
/* Envelopes                                                                   */
/* -------------------------------------------------------------------------- */

export interface RequestEnvelope {
  tag: typeof ENVELOPE_TAG;
  kind: "req";
  from: BridgeRole;
  session: string;
  id: number;
  method: BridgeMethod;
  params: unknown;
}

export interface ResponseEnvelope {
  tag: typeof ENVELOPE_TAG;
  kind: "res";
  from: BridgeRole;
  session: string;
  id: number;
  ok: boolean;
  result?: unknown;
  error?: BridgeErrorDTO;
}

export interface EventEnvelope {
  tag: typeof ENVELOPE_TAG;
  kind: "evt";
  from: BridgeRole;
  session: string;
  event: BridgeEventName;
  payload: unknown;
}

/** Sent by a client on connect so a host that booted first replays its state. */
export interface HelloEnvelope {
  tag: typeof ENVELOPE_TAG;
  kind: "hello";
  from: BridgeRole;
  session: string;
  protocolVersion: number;
}

export type BridgeEnvelope =
  | RequestEnvelope
  | ResponseEnvelope
  | EventEnvelope
  | HelloEnvelope;

/**
 * Error codes the extension maps onto `vscode.FileSystemError` variants. Any
 * other code surfaces as `Unavailable`, which is the honest answer for an
 * unexpected runtime failure.
 */
export type BridgeErrorCode =
  | "FileNotFound"
  | "FileExists"
  | "FileNotADirectory"
  | "FileIsADirectory"
  | "NoPermissions"
  | "Unavailable"
  | "Cancelled"
  | "Unknown";

export interface BridgeErrorDTO {
  code: BridgeErrorCode;
  message: string;
  stack?: string;
}

export function isBridgeEnvelope(value: unknown): value is BridgeEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { tag?: unknown }).tag === ENVELOPE_TAG
  );
}
