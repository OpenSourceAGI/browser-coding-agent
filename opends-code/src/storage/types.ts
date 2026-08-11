/**
 * Persistence contract.
 *
 * The bundled implementation talks to Cloudflare R2 through this package's
 * server routes, but nothing above this interface knows that. A host that wants
 * S3, a Postgres blob table, or the browser's own OPFS implements these five
 * methods and passes the adapter in `OpenDSCodeConfig.storage`.
 */

export interface StorageEntry {
  /** Workspace-relative path with a leading slash, e.g. `/src/index.ts`. */
  path: string;
  size: number;
  /** Epoch millis. Adapters that cannot track this should return 0. */
  mtime: number;
  /** Opaque version marker used to skip unchanged files. */
  etag?: string;
}

export interface StorageWriteOp {
  path: string;
  data: Uint8Array;
}

export interface StorageAdapter {
  /** Full listing of everything stored for this workspace. */
  list(): Promise<StorageEntry[]>;
  read(path: string): Promise<Uint8Array>;
  write(path: string, data: Uint8Array): Promise<void>;
  remove(path: string, recursive: boolean): Promise<void>;
  /**
   * Optional bulk write. When present the sync engine uses it instead of N
   * round trips, which matters a lot for the first push of a fresh project.
   */
  writeBatch?(ops: StorageWriteOp[]): Promise<void>;
}

/**
 * Paths never pushed to storage: reinstallable, huge, or machine-local. Keeping
 * `node_modules` out is what makes a workspace snapshot small enough to
 * hydrate quickly — Nodepod reinstalls from `package.json` on demand.
 */
export const DEFAULT_SYNC_EXCLUDES = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.next/**",
  "**/dist/**",
  "**/build/**",
  "**/out/**",
  "**/.cache/**",
  "**/.turbo/**",
  "**/coverage/**",
  "**/*.log",
];

/** Files above this size are skipped rather than silently truncated. */
export const DEFAULT_MAX_SYNC_FILE_SIZE = 10 * 1024 * 1024;
