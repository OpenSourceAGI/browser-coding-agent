import { Emitter, toDisposable } from "./emitter";
import type { Disposable } from "./types";

/**
 * An xterm.js look-alike with no DOM.
 *
 * Nodepod's `createTerminal()` wants an xterm constructor because it drives a
 * real terminal: it owns line editing, history, tab completion, Ctrl+C, and
 * raw mode for full-screen TUIs. VS Code also owns a real xterm instance and
 * wants to talk to a process instead. Handing Nodepod this shim puts the two
 * back to back — VS Code's keystrokes arrive here as `pushInput()` and come
 * out of Nodepod's line editor as `write()` calls we forward to VS Code.
 *
 * The surface below is exactly what `NodepodTerminal` touches. It is not a
 * general xterm replacement.
 */
export class HeadlessXterm {
  cols: number;
  rows: number;
  options: Record<string, unknown>;

  private readonly _onData = new Emitter<string>();
  private readonly _onResize = new Emitter<{ cols: number; rows: number }>();
  private readonly _onOutput = new Emitter<string>();
  private _disposed = false;

  constructor(options: Record<string, unknown> = {}) {
    this.options = { ...options };
    this.cols = typeof options.cols === "number" ? options.cols : 80;
    this.rows = typeof options.rows === "number" ? options.rows : 24;
  }

  /* ---- surface consumed by NodepodTerminal ---- */

  loadAddon(_addon: unknown): void {
    // No addons make sense without a renderer. FitAddon in particular must
    // stay unloaded: it would register a window resize listener and call
    // fit() against a detached element.
  }

  open(_container: HTMLElement): void {
    // Nothing to render into. VS Code owns the visible terminal.
  }

  focus(): void {}

  write(data: string, callback?: () => void): void {
    if (!this._disposed) this._onOutput.fire(data);
    callback?.();
  }

  writeln(data: string, callback?: () => void): void {
    this.write(`${data}\r\n`, callback);
  }

  clear(): void {
    // Same sequence xterm's own clear() produces: wipe scrollback, home cursor.
    this.write("\x1b[2J\x1b[3J\x1b[H");
  }

  reset(): void {
    this.write("\x1bc");
  }

  onData(listener: (data: string) => void): Disposable {
    return this._onData.on(listener);
  }

  onResize(listener: (size: { cols: number; rows: number }) => void): Disposable {
    return this._onResize.on(listener);
  }

  dispose(): void {
    this._disposed = true;
    this._onData.clear();
    this._onResize.clear();
    this._onOutput.clear();
  }

  /* ---- host side: driven by the VS Code terminal ---- */

  /** Everything Nodepod writes to "the screen". */
  onOutput(listener: (data: string) => void): Disposable {
    return this._onOutput.on(listener);
  }

  /** Feed a keystroke (or pasted text) into Nodepod's line editor. */
  pushInput(data: string): void {
    if (!this._disposed) this._onData.fire(data);
  }

  /** VS Code resized its terminal; tell Nodepod so TUIs reflow. */
  setSize(cols: number, rows: number): void {
    if (cols <= 0 || rows <= 0) return;
    if (cols === this.cols && rows === this.rows) return;
    this.cols = cols;
    this.rows = rows;
    this._onResize.fire({ cols, rows });
  }

  get disposed(): boolean {
    return this._disposed;
  }
}

/**
 * `createTerminal()` takes constructors, not instances, so we hand it a
 * factory bound to one shim and read the instance back out afterwards.
 */
export function createHeadlessTerminalCtor(): {
  ctor: new (options?: Record<string, unknown>) => HeadlessXterm;
  instance: () => HeadlessXterm | null;
  dispose: Disposable;
} {
  let created: HeadlessXterm | null = null;

  class BoundHeadlessXterm extends HeadlessXterm {
    constructor(options: Record<string, unknown> = {}) {
      super(options);
      created = this;
    }
  }

  return {
    ctor: BoundHeadlessXterm,
    instance: () => created,
    dispose: toDisposable(() => created?.dispose()),
  };
}
