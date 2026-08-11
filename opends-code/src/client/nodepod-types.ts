/**
 * Structural types for the Nodepod runtime.
 *
 * These are deliberately *not* imported from `@scelar/nodepod`. The package is
 * an optional peer dependency, and typing against the shape rather than the
 * implementation means a host can substitute any runtime that provides the same
 * fs/spawn/install surface (a different in-browser Node, a stub for tests, or a
 * future replacement) without touching this package.
 */

export interface NodepodStatLike {
  isFile: boolean;
  isDirectory: boolean;
  size: number;
  mtime: number;
}

export interface NodepodWatcherLike {
  close(): void;
}

export interface NodepodFsLike {
  readFile(path: string): Promise<Uint8Array>;
  readFile(path: string, encoding: "utf-8" | "utf8"): Promise<string>;
  writeFile(path: string, data: string | Uint8Array): Promise<void>;
  mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>;
  readdir(path: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<NodepodStatLike>;
  unlink(path: string): Promise<void>;
  rm(path: string, opts?: { recursive?: boolean; force?: boolean }): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  watch(
    path: string,
    options: { recursive?: boolean },
    callback: (event: string, filename: string | null) => void,
  ): NodepodWatcherLike;
}

export interface ProcessCompletion {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface NodepodProcessLike {
  on(event: "output", listener: (text: string) => void): void;
  on(event: "error", listener: (text: string) => void): void;
  on(event: "exit", listener: (code: number) => void): void;
  /**
   * Nodepod resolves this with the *fully buffered* output, which is why
   * `OpenDSSession._exec` reads it rather than only accumulating streamed
   * chunks: a listener attached after the first chunk would otherwise miss it,
   * and some processes only flush at exit. A bare exit code is accepted too, so
   * a simpler runtime can be substituted.
   */
  readonly completion: Promise<ProcessCompletion | number>;
  write?(data: string): void;
  kill?(): void;
}

/**
 * The subset of `NodepodTerminal`'s xterm contract we implement headlessly.
 * See `headless-xterm.ts` — Nodepod drives this object as if it were a real
 * `@xterm/xterm` `Terminal`, and we forward the bytes to VS Code's terminal.
 */
export interface XtermLike {
  cols: number;
  rows: number;
  options: { theme?: unknown; [key: string]: unknown };
  write(data: string): void;
  onData(listener: (data: string) => void): { dispose(): void };
  onResize?(listener: (size: { cols: number; rows: number }) => void): {
    dispose(): void;
  };
  open(container: unknown): void;
  focus(): void;
  clear(): void;
  dispose(): void;
  loadAddon(addon: unknown): void;
}

export interface NodepodTerminalLike {
  attach(target: unknown): void;
  write(data: string): void;
  detach?(): void;
  dispose?(): void;
  setCwd?(cwd: string): void;
  input?(text: string): void;
  fit?(): void;
}

export interface NodepodTerminalOptions {
  Terminal: new (options?: Record<string, unknown>) => XtermLike;
  FitAddon?: unknown;
  WebglAddon?: unknown;
  SerializeAddon?: unknown;
  theme?: Record<string, string>;
  prompt?: (cwd: string) => string;
  customCommands?: Record<string, (cwd: string, args: string[]) => string>;
}

export interface NodepodLike {
  readonly fs: NodepodFsLike;
  spawn(
    cmd: string,
    args?: string[],
    opts?: { cwd?: string; env?: Record<string, string>; signal?: AbortSignal },
  ): Promise<NodepodProcessLike>;
  install(packages?: string[]): Promise<unknown>;
  createTerminal(options: NodepodTerminalOptions): NodepodTerminalLike;
  port(num: number): string | null;
  teardown?(): void;
}

/** `Nodepod.boot()` — passed in by the host so we never import the package. */
export type NodepodBootFn = (
  options?: Record<string, unknown>,
) => Promise<NodepodLike>;
