import {
  FileChangeTypeDTO,
  FileTypeDTO,
  type DirEntryDTO,
  type FileChangeDTO,
  type FileStatDTO,
} from "../protocol/messages.js";
import { BridgeError } from "../protocol/channel.js";
import { dirname, joinPath, normalizePath } from "../protocol/paths.js";
import type { NodepodFsLike, NodepodWatcherLike } from "./nodepod-types.js";

export interface FileSystemServiceOptions {
  fs: NodepodFsLike;
  /** VFS directory the workspace root (`/`) maps onto. */
  workspaceRoot: string;
  /** Fired for every mutation so the sync engine can queue an upload. */
  onMutation?: (change: FileChangeDTO) => void;
  /** Fired for watcher hits, keyed by the watcher id the extension registered. */
  onWatchEvent?: (watcherId: string, changes: FileChangeDTO[]) => void;
}

interface WatcherEntry {
  handle: NodepodWatcherLike;
  path: string;
}

/**
 * Backs the VS Code `FileSystemProvider` with Nodepod's in-browser VFS.
 *
 * Paths on the wire are workspace-relative (`/src/index.ts`); paths inside
 * Nodepod are absolute (`/workspace/src/index.ts`). All translation happens
 * here so nothing else has to think about the two coordinate systems.
 */
export class FileSystemService {
  private readonly _fs: NodepodFsLike;
  private readonly _root: string;
  private readonly _options: FileSystemServiceOptions;
  private readonly _watchers = new Map<string, WatcherEntry>();

  constructor(options: FileSystemServiceOptions) {
    this._fs = options.fs;
    this._root = normalizePath(options.workspaceRoot);
    this._options = options;
  }

  /** Workspace path (`/src/a.ts`) -> VFS path (`/workspace/src/a.ts`). */
  toVfs(path: string): string {
    const normalized = normalizePath(path);
    return normalized === "/" ? this._root : joinPath(this._root, normalized);
  }

  /** VFS path -> workspace path. Returns null for paths outside the root. */
  toWorkspace(vfsPath: string): string | null {
    const normalized = normalizePath(vfsPath);
    if (normalized === this._root) return "/";
    if (!normalized.startsWith(`${this._root}/`)) return null;
    return normalized.slice(this._root.length) || "/";
  }

  async ensureRoot(): Promise<void> {
    if (!(await this._fs.exists(this._root))) {
      await this._fs.mkdir(this._root, { recursive: true });
    }
  }

  async stat(path: string): Promise<FileStatDTO> {
    const target = this.toVfs(path);
    const stat = await this._wrap(() => this._fs.stat(target), path);
    return {
      type: stat.isDirectory ? FileTypeDTO.Directory : FileTypeDTO.File,
      ctime: stat.mtime,
      mtime: stat.mtime,
      size: stat.size,
    };
  }

  async readDirectory(path: string): Promise<DirEntryDTO[]> {
    const target = this.toVfs(path);
    const names = await this._wrap(() => this._fs.readdir(target), path);

    // `readdir` gives names only, so each entry needs its own stat. They all hit
    // the same in-memory volume, so running them together costs nothing.
    const entries = await Promise.all(
      names.map(async (name): Promise<DirEntryDTO> => {
        try {
          const stat = await this._fs.stat(joinPath(target, name));
          return [name, stat.isDirectory ? FileTypeDTO.Directory : FileTypeDTO.File];
        } catch {
          return [name, FileTypeDTO.Unknown];
        }
      }),
    );
    return entries;
  }

  async readFile(path: string): Promise<Uint8Array> {
    const target = this.toVfs(path);
    const data = await this._wrap(() => this._fs.readFile(target), path);
    return toUint8Array(data);
  }

  async writeFile(
    path: string,
    data: Uint8Array,
    options: { create: boolean; overwrite: boolean },
  ): Promise<void> {
    const target = this.toVfs(path);
    const existed = await this._fs.exists(target);

    if (existed && !options.overwrite) {
      throw new BridgeError("FileExists", `file already exists: ${path}`);
    }
    if (!existed && !options.create) {
      throw new BridgeError("FileNotFound", `file not found: ${path}`);
    }
    if (existed) {
      const stat = await this._fs.stat(target);
      if (stat.isDirectory) {
        throw new BridgeError("FileIsADirectory", `${path} is a directory`);
      }
    }

    await this._wrap(() => this._fs.writeFile(target, data), path);
    this._notify({
      type: existed ? FileChangeTypeDTO.Changed : FileChangeTypeDTO.Created,
      path: normalizePath(path),
    });
  }

  async createDirectory(path: string): Promise<void> {
    const target = this.toVfs(path);
    if (await this._fs.exists(target)) {
      const stat = await this._fs.stat(target);
      if (stat.isDirectory) return; // mkdir -p semantics; VS Code retries freely
      throw new BridgeError("FileExists", `file already exists: ${path}`);
    }
    await this._wrap(() => this._fs.mkdir(target, { recursive: true }), path);
    this._notify({ type: FileChangeTypeDTO.Created, path: normalizePath(path) });
  }

  async delete(path: string, recursive: boolean): Promise<void> {
    const target = this.toVfs(path);
    if (!(await this._fs.exists(target))) {
      throw new BridgeError("FileNotFound", `file not found: ${path}`);
    }
    const stat = await this._fs.stat(target);
    if (stat.isDirectory && !recursive) {
      const children = await this._fs.readdir(target);
      if (children.length > 0) {
        throw new BridgeError(
          "NoPermissions",
          `directory not empty: ${path} (pass recursive to delete it)`,
        );
      }
    }

    // Collect descendants before the delete so the sync engine learns about
    // every removed object, not just the directory that contained them.
    const removed = stat.isDirectory
      ? await this._collectPaths(normalizePath(path))
      : [];

    await this._wrap(
      () => this._fs.rm(target, { recursive: true, force: true }),
      path,
    );

    for (const child of removed) {
      this._notify({ type: FileChangeTypeDTO.Deleted, path: child });
    }
    this._notify({ type: FileChangeTypeDTO.Deleted, path: normalizePath(path) });
  }

  async rename(from: string, to: string, overwrite: boolean): Promise<void> {
    const fromVfs = this.toVfs(from);
    const toVfs = this.toVfs(to);

    if (!(await this._fs.exists(fromVfs))) {
      throw new BridgeError("FileNotFound", `file not found: ${from}`);
    }
    if (await this._fs.exists(toVfs)) {
      if (!overwrite) {
        throw new BridgeError("FileExists", `file already exists: ${to}`);
      }
      await this._fs.rm(toVfs, { recursive: true, force: true });
    }

    const stat = await this._fs.stat(fromVfs);
    const movedChildren = stat.isDirectory
      ? await this._collectPaths(normalizePath(from))
      : [];

    await this._ensureParent(toVfs);
    await this._wrap(() => this._fs.rename(fromVfs, toVfs), from);

    const fromRoot = normalizePath(from);
    const toRoot = normalizePath(to);
    for (const child of movedChildren) {
      this._notify({ type: FileChangeTypeDTO.Deleted, path: child });
      this._notify({
        type: FileChangeTypeDTO.Created,
        path: joinPath(toRoot, child.slice(fromRoot.length)),
      });
    }
    this._notify({ type: FileChangeTypeDTO.Deleted, path: fromRoot });
    this._notify({ type: FileChangeTypeDTO.Created, path: toRoot });
  }

  async copy(from: string, to: string, overwrite: boolean): Promise<void> {
    const fromVfs = this.toVfs(from);
    if (!(await this._fs.exists(fromVfs))) {
      throw new BridgeError("FileNotFound", `file not found: ${from}`);
    }
    const stat = await this._fs.stat(fromVfs);

    if (!stat.isDirectory) {
      const data = toUint8Array(await this._fs.readFile(fromVfs));
      await this.writeFile(to, data, { create: true, overwrite });
      return;
    }

    await this.createDirectory(to);
    for (const name of await this._fs.readdir(fromVfs)) {
      await this.copy(joinPath(from, name), joinPath(to, name), overwrite);
    }
  }

  watch(
    id: string,
    path: string,
    recursive: boolean,
    excludes?: string[],
  ): void {
    this.unwatch(id);
    const target = this.toVfs(path);
    const excludeSet = new Set(excludes ?? []);

    try {
      const handle = this._fs.watch(
        target,
        { recursive },
        (event, filename) => {
          const absolute = filename ? joinPath(target, filename) : target;
          const workspacePath = this.toWorkspace(absolute);
          if (!workspacePath) return;
          if (excludeSet.size > 0 && excludeSet.has(workspacePath)) return;

          // Nodepod reports `rename` for both creation and deletion; resolving
          // existence here saves the extension from guessing.
          void this._fs
            .exists(absolute)
            .then((exists) => {
              const type =
                event === "change"
                  ? FileChangeTypeDTO.Changed
                  : exists
                    ? FileChangeTypeDTO.Created
                    : FileChangeTypeDTO.Deleted;
              const change: FileChangeDTO = { type, path: workspacePath };
              this._options.onWatchEvent?.(id, [change]);
              this._options.onMutation?.(change);
            })
            .catch(() => undefined);
        },
      );
      this._watchers.set(id, { handle, path: target });
    } catch {
      // A watch on a path that does not exist yet is not an error worth
      // surfacing — VS Code watches speculatively and retries.
    }
  }

  unwatch(id: string): void {
    const entry = this._watchers.get(id);
    if (!entry) return;
    this._watchers.delete(id);
    try {
      entry.handle.close();
    } catch {
      // already closed
    }
  }

  dispose(): void {
    for (const id of Array.from(this._watchers.keys())) this.unwatch(id);
  }

  /** Depth-first list of every file/dir under `path`, workspace-relative. */
  async listRecursive(
    path = "/",
    options?: { includeDirectories?: boolean; skip?: (relative: string) => boolean },
  ): Promise<string[]> {
    const out: string[] = [];
    const includeDirs = options?.includeDirectories ?? false;

    const walk = async (current: string): Promise<void> => {
      let names: string[];
      try {
        names = await this._fs.readdir(this.toVfs(current));
      } catch {
        return;
      }
      for (const name of names) {
        const child = joinPath(current, name);
        if (options?.skip?.(child.slice(1))) continue;
        let isDirectory = false;
        try {
          isDirectory = (await this._fs.stat(this.toVfs(child))).isDirectory;
        } catch {
          continue;
        }
        if (isDirectory) {
          if (includeDirs) out.push(child);
          await walk(child);
        } else {
          out.push(child);
        }
      }
    };

    await walk(normalizePath(path));
    return out;
  }

  private async _collectPaths(workspacePath: string): Promise<string[]> {
    return this.listRecursive(workspacePath, { includeDirectories: true });
  }

  private async _ensureParent(vfsPath: string): Promise<void> {
    const parent = dirname(vfsPath);
    if (parent !== "/" && !(await this._fs.exists(parent))) {
      await this._fs.mkdir(parent, { recursive: true });
    }
  }

  private _notify(change: FileChangeDTO): void {
    this._options.onMutation?.(change);
  }

  private async _wrap<T>(operation: () => Promise<T>, path: string): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const bridgeError = BridgeError.from(error);
      throw new BridgeError(
        bridgeError.code,
        `${bridgeError.message} (${path})`,
        bridgeError.remoteStack,
      );
    }
  }
}

export function toUint8Array(data: string | Uint8Array): Uint8Array {
  return typeof data === "string" ? new TextEncoder().encode(data) : data;
}
