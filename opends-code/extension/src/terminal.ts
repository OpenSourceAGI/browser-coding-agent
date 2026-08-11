import * as vscode from "vscode";
import type { BridgeClient } from "../../src/protocol/channel.js";
import type { TerminalMode } from "../../src/protocol/messages.js";

let terminalSequence = 0;

/**
 * A VS Code `Pseudoterminal` whose bytes come from the bridge.
 *
 * In `local` mode the host runs Nodepod's shell in the browser — the same
 * runtime that powers the filesystem — so `npm install`, `node server.js` and
 * shell builtins all work with no server involved.
 *
 * In `sandbox` mode the host proxies a PTY inside a Cloudflare Sandbox
 * container. Opening one of these is the only action in the entire product that
 * causes a container to be created.
 */
export class BridgePseudoterminal implements vscode.Pseudoterminal {
  private readonly _writeEmitter = new vscode.EventEmitter<string>();
  private readonly _closeEmitter = new vscode.EventEmitter<number | void>();
  readonly onDidWrite = this._writeEmitter.event;
  readonly onDidClose = this._closeEmitter.event;

  readonly id = `t${++terminalSequence}-${Math.random().toString(36).slice(2, 8)}`;

  private readonly _client: BridgeClient;
  private readonly _mode: TerminalMode;
  private readonly _command: string | undefined;
  private readonly _disposables: Array<() => void> = [];
  private _closed = false;

  constructor(
    client: BridgeClient,
    mode: TerminalMode,
    options?: { command?: string },
  ) {
    this._client = client;
    this._mode = mode;
    this._command = options?.command;
  }

  async open(initialDimensions: vscode.TerminalDimensions | undefined): Promise<void> {
    const cols = initialDimensions?.columns ?? 80;
    const rows = initialDimensions?.rows ?? 24;

    this._disposables.push(
      this._client.on("term.data", ({ id, data }) => {
        if (id === this.id) this._writeEmitter.fire(data);
      }),
      this._client.on("term.exit", ({ id, code }) => {
        if (id !== this.id || this._closed) return;
        this._closed = true;
        this._closeEmitter.fire(code);
      }),
    );

    try {
      await this._client.request(
        "term.open",
        {
          id: this.id,
          mode: this._mode,
          cols,
          rows,
          ...(this._command ? { command: this._command } : {}),
        },
        // Booting a container is slow the first time; a 60s default would time
        // out on a cold start and leave the user staring at a blank terminal.
        { timeoutMs: this._mode === "sandbox" ? 180_000 : 30_000 },
      );
    } catch (error) {
      this._writeEmitter.fire(
        `\r\n\x1b[31mFailed to start terminal: ${message(error)}\x1b[0m\r\n`,
      );
      this._closed = true;
      this._closeEmitter.fire(1);
    }
  }

  close(): void {
    if (!this._closed) {
      this._closed = true;
      void this._client.request("term.close", { id: this.id }).catch(() => undefined);
    }
    for (const dispose of this._disposables) dispose();
    this._disposables.length = 0;
  }

  handleInput(data: string): void {
    if (this._closed) return;
    void this._client
      .request("term.input", { id: this.id, data })
      .catch(() => undefined);
  }

  setDimensions(dimensions: vscode.TerminalDimensions): void {
    if (this._closed) return;
    void this._client
      .request("term.resize", {
        id: this.id,
        cols: dimensions.columns,
        rows: dimensions.rows,
      })
      .catch(() => undefined);
  }
}

export function registerTerminalProfiles(
  context: vscode.ExtensionContext,
  client: BridgeClient,
  sandboxAvailable: boolean,
): void {
  context.subscriptions.push(
    vscode.window.registerTerminalProfileProvider("opends.localTerminal", {
      provideTerminalProfile() {
        return new vscode.TerminalProfile({
          name: "node (browser)",
          pty: new BridgePseudoterminal(client, "local"),
          iconPath: new vscode.ThemeIcon("terminal"),
        });
      },
    }),
  );

  if (!sandboxAvailable) return;

  context.subscriptions.push(
    vscode.window.registerTerminalProfileProvider("opends.sandboxTerminal", {
      provideTerminalProfile() {
        return new vscode.TerminalProfile({
          name: "bash (cloud sandbox)",
          pty: new BridgePseudoterminal(client, "sandbox"),
          iconPath: new vscode.ThemeIcon("cloud"),
        });
      },
    }),
  );
}

export function openTerminal(
  client: BridgeClient,
  mode: TerminalMode,
  options?: { command?: string; name?: string },
): vscode.Terminal {
  const terminal = vscode.window.createTerminal({
    name:
      options?.name ??
      (mode === "sandbox" ? "bash (cloud sandbox)" : "node (browser)"),
    pty: new BridgePseudoterminal(client, mode, options),
    iconPath: new vscode.ThemeIcon(mode === "sandbox" ? "cloud" : "terminal"),
  });
  terminal.show();
  return terminal;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
