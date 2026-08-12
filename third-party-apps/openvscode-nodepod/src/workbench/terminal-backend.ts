import {
  SimpleTerminalBackend,
  SimpleTerminalProcess,
} from "@codingame/monaco-vscode-terminal-service-override";
import { Emitter } from "@codingame/monaco-vscode-api/vscode/vs/base/common/event";
import {
  ProcessPropertyType,
  type IProcessPropertyMap,
  type IShellLaunchConfig,
  type ITerminalChildProcess,
  type ITerminalProfile,
} from "@codingame/monaco-vscode-api/vscode/vs/platform/terminal/common/terminal";
import type { IProcessEnvironment } from "@codingame/monaco-vscode-api/vscode/vs/base/common/platform";
import type {
  Disposable as RuntimeDisposable,
  PtySession,
  TerminalDriver,
} from "../runtime/types";
import type { NodepodWorkspaceRuntime } from "../runtime/workspace-runtime";

/**
 * VS Code's terminal, talking to whichever runtime driver is active.
 *
 * The backend is deliberately thin: it knows how to start a pty and pipe
 * bytes. Which pty — a Web Worker shell in this tab, or bash in a Cloudflare
 * container — is the driver's business, and the terminal cannot tell the
 * difference.
 */
export class RuntimeTerminalBackend extends SimpleTerminalBackend {
  private _nextId = 1;

  constructor(private readonly _runtime: NodepodWorkspaceRuntime) {
    super();
    // There is no pty host to connect to, so the backend is usable at once.
    // Without this the terminal panel waits forever on `whenReady`.
    this.setReady();
  }

  getDefaultSystemShell = async (): Promise<string> =>
    this._runtime.terminals.shellPath;

  override getProfiles = async (): Promise<ITerminalProfile[]> =>
    this._runtime.availableDrivers().map((driver) => ({
      profileName: driver.label,
      path: driver.shellPath,
      isDefault: driver.id === this._runtime.terminalDriverId,
      isAutoDetected: false,
    }));

  override getEnvironment = async (): Promise<IProcessEnvironment> => ({
    ...this._runtime.env,
  });

  createProcess = async (
    shellLaunchConfig: IShellLaunchConfig,
    cwd: string,
    cols: number,
    rows: number,
    _unicodeVersion: "6" | "11",
    env: IProcessEnvironment,
  ): Promise<ITerminalChildProcess> => {
    const launchCwd =
      typeof shellLaunchConfig.cwd === "string"
        ? shellLaunchConfig.cwd
        : shellLaunchConfig.cwd?.path;

    // A terminal profile chooses the driver: picking "Cloudflare Sandbox" from
    // the terminal dropdown is how a user moves a shell off the client.
    const driver = this._pickDriver(shellLaunchConfig);

    return new RuntimePtyProcess(this._nextId++, driver, {
      cwd: launchCwd || cwd || this._runtime.workspaceRoot,
      cols: cols || 80,
      rows: rows || 24,
      env: { ...this._runtime.env, ...stripUndefined(env) },
    });
  };

  private _pickDriver(config: IShellLaunchConfig): TerminalDriver {
    const requested = config.name ?? config.executable;
    if (requested) {
      const match = this._runtime
        .availableDrivers()
        .find(
          (driver) =>
            driver.label === requested || driver.shellPath === requested,
        );
      if (match) return match;
    }
    return this._runtime.terminals;
  }
}

function stripUndefined(env: IProcessEnvironment): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

class RuntimePtyProcess extends SimpleTerminalProcess {
  private readonly _dataEmitter = new Emitter<string>();
  private readonly _exitEmitter = new Emitter<number>();
  private readonly _subscriptions: RuntimeDisposable[] = [];
  private _pty: PtySession | null = null;
  /** Input typed while the container boots must not be lost. */
  private _pendingInput: string[] = [];
  private _lastSize: { cols: number; rows: number };
  private _cwd: string;
  private _exited = false;

  constructor(
    id: number,
    private readonly _driver: TerminalDriver,
    private readonly _opts: {
      cwd: string;
      cols: number;
      rows: number;
      env: Record<string, string>;
    },
  ) {
    const dataEmitter = new Emitter<string>();
    super(id, id, _opts.cwd, dataEmitter.event);
    this._dataEmitter = dataEmitter;
    this._cwd = _opts.cwd;
    this._lastSize = { cols: _opts.cols, rows: _opts.rows };
    // The base class wires `onProcessExit` to `Event.None`; the terminal
    // would never notice the process ending without this.
    this.onProcessExit = this._exitEmitter.event;
  }

  async start(): Promise<undefined> {
    try {
      await this._driver.prepare((message) => {
        // Surface container boot progress where the user is already looking.
        this._dataEmitter.fire(`\x1b[2m${message}\x1b[0m\r\n`);
      });
      this._pty = await this._driver.createPty({
        cwd: this._cwd,
        cols: this._lastSize.cols,
        rows: this._lastSize.rows,
        env: this._opts.env,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._dataEmitter.fire(
        `\r\n\x1b[31mFailed to start terminal: ${message}\x1b[0m\r\n`,
      );
      this._exit(1);
      return undefined;
    }

    this._subscriptions.push(
      this._pty.onData((data) => this._dataEmitter.fire(data)),
      this._pty.onExit((code) => this._exit(code)),
      this._pty.onCwdChange((cwd) => {
        this._cwd = cwd;
      }),
    );

    for (const chunk of this._pendingInput) this._pty.write(chunk);
    this._pendingInput = [];
    this._pty.resize(this._lastSize.cols, this._lastSize.rows);
    return undefined;
  }

  input(data: string): void {
    if (this._exited) return;
    if (this._pty) this._pty.write(data);
    else this._pendingInput.push(data);
  }

  resize(cols: number, rows: number): void {
    this._lastSize = { cols, rows };
    this._pty?.resize(cols, rows);
  }

  sendSignal(_signal: string): void {
    // Neither driver exposes signal delivery; Ctrl+C reaches the shell as
    // ordinary input, which is what the shell's line discipline expects.
  }

  clearBuffer(): void {
    this._dataEmitter.fire("\x1b[2J\x1b[3J\x1b[H");
  }

  shutdown(immediate: boolean): void {
    this._pty?.shutdown(immediate);
    this._exit(0);
  }

  override async getCwd(): Promise<string> {
    return this._cwd;
  }

  override async getInitialCwd(): Promise<string> {
    return this._opts.cwd;
  }

  /**
   * The base class declares this as an unsupported stub (`() => Promise<never>`)
   * that resolves to `undefined`, but the terminal really does call it with a
   * property type and use the answer — asking for the cwd and getting
   * `undefined` back throws "cwd is not a string" and the terminal never
   * starts. The cast is the price of the base class's narrower signature.
   */
  override refreshProperty = ((type: ProcessPropertyType) =>
    Promise.resolve(this._readProperty(type))) as unknown as () => Promise<never>;

  private _readProperty(
    type: ProcessPropertyType,
  ): IProcessPropertyMap[ProcessPropertyType] | undefined {
    switch (type) {
      case ProcessPropertyType.Cwd:
        return this._cwd;
      case ProcessPropertyType.InitialCwd:
        return this._opts.cwd;
      case ProcessPropertyType.HasChildProcesses:
        return false;
      case ProcessPropertyType.Title:
        return this._driver.label;
      default:
        // Anything else is genuinely unsupported; the terminal treats
        // `undefined` as "no value" for these.
        return undefined;
    }
  }

  private _exit(code: number): void {
    if (this._exited) return;
    this._exited = true;
    for (const sub of this._subscriptions) sub.dispose();
    this._subscriptions.length = 0;
    this._pty = null;
    this._exitEmitter.fire(code);
  }
}
