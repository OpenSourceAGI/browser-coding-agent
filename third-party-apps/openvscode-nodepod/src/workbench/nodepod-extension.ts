import {
  ExtensionHostKind,
  registerExtension,
} from "@codingame/monaco-vscode-api/extensions";
import type { NodepodWorkspaceRuntime } from "../runtime/workspace-runtime";
import type { TerminalDriverId } from "../runtime/types";

type VscodeApi = typeof import("vscode");

const MANIFEST = {
  name: "nodepod-runtime",
  publisher: "openvscode-nodepod",
  version: "1.0.0",
  engines: { vscode: "*" },
  enabledApiProposals: [],
  contributes: {
    commands: [
      {
        command: "nodepod.terminal.selectBackend",
        title: "Nodepod: Select Terminal Backend…",
        category: "Nodepod",
      },
      {
        command: "nodepod.sandbox.push",
        title: "Nodepod: Clone Workspace Into Sandbox Container",
        category: "Nodepod",
      },
      {
        command: "nodepod.sandbox.pull",
        title: "Nodepod: Pull Changes From Sandbox Container",
        category: "Nodepod",
      },
      {
        command: "nodepod.ports.open",
        title: "Nodepod: Open Forwarded Port…",
        category: "Nodepod",
      },
    ],
  },
};

/**
 * A built-in extension carrying the runtime's user-facing commands.
 *
 * Going through the extension host rather than registering actions directly
 * means these land in the command palette, keybinding editor, and menus the
 * same way any other VS Code command does.
 */
export async function registerNodepodExtension(
  runtime: NodepodWorkspaceRuntime,
): Promise<void> {
  const { getApi } = registerExtension(MANIFEST, ExtensionHostKind.LocalProcess);
  const vscode = await getApi();

  // This build of the workbench ships no status bar part, so the item may not
  // render — and on some builds the service itself is a throwing stub. The
  // window indicator and the command palette are the reliable surfaces; this
  // is a bonus when it happens to work.
  const refreshStatus = createStatusIndicator(vscode, runtime);
  runtime.onTerminalDriverChange(refreshStatus);

  vscode.commands.registerCommand("nodepod.terminal.selectBackend", async () => {
    const picked = await vscode.window.showQuickPick(
      runtime.availableDrivers().map((driver) => ({
        label: driver.label,
        description:
          driver.id === runtime.terminalDriverId ? "current" : undefined,
        detail:
          driver.id === "sandbox"
            ? "Boots a Linux container and clones this workspace into it."
            : "Runs a shell in a Web Worker. No server involved.",
        id: driver.id,
      })),
      { title: "Where should new terminals run?" },
    );
    if (!picked) return;
    await runtime.setTerminalDriver(picked.id as TerminalDriverId);
    refreshStatus();
    vscode.window.showInformationMessage(
      `New terminals will run in: ${runtime.terminals.label}`,
    );
  });

  vscode.commands.registerCommand("nodepod.sandbox.push", async () => {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Sandbox" },
      async (progress) => {
        try {
          await runtime.sandbox.prepare((message) =>
            progress.report({ message }),
          );
          const count = await runtime.sandbox.pushWorkspace((message) =>
            progress.report({ message }),
          );
          vscode.window.showInformationMessage(
            `Cloned ${count} files into the sandbox container.`,
          );
        } catch (err) {
          vscode.window.showErrorMessage(
            `Sandbox clone failed: ${describe(err)}`,
          );
        }
      },
    );
  });

  vscode.commands.registerCommand("nodepod.sandbox.pull", async () => {
    try {
      const count = await runtime.sandbox.pullWorkspace();
      vscode.window.showInformationMessage(
        count === 0
          ? "No container-side changes to pull."
          : `Pulled ${count} changed files from the container.`,
      );
    } catch (err) {
      vscode.window.showErrorMessage(`Sandbox pull failed: ${describe(err)}`);
    }
  });

  vscode.commands.registerCommand("nodepod.ports.open", async () => {
    const ports = runtime.listPorts();
    if (ports.length === 0) {
      vscode.window.showInformationMessage(
        "No servers are listening yet. Run something that calls listen().",
      );
      return;
    }
    const picked = await vscode.window.showQuickPick(
      ports.map((p) => ({ label: `Port ${p.port}`, detail: p.url, url: p.url })),
      { title: "Open a forwarded port" },
    );
    if (picked) await vscode.env.openExternal(vscode.Uri.parse(picked.url));
  });

  // Announce servers as they come up: a dev server that starts silently is
  // the single most confusing thing about browser-hosted runtimes.
  runtime.onPortOpen(({ port, url }) => {
    void vscode.window
      .showInformationMessage(
        `Server listening on port ${port}.`,
        "Open in browser",
      )
      .then((choice) => {
        if (choice) return vscode.env.openExternal(vscode.Uri.parse(url));
        return undefined;
      });
  });

  runtime.sandbox.onSyncError((err) => {
    vscode.window.showWarningMessage(
      `Sandbox file sync paused: ${describe(err)}`,
    );
  });
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function createStatusIndicator(
  vscode: VscodeApi,
  runtime: NodepodWorkspaceRuntime,
): () => void {
  try {
    const item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    item.command = "nodepod.terminal.selectBackend";
    const refresh = () => {
      const driver = runtime.terminals;
      item.text =
        driver.id === "sandbox" ? "$(server) Sandbox" : "$(browser) In-browser";
      item.tooltip = `New terminals run in: ${driver.label}`;
      item.show();
    };
    refresh();
    return refresh;
  } catch (err) {
    console.warn("[openvscode-nodepod] no status bar available", err);
    return () => {};
  }
}
