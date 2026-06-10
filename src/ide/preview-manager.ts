// Wrapper around nodepod.port() / setPreviewScript() and iframe routing
// (plan step 1.4). Wire `notifyServerReady` into Nodepod.boot's
// onServerReady callback (buildBootOptions does this for you); attach an
// iframe-like target and the first server that comes up is loaded into it.

export interface PreviewHost {
  port(num: number): string | null;
  setPreviewScript(script: string): Promise<void>;
  clearPreviewScript(): Promise<void>;
}

/** Structural subset of HTMLIFrameElement so tests don't need a DOM. */
export interface PreviewTarget {
  src: string;
}

export interface PreviewServer {
  port: number;
  url: string;
}

export type PreviewEvent = "server-ready" | "server-closed" | "navigate";

export interface PreviewManagerOptions {
  /** Load the first ready server into the attached target. Default: true. */
  autoOpen?: boolean;
}

export class PreviewManager {
  private _host: PreviewHost | null;
  private _autoOpen: boolean;
  private _servers = new Map<number, string>();
  private _target: PreviewTarget | null = null;
  private _activePort: number | null = null;
  private _listeners = new Map<PreviewEvent, Set<(server: PreviewServer) => void>>();

  // The manager is usually created before Nodepod.boot() resolves (its
  // notifyServerReady is part of the boot options), so the host can be
  // bound after the fact.
  constructor(host?: PreviewHost, opts: PreviewManagerOptions = {}) {
    this._host = host ?? null;
    this._autoOpen = opts.autoOpen ?? true;
  }

  bindHost(host: PreviewHost): void {
    this._host = host;
  }

  /* ---- server lifecycle (wired into Nodepod.boot onServerReady) ---- */

  notifyServerReady(port: number, url: string): void {
    this._servers.set(port, url);
    this._emit("server-ready", { port, url });
    if (this._autoOpen && this._target && this._activePort === null) {
      this.open(port);
    }
  }

  notifyServerClosed(port: number): void {
    const url = this._servers.get(port);
    this._servers.delete(port);
    if (this._activePort === port) this._activePort = null;
    if (url !== undefined) this._emit("server-closed", { port, url });
  }

  /* ---- queries ---- */

  /** Preview URL for a port: live host answer first, then the ready-event cache. */
  urlFor(port: number): string | null {
    const fromHost = this._host?.port(port) ?? null;
    return fromHost ?? this._servers.get(port) ?? null;
  }

  servers(): PreviewServer[] {
    return [...this._servers.entries()].map(([port, url]) => ({ port, url }));
  }

  get activePort(): number | null {
    return this._activePort;
  }

  /* ---- iframe routing ---- */

  attach(target: PreviewTarget): void {
    this._target = target;
    if (this._autoOpen && this._activePort === null) {
      const first = this.servers()[0];
      if (first) this.open(first.port);
    }
  }

  detach(): void {
    this._target = null;
    this._activePort = null;
  }

  /** Point the attached target at the server on `port`. */
  open(port: number): boolean {
    const url = this.urlFor(port);
    if (!url || !this._target) return false;
    this._activePort = port;
    this._target.src = url;
    this._emit("navigate", { port, url });
    return true;
  }

  /** Re-navigate the target to the active server. */
  refresh(): boolean {
    if (this._activePort === null) return false;
    return this.open(this._activePort);
  }

  /* ---- preview script injection ---- */

  async setPreviewScript(script: string): Promise<void> {
    if (!this._host) throw new Error("[PreviewManager] no host bound");
    await this._host.setPreviewScript(script);
  }

  async clearPreviewScript(): Promise<void> {
    if (!this._host) throw new Error("[PreviewManager] no host bound");
    await this._host.clearPreviewScript();
  }

  /* ---- events ---- */

  on(event: PreviewEvent, listener: (server: PreviewServer) => void): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set!.delete(listener);
  }

  dispose(): void {
    this._listeners.clear();
    this._servers.clear();
    this._target = null;
    this._activePort = null;
  }

  private _emit(event: PreviewEvent, server: PreviewServer): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const listener of [...set]) listener(server);
  }
}
