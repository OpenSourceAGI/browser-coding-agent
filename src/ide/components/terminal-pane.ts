// Terminal component (plan steps 3.1/3.2). Preferred mode plugs xterm.js
// into nodepod.createTerminal({ Terminal, FitAddon }) for a full
// interactive shell. When xterm isn't supplied, a fallback console wires
// typed commands straight to nodepod.spawn via ProcessRunner.

import { el } from "./dom";
import type { TerminalOptions, TerminalTheme } from "../../sdk/types";
import type { IdeTerminal } from "../host";
import type { ProcessRunner } from "../process-runner";

export interface TerminalPaneOptions {
  /** Host with createTerminal (a booted Nodepod) — enables xterm mode. */
  host?: { createTerminal(opts: TerminalOptions): IdeTerminal };
  /** Injected xterm.js constructors (peer deps, same pattern as the SDK). */
  xterm?: { Terminal: any; FitAddon?: any; theme?: TerminalTheme };
  /** Fallback executor when xterm isn't available. */
  runner?: ProcessRunner;
  cwd?: string;
}

export class TerminalPane {
  private _opts: TerminalPaneOptions;
  private _terminal: IdeTerminal | null = null;
  private _container: HTMLElement | null = null;
  private _log: HTMLElement | null = null;
  private _input: HTMLInputElement | null = null;
  private _history: string[] = [];
  private _historyIndex = -1;
  private _busy = false;

  constructor(opts: TerminalPaneOptions) {
    this._opts = opts;
  }

  get mode(): "xterm" | "console" {
    return this._opts.host && this._opts.xterm?.Terminal ? "xterm" : "console";
  }

  mount(container: HTMLElement): void {
    this._container = container;
    container.classList.add("npde-terminal");
    if (this.mode === "xterm") {
      this._terminal = this._opts.host!.createTerminal({
        Terminal: this._opts.xterm!.Terminal,
        FitAddon: this._opts.xterm!.FitAddon,
        theme: this._opts.xterm!.theme,
      });
      this._terminal.attach(container);
    } else {
      this._mountConsole(container);
    }
  }

  fit(): void {
    this._terminal?.fit?.();
  }

  dispose(): void {
    this._terminal?.dispose?.();
    this._terminal = null;
    this._container = null;
    this._log = null;
    this._input = null;
  }

  /* ---- fallback console (commands -> nodepod.spawn) ---- */

  private _mountConsole(container: HTMLElement): void {
    const doc = container.ownerDocument;
    this._log = el(doc, "pre", { className: "npde-console-log" });
    this._input = el(doc, "input", {
      className: "npde-console-input",
      type: "text",
      placeholder: "Type a shell command and press Enter (e.g. ls, node index.js)",
      spellcheck: false,
    });
    const row = el(doc, "div", { className: "npde-console-input-row" }, [
      el(doc, "span", { className: "npde-console-prompt", textContent: "$" }),
      this._input,
    ]);
    container.append(this._log, row);

    this._input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        const command = this._input!.value.trim();
        this._input!.value = "";
        if (command) void this._execute(command);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        this._recall(-1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        this._recall(1);
      }
    });
  }

  /** Append text to the console log (also used by the app's Run/Install actions). */
  appendOutput(text: string, kind: "out" | "err" | "cmd" = "out"): void {
    if (!this._log) return;
    const doc = this._log.ownerDocument;
    this._log.append(
      el(doc, "span", { className: `npde-console-${kind}`, textContent: text }),
    );
    this._log.scrollTop = this._log.scrollHeight;
  }

  private async _execute(command: string): Promise<void> {
    if (!this._opts.runner || this._busy) return;
    this._history.push(command);
    this._historyIndex = this._history.length;
    this.appendOutput(`$ ${command}\n`, "cmd");
    this._busy = true;
    try {
      const result = await this._opts.runner.run(command, undefined, {
        cwd: this._opts.cwd,
        onOutput: (chunk) => this.appendOutput(chunk, "out"),
        onError: (chunk) => this.appendOutput(chunk, "err"),
      });
      if (result.exitCode !== 0) {
        this.appendOutput(`(exit ${result.exitCode})\n`, "err");
      }
    } catch (err) {
      this.appendOutput(`${err instanceof Error ? err.message : err}\n`, "err");
    } finally {
      this._busy = false;
    }
  }

  private _recall(direction: -1 | 1): void {
    if (!this._input || this._history.length === 0) return;
    const next = Math.min(
      Math.max(this._historyIndex + direction, 0),
      this._history.length,
    );
    this._historyIndex = next;
    this._input.value = this._history[next] ?? "";
  }
}
