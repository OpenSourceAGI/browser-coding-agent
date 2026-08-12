import type { MemoryVolume } from "@scelar/nodepod";
import { Emitter, toDisposable } from "./emitter";
import type {
  DirEntry,
  Disposable,
  FileChange,
  FileStat,
  RuntimeFileSystem,
} from "./types";

/**
 * Nodepod's MemoryVolume, exposed through the runtime contract.
 *
 * The volume is synchronous, so every method here resolves on the spot. That
 * matters for the workbench: VS Code's explorer and search issue thousands of
 * stat calls, and going through a real microtask queue per call is what makes
 * browser IDEs feel sluggish.
 */
export class NodepodFileSystem implements RuntimeFileSystem {
  private readonly _onChange = new Emitter<FileChange>();
  private _volumeWatcher: { close(): void } | null = null;

  constructor(
    private readonly _volume: MemoryVolume,
    private readonly _root: string,
  ) {}

  /**
   * One watcher on the volume root fans out to every workbench watcher.
   * Nodepod fires per-path callbacks, so registering one per open editor
   * would multiply the same event N times.
   */
  start(): void {
    if (this._volumeWatcher) return;
    this._volumeWatcher = this._volume.watch(
      this._root,
      { recursive: true },
      (event: string, filename: string | null) => {
        if (!filename) return;
        const path = filename.startsWith("/")
          ? filename
          : joinPath(this._root, filename);
        // Nodepod reports "rename" for both creation and deletion; the volume
        // is the only place that knows which one actually happened.
        const exists = this._volume.existsSync(path);
        const kind: FileChange["kind"] =
          event === "rename" ? (exists ? "created" : "deleted") : "changed";
        this._onChange.fire({ kind, path });
      },
    );
  }

  dispose(): void {
    this._volumeWatcher?.close();
    this._volumeWatcher = null;
    this._onChange.clear();
  }

  watch(path: string, listener: (change: FileChange) => void): Disposable {
    const prefix = path.endsWith("/") ? path : `${path}/`;
    return this._onChange.on((change) => {
      if (change.path === path || change.path.startsWith(prefix)) {
        listener(change);
      }
    });
  }

  async readFile(path: string): Promise<Uint8Array> {
    return this._volume.readFileSync(path);
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    const dir = dirname(path);
    if (dir !== "/" && !this._volume.existsSync(dir)) {
      this._volume.mkdirSync(dir, { recursive: true });
    }
    this._volume.writeFileSync(path, data);
  }

  async readdir(path: string): Promise<DirEntry[]> {
    const names = this._volume.readdirSync(path);
    const entries: DirEntry[] = [];
    for (const name of names) {
      try {
        // lstat, not stat: the explorer must show a symlink as a symlink
        // rather than silently following it into a cycle.
        const st = this._volume.lstatSync(joinPath(path, name));
        entries.push({
          name,
          type: st.isSymbolicLink()
            ? "symlink"
            : st.isDirectory()
              ? "directory"
              : "file",
        });
      } catch {
        // Entry vanished between readdir and lstat — skip it rather than
        // failing the whole directory listing.
      }
    }
    return entries;
  }

  async stat(path: string): Promise<FileStat> {
    const st = this._volume.statSync(path);
    const mtime = st.mtimeMs;
    return {
      type: st.isDirectory() ? "directory" : "file",
      size: st.size,
      mtime,
      ctime: st.ctimeMs,
    };
  }

  async exists(path: string): Promise<boolean> {
    return this._volume.existsSync(path);
  }

  async mkdir(path: string): Promise<void> {
    this._volume.mkdirSync(path, { recursive: true });
  }

  async delete(path: string, opts?: { recursive?: boolean }): Promise<void> {
    const st = this._volume.statSync(path);
    if (!st.isDirectory()) {
      this._volume.unlinkSync(path);
      return;
    }
    if (opts?.recursive) this._removeRecursive(path);
    else this._volume.rmdirSync(path);
  }

  async rename(
    from: string,
    to: string,
    opts?: { overwrite?: boolean },
  ): Promise<void> {
    if (this._volume.existsSync(to)) {
      if (!opts?.overwrite) {
        throw Object.assign(new Error(`EEXIST: file already exists, rename '${to}'`), {
          code: "EEXIST",
        });
      }
      const st = this._volume.statSync(to);
      await this.delete(to, { recursive: st.isDirectory() });
    }
    const dir = dirname(to);
    if (dir !== "/" && !this._volume.existsSync(dir)) {
      this._volume.mkdirSync(dir, { recursive: true });
    }
    this._volume.renameSync(from, to);
  }

  /** Depth-first walk used by the Sandbox mirror. Skips heavy generated dirs. */
  async collect(
    dir: string,
    opts: { exclude?: Set<string>; maxBytes?: number } = {},
  ): Promise<Array<{ path: string; data: Uint8Array; mtime: number }>> {
    const exclude = opts.exclude ?? DEFAULT_EXCLUDES;
    const maxBytes = opts.maxBytes ?? Infinity;
    const out: Array<{ path: string; data: Uint8Array; mtime: number }> = [];
    let total = 0;

    const walk = (current: string) => {
      let names: string[];
      try {
        names = this._volume.readdirSync(current);
      } catch {
        return;
      }
      for (const name of names) {
        if (exclude.has(name)) continue;
        const full = joinPath(current, name);
        let st;
        try {
          st = this._volume.lstatSync(full);
        } catch {
          continue;
        }
        if (st.isSymbolicLink()) continue;
        if (st.isDirectory()) {
          walk(full);
          continue;
        }
        const size = st.size;
        if (total + size > maxBytes) continue;
        try {
          const data = this._volume.readFileSync(full);
          total += data.byteLength;
          out.push({ path: full, data, mtime: st.mtimeMs });
        } catch {
          // Unreadable file — nothing useful to mirror.
        }
      }
    };

    walk(dir);
    return out;
  }

  get volume(): MemoryVolume {
    return this._volume;
  }

  private _removeRecursive(dir: string): void {
    for (const name of this._volume.readdirSync(dir)) {
      const full = joinPath(dir, name);
      const st = this._volume.lstatSync(full);
      if (st.isDirectory() && !st.isSymbolicLink()) this._removeRecursive(full);
      else this._volume.unlinkSync(full);
    }
    this._volume.rmdirSync(dir);
  }
}

export const DEFAULT_EXCLUDES = new Set([
  "node_modules",
  ".git",
  ".cache",
  ".npm",
  "dist",
  ".next",
  ".vscode-web",
]);

export function joinPath(dir: string, name: string): string {
  return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}

export function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  if (idx <= 0) return "/";
  return path.slice(0, idx);
}

export { toDisposable };
