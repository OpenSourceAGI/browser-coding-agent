/**
 * Server-side object storage.
 *
 * Two implementations ship: one over a Cloudflare R2 *binding* (fast path when
 * the routes run on Workers/Pages) and one over R2's S3-compatible API (for
 * Next.js on Node, Vercel, or anywhere else). Both satisfy the same interface,
 * so the route handlers never branch on deployment target.
 */

export interface ObjectInfo {
  key: string;
  size: number;
  uploaded: number;
  etag?: string;
}

export interface ObjectStore {
  list(prefix: string): Promise<ObjectInfo[]>;
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, data: Uint8Array): Promise<void>;
  delete(keys: string[]): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* R2 binding                                                                  */
/* -------------------------------------------------------------------------- */

/** Structural subset of `R2Bucket` — avoids a hard dep on workers-types. */
export interface R2BucketLike {
  list(options?: {
    prefix?: string;
    cursor?: string;
    limit?: number;
    delimiter?: string;
  }): Promise<{
    objects: Array<{ key: string; size: number; uploaded: Date; etag?: string }>;
    truncated: boolean;
    cursor?: string;
  }>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  put(key: string, value: ArrayBuffer | Uint8Array | ReadableStream): Promise<unknown>;
  delete(keys: string | string[]): Promise<void>;
  head(key: string): Promise<{ size: number; uploaded: Date } | null>;
}

export class R2BindingStore implements ObjectStore {
  constructor(private readonly _bucket: R2BucketLike) {}

  async list(prefix: string): Promise<ObjectInfo[]> {
    const out: ObjectInfo[] = [];
    let cursor: string | undefined;

    // R2 pages at 1000 objects; a workspace can easily exceed that.
    do {
      const page = await this._bucket.list({ prefix, ...(cursor ? { cursor } : {}) });
      for (const object of page.objects) {
        out.push({
          key: object.key,
          size: object.size,
          uploaded: object.uploaded ? new Date(object.uploaded).getTime() : 0,
          ...(object.etag ? { etag: object.etag } : {}),
        });
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);

    return out;
  }

  async get(key: string): Promise<Uint8Array | null> {
    const object = await this._bucket.get(key);
    if (!object) return null;
    return new Uint8Array(await object.arrayBuffer());
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    await this._bucket.put(key, data);
  }

  async delete(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    // R2's batch delete caps at 1000 keys per call.
    for (let i = 0; i < keys.length; i += 1000) {
      await this._bucket.delete(keys.slice(i, i + 1000));
    }
  }
}

/* -------------------------------------------------------------------------- */
/* S3-compatible (R2 outside Workers)                                          */
/* -------------------------------------------------------------------------- */

export interface S3StoreOptions {
  /** e.g. `https://<account>.r2.cloudflarestorage.com` */
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** R2 ignores the region but SigV4 requires one; `auto` is what R2 documents. */
  region?: string;
  fetchImpl?: typeof fetch;
}

/**
 * R2 over its S3 API, signed with SigV4 using WebCrypto.
 *
 * Hand-rolling the signature keeps this package dependency-free and edge
 * compatible — the AWS SDK is large, Node-oriented, and unnecessary for the
 * four operations used here.
 */
export class S3Store implements ObjectStore {
  private readonly _options: Required<Omit<S3StoreOptions, "fetchImpl">>;
  private readonly _fetch: typeof fetch;

  constructor(options: S3StoreOptions) {
    this._options = {
      endpoint: options.endpoint.replace(/\/+$/, ""),
      bucket: options.bucket,
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      region: options.region ?? "auto",
    };
    this._fetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async list(prefix: string): Promise<ObjectInfo[]> {
    const out: ObjectInfo[] = [];
    let continuationToken: string | undefined;

    do {
      const query = new URLSearchParams({ "list-type": "2", prefix });
      if (continuationToken) query.set("continuation-token", continuationToken);

      const response = await this._send("GET", `/${this._options.bucket}`, {
        query,
      });
      const xml = await response.text();

      for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const block = match[1]!;
        const key = tag(block, "Key");
        if (!key) continue;
        out.push({
          key: decodeXmlEntities(key),
          size: Number(tag(block, "Size") ?? 0),
          uploaded: Date.parse(tag(block, "LastModified") ?? "") || 0,
          ...(tag(block, "ETag") ? { etag: tag(block, "ETag")! } : {}),
        });
      }

      continuationToken =
        tag(xml, "IsTruncated") === "true"
          ? (tag(xml, "NextContinuationToken") ?? undefined)
          : undefined;
    } while (continuationToken);

    return out;
  }

  async get(key: string): Promise<Uint8Array | null> {
    const response = await this._send(
      "GET",
      `/${this._options.bucket}/${encodeKey(key)}`,
      { allowNotFound: true },
    );
    if (response.status === 404) return null;
    return new Uint8Array(await response.arrayBuffer());
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    await this._send("PUT", `/${this._options.bucket}/${encodeKey(key)}`, {
      body: data,
    });
  }

  async delete(keys: string[]): Promise<void> {
    // The S3 batch-delete POST needs an MD5 of the body, which WebCrypto does
    // not implement. Individual DELETEs need no digest and are plenty fast for
    // the sizes involved here.
    for (const key of keys) {
      await this._send("DELETE", `/${this._options.bucket}/${encodeKey(key)}`, {
        allowNotFound: true,
      });
    }
  }

  private async _send(
    method: string,
    path: string,
    options?: {
      query?: URLSearchParams;
      body?: Uint8Array;
      allowNotFound?: boolean;
    },
  ): Promise<Response> {
    const url = new URL(`${this._options.endpoint}${path}`);
    if (options?.query) url.search = options.query.toString();

    const body = options?.body;
    const payloadHash = await sha256Hex(body ?? new Uint8Array(0));
    const headers = await signRequest({
      method,
      url,
      payloadHash,
      accessKeyId: this._options.accessKeyId,
      secretAccessKey: this._options.secretAccessKey,
      region: this._options.region,
      service: "s3",
    });

    const response = await this._fetch(url.toString(), {
      method,
      headers,
      ...(body ? { body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer } : {}),
    });

    if (!response.ok && !(options?.allowNotFound && response.status === 404)) {
      throw new Error(
        `R2 ${method} ${path} failed: ${response.status} ${(await response.text()).slice(0, 300)}`,
      );
    }
    return response;
  }
}

/* -------------------------------------------------------------------------- */
/* SigV4                                                                       */
/* -------------------------------------------------------------------------- */

interface SignOptions {
  method: string;
  url: URL;
  payloadHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
}

async function signRequest(options: SignOptions): Promise<Record<string, string>> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const headers: Record<string, string> = {
    host: options.url.host,
    "x-amz-content-sha256": options.payloadHash,
    "x-amz-date": amzDate,
  };

  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((name) => `${name}:${headers[name]}\n`)
    .join("");

  const canonicalQuery = Array.from(options.url.searchParams.entries())
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const canonicalRequest = [
    options.method,
    options.url.pathname,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    options.payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${options.region}/${options.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    await sha256Hex(new TextEncoder().encode(canonicalRequest)),
  ].join("\n");

  const encoder = new TextEncoder();
  let key: Uint8Array = encoder.encode(`AWS4${options.secretAccessKey}`);
  for (const part of [dateStamp, options.region, options.service, "aws4_request"]) {
    key = await hmac(key, encoder.encode(part));
  }
  const signature = toHex(await hmac(key, encoder.encode(stringToSign)));

  return {
    ...headers,
    authorization:
      `AWS4-HMAC-SHA256 Credential=${options.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", cryptoKey, data as unknown as ArrayBuffer),
  );
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    data as unknown as ArrayBuffer,
  );
  return toHex(new Uint8Array(digest));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** S3 requires RFC 3986 encoding, which differs from `encodeURIComponent`. */
function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeKey(key: string): string {
  return key.split("/").map(encodeRfc3986).join("/");
}

function tag(xml: string, name: string): string | null {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return match ? match[1]! : null;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
