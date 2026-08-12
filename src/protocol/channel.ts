/**
 * Transport + RPC plumbing for the host <-> extension bridge.
 *
 * The default transport is a `BroadcastChannel`. That works because we boot the
 * workbench with a `product.json` that leaves `webEndpointUrlTemplate` unset,
 * which makes VS Code load the web extension host in a *same-origin* iframe
 * (it logs "The web worker extension host is started in a same-origin iframe!").
 * Same origin means the extension host worker and the host page can share a
 * BroadcastChannel; no `postMessage` relay through the workbench is needed.
 *
 * A `MessagePort` transport is also provided for hosts that pass ports in via
 * `IWorkbenchConstructionOptions.messagePorts`, or for embedding the runtime in
 * a dedicated worker.
 */

import {
  ENVELOPE_TAG,
  PROTOCOL_VERSION,
  isBridgeEnvelope,
  type BridgeEnvelope,
  type BridgeErrorCode,
  type BridgeErrorDTO,
  type BridgeEventName,
  type BridgeEvents,
  type BridgeMethod,
  type BridgeRequests,
  type BridgeResponses,
  type BridgeRole,
  type EventEnvelope,
  type RequestEnvelope,
  type ResponseEnvelope,
} from "./messages.js";

export interface BridgeTransport {
  post(message: BridgeEnvelope): void;
  subscribe(listener: (message: BridgeEnvelope) => void): () => void;
  close(): void;
}

export function channelName(session: string): string {
  return `${ENVELOPE_TAG}:${session}`;
}

export function createBroadcastTransport(session: string): BridgeTransport {
  const bc = new BroadcastChannel(channelName(session));
  const listeners = new Set<(message: BridgeEnvelope) => void>();

  const onMessage = (event: MessageEvent) => {
    if (!isBridgeEnvelope(event.data)) return;
    for (const listener of listeners) listener(event.data);
  };
  bc.addEventListener("message", onMessage);

  return {
    post: (message) => bc.postMessage(message),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      bc.removeEventListener("message", onMessage);
      listeners.clear();
      bc.close();
    },
  };
}

export function createPortTransport(port: MessagePort): BridgeTransport {
  const listeners = new Set<(message: BridgeEnvelope) => void>();

  const onMessage = (event: MessageEvent) => {
    if (!isBridgeEnvelope(event.data)) return;
    for (const listener of listeners) listener(event.data);
  };
  port.addEventListener("message", onMessage);
  port.start();

  return {
    post: (message) => port.postMessage(message),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      port.removeEventListener("message", onMessage);
      listeners.clear();
      port.close();
    },
  };
}

/* -------------------------------------------------------------------------- */

export class BridgeError extends Error {
  readonly code: BridgeErrorCode;
  readonly remoteStack: string | undefined;

  constructor(code: BridgeErrorCode, message: string, remoteStack?: string) {
    super(message);
    this.name = "BridgeError";
    this.code = code;
    this.remoteStack = remoteStack;
  }

  static from(error: unknown): BridgeError {
    if (error instanceof BridgeError) return error;
    if (error instanceof Error) {
      return new BridgeError(
        classifyError(error),
        error.message,
        error.stack ?? undefined,
      );
    }
    return new BridgeError("Unknown", String(error));
  }

  toDTO(): BridgeErrorDTO {
    return {
      code: this.code,
      message: this.message,
      ...(this.remoteStack ? { stack: this.remoteStack } : {}),
    };
  }
}

/**
 * Node-style `errno` strings are what Nodepod's fs polyfill throws, so map them
 * onto the codes the extension can turn into real `FileSystemError`s. Without
 * this, VS Code shows "unavailable" for a plain missing file and the explorer
 * refuses to create it.
 *
 * Nodepod raises some errors as a plain `Error` whose message merely *starts*
 * with the errno (`"ENOENT: no such file or directory, open '/x'"`), so fall
 * back to reading the message when there is no `code` property.
 */
function classifyError(error: Error): BridgeErrorCode {
  const code =
    (error as { code?: unknown }).code ??
    /^([A-Z]{4,10}):/.exec(error.message)?.[1];

  switch (code) {
    case "ENOENT":
      return "FileNotFound";
    case "EEXIST":
      return "FileExists";
    case "ENOTDIR":
      return "FileNotADirectory";
    case "EISDIR":
      return "FileIsADirectory";
    case "EACCES":
    case "EPERM":
      return "NoPermissions";
    case "ABORT_ERR":
      return "Cancelled";
    default:
      return error.name === "AbortError" ? "Cancelled" : "Unknown";
  }
}

/* -------------------------------------------------------------------------- */

export type BridgeHandler<M extends BridgeMethod> = (
  params: BridgeRequests[M],
) => BridgeResponses[M] | Promise<BridgeResponses[M]>;

type AnyHandler = (params: never) => unknown;

export interface BridgeServerOptions {
  session: string;
  transport?: BridgeTransport;
  /** Invoked whenever a fresh client announces itself, e.g. after a reload. */
  onClientHello?: () => void;
}

/**
 * Host side of the bridge. Owns the handler table and pushes events out to
 * whichever extension host is currently attached.
 */
export class BridgeServer {
  readonly session: string;
  private readonly _transport: BridgeTransport;
  private readonly _handlers = new Map<BridgeMethod, AnyHandler>();
  private readonly _unsubscribe: () => void;
  private readonly _onClientHello: (() => void) | undefined;
  private _disposed = false;

  constructor(options: BridgeServerOptions) {
    this.session = options.session;
    this._transport =
      options.transport ?? createBroadcastTransport(options.session);
    this._onClientHello = options.onClientHello;
    this._unsubscribe = this._transport.subscribe((message) =>
      this._onMessage(message),
    );
  }

  handle<M extends BridgeMethod>(method: M, handler: BridgeHandler<M>): void {
    this._handlers.set(method, handler as AnyHandler);
  }

  emit<E extends BridgeEventName>(event: E, payload: BridgeEvents[E]): void {
    if (this._disposed) return;
    const envelope: EventEnvelope = {
      tag: ENVELOPE_TAG,
      kind: "evt",
      from: "host",
      session: this.session,
      event,
      payload,
    };
    this._transport.post(envelope);
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._unsubscribe();
    this._transport.close();
    this._handlers.clear();
  }

  private _onMessage(message: BridgeEnvelope): void {
    if (message.session !== this.session) return;
    if (message.from === "host") return; // our own broadcast, or a peer host

    if (message.kind === "hello") {
      this._onClientHello?.();
      return;
    }
    if (message.kind !== "req") return;
    void this._dispatch(message);
  }

  private async _dispatch(request: RequestEnvelope): Promise<void> {
    const handler = this._handlers.get(request.method);
    if (!handler) {
      this._respond(request.id, false, undefined, {
        code: "Unknown",
        message: `no handler registered for "${request.method}"`,
      });
      return;
    }
    try {
      const result = await (handler as (p: unknown) => unknown)(request.params);
      this._respond(request.id, true, result);
    } catch (error) {
      this._respond(
        request.id,
        false,
        undefined,
        BridgeError.from(error).toDTO(),
      );
    }
  }

  private _respond(
    id: number,
    ok: boolean,
    result?: unknown,
    error?: BridgeErrorDTO,
  ): void {
    if (this._disposed) return;
    const envelope: ResponseEnvelope = {
      tag: ENVELOPE_TAG,
      kind: "res",
      from: "host",
      session: this.session,
      id,
      ok,
      ...(result === undefined ? {} : { result }),
      ...(error ? { error } : {}),
    };
    this._transport.post(envelope);
  }
}

/* -------------------------------------------------------------------------- */

export interface BridgeClientOptions {
  session: string;
  transport?: BridgeTransport;
  /** Default per-request timeout in ms. Defaults to 60_000. */
  timeoutMs?: number;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout> | undefined;
}

/**
 * Extension side of the bridge. Every VS Code provider in `extension/` goes
 * through this object, so the extension has no knowledge of Nodepod, R2 or
 * Cloudflare Sandbox — only of the method names above.
 */
export class BridgeClient {
  readonly session: string;
  private readonly _transport: BridgeTransport;
  private readonly _pending = new Map<number, PendingRequest>();
  private readonly _listeners = new Map<
    BridgeEventName,
    Set<(payload: never) => void>
  >();
  private readonly _unsubscribe: () => void;
  private readonly _timeoutMs: number;
  private _nextId = 1;
  private _disposed = false;

  constructor(options: BridgeClientOptions) {
    this.session = options.session;
    this._timeoutMs = options.timeoutMs ?? 60_000;
    this._transport =
      options.transport ?? createBroadcastTransport(options.session);
    this._unsubscribe = this._transport.subscribe((message) =>
      this._onMessage(message),
    );
    this._transport.post({
      tag: ENVELOPE_TAG,
      kind: "hello",
      from: "client",
      session: this.session,
      protocolVersion: PROTOCOL_VERSION,
    });
  }

  request<M extends BridgeMethod>(
    method: M,
    params: BridgeRequests[M],
    options?: { timeoutMs?: number },
  ): Promise<BridgeResponses[M]> {
    if (this._disposed) {
      return Promise.reject(
        new BridgeError("Unavailable", "bridge client is disposed"),
      );
    }
    const id = this._nextId++;
    const timeoutMs = options?.timeoutMs ?? this._timeoutMs;

    return new Promise<BridgeResponses[M]>((resolve, reject) => {
      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
              this._pending.delete(id);
              reject(
                new BridgeError(
                  "Unavailable",
                  `"${method}" timed out after ${timeoutMs}ms — is the OpenDS host page still running?`,
                ),
              );
            }, timeoutMs)
          : undefined;

      this._pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      const envelope: RequestEnvelope = {
        tag: ENVELOPE_TAG,
        kind: "req",
        from: "client",
        session: this.session,
        id,
        method,
        params,
      };
      this._transport.post(envelope);
    });
  }

  on<E extends BridgeEventName>(
    event: E,
    listener: (payload: BridgeEvents[E]) => void,
  ): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener as (payload: never) => void);
    return () => {
      set!.delete(listener as (payload: never) => void);
    };
  }

  /**
   * Polls `runtime.info` until the host answers. The extension host frequently
   * activates before the page has finished booting Nodepod, and a plain request
   * would then fail the very first `stat` of the workspace root.
   */
  async waitForHost(options?: {
    timeoutMs?: number;
    intervalMs?: number;
  }): Promise<BridgeResponses["runtime.info"]> {
    const deadline = Date.now() + (options?.timeoutMs ?? 120_000);
    const interval = options?.intervalMs ?? 250;
    let lastError: unknown;

    while (Date.now() < deadline) {
      try {
        return await this.request("runtime.info", undefined, {
          timeoutMs: Math.min(interval * 4, 4000),
        });
      } catch (error) {
        lastError = error;
        await delay(interval);
      }
    }
    throw BridgeError.from(
      lastError ?? new Error("timed out waiting for the OpenDS host page"),
    );
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._unsubscribe();
    for (const pending of this._pending.values()) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(new BridgeError("Cancelled", "bridge client disposed"));
    }
    this._pending.clear();
    this._listeners.clear();
    this._transport.close();
  }

  private _onMessage(message: BridgeEnvelope): void {
    if (message.session !== this.session) return;
    if (message.from === "client") return;

    if (message.kind === "res") {
      const pending = this._pending.get(message.id);
      if (!pending) return;
      this._pending.delete(message.id);
      if (pending.timer) clearTimeout(pending.timer);
      if (message.ok) {
        pending.resolve(message.result);
      } else {
        const dto = message.error;
        pending.reject(
          new BridgeError(
            dto?.code ?? "Unknown",
            dto?.message ?? "bridge request failed",
            dto?.stack,
          ),
        );
      }
      return;
    }

    if (message.kind === "evt") {
      const set = this._listeners.get(message.event);
      if (!set) return;
      for (const listener of set) {
        try {
          (listener as (payload: unknown) => void)(message.payload);
        } catch (error) {
          console.error("[opends] event listener threw", error);
        }
      }
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
