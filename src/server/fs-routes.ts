import { normalizePath, InvalidPathError } from "../protocol/paths.js";
import { decodeBatch } from "../storage/http-storage.js";
import type { StorageEntry } from "../storage/types.js";
import type { ObjectStore } from "./object-store.js";
import type { AuthContext, OpenDSServerConfig } from "./types.js";

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Durable-storage routes.
 *
 * These are *not* on the editing hot path. The browser reads and writes its own
 * in-memory filesystem; this API only sees the debounced sync. That is why a
 * cold start or a slow round trip here never makes typing feel slow.
 */
export class FileRoutes {
  private readonly _store: ObjectStore;
  private readonly _keyPrefix: string;
  private readonly _maxFileSize: number;

  constructor(store: ObjectStore, config: OpenDSServerConfig) {
    this._store = store;
    this._keyPrefix = (config.keyPrefix ?? "workspaces").replace(/^\/+|\/+$/g, "");
    this._maxFileSize = config.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  }

  async list(context: AuthContext): Promise<Response> {
    const prefix = this._prefixFor(context);
    const objects = await this._store.list(prefix);

    const entries: StorageEntry[] = objects.map((object) => ({
      path: `/${object.key.slice(prefix.length)}`,
      size: object.size,
      mtime: object.uploaded,
      ...(object.etag ? { etag: object.etag } : {}),
    }));

    return json(entries);
  }

  async read(context: AuthContext, url: URL): Promise<Response> {
    const path = safePath(url.searchParams.get("path"));
    if (!path) return badRequest("invalid path");

    const data = await this._store.get(this._keyFor(context, path));
    if (!data) return new Response("not found", { status: 404 });

    return new Response(toBody(data), {
      headers: {
        "content-type": "application/octet-stream",
        "cache-control": "no-store",
      },
    });
  }

  async write(
    context: AuthContext,
    url: URL,
    request: Request,
  ): Promise<Response> {
    if (context.readOnly) return forbidden();
    const path = safePath(url.searchParams.get("path"));
    if (!path) return badRequest("invalid path");

    const body = new Uint8Array(await request.arrayBuffer());
    if (body.byteLength > this._maxFileSize) {
      return new Response("file too large", { status: 413 });
    }

    await this._store.put(this._keyFor(context, path), body);
    return new Response(null, { status: 204 });
  }

  /** Bulk upload — one request for a whole debounced batch of edits. */
  async batch(context: AuthContext, request: Request): Promise<Response> {
    if (context.readOnly) return forbidden();

    const ops = decodeBatch(new Uint8Array(await request.arrayBuffer()));
    let written = 0;

    for (const op of ops) {
      const path = safePath(op.path);
      if (!path) continue;
      if (op.data.byteLength > this._maxFileSize) continue;
      await this._store.put(this._keyFor(context, path), op.data);
      written++;
    }

    return json({ written, received: ops.length });
  }

  async remove(context: AuthContext, url: URL): Promise<Response> {
    if (context.readOnly) return forbidden();
    const path = safePath(url.searchParams.get("path"));
    if (!path) return badRequest("invalid path");
    const recursive = url.searchParams.get("recursive") === "true";

    const key = this._keyFor(context, path);
    const keys = [key];

    if (recursive) {
      // Object stores have no directories, so "delete a folder" means deleting
      // every key under its prefix.
      const children = await this._store.list(`${key}/`);
      keys.push(...children.map((object) => object.key));
    }

    await this._store.delete(keys);
    return new Response(null, { status: 204 });
  }

  private _prefixFor(context: AuthContext): string {
    const workspaceId = context.workspaceId ?? context.userId;
    return `${this._keyPrefix}/${encodeSegment(context.userId)}/${encodeSegment(workspaceId)}/`;
  }

  private _keyFor(context: AuthContext, path: string): string {
    return `${this._prefixFor(context)}${path.replace(/^\/+/, "")}`;
  }
}

/* -------------------------------------------------------------------------- */

/**
 * Rejects traversal outright rather than clamping it. A request that tried to
 * escape the workspace is a bug or an attack; either way, silently rewriting it
 * hides the problem.
 */
function safePath(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const path = normalizePath(raw);
    return path === "/" ? null : path;
  } catch (error) {
    if (error instanceof InvalidPathError) return null;
    throw error;
  }
}

/** Keeps a userId containing `/` from writing outside its own prefix. */
function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

export function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function badRequest(message: string): Response {
  return new Response(message, { status: 400 });
}

export function forbidden(): Response {
  return new Response("read-only session", { status: 403 });
}

function toBody(data: Uint8Array): BodyInit {
  return data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
}
