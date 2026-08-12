/**
 * Browser-side client for the Worker's `/api/sandbox/*` routes.
 *
 * Nothing here imports `@cloudflare/sandbox` — the SDK only exists inside the
 * Worker. Keeping that boundary is what lets the whole IDE run with no
 * container at all until someone asks for a container terminal.
 */

export interface SandboxSession {
  sessionId: string;
  workspace: string;
}

export interface SandboxFilePush {
  path: string;
  /** base64, because JSON cannot carry raw bytes. */
  content: string;
}

export interface SandboxChangeCheck {
  status: "unchanged" | "changed" | "resync";
  version: string;
}

export interface SandboxFileInfo {
  path: string;
  type: "file" | "directory" | "symlink" | "other";
  size: number;
  modifiedAt: string;
}

export class SandboxApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SandboxApiError";
  }
}

export class SandboxClient {
  constructor(private readonly _base = "/api/sandbox") {}

  async createSession(workspace: string): Promise<SandboxSession> {
    return this._json<SandboxSession>("POST", "/session", { workspace });
  }

  /**
   * Mirror files into the container. Sent in batches by the caller — a single
   * request with a whole workspace would blow past the Worker request limit.
   */
  async pushFiles(
    sessionId: string,
    files: SandboxFilePush[],
    opts: { clean?: boolean } = {},
  ): Promise<{ written: number }> {
    return this._json("POST", "/files/push", {
      sessionId,
      files,
      clean: opts.clean ?? false,
    });
  }

  /** Cheap poll: asks the container whether anything under the workspace moved. */
  async checkChanges(
    sessionId: string,
    since?: string,
  ): Promise<SandboxChangeCheck> {
    const params = new URLSearchParams({ sessionId });
    if (since) params.set("since", since);
    return this._json("GET", `/files/changes?${params}`);
  }

  async listFiles(sessionId: string): Promise<SandboxFileInfo[]> {
    const params = new URLSearchParams({ sessionId });
    const res = await this._json<{ files: SandboxFileInfo[] }>(
      "GET",
      `/files/list?${params}`,
    );
    return res.files;
  }

  async readFile(sessionId: string, path: string): Promise<Uint8Array> {
    const params = new URLSearchParams({ sessionId, path });
    const res = await fetch(`${this._base}/files/read?${params}`);
    if (!res.ok) {
      throw new SandboxApiError(
        `Failed to read ${path} from sandbox: ${res.statusText}`,
        res.status,
      );
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  terminalUrl(sessionId: string, cols: number, rows: number): string {
    const params = new URLSearchParams({
      sessionId,
      cols: String(cols),
      rows: String(rows),
    });
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${location.host}${this._base}/terminal?${params}`;
  }

  private async _json<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${this._base}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new SandboxApiError(
        detail || `${method} ${path} failed (${res.status})`,
        res.status,
      );
    }
    return (await res.json()) as T;
  }
}

/** Encode without blowing the argument limit on large files. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
