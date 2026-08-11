import { BridgeServer, BridgeError } from "../protocol/channel.js";
import type {
  FileChangeDTO,
  PreviewPortDTO,
  RuntimeInfoDTO,
  SyncStatusDTO,
} from "../protocol/messages.js";
import { SyncEngine } from "../storage/sync-engine.js";
import {
  resolveConfig,
  resolveHeaders,
  type OpenDSCodeConfig,
  type ResolvedConfig,
} from "./config.js";
import { FileSystemService, toUint8Array } from "./fs-service.js";
import type { NodepodLike } from "./nodepod-types.js";
import { SearchService } from "./search-service.js";
import { TerminalService } from "./terminal-service.js";

export interface OpenDSSessionEvents {
  onReady?: (info: RuntimeInfoDTO) => void;
  onSyncStatus?: (status: SyncStatusDTO) => void;
  onPreview?: (preview: PreviewPortDTO) => void;
  onError?: (error: Error) => void;
}

/**
 * The host-page half of OpenDS Code.
 *
 * Owns the Nodepod runtime, the workspace filesystem, search, terminals and
 * persistence, and answers the bridge RPCs issued by the extension running
 * inside the workbench. Nothing here imports `vscode`; nothing in the extension
 * imports Nodepod. The protocol is the only coupling between the two.
 */
export class OpenDSSession {
  readonly config: ResolvedConfig;

  private readonly _rawConfig: OpenDSCodeConfig;
  private readonly _events: OpenDSSessionEvents;
  private readonly _bridge: BridgeServer;
  private readonly _previews = new Map<number, PreviewPortDTO>();

  private _nodepod: NodepodLike | null = null;
  private _fs: FileSystemService | null = null;
  private _search: SearchService | null = null;
  private _terminals: TerminalService | null = null;
  private _sync: SyncEngine | null = null;

  private _bootPromise: Promise<void> | null = null;
  private _ready = false;
  private _disposed = false;

  constructor(config: OpenDSCodeConfig, events: OpenDSSessionEvents = {}) {
    this._rawConfig = config;
    this._events = events;
    this.config = resolveConfig(config);

    this._bridge = new BridgeServer({
      session: this.config.sessionId,
      // The extension host can be recreated (reload, extension restart) long
      // after boot, so replay current state whenever a fresh client appears.
      onClientHello: () => {
        if (this._ready) this._bridge.emit("runtime.state", this.runtimeInfo());
      },
    });
    this._registerHandlers();
  }

  get nodepod(): NodepodLike | null {
    return this._nodepod;
  }

  get fs(): FileSystemService | null {
    return this._fs;
  }

  get sync(): SyncEngine | null {
    return this._sync;
  }

  get ready(): boolean {
    return this._ready;
  }

  runtimeInfo(): RuntimeInfoDTO {
    return {
      protocolVersion: 1,
      workspaceRoot: this.config.workspaceRoot,
      scheme: this.config.scheme,
      ready: this._ready,
      sandboxAvailable: Boolean(this._terminals?.sandboxAvailable),
      persistence: this._sync?.status ?? {
        phase: "idle",
        pending: 0,
        lastPushedAt: 0,
        enabled: false,
      },
    };
  }

  /** Idempotent: repeated calls await the same boot. */
  start(): Promise<void> {
    if (!this._bootPromise) this._bootPromise = this._boot();
    return this._bootPromise;
  }

  async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;

    // Best-effort final push so closing the tab does not drop the last edit.
    try {
      await this._sync?.flush();
    } catch {
      // nothing useful to do while tearing down
    }

    this._terminals?.dispose();
    this._sync?.dispose();
    this._fs?.dispose();
    this._bridge.dispose();
    this._nodepod?.teardown?.();
  }

  /* ------------------------------------------------------------------ boot */

  private async _boot(): Promise<void> {
    try {
      this._nodepod = await this._resolveNodepod();

      this._fs = new FileSystemService({
        fs: this._nodepod.fs,
        workspaceRoot: this.config.workspaceRoot,
        onMutation: (change) => this._onMutation(change),
        onWatchEvent: (id, changes) =>
          this._bridge.emit("fs.changed", { id, changes }),
      });
      await this._fs.ensureRoot();

      this._search = new SearchService(this._fs);

      this._sync = new SyncEngine({
        fs: this._fs,
        storage: this._rawConfig.storage,
        debounceMs: this.config.syncDebounceMs,
        onStatus: (status) => {
          this._bridge.emit("sync.status", status);
          this._events.onSyncStatus?.(status);
        },
        onLog: (level, message) => this._log(level, message),
      });

      const restored = await this._sync.hydrate();
      if (restored === 0) await this._seedInitialFiles();

      this._terminals = new TerminalService({
        nodepod: this._nodepod,
        workspaceRoot: this.config.workspaceRoot,
        callbacks: {
          onData: (id, data) => this._bridge.emit("term.data", { id, data }),
          onExit: (id, code) => this._bridge.emit("term.exit", { id, code }),
        },
        ...(this.config.sandbox.enabled && this.config.apiBase
          ? {
              sandbox: {
                enabled: true,
                startUrl: `${this.config.apiBase}${this.config.sandbox.startPath}`,
                cwd: this.config.sandbox.cwd,
                headers: () => resolveHeaders(this._rawConfig),
                credentials: this.config.credentials,
                ...(this.config.sandbox.syncBeforeAttach
                  ? { beforeAttach: async () => void (await this._sync?.flush()) }
                  : {}),
              },
            }
          : {}),
      });

      this._ready = true;
      const info = this.runtimeInfo();
      this._bridge.emit("runtime.state", info);
      this._events.onReady?.(info);
      this._log("info", "OpenDS runtime ready");
    } catch (error) {
      const wrapped =
        error instanceof Error ? error : new Error(String(error));
      this._log("error", `runtime boot failed: ${wrapped.message}`);
      this._events.onError?.(wrapped);
      throw wrapped;
    }
  }

  private async _resolveNodepod(): Promise<NodepodLike> {
    if (this._rawConfig.nodepod) return this._rawConfig.nodepod;

    const bootOptions: Record<string, unknown> = {
      workdir: this.config.workspaceRoot,
      onServerReady: (port: number, url: string) => this._onServerReady(port, url),
      ...this._rawConfig.nodepodOptions,
    };

    if (this._rawConfig.bootNodepod) {
      return this._rawConfig.bootNodepod(bootOptions);
    }

    // Dynamic import keeps the runtime out of the host's initial bundle; it is
    // only fetched once an editor actually mounts.
    const moduleName = "@scelar/nodepod";
    const mod = (await import(/* @vite-ignore */ moduleName)) as {
      Nodepod: { boot: (options?: Record<string, unknown>) => Promise<NodepodLike> };
    };
    if (!mod?.Nodepod?.boot) {
      throw new Error(
        "could not load @scelar/nodepod — install it, or pass `nodepod`/`bootNodepod` in the config",
      );
    }
    return mod.Nodepod.boot(bootOptions);
  }

  private async _seedInitialFiles(): Promise<void> {
    const files = this._rawConfig.initialFiles;
    if (!files || Object.keys(files).length === 0) return;

    for (const [path, contents] of Object.entries(files)) {
      await this._fs!.writeFile(path, toUint8Array(contents), {
        create: true,
        overwrite: true,
      });
    }
    // Template files should survive the first reload, so push them eagerly
    // rather than waiting for the user to type something.
    await this._sync?.flush();
  }

  private _onMutation(change: FileChangeDTO): void {
    this._search?.invalidate();
    this._sync?.notify(change);
  }

  private _onServerReady(port: number, url: string): void {
    const preview: PreviewPortDTO = { port, url };
    this._previews.set(port, preview);
    this._bridge.emit("preview.ready", preview);
    this._events.onPreview?.(preview);
    this._rawConfig.onServerReady?.(port, url);
  }

  private _log(level: "info" | "warn" | "error", message: string): void {
    this._rawConfig.onLog?.(level, message);
    this._bridge.emit("log", { level, message });
  }

  /* -------------------------------------------------------------- handlers */

  private _registerHandlers(): void {
    const bridge = this._bridge;

    // Requests can arrive before boot finishes — the extension host activates
    // in parallel with the runtime. Awaiting here queues them instead of
    // failing the workspace's very first `stat`.
    const fs = async (): Promise<FileSystemService> => {
      await this.start();
      if (!this._fs) throw new BridgeError("Unavailable", "filesystem unavailable");
      return this._fs;
    };

    bridge.handle("runtime.info", () => this.runtimeInfo());
    bridge.handle("runtime.ready", async () => {
      await this.start();
      return this.runtimeInfo();
    });

    bridge.handle("fs.stat", async ({ path }) => (await fs()).stat(path));
    bridge.handle("fs.readDirectory", async ({ path }) =>
      (await fs()).readDirectory(path),
    );
    bridge.handle("fs.readFile", async ({ path }) => ({
      data: await (await fs()).readFile(path),
    }));
    bridge.handle("fs.writeFile", async ({ path, data, create, overwrite }) => {
      await (await fs()).writeFile(path, data, { create, overwrite });
    });
    bridge.handle("fs.createDirectory", async ({ path }) => {
      await (await fs()).createDirectory(path);
    });
    bridge.handle("fs.delete", async ({ path, recursive }) => {
      await (await fs()).delete(path, recursive);
    });
    bridge.handle("fs.rename", async ({ from, to, overwrite }) => {
      await (await fs()).rename(from, to, overwrite);
    });
    bridge.handle("fs.copy", async ({ from, to, overwrite }) => {
      await (await fs()).copy(from, to, overwrite);
    });
    bridge.handle("fs.watch", async ({ id, path, recursive, excludes }) => {
      (await fs()).watch(id, path, recursive, excludes);
    });
    bridge.handle("fs.unwatch", async ({ id }) => {
      this._fs?.unwatch(id);
    });

    bridge.handle("search.file", async (query) => {
      await this.start();
      return this._search?.searchFiles(query) ?? [];
    });
    bridge.handle("search.text", async (query) => {
      await this.start();
      return this._search?.searchText(query) ?? [];
    });

    bridge.handle("term.open", async (params) => {
      await this.start();
      if (!this._terminals) {
        throw new BridgeError("Unavailable", "terminal service unavailable");
      }
      return this._terminals.open(params);
    });
    bridge.handle("term.input", ({ id, data }) => {
      this._terminals?.input(id, data);
    });
    bridge.handle("term.resize", ({ id, cols, rows }) => {
      this._terminals?.resize(id, cols, rows);
    });
    bridge.handle("term.close", ({ id }) => {
      this._terminals?.close(id);
    });

    bridge.handle("proc.exec", async ({ command, cwd, env }) => {
      await this.start();
      return this._exec(command, cwd, env);
    });

    bridge.handle("npm.install", async ({ packages }) => {
      await this.start();
      try {
        await this._nodepod!.install(packages);
        return {
          ok: true,
          message: packages?.length
            ? `installed ${packages.join(", ")}`
            : "installed dependencies from package.json",
        };
      } catch (error) {
        return { ok: false, message: text(error) };
      }
    });

    bridge.handle("sync.status", () => this.runtimeInfo().persistence);
    bridge.handle("sync.flush", async () => {
      await this.start();
      return (await this._sync?.flush()) ?? this.runtimeInfo().persistence;
    });
    bridge.handle("sync.pull", async () => {
      await this.start();
      return (await this._sync?.pull()) ?? this.runtimeInfo().persistence;
    });

    bridge.handle("preview.list", () => Array.from(this._previews.values()));
  }

  private async _exec(
    command: string,
    cwd?: string,
    env?: Record<string, string>,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const nodepod = this._nodepod;
    if (!nodepod) throw new BridgeError("Unavailable", "runtime unavailable");

    // `sh -c` so the caller can pass a full command line (pipes, &&, globs)
    // rather than a pre-split argv.
    const proc = await nodepod.spawn("sh", ["-c", command], {
      cwd: cwd ? this._fs!.toVfs(cwd) : this.config.workspaceRoot,
      ...(env ? { env } : {}),
    });

    let streamedOut = "";
    let streamedErr = "";
    proc.on("output", (chunk: string) => {
      streamedOut += chunk;
    });
    proc.on("error", (chunk: string) => {
      streamedErr += chunk;
    });

    const completion = await proc.completion;
    if (typeof completion === "number") {
      return { exitCode: completion, stdout: streamedOut, stderr: streamedErr };
    }

    // The completion payload is authoritative — it holds everything the process
    // wrote, including whatever landed before these listeners were attached.
    return {
      exitCode: completion.exitCode,
      stdout: completion.stdout || streamedOut,
      stderr: completion.stderr || streamedErr,
    };
  }
}

function text(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
