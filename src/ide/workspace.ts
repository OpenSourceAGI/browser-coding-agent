// Workspace boot + persistence (plan phase 2). Nodepod's virtual
// filesystem is the only data layer: the IDE boots Nodepod with the
// workspace files, every edit flows through NodepodFileSystem, and
// persistence is a Nodepod snapshot serialized to host storage. There is
// no separate legacy store to dual-write against.

import type { NodepodOptions, Snapshot, SnapshotOptions } from "../sdk/types";
import type { PreviewManager } from "./preview-manager";

export interface IdeWorkspaceConfig {
  files?: Record<string, string | Uint8Array>;
  workdir?: string;
  env?: Record<string, string>;
  /** Forwarded to Nodepod's CORS proxy whitelist (plan step 4.3). */
  allowedFetchDomains?: string[] | null;
  watermark?: boolean;
  swUrl?: string;
  serviceWorker?: boolean;
  onServerReady?: (port: number, url: string) => void;
}

/**
 * Build the Nodepod.boot() options for an IDE workspace, chaining the
 * PreviewManager into onServerReady so preview routing works without
 * extra wiring (plan steps 2.1 and 4.2).
 */
export function buildBootOptions(
  config: IdeWorkspaceConfig = {},
  previews?: PreviewManager,
): NodepodOptions {
  const userOnServerReady = config.onServerReady;
  const options: NodepodOptions = {
    files: config.files,
    workdir: config.workdir,
    env: config.env,
    watermark: config.watermark,
    onServerReady: (port, url) => {
      previews?.notifyServerReady(port, url);
      userOnServerReady?.(port, url);
    },
  };
  if (config.swUrl !== undefined) options.swUrl = config.swUrl;
  if (config.serviceWorker !== undefined) {
    options.serviceWorker = config.serviceWorker;
  }
  if (config.allowedFetchDomains !== undefined) {
    options.allowedFetchDomains = config.allowedFetchDomains;
  }
  return options;
}

/* ---- snapshot persistence ---- */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SnapshotHost {
  snapshot(opts?: SnapshotOptions): Snapshot;
  restore(snapshot: Snapshot, opts?: SnapshotOptions): Promise<void>;
}

export const WORKSPACE_STORE_KEY = "nodepod-ide.workspace.v1";

/**
 * Persist the workspace as a Nodepod snapshot (shallow — node_modules is
 * re-installed from package.json on restore). The snapshot format is
 * plain JSON, so any StorageLike (localStorage, a KV adapter) works.
 */
export class WorkspaceStore {
  private _storage: StorageLike;
  private _key: string;

  constructor(storage: StorageLike, key: string = WORKSPACE_STORE_KEY) {
    this._storage = storage;
    this._key = key;
  }

  save(host: Pick<SnapshotHost, "snapshot">, opts?: SnapshotOptions): void {
    const snapshot = host.snapshot(opts);
    this._storage.setItem(this._key, JSON.stringify(snapshot));
  }

  load(): Snapshot | null {
    const raw = this._storage.getItem(this._key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Snapshot;
      if (!parsed || !Array.isArray(parsed.entries)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  /** Restore a stored snapshot into the host. Returns false if none stored. */
  async restoreInto(
    host: Pick<SnapshotHost, "restore">,
    opts?: SnapshotOptions,
  ): Promise<boolean> {
    const snapshot = this.load();
    if (!snapshot) return false;
    await host.restore(snapshot, opts);
    return true;
  }

  clear(): void {
    this._storage.removeItem(this._key);
  }
}
