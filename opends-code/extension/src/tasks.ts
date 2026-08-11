import * as vscode from "vscode";
import type { BridgeClient } from "../../src/protocol/channel.js";
import { BridgePseudoterminal } from "./terminal.js";

const TASK_TYPE = "opends";

/**
 * Surfaces `package.json` scripts as VS Code tasks.
 *
 * The built-in npm task provider shells out to a real `npm` binary, which does
 * not exist here — so tasks are provided directly and executed through the same
 * in-browser shell as the terminal. `Run Task` therefore works exactly as it
 * would locally, and a task's output is a live PTY, not a scraped log.
 */
export function registerTaskProvider(
  context: vscode.ExtensionContext,
  client: BridgeClient,
): void {
  context.subscriptions.push(
    vscode.tasks.registerTaskProvider(TASK_TYPE, {
      async provideTasks() {
        const scripts = await readScripts();
        const tasks = Object.keys(scripts).map((name) =>
          buildTask(client, name, `npm run ${name}`),
        );
        tasks.push(buildTask(client, "install", "npm install"));
        return tasks;
      },

      resolveTask(task) {
        const command = (task.definition as { command?: string }).command;
        if (!command) return undefined;
        return buildTask(client, task.name, command);
      },
    }),
  );
}

async function readScripts(): Promise<Record<string, string>> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return {};

  try {
    const bytes = await vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(folder.uri, "package.json"),
    );
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as {
      scripts?: Record<string, string>;
    };
    return parsed.scripts ?? {};
  } catch {
    // No package.json, or it is mid-edit and unparseable. Either way there are
    // no scripts to offer right now.
    return {};
  }
}

function buildTask(
  client: BridgeClient,
  name: string,
  command: string,
): vscode.Task {
  const task = new vscode.Task(
    { type: TASK_TYPE, command },
    vscode.TaskScope.Workspace,
    name,
    TASK_TYPE,
    new vscode.CustomExecution(
      async () => new BridgePseudoterminal(client, "local", { command }),
    ),
  );
  task.detail = command;
  task.presentationOptions = {
    reveal: vscode.TaskRevealKind.Always,
    panel: vscode.TaskPanelKind.Dedicated,
    clear: true,
  };
  return task;
}
