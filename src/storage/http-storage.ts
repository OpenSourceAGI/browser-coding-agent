import type { StorageAdapter, StorageEntry, StorageWriteOp } from "./types.js";

export interface HttpStorageOptions {
  /** Base URL of the mounted server routes, e.g. `/api/opends`. */
  apiBase: string;
  /** Workspace identifier; becomes the R2 key prefix on the server. */
  workspaceId: string;
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
  credentials?: RequestCredentials;
  fetchImpl?: typeof fetch;
}

/**
 * Client-side `StorageAdapter` for the routes in `../server`.
 *
 * Auth is entirely the host's business: pass a bearer token through `headers`,
 * or rely on `credentials: "include"` and a session cookie. This adapter never
 * inspects or stores credentials itself.
 */
export class HttpStorage implements StorageAdapter {
  private readonly _options: HttpStorageOptions;
  private readonly _fetch: typeof fetch;

  constructor(options: HttpStorageOptions) {
    this._options = options;
    this._fetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async list(): Promise<StorageEntry[]> {
    const response = await this._request("GET", "/fs/list");
    return (await response.json()) as StorageEntry[];
  }

  async read(path: string): Promise<Uint8Array> {
    const response = await this._request(
      "GET",
      `/fs/read?path=${encodeURIComponent(path)}`,
    );
    return new Uint8Array(await response.arrayBuffer());
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    await this._request("PUT", `/fs/write?path=${encodeURIComponent(path)}`, {
      body: toBodyInit(data),
      contentType: "application/octet-stream",
    });
  }

  async remove(path: string, recursive: boolean): Promise<void> {
    await this._request(
      "DELETE",
      `/fs/delete?path=${encodeURIComponent(path)}&recursive=${recursive}`,
    );
  }

  /**
   * Uploads many files in one request using a length-prefixed frame format:
   * `[u32 pathBytes][path][u32 dataBytes][data]…`. Multipart would work too,
   * but this keeps the server side dependency-free and avoids base64 inflation
   * on what is often a few megabytes of source.
   */
  async writeBatch(ops: StorageWriteOp[]): Promise<void> {
    if (ops.length === 0) return;
    await this._request("POST", "/fs/batch", {
      body: toBodyInit(encodeBatch(ops)),
      contentType: "application/x-opends-batch",
    });
  }

  private async _request(
    method: string,
    path: string,
    init?: { body?: BodyInit; contentType?: string },
  ): Promise<Response> {
    const headers: Record<string, string> = {
      "x-opends-workspace": this._options.workspaceId,
      ...(await this._resolveHeaders()),
    };
    if (init?.contentType) headers["content-type"] = init.contentType;

    const response = await this._fetch(`${this._options.apiBase}${path}`, {
      method,
      headers,
      credentials: this._options.credentials ?? "include",
      ...(init?.body ? { body: init.body } : {}),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `opends storage ${method} ${path} failed: ${response.status} ${detail.slice(0, 200)}`,
      );
    }
    return response;
  }

  private async _resolveHeaders(): Promise<Record<string, string>> {
    const headers = this._options.headers;
    if (!headers) return {};
    return typeof headers === "function" ? await headers() : headers;
  }
}

export function createHttpStorage(options: HttpStorageOptions): HttpStorage {
  return new HttpStorage(options);
}

/* -------------------------------------------------------------------------- */
/* Batch frame codec — shared with the server route                            */
/* -------------------------------------------------------------------------- */

export function encodeBatch(ops: StorageWriteOp[]): Uint8Array {
  const encoder = new TextEncoder();
  const frames = ops.map((op) => ({
    path: encoder.encode(op.path),
    data: op.data,
  }));

  const total = frames.reduce(
    (sum, frame) => sum + 8 + frame.path.byteLength + frame.data.byteLength,
    0,
  );
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let offset = 0;

  for (const frame of frames) {
    view.setUint32(offset, frame.path.byteLength, false);
    offset += 4;
    out.set(frame.path, offset);
    offset += frame.path.byteLength;
    view.setUint32(offset, frame.data.byteLength, false);
    offset += 4;
    out.set(frame.data, offset);
    offset += frame.data.byteLength;
  }
  return out;
}

export function decodeBatch(bytes: Uint8Array): StorageWriteOp[] {
  const decoder = new TextDecoder();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ops: StorageWriteOp[] = [];
  let offset = 0;

  while (offset + 4 <= bytes.byteLength) {
    const pathLength = view.getUint32(offset, false);
    offset += 4;
    if (offset + pathLength + 4 > bytes.byteLength) break;

    const path = decoder.decode(bytes.subarray(offset, offset + pathLength));
    offset += pathLength;

    const dataLength = view.getUint32(offset, false);
    offset += 4;
    if (offset + dataLength > bytes.byteLength) break;

    ops.push({ path, data: bytes.slice(offset, offset + dataLength) });
    offset += dataLength;
  }
  return ops;
}

/**
 * `fetch` types disagree about `Uint8Array<ArrayBufferLike>` vs `BodyInit`
 * across TS DOM lib versions; going through the underlying buffer is accepted
 * everywhere and copies nothing.
 */
function toBodyInit(data: Uint8Array): BodyInit {
  return data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
}
