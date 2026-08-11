import {
  FileChangeTypeDTO,
  type FileChangeDTO,
  type SyncStatusDTO,
} from "../protocol/messages.js";
import {
  isExcludedDirectory,
  matchesAnyGlob,
  normalizePath,
} from "../protocol/paths.js";
import type { FileSystemService } from "../client/fs-service.js";
import {
  DEFAULT_MAX_SYNC_FILE_SIZE,
  DEFAULT_SYNC_EXCLUDES,
  type StorageAdapter,
  type StorageWriteOp,
} from "./types.js";

export interface SyncEngineOptions {
  fs: FileSystemService;
  storage: StorageAdapter | undefined;
  /** Quiet period before a burst of edits is pushed. Defaults to 1500ms. */
  debounceMs?: number;
  excludes?: string[];
  maxFileSize?: number;
  onStatus?: (status: SyncStatusDTO) => void;
  onLog?: (level: "info" | "warn" | "error", message: string) => void;
}

/**
 * Keeps the in-browser VFS and durable storage in step.
 *
 * The editor never waits on this: writes land in the VFS immediately and are
 * pushed afterwards, debounced. That is what makes typing feel local while the
 * workspace still survives a reload — the same trade-off vscode.dev makes.
 */
export class SyncEngine {
  private readonly _fs: FileSystemService;
  private readonly _storage: StorageAdapter | undefined;
  private readonly _debounceMs: number;
  private readonly _excludes: string[];
  private readonly _maxFileSize: number;
  private readonly _options: SyncEngineOptions;

  private readonly _dirty = new Set<string>();
  private readonly _deleted = new Set<string>();
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _flushing: Promise<void> | null = null;
  private _suppress = false;
  private _status: SyncStatusDTO;

  constructor(options: SyncEngineOptions) {
    this._fs = options.fs;
    this._storage = options.storage;
    this._debounceMs = options.debounceMs ?? 1500;
    this._excludes = [...DEFAULT_SYNC_EXCLUDES, ...(options.excludes ?? [])];
    this._maxFileSize = options.maxFileSize ?? DEFAULT_MAX_SYNC_FILE_SIZE;
    this._options = options;
    this._status = {
      phase: "idle",
      pending: 0,
      lastPushedAt: 0,
      enabled: Boolean(options.storage),
    };
  }

  get status(): SyncStatusDTO {
    return { ...this._status, pending: this._dirty.size + this._deleted.size };
  }

  get enabled(): boolean {
    return Boolean(this._storage);
  }

  /**
   * Loads the stored workspace into the VFS. Returns the number of files
   * restored; 0 means a fresh workspace, and the caller seeds template files.
   */
  async hydrate(): Promise<number> {
    if (!this._storage) return 0;

    this._setStatus({ phase: "hydrating" });
    this._suppress = true;
    let restored = 0;

    try {
      await this._fs.ensureRoot();
      const entries = await this._storage.list();

      for (const entry of entries) {
        const path = normalizePath(entry.path);
        if (this._isExcluded(path)) continue;
        try {
          const data = await this._storage.read(path);
          await this._fs.writeFile(path, data, {
            create: true,
            overwrite: true,
          });
          restored++;
        } catch (error) {
          this._log("warn", `could not restore ${path}: ${text(error)}`);
        }
      }

      this._setStatus({ phase: "idle" });
      return restored;
    } catch (error) {
      this._setStatus({ phase: "error", error: text(error) });
      this._log("error", `hydrate failed: ${text(error)}`);
      return restored;
    } finally {
      this._suppress = false;
    }
  }

  /** Re-reads everything from storage, discarding unsynced local edits. */
  async pull(): Promise<SyncStatusDTO> {
    this._dirty.clear();
    this._deleted.clear();
    this._setStatus({ phase: "pulling" });
    await this.hydrate();
    return this.status;
  }

  /** Called for every VFS mutation. Cheap: it only touches two sets. */
  notify(change: FileChangeDTO): void {
    if (!this._storage || this._suppress) return;
    const path = normalizePath(change.path);
    if (this._isExcluded(path)) return;

    if (change.type === FileChangeTypeDTO.Deleted) {
      this._dirty.delete(path);
      this._deleted.add(path);
    } else {
      this._deleted.delete(path);
      this._dirty.add(path);
    }
    this._schedule();
  }

  /** Pushes everything queued right now and resolves when storage has it. */
  async flush(): Promise<SyncStatusDTO> {
    if (!this._storage) return this.status;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    // Coalesce concurrent callers onto the in-flight push, then run once more
    // so writes that arrived mid-flush are not left behind.
    if (this._flushing) {
      await this._flushing;
      if (this._dirty.size === 0 && this._deleted.size === 0) return this.status;
    }
    this._flushing = this._push();
    try {
      await this._flushing;
    } finally {
      this._flushing = null;
    }
    return this.status;
  }

  /** Uploads the whole workspace, ignoring the dirty set. */
  async pushAll(): Promise<SyncStatusDTO> {
    if (!this._storage) return this.status;
    const files = await this._fs.listRecursive("/", {
      skip: (relative) => isExcludedDirectory(relative, this._excludes),
    });
    for (const file of files) this._dirty.add(file);
    return this.flush();
  }

  dispose(): void {
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
  }

  private _schedule(): void {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this._timer = null;
      void this.flush();
    }, this._debounceMs);
    this._emitStatus();
  }

  private async _push(): Promise<void> {
    const storage = this._storage;
    if (!storage) return;

    const dirty = Array.from(this._dirty);
    const deleted = Array.from(this._deleted);
    if (dirty.length === 0 && deleted.length === 0) return;

    this._dirty.clear();
    this._deleted.clear();
    this._setStatus({ phase: "pushing" });

    try {
      for (const path of deleted) {
        await storage.remove(path, true);
      }

      const ops: StorageWriteOp[] = [];
      for (const path of dirty) {
        try {
          const stat = await this._fs.stat(path);
          // Directories carry no bytes; they are implied by their contents.
          if (stat.type !== 1) continue;
          if (stat.size > this._maxFileSize) {
            this._log(
              "warn",
              `skipping ${path}: ${stat.size} bytes exceeds the sync limit`,
            );
            continue;
          }
          ops.push({ path, data: await this._fs.readFile(path) });
        } catch {
          // Deleted between queueing and flushing — nothing to push.
        }
      }

      if (ops.length > 0) {
        if (storage.writeBatch) {
          await storage.writeBatch(ops);
        } else {
          for (const op of ops) await storage.write(op.path, op.data);
        }
      }

      this._setStatus({ phase: "idle", lastPushedAt: Date.now(), error: undefined });
    } catch (error) {
      // Put the work back so the next flush retries instead of losing edits.
      for (const path of dirty) this._dirty.add(path);
      for (const path of deleted) this._deleted.add(path);
      this._setStatus({ phase: "error", error: text(error) });
      this._log("error", `sync push failed: ${text(error)}`);
    }
  }

  private _isExcluded(path: string): boolean {
    const relative = path.replace(/^\//, "");
    return matchesAnyGlob(relative, this._excludes);
  }

  private _setStatus(patch: Partial<SyncStatusDTO>): void {
    this._status = { ...this._status, ...patch };
    this._emitStatus();
  }

  private _emitStatus(): void {
    this._options.onStatus?.(this.status);
  }

  private _log(level: "info" | "warn" | "error", message: string): void {
    this._options.onLog?.(level, message);
  }
}

function text(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
