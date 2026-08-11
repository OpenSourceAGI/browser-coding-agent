import type { XtermLike } from "./nodepod-types.js";

export interface HeadlessXtermOptions {
  cols?: number;
  rows?: number;
  /** Everything Nodepod's line editor writes to the screen. */
  onWrite: (data: string) => void;
}

interface Disposable {
  dispose(): void;
}

/**
 * A headless stand-in for `@xterm/xterm`'s `Terminal`.
 *
 * VS Code already owns a real xterm inside its terminal panel, and a
 * `Pseudoterminal` speaks plain strings in both directions. So instead of
 * re-implementing Nodepod's line discipline (history, tab completion, raw mode,
 * Ctrl+C) we hand Nodepod this object, which looks exactly like the xterm it
 * expects but forwards every byte over the bridge. Nodepod's terminal stack
 * runs unmodified; VS Code renders it.
 *
 * Only the members `NodepodTerminal` actually touches are implemented:
 * `write`, `onData`, `onResize`, `open`, `focus`, `clear`, `dispose`,
 * `loadAddon`, `cols`, `rows` and `options.theme`.
 */
export class HeadlessXterm implements XtermLike {
  cols: number;
  rows: number;
  options: { theme?: unknown; [key: string]: unknown };

  private readonly _onWrite: (data: string) => void;
  private readonly _dataListeners = new Set<(data: string) => void>();
  private readonly _resizeListeners = new Set<
    (size: { cols: number; rows: number }) => void
  >();
  private _disposed = false;

  constructor(options: HeadlessXtermOptions) {
    this.cols = options.cols ?? 80;
    this.rows = options.rows ?? 24;
    this.options = {};
    this._onWrite = options.onWrite;
  }

  write(data: string): void {
    if (this._disposed || !data) return;
    this._onWrite(data);
  }

  onData(listener: (data: string) => void): Disposable {
    this._dataListeners.add(listener);
    return {
      dispose: () => {
        this._dataListeners.delete(listener);
      },
    };
  }

  onResize(listener: (size: { cols: number; rows: number }) => void): Disposable {
    this._resizeListeners.add(listener);
    return {
      dispose: () => {
        this._resizeListeners.delete(listener);
      },
    };
  }

  /** No DOM to attach to — the container argument is ignored on purpose. */
  open(_container: unknown): void {}

  focus(): void {}

  loadAddon(_addon: unknown): void {}

  clear(): void {
    // Same escape sequence xterm's own `clear()` emits: wipe screen + scrollback
    // and park the cursor at the origin.
    this.write("\x1b[2J\x1b[3J\x1b[H");
  }

  dispose(): void {
    this._disposed = true;
    this._dataListeners.clear();
    this._resizeListeners.clear();
  }

  /* ---- driven by the bridge, not by Nodepod ---- */

  /** Feed user keystrokes coming from VS Code's terminal into the line editor. */
  feed(data: string): void {
    if (this._disposed) return;
    for (const listener of Array.from(this._dataListeners)) {
      try {
        listener(data);
      } catch (error) {
        console.error("[opends] terminal data listener threw", error);
      }
    }
  }

  resize(cols: number, rows: number): void {
    if (this._disposed) return;
    if (!cols || !rows) return;
    if (cols === this.cols && rows === this.rows) return;
    this.cols = cols;
    this.rows = rows;
    for (const listener of Array.from(this._resizeListeners)) {
      try {
        listener({ cols, rows });
      } catch (error) {
        console.error("[opends] terminal resize listener threw", error);
      }
    }
  }
}

/**
 * Nodepod instantiates the terminal class itself, so hand it a constructor that
 * closes over our callbacks and reports the instance back.
 */
export function createHeadlessTerminalClass(
  options: HeadlessXtermOptions & { onCreate: (terminal: HeadlessXterm) => void },
): new (termOptions?: Record<string, unknown>) => XtermLike {
  return class BoundHeadlessXterm extends HeadlessXterm {
    constructor(_termOptions?: Record<string, unknown>) {
      super(options);
      options.onCreate(this);
    }
  };
}
