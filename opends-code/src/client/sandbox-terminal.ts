import type { TerminalMode } from "../protocol/messages.js";
import type { TerminalSession, TerminalSessionCallbacks } from "./terminal-session.js";

export interface SandboxTerminalOptions {
  id: string;
  cols: number;
  rows: number;
  cwd: string;
  command?: string;
  /** Absolute URL of the route that boots the container and mints a WS URL. */
  startUrl: string;
  headers: Record<string, string>;
  credentials: RequestCredentials;
  /**
   * Runs before the WebSocket is opened. Used to flush unsaved/unsynced files
   * so the shell in the container operates on what is on screen.
   */
  beforeAttach?: () => Promise<void>;
  callbacks: TerminalSessionCallbacks;
}

interface StartResponse {
  wsUrl: string;
  sessionId?: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * A terminal backed by a real PTY inside a Cloudflare Sandbox container.
 *
 * This is the only code path in the whole package that causes a container to
 * exist. Editing, browsing, searching, saving and the local terminal all stay
 * in the browser — a container is booted the first time someone opens one of
 * these, and the SDK keeps the session alive across reconnects.
 *
 * Wire format follows the Sandbox terminal protocol: binary frames carry PTY
 * I/O in both directions, text frames carry JSON control messages (resize,
 * exit).
 */
export class SandboxTerminalSession implements TerminalSession {
  readonly id: string;
  readonly mode: TerminalMode = "sandbox";
  sessionId: string | undefined;

  private readonly _options: SandboxTerminalOptions;
  private _socket: WebSocket | null = null;
  private _closed = false;
  /** Keystrokes typed before the socket finished opening. */
  private _pendingInput: string[] = [];
  private _pendingResize: { cols: number; rows: number } | null = null;

  constructor(options: SandboxTerminalOptions) {
    this.id = options.id;
    this._options = options;
  }

  async start(): Promise<void> {
    const { callbacks } = this._options;
    callbacks.onData(this.id, dim("Preparing cloud sandbox…\r\n"));

    if (this._options.beforeAttach) {
      try {
        await this._options.beforeAttach();
        callbacks.onData(this.id, dim("Workspace synced.\r\n"));
      } catch (error) {
        callbacks.onData(
          this.id,
          yellow(`Warning: workspace sync failed (${errorText(error)}).\r\n`),
        );
      }
    }

    const response = await fetch(this._options.startUrl, {
      method: "POST",
      credentials: this._options.credentials,
      headers: {
        "content-type": "application/json",
        ...this._options.headers,
      },
      body: JSON.stringify({
        cols: this._options.cols,
        rows: this._options.rows,
        cwd: this._options.cwd,
        command: this._options.command,
        terminalId: this.id,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `sandbox start failed: ${response.status} ${await safeText(response)}`,
      );
    }

    const payload = (await response.json()) as StartResponse;
    if (!payload?.wsUrl) throw new Error("sandbox start returned no wsUrl");
    this.sessionId = payload.sessionId;

    callbacks.onData(this.id, dim("Booting container…\r\n"));
    this._connect(payload.wsUrl);
  }

  input(data: string): void {
    if (this._closed) return;
    const socket = this._socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      this._pendingInput.push(data);
      return;
    }
    socket.send(encoder.encode(data));
  }

  resize(cols: number, rows: number): void {
    if (this._closed) return;
    const socket = this._socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      this._pendingResize = { cols, rows };
      return;
    }
    socket.send(JSON.stringify({ type: "resize", cols, rows }));
  }

  close(): void {
    if (this._closed) return;
    this._closed = true;
    try {
      this._socket?.close();
    } catch {
      // already gone
    }
    this._socket = null;
  }

  private _connect(wsUrl: string): void {
    const socket = new WebSocket(wsUrl);
    socket.binaryType = "arraybuffer";
    this._socket = socket;
    const { callbacks } = this._options;

    socket.addEventListener("open", () => {
      callbacks.onData(this.id, dim("Connected.\r\n"));
      socket.send(
        JSON.stringify({
          type: "resize",
          cols: this._pendingResize?.cols ?? this._options.cols,
          rows: this._pendingResize?.rows ?? this._options.rows,
        }),
      );
      this._pendingResize = null;
      for (const chunk of this._pendingInput) socket.send(encoder.encode(chunk));
      this._pendingInput = [];
    });

    socket.addEventListener("message", (event) => {
      const data = event.data;
      if (typeof data === "string") {
        this._handleControlFrame(data);
        return;
      }
      const bytes =
        data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(0);
      callbacks.onData(this.id, decoder.decode(bytes, { stream: true }));
    });

    socket.addEventListener("error", () => {
      if (this._closed) return;
      callbacks.onData(this.id, red("\r\nsandbox connection error\r\n"));
    });

    socket.addEventListener("close", (event) => {
      if (this._closed) return;
      this._closed = true;
      if (event.code !== 1000 && event.code !== 1005) {
        callbacks.onData(
          this.id,
          dim(`\r\nsandbox disconnected (${event.code})\r\n`),
        );
      }
      callbacks.onExit(this.id, 0);
    });
  }

  private _handleControlFrame(text: string): void {
    const { callbacks } = this._options;
    let message: { type?: string; code?: number; data?: string };
    try {
      message = JSON.parse(text);
    } catch {
      // Not JSON — some images emit plain-text banners on the control channel.
      callbacks.onData(this.id, text);
      return;
    }

    switch (message.type) {
      case "exit":
        this._closed = true;
        callbacks.onExit(this.id, message.code ?? 0);
        break;
      case "stdout":
      case "stderr":
      case "data":
        callbacks.onData(this.id, message.data ?? "");
        break;
      default:
        break;
    }
  }
}

function dim(text: string): string {
  return `\x1b[90m${text}\x1b[0m`;
}
function red(text: string): string {
  return `\x1b[31m${text}\x1b[0m`;
}
function yellow(text: string): string {
  return `\x1b[33m${text}\x1b[0m`;
}
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 200);
  } catch {
    return "";
  }
}
