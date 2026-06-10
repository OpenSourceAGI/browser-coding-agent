// Repository layer between the UI and nodepod.fs (plan step 1.2).
// Every file operation the IDE performs flows through this class, which
// normalizes paths, emits change events the UI components subscribe to,
// and offers tree reads for the explorer. The Nodepod virtual filesystem
// is the single source of truth — there is no parallel storage layer.

import { normalize, dirname } from "../polyfills/path";
import type { StatResult } from "../sdk/types";
import type { IdeFsApi } from "./host";

export interface FileTreeNode {
  name: string;
  path: string;
  kind: "file" | "directory";
  children?: FileTreeNode[];
}

export type FileChangeKind =
  | "write"
  | "mkdir"
  | "delete"
  | "rename"
  | "external";

export interface FileChangeEvent {
  kind: FileChangeKind;
  path: string;
  /** Destination path for renames. */
  toPath?: string;
}

export interface ReadTreeOptions {
  /** Directory names skipped at any depth. Defaults to node_modules/.git/.cache. */
  excludeDirs?: string[];
  /** Maximum depth (1 = direct children only). Defaults to unlimited. */
  maxDepth?: number;
}

export const DEFAULT_TREE_EXCLUDES = ["node_modules", ".git", ".cache"];

/** Collapse slashes, resolve ./.., always return an absolute path. */
export function normalizePath(path: string): string {
  const abs = path.startsWith("/") ? path : `/${path}`;
  const result = normalize(abs);
  return result === "" ? "/" : result;
}

/** Directories first, then files, each alphabetically (VS Code ordering). */
export function sortTreeNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export class NodepodFileSystem {
  private _fs: IdeFsApi;
  private _listeners = new Set<(event: FileChangeEvent) => void>();
  private _hostWatcher: { close(): void } | null = null;

  constructor(fs: IdeFsApi) {
    this._fs = fs;
  }

  /* ---- reads ---- */

  async readFile(path: string): Promise<string> {
    return this._fs.readFile(normalizePath(path), "utf8");
  }

  async readFileBinary(path: string): Promise<Uint8Array> {
    return this._fs.readFile(normalizePath(path));
  }

  async readdir(path: string): Promise<string[]> {
    return this._fs.readdir(normalizePath(path));
  }

  async stat(path: string): Promise<StatResult> {
    return this._fs.stat(normalizePath(path));
  }

  async exists(path: string): Promise<boolean> {
    return this._fs.exists(normalizePath(path));
  }

  /** Recursive listing for the file explorer, sorted dirs-first. */
  async readTree(
    dir = "/",
    opts: ReadTreeOptions = {},
  ): Promise<FileTreeNode[]> {
    const excludeDirs = new Set(opts.excludeDirs ?? DEFAULT_TREE_EXCLUDES);
    const maxDepth = opts.maxDepth ?? Infinity;

    const walk = async (
      current: string,
      depth: number,
    ): Promise<FileTreeNode[]> => {
      const names = await this._fs.readdir(current);
      const nodes: FileTreeNode[] = [];
      for (const name of names) {
        const path = normalizePath(
          current === "/" ? `/${name}` : `${current}/${name}`,
        );
        const stat = await this._fs.stat(path);
        if (stat.isDirectory) {
          if (excludeDirs.has(name)) continue;
          const node: FileTreeNode = { name, path, kind: "directory" };
          if (depth < maxDepth) node.children = await walk(path, depth + 1);
          nodes.push(node);
        } else {
          nodes.push({ name, path, kind: "file" });
        }
      }
      return sortTreeNodes(nodes);
    };

    return walk(normalizePath(dir), 1);
  }

  /* ---- writes (all emit change events) ---- */

  async writeFile(path: string, data: string | Uint8Array): Promise<void> {
    const target = normalizePath(path);
    await this._fs.writeFile(target, data);
    this._emit({ kind: "write", path: target });
  }

  async mkdir(path: string, opts?: { recursive?: boolean }): Promise<void> {
    const target = normalizePath(path);
    await this._fs.mkdir(target, opts ?? { recursive: true });
    this._emit({ kind: "mkdir", path: target });
  }

  /** Remove a file or directory (directories are always removed recursively). */
  async rm(path: string): Promise<void> {
    const target = normalizePath(path);
    const stat = await this._fs.stat(target);
    if (stat.isDirectory) {
      await this._fs.rmdir(target, { recursive: true });
    } else {
      await this._fs.unlink(target);
    }
    this._emit({ kind: "delete", path: target });
  }

  async rename(from: string, to: string): Promise<void> {
    const source = normalizePath(from);
    const target = normalizePath(to);
    await this._fs.rename(source, target);
    this._emit({ kind: "rename", path: source, toPath: target });
  }

  /* ---- change events ---- */

  onDidChange(listener: (event: FileChangeEvent) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /**
   * Bridge changes made outside this layer (spawned processes, npm install)
   * into the same event stream, via the host's recursive watcher.
   */
  watchHost(root = "/"): () => void {
    this._hostWatcher?.close();
    this._hostWatcher = this._fs.watch(
      normalizePath(root),
      { recursive: true },
      (_event: string, filename: string | null) => {
        this._emit({
          kind: "external",
          path: filename ? normalizePath(filename) : normalizePath(root),
        });
      },
    );
    return () => {
      this._hostWatcher?.close();
      this._hostWatcher = null;
    };
  }

  dispose(): void {
    this._hostWatcher?.close();
    this._hostWatcher = null;
    this._listeners.clear();
  }

  /** Parent directory of a path (exposed for UI components). */
  parentOf(path: string): string {
    return dirname(normalizePath(path));
  }

  private _emit(event: FileChangeEvent): void {
    for (const listener of [...this._listeners]) listener(event);
  }
}
