import * as vscode from "vscode";
import { BridgeClient } from "../../src/protocol/channel.js";
import type { SyncStatusDTO } from "../../src/protocol/messages.js";
import { OpenDSFileSystemProvider } from "./fs-provider.js";
import { registerSearchProviders } from "./search-providers.js";
import { registerTaskProvider } from "./tasks.js";
import { openTerminal, registerTerminalProfiles } from "./terminal.js";

let client: BridgeClient | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration("opends");
  const sessionId = config.get<string>("sessionId", "");
  const scheme = config.get<string>("scheme", "opends");
  const authority = config.get<string>("workspaceName", "workspace");
  const sandboxAvailable = config.get<boolean>("sandboxAvailable", false);

  const output = vscode.window.createOutputChannel("OpenDS Code", { log: true });
  context.subscriptions.push(output);
  const log = (message: string) => output.appendLine(message);

  if (!sessionId) {
    // Without a session id there is no channel to talk on. Fail loudly here
    // rather than registering a filesystem that can never answer.
    log(
      "No `opends.sessionId` configured. The workbench must be booted by @opensourceagi/opends-code so the bridge channel is known.",
    );
    void vscode.window.showErrorMessage(
      "OpenDS Code: no runtime session configured — the workspace cannot be loaded.",
    );
    return;
  }

  client = new BridgeClient({ session: sessionId });
  context.subscriptions.push(new vscode.Disposable(() => client?.dispose()));
  log(`Bridge attached to session ${sessionId}`);

  // `BridgeClient.on` returns an unsubscribe function; `Disposable` adapts it
  // to the lifecycle VS Code manages.
  context.subscriptions.push(
    new vscode.Disposable(
      client.on("log", ({ level, message }) => log(`[${level}] ${message}`)),
    ),
  );

  /* ---- filesystem: registered first, and synchronously ------------------- */

  const provider = new OpenDSFileSystemProvider(client, scheme, authority);
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(scheme, provider, {
      isCaseSensitive: true,
      isReadonly: false,
    }),
  );

  registerSearchProviders(context, client, scheme, authority, log);
  registerTerminalProfiles(context, client, sandboxAvailable);
  registerTaskProvider(context, client);
  registerCommands(context, client, sandboxAvailable, output);

  const status = createStatusBarItem(context);
  context.subscriptions.push(
    new vscode.Disposable(
      client.on("sync.status", (payload) => updateStatus(status, payload)),
    ),
  );

  // The extension host usually activates before the page has finished booting
  // Nodepod; this reports the outcome instead of leaving an empty explorer.
  void client
    .waitForHost()
    .then((info) => {
      log(
        `Runtime ready — workspace ${info.workspaceRoot}, persistence ${
          info.persistence.enabled ? "on" : "off"
        }, sandbox ${info.sandboxAvailable ? "available" : "disabled"}`,
      );
      updateStatus(status, info.persistence);
    })
    .catch((error: unknown) => {
      log(`Runtime unavailable: ${message(error)}`);
      void vscode.window.showErrorMessage(
        `OpenDS Code: runtime did not start (${message(error)})`,
      );
    });

  // A last flush on shutdown turns "closed the tab too fast" from a data-loss
  // bug into a non-event.
  context.subscriptions.push(
    new vscode.Disposable(() => {
      void client?.request("sync.flush", undefined).catch(() => undefined);
    }),
  );
}

export function deactivate(): void {
  client?.dispose();
  client = undefined;
}

/* -------------------------------------------------------------------------- */

function registerCommands(
  context: vscode.ExtensionContext,
  bridge: BridgeClient,
  sandboxAvailable: boolean,
  output: vscode.OutputChannel,
): void {
  const register = (id: string, handler: () => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));

  register("opends.openLocalTerminal", () => openTerminal(bridge, "local"));

  register("opends.openSandboxTerminal", () => {
    if (!sandboxAvailable) {
      void vscode.window.showWarningMessage(
        "OpenDS Code: no cloud sandbox is configured for this session.",
      );
      return;
    }
    openTerminal(bridge, "sandbox");
  });

  register("opends.syncNow", () =>
    vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Saving workspace…" },
      async () => {
        const status = await bridge.request("sync.flush", undefined, {
          timeoutMs: 120_000,
        });
        if (!status.enabled) {
          void vscode.window.showInformationMessage(
            "OpenDS Code: this session has no cloud storage configured — changes live in the browser only.",
          );
        } else if (status.phase === "error") {
          void vscode.window.showErrorMessage(`OpenDS Code: save failed — ${status.error}`);
        }
      },
    ),
  );

  register("opends.pullFromStorage", async () => {
    const choice = await vscode.window.showWarningMessage(
      "Reload the workspace from cloud storage? Unsaved local changes will be overwritten.",
      { modal: true },
      "Reload",
    );
    if (choice !== "Reload") return;

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Reloading workspace…" },
      () => bridge.request("sync.pull", undefined, { timeoutMs: 120_000 }),
    );
  });

  register("opends.installDependencies", () =>
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Installing npm dependencies…",
      },
      async () => {
        const result = await bridge.request("npm.install", {}, { timeoutMs: 300_000 });
        output.appendLine(result.message);
        if (result.ok) {
          void vscode.window.showInformationMessage(`OpenDS Code: ${result.message}`);
        } else {
          void vscode.window.showErrorMessage(`OpenDS Code: ${result.message}`);
        }
      },
    ),
  );

  register("opends.runNpmScript", async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return;

    let scripts: Record<string, string> = {};
    try {
      const bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.joinPath(folder.uri, "package.json"),
      );
      scripts =
        (JSON.parse(new TextDecoder().decode(bytes)) as {
          scripts?: Record<string, string>;
        }).scripts ?? {};
    } catch {
      void vscode.window.showWarningMessage(
        "OpenDS Code: no readable package.json in this workspace.",
      );
      return;
    }

    const names = Object.keys(scripts);
    if (names.length === 0) {
      void vscode.window.showInformationMessage(
        "OpenDS Code: package.json declares no scripts.",
      );
      return;
    }

    const picked = await vscode.window.showQuickPick(
      names.map((name) => ({ label: name, description: scripts[name] })),
      { placeHolder: "Select an npm script to run in the browser terminal" },
    );
    if (!picked) return;

    openTerminal(bridge, "local", {
      command: `npm run ${picked.label}`,
      name: `npm: ${picked.label}`,
    });
  });

  register("opends.openPreview", async () => {
    const ports = await bridge.request("preview.list", undefined);
    if (ports.length === 0) {
      void vscode.window.showInformationMessage(
        "OpenDS Code: no server is running yet. Start one from a terminal and try again.",
      );
      return;
    }

    const picked =
      ports.length === 1
        ? ports[0]
        : await vscode.window
            .showQuickPick(
              ports.map((entry) => ({
                label: `localhost:${entry.port}`,
                description: entry.url,
                entry,
              })),
              { placeHolder: "Select a running server" },
            )
            .then((selection) => selection?.entry);
    if (!picked) return;

    // `simpleBrowser.show` is a built-in web extension; falling back to
    // `openExternal` keeps this working in builds that omit it.
    try {
      await vscode.commands.executeCommand("simpleBrowser.show", picked.url);
    } catch {
      await vscode.env.openExternal(vscode.Uri.parse(picked.url));
    }
  });

  register("opends.showLog", () => output.show(true));
}

/* -------------------------------------------------------------------------- */

function createStatusBarItem(
  context: vscode.ExtensionContext,
): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  item.command = "opends.syncNow";
  item.text = "$(cloud) OpenDS";
  item.tooltip = "OpenDS Code — click to save the workspace";
  item.show();
  context.subscriptions.push(item);
  return item;
}

function updateStatus(item: vscode.StatusBarItem, status: SyncStatusDTO): void {
  if (!status.enabled) {
    item.text = "$(circle-slash) OpenDS: local only";
    item.tooltip =
      "No cloud storage configured — this workspace lives in the browser and is lost on reload.";
    item.backgroundColor = undefined;
    return;
  }

  switch (status.phase) {
    case "pushing":
      item.text = `$(sync~spin) Saving${status.pending ? ` (${status.pending})` : ""}`;
      item.tooltip = "Pushing workspace changes to cloud storage";
      item.backgroundColor = undefined;
      break;
    case "hydrating":
    case "pulling":
      item.text = "$(sync~spin) Loading workspace";
      item.tooltip = "Restoring the workspace from cloud storage";
      item.backgroundColor = undefined;
      break;
    case "error":
      item.text = "$(warning) OpenDS: save failed";
      item.tooltip = `Last sync error: ${status.error ?? "unknown"}`;
      item.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground",
      );
      break;
    default:
      item.text = status.pending
        ? `$(cloud-upload) ${status.pending} pending`
        : "$(check) OpenDS saved";
      item.tooltip = status.lastPushedAt
        ? `Last saved ${new Date(status.lastPushedAt).toLocaleTimeString()}`
        : "Workspace is in sync";
      item.backgroundColor = undefined;
      break;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
