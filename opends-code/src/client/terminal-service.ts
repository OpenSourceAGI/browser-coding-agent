import type {
  TerminalMode,
  TerminalOpenParams,
  TerminalOpenResult,
} from "../protocol/messages.js";
import { BridgeError } from "../protocol/channel.js";
import {
  createHeadlessTerminalClass,
  type HeadlessXterm,
} from "./headless-xterm.js";
import type { NodepodLike, NodepodTerminalLike } from "./nodepod-types.js";
import { SandboxTerminalSession } from "./sandbox-terminal.js";
import type {
  TerminalSession,
  TerminalSessionCallbacks,
} from "./terminal-session.js";

export interface TerminalServiceOptions {
  nodepod: NodepodLike;
  /** VFS directory a terminal starts in. */
  workspaceRoot: string;
  callbacks: TerminalSessionCallbacks;
  sandbox?: {
    enabled: boolean;
    startUrl: string;
    cwd: string;
    headers: () => Promise<Record<string, string>>;
    credentials: RequestCredentials;
    beforeAttach?: () => Promise<void>;
  };
}

/**
 * Owns every terminal the workbench has open, in both modes.
 *
 * `local` terminals run Nodepod's shell in the browser — instant, offline, and
 * the default. `sandbox` terminals proxy a container PTY and are only created
 * on explicit request, which is what keeps the "no container unless you ask for
 * one" property of this design honest.
 */
export class TerminalService {
  private readonly _options: TerminalServiceOptions;
  private readonly _sessions = new Map<string, TerminalSession>();

  constructor(options: TerminalServiceOptions) {
    this._options = options;
  }

  get sandboxAvailable(): boolean {
    return Boolean(this._options.sandbox?.enabled);
  }

  async open(params: TerminalOpenParams): Promise<TerminalOpenResult> {
    this.close(params.id);

    const mode: TerminalMode = params.mode === "sandbox" ? "sandbox" : "local";
    if (mode === "sandbox") return this._openSandbox(params);
    return this._openLocal(params);
  }

  input(id: string, data: string): void {
    this._sessions.get(id)?.input(data);
  }

  resize(id: string, cols: number, rows: number): void {
    this._sessions.get(id)?.resize(cols, rows);
  }

  close(id: string): void {
    const session = this._sessions.get(id);
    if (!session) return;
    this._sessions.delete(id);
    try {
      session.close();
    } catch {
      // best effort
    }
  }

  dispose(): void {
    for (const id of Array.from(this._sessions.keys())) this.close(id);
  }

  /* ---- local (Nodepod) ---- */

  private async _openLocal(
    params: TerminalOpenParams,
  ): Promise<TerminalOpenResult> {
    const { nodepod, callbacks } = this._options;
    let xterm: HeadlessXterm | null = null;

    const Terminal = createHeadlessTerminalClass({
      cols: params.cols,
      rows: params.rows,
      onWrite: (data) => callbacks.onData(params.id, data),
      onCreate: (instance) => {
        xterm = instance;
      },
    });

    const terminal = nodepod.createTerminal({ Terminal });

    // `attach` only forwards this value to `Terminal.open()`, which our headless
    // shim ignores; it just has to be truthy to pass Nodepod's null check.
    terminal.attach({} as unknown as HTMLElement);

    if (!xterm) {
      throw new BridgeError(
        "Unavailable",
        "Nodepod did not construct a terminal — is the runtime still booting?",
      );
    }
    const shim: HeadlessXterm = xterm;
    shim.resize(params.cols, params.rows);

    const session = new LocalTerminalSession(params.id, terminal, shim, () =>
      this._sessions.delete(params.id),
    );
    this._sessions.set(params.id, session);

    if (params.command) {
      // `input()` replays the string through the line editor, so the command is
      // echoed and lands in history exactly as if it had been typed.
      terminal.input?.(`${params.command}\r`);
    }

    return { id: params.id, mode: "local", title: "node (browser)" };
  }

  /* ---- sandbox (Cloudflare container) ---- */

  private async _openSandbox(
    params: TerminalOpenParams,
  ): Promise<TerminalOpenResult> {
    const sandbox = this._options.sandbox;
    if (!sandbox?.enabled) {
      throw new BridgeError(
        "Unavailable",
        "the cloud sandbox is not configured for this session",
      );
    }

    const session = new SandboxTerminalSession({
      id: params.id,
      cols: params.cols,
      rows: params.rows,
      cwd: params.cwd ?? sandbox.cwd,
      command: params.command,
      startUrl: sandbox.startUrl,
      headers: await sandbox.headers(),
      credentials: sandbox.credentials,
      beforeAttach: sandbox.beforeAttach,
      callbacks: this._options.callbacks,
    });
    this._sessions.set(params.id, session);

    try {
      await session.start();
    } catch (error) {
      this._sessions.delete(params.id);
      throw BridgeError.from(error);
    }

    return {
      id: params.id,
      mode: "sandbox",
      title: "bash (sandbox)",
      ...(session.sessionId ? { sessionId: session.sessionId } : {}),
    };
  }
}

class LocalTerminalSession implements TerminalSession {
  readonly mode: TerminalMode = "local";

  constructor(
    readonly id: string,
    private readonly _terminal: NodepodTerminalLike,
    private readonly _xterm: HeadlessXterm,
    private readonly _onClose: () => void,
  ) {}

  input(data: string): void {
    this._xterm.feed(data);
  }

  resize(cols: number, rows: number): void {
    this._xterm.resize(cols, rows);
  }

  close(): void {
    try {
      this._terminal.detach?.();
      this._terminal.dispose?.();
    } finally {
      this._xterm.dispose();
      this._onClose();
    }
  }
}
