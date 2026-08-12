import type { Nodepod } from "@scelar/nodepod";
import {
  Emitter,
  ReplayEmitter,
  combinedDisposable,
  toDisposable,
} from "./emitter";
import { createHeadlessTerminalCtor } from "./headless-xterm";
import type {
  Disposable,
  PtyOptions,
  PtySession,
  TerminalDriver,
} from "./types";

let nextPid = 1000;

/**
 * Terminals that run in this tab.
 *
 * Nodepod already implements the hard part — a shell with line editing,
 * history, job control and raw mode — so this driver does not reimplement a
 * terminal. It gives Nodepod a headless xterm to drive and forwards the bytes
 * to VS Code's real one.
 */
export class NodepodTerminalDriver implements TerminalDriver {
  readonly id = "nodepod" as const;
  readonly label = "Nodepod (in-browser)";
  readonly shellPath = "/bin/sh";

  private _sessions = new Set<NodepodPty>();

  constructor(private readonly _pod: Nodepod) {}

  async prepare(): Promise<void> {
    // Nothing to boot: the pod is already running, and Nodepod creates the
    // shell worker lazily on the first command.
  }

  async createPty(opts: PtyOptions): Promise<PtySession> {
    const session = new NodepodPty(this._pod, opts, () =>
      this._sessions.delete(session),
    );
    this._sessions.add(session);
    return session;
  }

  dispose(): void {
    for (const session of [...this._sessions]) session.shutdown(true);
    this._sessions.clear();
  }
}

class NodepodPty implements PtySession {
  readonly pid = nextPid++;

  // Replay: Nodepod draws its prompt before VS Code subscribes.
  private readonly _onData = new ReplayEmitter<string>();
  private readonly _onExit = new Emitter<number>();
  private readonly _onCwdChange = new Emitter<string>();

  private readonly _shim;
  private readonly _terminal;
  private readonly _container: HTMLElement;
  private readonly _wiring: Disposable;
  private _cwd: string;
  private _closed = false;

  constructor(
    pod: Nodepod,
    opts: PtyOptions,
    private readonly _onDispose: () => void,
  ) {
    this._cwd = opts.cwd;

    const headless = createHeadlessTerminalCtor();
    this._terminal = pod.createTerminal({
      Terminal: headless.ctor,
      // No FitAddon: sizing comes from VS Code, and fitting a detached
      // element would clamp every terminal to 80x24.
      customCommands: {
        // Nodepod's shell has no session to end, so `exit` would otherwise
        // look like it did nothing. Closing the VS Code terminal is what the
        // user means.
        exit: () => {
          queueMicrotask(() => this._finish(0));
          return "";
        },
        logout: () => {
          queueMicrotask(() => this._finish(0));
          return "";
        },
      },
    });

    // NodepodTerminal.attach() needs an element to "open" into. It is never
    // added to the document — nothing renders here.
    this._container = document.createElement("div");
    this._terminal.setCwd(opts.cwd);
    // attach() is what calls `new Terminal(...)`, so the shim does not exist
    // until after this line.
    this._terminal.attach(this._container);

    const shim = headless.instance();
    if (!shim) {
      throw new Error("Nodepod did not construct a terminal");
    }
    this._shim = shim;
    this._shim.setSize(opts.cols, opts.rows);

    this._wiring = combinedDisposable(
      this._shim.onOutput((data) => {
        this._onData.fire(data);
        // The shell reports directory changes through the terminal object
        // rather than a callback, so sample it whenever output lands.
        const cwd = this._terminal.getCwd();
        if (cwd && cwd !== this._cwd) {
          this._cwd = cwd;
          this._onCwdChange.fire(cwd);
        }
      }),
      toDisposable(() => headless.dispose.dispose()),
    );

    // Draw the first prompt: Nodepod only writes one after a command ends.
    queueMicrotask(() => {
      if (!this._closed) this._terminal.showPrompt();
    });
  }

  onData(listener: (data: string) => void): Disposable {
    return this._onData.on(listener);
  }

  onExit(listener: (exitCode: number) => void): Disposable {
    return this._onExit.on(listener);
  }

  onCwdChange(listener: (cwd: string) => void): Disposable {
    return this._onCwdChange.on(listener);
  }

  write(data: string): void {
    if (this._closed) return;
    this._shim.pushInput(data);
  }

  resize(cols: number, rows: number): void {
    if (this._closed) return;
    this._shim.setSize(cols, rows);
  }

  getCwd(): string {
    return this._cwd;
  }

  shutdown(_immediate: boolean): void {
    this._finish(0);
  }

  private _finish(exitCode: number): void {
    if (this._closed) return;
    this._closed = true;
    try {
      this._terminal.detach();
    } catch {
      // Already torn down.
    }
    this._wiring.dispose();
    this._onDispose();
    this._onExit.fire(exitCode);
    this._onData.clear();
    this._onCwdChange.clear();
  }
}
