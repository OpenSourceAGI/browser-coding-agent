// IDE entry point. Boots Nodepod as the single source of truth for the
// workspace (docs/plan.md phase 2), then mounts the NodepodIde shell with
// xterm.js plugged into nodepod.createTerminal (phase 3) and the preview
// manager wired into onServerReady (phase 4).

import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import { Nodepod, NodepodSWSetupError } from "../src/index";
import {
  PreviewManager,
  WorkspaceStore,
  buildBootOptions,
  parseFlagOverrides,
  flagsFromStorage,
  resolveFlags,
  isFlagEnabled,
  DEFAULT_IDE_FLAGS,
} from "../src/ide";
// Note: `NodepodIde` (the custom UI) is kept in the codebase but we prefer
// to reuse the adapted OpenVSCode Server web UI when its `out` build is
// available under `/openvscode-server/out`. If present we'll load the
// OpenVSC bootstrap and initialize the workbench; otherwise fall back to
// the existing `NodepodIde` shell.
import { NodepodIde } from "../src/ide/app";
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

  // Try to detect an OpenVSCode Server web build at /openvscode-server/out
  try {
    const resp = await fetch('/openvscode-server/out/vs/loader.js', { method: 'HEAD' });
    if (resp.ok && typeof (window as any).MonacoBootstrapWindow === 'undefined') {
      // Inject the OpenVSC bootstrap script which defines `MonacoBootstrapWindow`
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = '/openvscode-server/src/bootstrap-window.js';
        s.onload = () => resolve();
        s.onerror = (e) => reject(new Error('Failed to load OpenVSC bootstrap'));
        document.head.appendChild(s);
      });
    }

    if ((window as any).MonacoBootstrapWindow) {
      console.info('[ide] OpenVSC build detected — booting OpenVSCode Server UI');
      appEl.innerHTML = '';
      // Ensure a container for the workbench exists
      const wb = document.createElement('div');
      wb.id = 'workbench';
      wb.style.width = '100%';
      wb.style.height = '100%';
      appEl.append(wb);

      // Load the web workbench module. Use beforeLoaderConfig to point
      // the AMD loader to the prebuilt `out` directory.
      (window as any).MonacoBootstrapWindow.load([
        'vs/workbench/workbench.web.main'
      ], (_result: any, configuration: any) => {
        console.info('[ide] OpenVSC workbench loaded', configuration);
        return undefined;
      }, {
        beforeLoaderConfig: (_configuration: any, loaderConfig: any) => {
          loaderConfig.baseUrl = `${location.origin}/openvscode-server/out`;
        },
        canModifyDOM: (_configuration: any) => {
          // Nothing special to do — we already created #workbench inside `app`.
        }
      });
      // We still expose the nodepod/ide globals for compatibility.
      (window as any).nodepod = nodepod;
      (window as any).ide = ide;
      // Attempt to open default file in the legacy editor too (best-effort)
      await ide.editor.open('/server.js').catch(() => undefined);
      return;
    }
  } catch (err) {
    console.warn('[ide] OpenVSC UI not available, falling back to NodepodIde:', err);
  }

  // Fallback: mount the original NodepodIde UI
  appEl.innerHTML = '';
  ide.mount(appEl);
  await ide.editor.open('/server.js').catch(() => undefined);

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
