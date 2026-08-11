import { normalizePath } from "../protocol/paths.js";
import type { StorageAdapter, StorageEntry, StorageWriteOp } from "./types.js";

/**
 * In-process `StorageAdapter`. Useful for tests, for demos with no backend, and
 * as the reference implementation when writing a new adapter — the semantics
 * here (recursive delete by prefix, implicit directories) are what the R2
 * adapter reproduces on top of an object store.
 */
export class MemoryStorage implements StorageAdapter {
  private readonly _files = new Map<string, { data: Uint8Array; mtime: number }>();

  constructor(seed?: Record<string, string | Uint8Array>) {
    for (const [path, value] of Object.entries(seed ?? {})) {
      this._files.set(normalizePath(path), {
        data: typeof value === "string" ? new TextEncoder().encode(value) : value,
        mtime: Date.now(),
      });
    }
  }

  async list(): Promise<StorageEntry[]> {
    return Array.from(this._files.entries()).map(([path, entry]) => ({
      path,
      size: entry.data.byteLength,
      mtime: entry.mtime,
    }));
  }

  async read(path: string): Promise<Uint8Array> {
    const entry = this._files.get(normalizePath(path));
    if (!entry) {
      // The errno prefix is what `BridgeError.from` classifies on, so a missing
      // object surfaces in VS Code as FileNotFound rather than "unavailable".
      const error = new Error(`ENOENT: no such file or directory, open '${path}'`);
      (error as Error & { code?: string }).code = "ENOENT";
      throw error;
    }
    return entry.data;
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    this._files.set(normalizePath(path), { data, mtime: Date.now() });
  }

  async writeBatch(ops: StorageWriteOp[]): Promise<void> {
    for (const op of ops) await this.write(op.path, op.data);
  }

  async remove(path: string, recursive: boolean): Promise<void> {
    const target = normalizePath(path);
    this._files.delete(target);
    if (!recursive) return;
    const prefix = `${target}/`;
    for (const key of Array.from(this._files.keys())) {
      if (key.startsWith(prefix)) this._files.delete(key);
    }
  }
}

export function createMemoryStorage(
  seed?: Record<string, string | Uint8Array>,
): MemoryStorage {
  return new MemoryStorage(seed);
}
