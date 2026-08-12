import { Emitter, ReplayEmitter } from "./emitter";
import type { NodepodFileSystem } from "./nodepod-fs";
import { DEFAULT_EXCLUDES } from "./nodepod-fs";
import { SandboxClient, bytesToBase64 } from "./sandbox-client";
import type {
  Disposable,
  PtyOptions,
  PtySession,
  TerminalDriver,
} from "./types";

/** Keep each push comfortably under the Worker request body limit. */
const PUSH_BATCH_BYTES = 2 * 1024 * 1024;
const PUSH_MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const PULL_INTERVAL_MS = 3000;

export interface SandboxDriverOptions {
  /** Local workspace root, mirrored to the container's workspace. */
  workspaceRoot: string;
}

/**
 * Terminals that run in a Cloudflare Sandbox container.
 *
 * The editor keeps using the in-browser filesystem; only the shell moves. On
 * `prepare()` the workspace is cloned into the container, and while a
 * container terminal is open, files the shell creates (installs, build output,
 * generated code) are pulled back so the explorer stays truthful.
 */
export class SandboxTerminalDriver implements TerminalDriver {
  readonly id = "sandbox" as const;
  readonly label = "Cloudflare Sandbox (container)";
  readonly shellPath = "/bin/bash";

  private readonly _client: SandboxClient;
  private readonly _onSyncError = new Emitter<Error>();
  private _session: { sessionId: string; workspace: string } | null = null;
  private _preparing: Promise<void> | null = null;
  private _sessions = new Set<SandboxPty>();
  private _pullTimer: ReturnType<typeof setInterval> | null = null;
  private _changeVersion: string | undefined;
  private _knownMtimes = new Map<string, number>();

  constructor(
    private readonly _fs: NodepodFileSystem,
    private readonly _opts: SandboxDriverOptions,
    client = new SandboxClient(),
  ) {
    this._client = client;
  }

  onSyncError(listener: (err: Error) => void): Disposable {
    return this._onSyncError.on(listener);
  }

  get workspace(): string {
    return this._session?.workspace ?? "/workspace";
  }

  async prepare(progress?: (message: string) => void): Promise<void> {
    // Concurrent terminal creation must not boot two containers.
    if (this._preparing) return this._preparing;
    this._preparing = this._prepare(progress).catch((err) => {
      this._preparing = null;
      throw err;
    });
    return this._preparing;
  }

  private async _prepare(progress?: (message: string) => void): Promise<void> {
    const report = (message: string) => progress?.(message);

    report("Starting sandbox container…");
    this._session = await this._client.createSession(this._opts.workspaceRoot);

    report("Cloning workspace into container…");
    await this.pushWorkspace(report);

    // Establish a change baseline so the first poll does not report the files
    // we just wrote as container-side edits.
    try {
      const check = await this._client.checkChanges(this._session.sessionId);
      this._changeVersion = check.version;
    } catch {
      this._changeVersion = undefined;
    }
    report("Sandbox ready");
  }

  /** Copy the local workspace into the container, in size-bounded batches. */
  async pushWorkspace(progress?: (message: string) => void): Promise<number> {
    const session = this._session;
    if (!session) throw new Error("Sandbox session not started");

    const files = await this._fs.collect(this._opts.workspaceRoot, {
      exclude: DEFAULT_EXCLUDES,
      maxBytes: PUSH_MAX_TOTAL_BYTES,
    });

    let batch: Array<{ path: string; content: string }> = [];
    let batchBytes = 0;
    let written = 0;
    let clean = true;

    const flush = async () => {
      if (batch.length === 0) return;
      await this._client.pushFiles(session.sessionId, batch, { clean });
      written += batch.length;
      progress?.(`Cloned ${written}/${files.length} files…`);
      clean = false;
      batch = [];
      batchBytes = 0;
    };

    for (const file of files) {
      const relative = this._toContainerPath(file.path, session.workspace);
      batch.push({ path: relative, content: bytesToBase64(file.data) });
      batchBytes += file.data.byteLength;
      this._knownMtimes.set(relative, file.mtime);
      if (batchBytes >= PUSH_BATCH_BYTES) await flush();
    }
    await flush();

    // An empty workspace still needs the directory to exist in the container.
    if (files.length === 0) {
      await this._client.pushFiles(session.sessionId, [], { clean: true });
    }
    return written;
  }

  /** Bring container-side changes (installs, generated files) back locally. */
  async pullWorkspace(): Promise<number> {
    const session = this._session;
    if (!session) return 0;

    const check = await this._client.checkChanges(
      session.sessionId,
      this._changeVersion,
    );
    this._changeVersion = check.version;
    if (check.status === "unchanged") return 0;

    const listing = await this._client.listFiles(session.sessionId);
    let updated = 0;

    for (const info of listing) {
      if (info.type !== "file") continue;
      const containerPath = info.path;
      if (isExcluded(containerPath)) continue;

      const mtime = Date.parse(info.modifiedAt);
      const known = this._knownMtimes.get(containerPath);
      if (known !== undefined && Number.isFinite(mtime) && mtime <= known) {
        continue;
      }

      const data = await this._client.readFile(session.sessionId, containerPath);
      const localPath = this._toLocalPath(containerPath, session.workspace);
      await this._fs.writeFile(localPath, data);
      this._knownMtimes.set(containerPath, Number.isFinite(mtime) ? mtime : Date.now());
      updated++;
    }
    return updated;
  }

  async createPty(opts: PtyOptions): Promise<PtySession> {
    await this.prepare();
    const session = this._session;
    if (!session) throw new Error("Sandbox session not started");

    const pty = new SandboxPty(
      this._client.terminalUrl(session.sessionId, opts.cols, opts.rows),
      this._toContainerPath(opts.cwd, session.workspace),
      () => {
        this._sessions.delete(pty);
        if (this._sessions.size === 0) this._stopPulling();
      },
    );
    this._sessions.add(pty);
    this._startPulling();
    return pty;
  }

  dispose(): void {
    this._stopPulling();
    for (const session of [...this._sessions]) session.shutdown(true);
    this._sessions.clear();
    this._session = null;
    this._preparing = null;
    this._knownMtimes.clear();
    this._onSyncError.clear();
  }

  private _startPulling(): void {
    if (this._pullTimer) return;
    this._pullTimer = setInterval(() => {
      void this.pullWorkspace().catch((err) => {
        this._onSyncError.fire(
          err instanceof Error ? err : new Error(String(err)),
        );
      });
    }, PULL_INTERVAL_MS);
  }

  private _stopPulling(): void {
    if (!this._pullTimer) return;
    clearInterval(this._pullTimer);
    this._pullTimer = null;
  }

  private _toContainerPath(localPath: string, workspace: string): string {
    const root = this._opts.workspaceRoot.replace(/\/$/, "");
    if (localPath === root) return workspace;
    if (localPath.startsWith(`${root}/`)) {
      return `${workspace}${localPath.slice(root.length)}`;
    }
    return localPath;
  }

  private _toLocalPath(containerPath: string, workspace: string): string {
    const ws = workspace.replace(/\/$/, "");
    const root = this._opts.workspaceRoot.replace(/\/$/, "");
    if (containerPath === ws) return root;
    if (containerPath.startsWith(`${ws}/`)) {
      return `${root}${containerPath.slice(ws.length)}`;
    }
    return containerPath;
  }
}

function isExcluded(path: string): boolean {
  return path.split("/").some((segment) => DEFAULT_EXCLUDES.has(segment));
}

/**
 * One WebSocket to a container PTY, speaking the Sandbox SDK's terminal
 * protocol: binary frames carry terminal bytes, JSON text frames carry
 * control messages.
 */
class SandboxPty implements PtySession {
  readonly pid = 1;

  // Replay: the container's shell banner and prompt can arrive before
  // VS Code subscribes to the process.
  private readonly _onData = new ReplayEmitter<string>();
  private readonly _onExit = new Emitter<number>();
  private readonly _onCwdChange = new Emitter<string>();
  private readonly _decoder = new TextDecoder();
  private readonly _encoder = new TextEncoder();
  private readonly _socket: WebSocket;
  /** Input typed before the socket opens would otherwise be dropped. */
  private _pending: string[] = [];
  private _pendingResize: { cols: number; rows: number } | null = null;
  private _closed = false;

  constructor(
    url: string,
    private readonly _cwd: string,
    private readonly _onDispose: () => void,
  ) {
    this._socket = new WebSocket(url);
    this._socket.binaryType = "arraybuffer";

    this._socket.addEventListener("open", () => {
      for (const chunk of this._pending) this._send(chunk);
      this._pending = [];
      if (this._pendingResize) {
        this.resize(this._pendingResize.cols, this._pendingResize.rows);
        this._pendingResize = null;
      }
    });

    this._socket.addEventListener("message", (event) => {
      const { data } = event;
      if (data instanceof ArrayBuffer) {
        this._onData.fire(this._decoder.decode(new Uint8Array(data), { stream: true }));
        return;
      }
      if (typeof data !== "string") return;
      try {
        const msg = JSON.parse(data) as {
          type?: string;
          message?: string;
          code?: number;
        };
        if (msg.type === "error" && msg.message) {
          this._onData.fire(`\r\n\x1b[31m${msg.message}\x1b[0m\r\n`);
        } else if (msg.type === "exit") {
          this._finish(msg.code ?? 0);
        }
      } catch {
        // Not a control frame we understand; ignore rather than corrupt output.
      }
    });

    this._socket.addEventListener("close", () => this._finish(0));
    this._socket.addEventListener("error", () => {
      this._onData.fire(
        "\r\n\x1b[31mLost connection to the sandbox container.\x1b[0m\r\n",
      );
    });
  }

  onData(listener: (data: string) => void): Disposable {
    return this._onData.on(listener);
  }

  onExit(listener: (exitCode: number) => void): Disposable {
    return this._onExit.on(listener);
  }

  onCwdChange(listener: (cwd: string) => void): Disposable {
    return this._onCwdChange.on(listener);
  }

  write(data: string): void {
    if (this._closed) return;
    if (this._socket.readyState === WebSocket.OPEN) this._send(data);
    else this._pending.push(data);
  }

  resize(cols: number, rows: number): void {
    if (this._closed) return;
    if (this._socket.readyState !== WebSocket.OPEN) {
      this._pendingResize = { cols, rows };
      return;
    }
    this._socket.send(JSON.stringify({ type: "resize", cols, rows }));
  }

  getCwd(): string {
    return this._cwd;
  }

  shutdown(_immediate: boolean): void {
    this._finish(0);
  }

  private _send(data: string): void {
    this._socket.send(this._encoder.encode(data));
  }

  private _finish(exitCode: number): void {
    if (this._closed) return;
    this._closed = true;
    try {
      this._socket.close();
    } catch {
      // Already closing.
    }
    this._onDispose();
    this._onExit.fire(exitCode);
    this._onData.clear();
    this._onCwdChange.clear();
  }
}
