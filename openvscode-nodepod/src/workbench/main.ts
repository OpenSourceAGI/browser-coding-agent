import { initialize as initializeServices } from "@codingame/monaco-vscode-api";
import getConfigurationServiceOverride, {
  initUserConfiguration,
} from "@codingame/monaco-vscode-configuration-service-override";
import getDebugServiceOverride from "@codingame/monaco-vscode-debug-service-override";
import getDialogsServiceOverride from "@codingame/monaco-vscode-dialogs-service-override";
import getEnvironmentServiceOverride from "@codingame/monaco-vscode-environment-service-override";
import getExplorerServiceOverride from "@codingame/monaco-vscode-explorer-service-override";
import getExtensionServiceOverride from "@codingame/monaco-vscode-extensions-service-override";
import getFilesServiceOverride, {
  registerFileSystemOverlay,
} from "@codingame/monaco-vscode-files-service-override";
import getHostServiceOverride from "@codingame/monaco-vscode-host-service-override";
import getKeybindingsServiceOverride, {
  initUserKeybindings,
} from "@codingame/monaco-vscode-keybindings-service-override";
import getLanguagesServiceOverride from "@codingame/monaco-vscode-languages-service-override";
import getLayoutServiceOverride from "@codingame/monaco-vscode-layout-service-override";
import getLifecycleServiceOverride from "@codingame/monaco-vscode-lifecycle-service-override";
import getLogServiceOverride from "@codingame/monaco-vscode-log-service-override";
import getMarkersServiceOverride from "@codingame/monaco-vscode-markers-service-override";
import getNotificationServiceOverride from "@codingame/monaco-vscode-notifications-service-override";
import getOutputServiceOverride from "@codingame/monaco-vscode-output-service-override";
import getPreferencesServiceOverride from "@codingame/monaco-vscode-preferences-service-override";
import getQuickAccessServiceOverride from "@codingame/monaco-vscode-quickaccess-service-override";
import getScmServiceOverride from "@codingame/monaco-vscode-scm-service-override";
import getSearchServiceOverride from "@codingame/monaco-vscode-search-service-override";
import getSecretStorageServiceOverride from "@codingame/monaco-vscode-secret-storage-service-override";
import getSnippetsServiceOverride from "@codingame/monaco-vscode-snippets-service-override";
import getStorageServiceOverride from "@codingame/monaco-vscode-storage-service-override";
import getTaskServiceOverride from "@codingame/monaco-vscode-task-service-override";
import getTerminalServiceOverride from "@codingame/monaco-vscode-terminal-service-override";
import getTextmateServiceOverride from "@codingame/monaco-vscode-textmate-service-override";
import getThemeServiceOverride from "@codingame/monaco-vscode-theme-service-override";
import getViewsServiceOverride from "@codingame/monaco-vscode-views-service-override";
import getWorkspaceTrustServiceOverride from "@codingame/monaco-vscode-workspace-trust-service-override";
import "@codingame/monaco-vscode-theme-defaults-default-extension";
// Side-effect import: registers the factory that builds the `vscode` API
// object for extensions running in the page. Without it, `getApi()` on a
// LocalProcess extension never resolves and boot hangs.
import "vscode/localExtensionHost";

import { URI } from "@codingame/monaco-vscode-api/vscode/vs/base/common/uri";
import EditorWorker from "@codingame/monaco-vscode-api/workers/editor.worker?worker";
import ExtensionHostWorker from "@codingame/monaco-vscode-api/workers/extensionHost.worker?worker";
import editorWorkerUrl from "@codingame/monaco-vscode-api/workers/editor.worker?worker&url";
import extensionHostWorkerUrl from "@codingame/monaco-vscode-api/workers/extensionHost.worker?worker&url";

import { NodepodWorkspaceRuntime } from "../runtime/workspace-runtime";
import type { TerminalDriverId } from "../runtime/types";
import {
  DEFAULT_KEYBINDINGS,
  DEFAULT_USER_CONFIGURATION,
  PRODUCT_CONFIGURATION,
} from "./default-config";
import { RuntimeFileSystemProvider } from "./file-system-provider";
import { mountWorkbenchParts } from "./layout";
import { registerNodepodExtension } from "./nodepod-extension";
import { seedFiles } from "./seed-workspace";
import { RuntimeTerminalBackend } from "./terminal-backend";

const WORKSPACE_ROOT = "/workspace";

// The editor and extension-host workers are the only ones VS Code asks for by
// label; everything else in this build is bundled into the main chunk.
declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorker?: (moduleId: string, label: string) => Worker;
      getWorkerUrl?: (moduleId: string, label: string) => string;
      getWorkerOptions?: (
        moduleId: string,
        label: string,
      ) => WorkerOptions | undefined;
    };
  }
}

// Labels are per-descriptor strings, not a fixed enum, and they have changed
// between VS Code versions ("extensionHost" vs "extensionHostWorkerMain").
// Matching on a substring survives that; matching exactly silently breaks the
// extension host.
function isExtensionHost(label: string): boolean {
  return label.toLowerCase().includes("extensionhost");
}

window.MonacoEnvironment = {
  getWorker: (_moduleId, label) =>
    isExtensionHost(label) ? new ExtensionHostWorker() : new EditorWorker(),
  // Both hooks have to be here: `getWorker` covers workers the editor creates
  // directly, `getWorkerUrl` covers the ones created from a URL (the
  // extension host takes that path and throws if only `getWorker` exists).
  getWorkerUrl: (_moduleId, label) =>
    isExtensionHost(label) ? extensionHostWorkerUrl : editorWorkerUrl,
  // Vite emits these workers as ES modules; a classic worker cannot import.
  getWorkerOptions: () => ({ type: "module" }),
};

function setStatus(message: string): void {
  const el = document.querySelector<HTMLElement>("#ovn-boot-status");
  if (el) el.textContent = message;
}

function showFatal(err: unknown): void {
  const splash = document.querySelector<HTMLElement>("#ovn-boot");
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error("[openvscode-nodepod] boot failed", err);
  if (!splash) return;
  splash.innerHTML = "";
  const heading = document.createElement("h2");
  heading.textContent = "Failed to start";
  const pre = document.createElement("pre");
  pre.className = "ovn-error";
  pre.textContent = message;
  splash.append(heading, pre);
  splash.classList.remove("ovn-hidden");
}

function readDriverPreference(): TerminalDriverId {
  const fromQuery = new URLSearchParams(location.search).get("terminal");
  if (fromQuery === "sandbox" || fromQuery === "nodepod") return fromQuery;
  const stored = localStorage.getItem("ovn.terminalDriver");
  return stored === "sandbox" ? "sandbox" : "nodepod";
}

export async function boot(): Promise<void> {
  setStatus("Booting Nodepod runtime…");

  const runtime = await NodepodWorkspaceRuntime.boot({
    workspaceRoot: WORKSPACE_ROOT,
    files: seedFiles(WORKSPACE_ROOT),
    terminalDriver: readDriverPreference(),
    onStatus: setStatus,
  });

  runtime.onTerminalDriverChange((driver) => {
    localStorage.setItem("ovn.terminalDriver", driver.id);
  });

  setStatus("Loading workbench services…");

  // Seed settings before `initialize`: the configuration service reads them
  // during startup, and applying them afterwards causes a visible theme flash.
  await initUserConfiguration(DEFAULT_USER_CONFIGURATION);
  await initUserKeybindings(DEFAULT_KEYBINDINGS);

  const workspaceUri = URI.file(WORKSPACE_ROOT);

  await initializeServices(
    {
      // The worker extension host has nothing to run here — there is no
      // marketplace and the built-in extension is a LocalProcess one — and
      // waiting on it stalls extension activation for a full minute, which
      // in turn holds up the terminal.
      ...getExtensionServiceOverride({ enableWorkerExtensionHost: false }),
      ...getFilesServiceOverride(),
      ...getConfigurationServiceOverride(),
      ...getKeybindingsServiceOverride(),
      ...getLifecycleServiceOverride(),
      ...getLocalizedServices(),
      // Must come before the views override: it owns ILayoutService, which is
      // what registers the workbench parts we later attach to the DOM.
      ...getLayoutServiceOverride(),
      ...getViewsServiceOverride(),
      ...getExplorerServiceOverride(),
      ...getSearchServiceOverride(),
      ...getScmServiceOverride(),
      ...getDebugServiceOverride(),
      ...getTerminalServiceOverride(new RuntimeTerminalBackend(runtime)),
      ...getTaskServiceOverride(),
      ...getMarkersServiceOverride(),
      ...getOutputServiceOverride(),
      ...getPreferencesServiceOverride(),
      ...getSnippetsServiceOverride(),
      ...getStorageServiceOverride(),
      ...getSecretStorageServiceOverride(),
      ...getWorkspaceTrustServiceOverride(),
      ...getEnvironmentServiceOverride(),
      ...getHostServiceOverride(),
      ...getNotificationServiceOverride(),
      ...getDialogsServiceOverride(),
      ...getQuickAccessServiceOverride({
        isKeybindingConfigurationVisible: () => true,
        shouldUseGlobalPicker: () => true,
      }),
      ...getLogServiceOverride(),
    },
    document.querySelector<HTMLElement>("#ovn-workbench") ?? document.body,
    {
      workspaceProvider: {
        trusted: true,
        workspace: { folderUri: workspaceUri },
        async open() {
          // Single-workspace deployment: there is nowhere else to open.
          return false;
        },
      },
      productConfiguration: PRODUCT_CONFIGURATION,
      developmentOptions: { logLevel: 2 /* Info */ },
      windowIndicator: {
        label: "$(browser) Nodepod",
        tooltip: "Filesystem, processes and shell provided by Nodepod",
        command: "nodepod.terminal.selectBackend",
      },
      // Turn `http://localhost:<port>` from code running inside the tab into a
      // URL the browser can actually fetch.
      resolveExternalUri: async (uri) => {
        const port = Number(uri.authority.split(":")[1]);
        if (!Number.isFinite(port)) return uri;
        const forwarded = runtime.resolveExternalUri(port);
        return forwarded ? URI.parse(forwarded) : uri;
      },
    },
  );

  // Registered after `initialize` because the overlay needs the file service
  // that the overrides above construct.
  registerFileSystemOverlay(1, new RuntimeFileSystemProvider(runtime.fs));

  setStatus("Mounting workbench…");
  mountWorkbenchParts();

  document.querySelector("#ovn-boot")?.classList.add("ovn-hidden");
  document.querySelector("#ovn-workbench")?.classList.remove("ovn-hidden");

  // Handy for debugging and for hosts that embed the workbench and want to
  // reach the runtime (write files, read ports) from the page.
  (window as unknown as { openvscodeNodepod?: unknown }).openvscodeNodepod = {
    runtime,
  };

  // The runtime's own commands are a convenience layer. Editing, the
  // explorer, and terminals all work without them, so a slow or broken
  // extension host must not hold the IDE behind a splash screen.
  void registerNodepodExtension(runtime).catch((err) => {
    console.error("[openvscode-nodepod] runtime commands unavailable", err);
  });
}

/** Language + theme + grammar services, grouped so the list above stays readable. */
function getLocalizedServices() {
  return {
    ...getLanguagesServiceOverride(),
    ...getTextmateServiceOverride(),
    ...getThemeServiceOverride(),
  };
}

boot().catch(showFatal);
