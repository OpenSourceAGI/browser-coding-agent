// The contract the workbench talks to. Everything VS Code needs from an
// "operating system" — files, a shell, processes, listening ports — comes
// through here, so the workbench never imports Nodepod or the Sandbox SDK
// directly and either can be swapped without touching workbench code.

export type TerminalDriverId = "nodepod" | "sandbox";

export interface Disposable {
  dispose(): void;
}

export type FileKind = "file" | "directory" | "symlink";

export interface FileStat {
  type: FileKind;
  size: number;
  /** Milliseconds since epoch. */
  mtime: number;
  ctime: number;
}

export interface DirEntry {
  name: string;
  type: FileKind;
}

export type FileChangeKind = "created" | "changed" | "deleted";

export interface FileChange {
  kind: FileChangeKind;
  /** Absolute POSIX path inside the workspace volume. */
  path: string;
}

/**
 * Async filesystem surface. Nodepod's volume is synchronous underneath, so
 * these resolve immediately; the async shape exists so a remote-backed
 * implementation can slot in unchanged.
 */
export interface RuntimeFileSystem {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(
    path: string,
    data: Uint8Array,
    opts?: { create?: boolean; overwrite?: boolean },
  ): Promise<void>;
  readdir(path: string): Promise<DirEntry[]>;
  stat(path: string): Promise<FileStat>;
  mkdir(path: string): Promise<void>;
  delete(path: string, opts?: { recursive?: boolean }): Promise<void>;
  rename(from: string, to: string, opts?: { overwrite?: boolean }): Promise<void>;
  /** Fires for any change under `path`. Nodepod watches recursively. */
  watch(path: string, listener: (change: FileChange) => void): Disposable;
}

/** One live pseudo-terminal: bytes in, bytes out, a size, and an exit. */
export interface PtySession {
  readonly pid: number;
  onData(listener: (data: string) => void): Disposable;
  onExit(listener: (exitCode: number) => void): Disposable;
  /** Report cwd changes so VS Code's terminal title stays accurate. */
  onCwdChange(listener: (cwd: string) => void): Disposable;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  shutdown(immediate: boolean): void;
  getCwd(): string;
}

export interface PtyOptions {
  cwd: string;
  cols: number;
  rows: number;
  env: Record<string, string>;
}

/**
 * Where terminals actually run. `nodepod` runs the shell in a Web Worker in
 * this tab; `sandbox` runs bash in a Cloudflare container and mirrors the
 * workspace into it.
 */
export interface TerminalDriver {
  readonly id: TerminalDriverId;
  /** Shown in the terminal profile picker and the status bar. */
  readonly label: string;
  readonly shellPath: string;
  /** Boot whatever this driver needs (container, file clone) before first use. */
  prepare(progress?: (message: string) => void): Promise<void>;
  createPty(opts: PtyOptions): Promise<PtySession>;
  dispose(): void;
}

export interface ForwardedPort {
  port: number;
  /** Absolute URL that reaches the virtual server from the browser. */
  url: string;
}

/** The workspace-level runtime: one filesystem, N terminal drivers. */
export interface WorkspaceRuntime {
  readonly fs: RuntimeFileSystem;
  readonly workspaceRoot: string;
  readonly env: Record<string, string>;
  /** Currently selected terminal driver. */
  readonly terminals: TerminalDriver;
  onPortOpen(listener: (p: ForwardedPort) => void): Disposable;
  onPortClose(listener: (port: number) => void): Disposable;
  listPorts(): ForwardedPort[];
  /** Map `http://localhost:<port>` to a URL that works in this browser tab. */
  resolveExternalUri(port: number): string | undefined;
}
