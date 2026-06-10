// IDE entry point. Boots Nodepod as the single source of truth for the
// workspace (docs/plan.md phase 2), then mounts the NodepodIde shell with
// xterm.js plugged into nodepod.createTerminal (phase 3) and the preview
// manager wired into onServerReady (phase 4).

import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import { Nodepod, NodepodSWSetupError } from "../src/index";
import {
  NodepodIde,
  PreviewManager,
  WorkspaceStore,
  buildBootOptions,
  parseFlagOverrides,
  flagsFromStorage,
  resolveFlags,
  isFlagEnabled,
  DEFAULT_IDE_FLAGS,
} from "../src/ide";
import { STARTER_FILES } from "./starter-files";

const appEl = document.getElementById("app")!;

function showBootError(error: unknown): void {
  const message =
    error instanceof Error ? `${error.message}` : String(error);
  appEl.innerHTML = "";
  const splash = document.createElement("div");
  splash.className = "boot-splash";
  const heading = document.createElement("div");
  heading.textContent = "Nodepod failed to boot";
  const detail = document.createElement("pre");
  detail.textContent = message;
  splash.append(heading, detail);
  appEl.append(splash);
}

async function main(): Promise<void> {
  // Feature flags: defaults < persisted overrides < URL (?ff=ide.preview:off)
  const flags = resolveFlags(
    DEFAULT_IDE_FLAGS,
    flagsFromStorage(localStorage),
    parseFlagOverrides(location.search),
  );

  // Created before boot so onServerReady events are never missed.
  const previews = new PreviewManager();

  const nodepod = await Nodepod.boot(
    buildBootOptions(
      {
        files: STARTER_FILES,
        workdir: "/",
        env: { NODE_ENV: "development" },
      },
      previews,
    ),
  );
  previews.bindHost(nodepod);

  // Restore a persisted workspace snapshot, if one exists. The snapshot is
  // shallow (no node_modules); deps reinstall from package.json on demand.
  const persistence = isFlagEnabled(flags, "ide.persistence");
  if (persistence) {
    const store = new WorkspaceStore(localStorage);
    try {
      const restored = await store.restoreInto(nodepod, { autoInstall: false });
      if (restored) console.info("[ide] restored workspace from snapshot");
    } catch (err) {
      console.warn("[ide] workspace restore failed, using starter files:", err);
    }
  }

  const ide = new NodepodIde({
    host: nodepod,
    previews,
    xterm: { Terminal, FitAddon },
    flags,
    storage: persistence ? localStorage : null,
    title: "VS Code in Nodepod",
  });

  appEl.innerHTML = "";
  ide.mount(appEl);
  await ide.editor.open("/server.js").catch(() => undefined);

  // Handy for poking around in devtools.
  (window as any).nodepod = nodepod;
  (window as any).ide = ide;
}

main().catch((error) => {
  if (error instanceof NodepodSWSetupError) {
    console.error(error.message);
  }
  console.error(error);
  showBootError(error);
});
