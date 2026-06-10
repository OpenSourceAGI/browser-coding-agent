// NodepodIde: the OpenVSCode-inspired shell that composes FileExplorer,
// Editor, Terminal and Preview around the Nodepod data layer. The host
// (a booted Nodepod) is the single source of truth — every pane talks to
// it through NodepodFileSystem / ProcessRunner / PreviewManager only.

import { el } from "./components/dom";
import { FileExplorer } from "./components/file-explorer";
import { Editor } from "./components/editor";
import { TerminalPane } from "./components/terminal-pane";
import { PreviewPane } from "./components/preview-pane";
import { NodepodFileSystem, type ReadTreeOptions } from "./nodepod-file-system";
import { ProcessRunner } from "./process-runner";
import { PreviewManager } from "./preview-manager";
import { WorkspaceStore, type StorageLike } from "./workspace";
import {
  DEFAULT_IDE_FLAGS,
  isFlagEnabled,
  resolveFlags,
  type FlagMap,
} from "./feature-flags";
import { getModuleManifest } from "./polyfill-manifest";
import { injectIdeStyles } from "./styles";
import type { IdeHost } from "./host";
import type { TerminalTheme } from "../sdk/types";

export interface NodepodIdeOptions {
  host: IdeHost;
  /** Pass the PreviewManager that was wired into Nodepod.boot(). */
  previews?: PreviewManager;
  /** xterm.js constructors for the interactive terminal (plan step 3.1). */
  xterm?: { Terminal: any; FitAddon?: any; theme?: TerminalTheme };
  flags?: FlagMap;
  /** Storage for workspace snapshots (e.g. localStorage). */
  storage?: StorageLike | null;
  title?: string;
  /** Script run by the ▶ button. Falls back to package.json "main", then /index.js. */
  entryScript?: string;
  treeOptions?: ReadTreeOptions;
}

type PanelView = "terminal" | "output" | "runtime";

export class NodepodIde {
  readonly files: NodepodFileSystem;
  readonly runner: ProcessRunner;
  readonly previews: PreviewManager;
  readonly explorer: FileExplorer;
  readonly editor: Editor;
  readonly terminal: TerminalPane;
  readonly preview: PreviewPane;

  private _opts: NodepodIdeOptions;
  private _flags: FlagMap;
  private _store: WorkspaceStore | null;
  private _root: HTMLElement | null = null;
  private _outputLog: HTMLElement | null = null;
  private _statusFile: HTMLElement | null = null;
  private _statusPorts: HTMLElement | null = null;
  private _panelButtons = new Map<PanelView, HTMLElement>();
  private _panelViews = new Map<PanelView, HTMLElement>();
  private _unwatchFs: (() => void) | null = null;
  private _persistTimer: ReturnType<typeof setTimeout> | null = null;
  private _sidebarVisible = true;
  private _panelVisible = true;
  private _previewVisible = true;

  constructor(opts: NodepodIdeOptions) {
    this._opts = opts;
    this._flags = resolveFlags(DEFAULT_IDE_FLAGS, opts.flags ?? {});
    const host = opts.host;

    this.files = new NodepodFileSystem(host.fs);
    this.runner = new ProcessRunner(host);
    this.previews = opts.previews ?? new PreviewManager(host);
    if (opts.previews) this.previews.bindHost(host);

    this._store =
      opts.storage && this._flag("ide.persistence") && host.snapshot
        ? new WorkspaceStore(opts.storage)
        : null;

    this.explorer = new FileExplorer({
      fs: this.files,
      tree: opts.treeOptions,
      onOpenFile: (path) => void this.editor.open(path),
    });
    this.editor = new Editor({
      fs: this.files,
      onSave: () => this._schedulePersist(),
      onStatus: (status) => {
        if (!this._statusFile) return;
        this._statusFile.textContent = status.path
          ? `${status.path}${status.dirty ? " ●" : ""}  Ln ${status.line}, Col ${status.column}`
          : "";
      },
    });
    this.terminal = new TerminalPane({
      host: host.createTerminal ? (host as any) : undefined,
      xterm: this._flag("ide.terminal") ? opts.xterm : undefined,
      runner: this.runner,
      cwd: host.cwd,
    });
    this.preview = new PreviewPane({ previews: this.previews });
  }

  /* ---- mounting ---- */

  mount(container: HTMLElement): void {
    const doc = container.ownerDocument;
    injectIdeStyles(doc);

    const root = el(doc, "div", { className: "npde-root" });
    this._root = root;

    root.append(
      this._buildTitlebar(doc),
      this._buildMain(doc),
      this._buildStatusbar(doc),
    );
    container.append(root);

    // Default layout for small screens: start with sidebar/preview hidden
    const narrow =
      typeof (globalThis as any).matchMedia === "function"
        ? (globalThis as any).matchMedia("(max-width: 900px)").matches
        : false;
    this._sidebarVisible = !narrow;
    this._previewVisible = this._flag("ide.preview");
    this._panelVisible = true;
    this._applyLayout();

    // External FS changes (spawned processes, npm install) feed the same
    // change stream the explorer and editor already subscribe to.
    try {
      this._unwatchFs = this.files.watchHost("/");
    } catch {
      /* hosts without watch support */
    }

    this.previews.on("server-ready", () => this._syncPorts());
    this.previews.on("server-closed", () => this._syncPorts());
    this._syncPorts();
  }

  dispose(): void {
    if (this._persistTimer) clearTimeout(this._persistTimer);
    this._unwatchFs?.();
    this.explorer.dispose();
    this.editor.dispose();
    this.terminal.dispose();
    this.preview.dispose();
    this.runner.killAll();
    this.files.dispose();
    this._root?.remove();
    this._root = null;
  }

  /* ---- actions ---- */

  /** Resolve the script the ▶ button runs. */
  async resolveEntryScript(): Promise<string> {
    if (this._opts.entryScript) return this._opts.entryScript;
    try {
      const manifest = JSON.parse(await this.files.readFile("/package.json"));
      if (typeof manifest.main === "string" && manifest.main) {
        return manifest.main.startsWith("/") ? manifest.main : `/${manifest.main}`;
      }
    } catch {
      /* no manifest */
    }
    return "/index.js";
  }

  async runEntry(): Promise<void> {
    await this.editor.saveAll();
    const entry = await this.resolveEntryScript();
    this._showPanel("output");
    this._appendOutput(`$ node ${entry.replace(/^\//, "")}\n`, "cmd");
    try {
      const running = await this.runner.start("node", [entry], {
        onOutput: (chunk) => this._appendOutput(chunk, "out"),
        onError: (chunk) => this._appendOutput(chunk, "err"),
        onExit: (code) => this._appendOutput(`(exit ${code})\n`, code === 0 ? "info" : "err"),
      });
      void running.completion;
    } catch (err) {
      this._appendOutput(`${err instanceof Error ? err.message : err}\n`, "err");
    }
  }

  async installDependencies(): Promise<void> {
    const host = this._opts.host;
    if (!host.install) {
      this._appendOutput("install is not supported by this host\n", "err");
      return;
    }
    this._showPanel("output");
    this._appendOutput("$ npm install\n", "cmd");
    try {
      await host.install(undefined, {
        onProgress: (message) => this._appendOutput(`${message}\n`, "info"),
      });
      this._appendOutput("Dependencies installed.\n", "info");
      this._schedulePersist();
    } catch (err) {
      this._appendOutput(`${err instanceof Error ? err.message : err}\n`, "err");
    }
  }

  async saveWorkspace(): Promise<void> {
    if (!this._store || !this._opts.host.snapshot) return;
    await this.editor.saveAll();
    this._store.save(this._opts.host as { snapshot: NonNullable<IdeHost["snapshot"]> });
    this._appendOutput("Workspace snapshot saved.\n", "info");
  }

  resetWorkspace(): void {
    this._store?.clear();
    this._appendOutput(
      "Stored workspace cleared. Reload the page to boot the starter files.\n",
      "info",
    );
  }

  /* ---- layout construction ---- */

  private _buildTitlebar(doc: Document): HTMLElement {
    const actions: HTMLElement[] = [
      el(doc, "button", {
        className: "npde-action npde-action-primary",
        textContent: "▶ Run",
        title: "Run the workspace entry script with node",
        onClick: () => void this.runEntry(),
      }),
    ];
    if (this._flag("ide.install") && this._opts.host.install) {
      actions.push(
        el(doc, "button", {
          className: "npde-action",
          textContent: "npm install",
          title: "Install dependencies from package.json (plan step 5.1)",
          onClick: () => void this.installDependencies(),
        }),
      );
    }
    if (this._store) {
      actions.push(
        el(doc, "button", {
          className: "npde-action",
          textContent: "Save workspace",
          title: "Persist a filesystem snapshot to browser storage",
          onClick: () => void this.saveWorkspace(),
        }),
        el(doc, "button", {
          className: "npde-action",
          textContent: "Reset",
          title: "Clear the persisted snapshot",
          onClick: () => this.resetWorkspace(),
        }),
      );
    }

    return el(doc, "div", { className: "npde-titlebar" }, [
      el(doc, "span", { className: "npde-title" }, [
        el(doc, "span", {
          textContent: this._opts.title ?? "VS Code in Nodepod",
        }),
        el(doc, "span", { className: "npde-title-dot", textContent: " ●" }),
      ]),
      el(doc, "span", { className: "npde-titlebar-spacer" }),
      ...actions,
    ]);
  }

  private _buildMain(doc: Document): HTMLElement {
    const activitybar = el(doc, "div", { className: "npde-activitybar" }, [
      this._activityButton(doc, "🗎", "Toggle explorer", () => {
        this._sidebarVisible = !this._sidebarVisible;
        this._applyLayout();
      }),
      this._activityButton(doc, "❯_", "Toggle terminal panel", () => {
        this._panelVisible = !this._panelVisible;
        this._applyLayout();
        this.terminal.fit();
      }),
      this._activityButton(doc, "▣", "Toggle preview", () => {
        this._previewVisible = !this._previewVisible;
        this._applyLayout();
      }),
      this._activityButton(doc, "ⓘ", "Runtime info", () => {
        this._panelVisible = true;
        this._applyLayout();
        this._showPanel("runtime");
      }),
    ]);

    const sidebar = el(doc, "div", { className: "npde-sidebar" });
    this.explorer.mount(sidebar);

    const editorWrap = el(doc, "div", { className: "npde-editor-wrap" });
    this.editor.mount(editorWrap);

    const center = el(doc, "div", { className: "npde-center" }, [
      editorWrap,
      this._buildPanel(doc),
    ]);

    const right = el(doc, "div", { className: "npde-right" });
    if (this._flag("ide.preview")) {
      this.preview.mount(right);
    }

    return el(doc, "div", { className: "npde-main" }, [
      activitybar,
      sidebar,
      center,
      right,
    ]);
  }

  private _buildPanel(doc: Document): HTMLElement {
    const tabs = el(doc, "div", { className: "npde-panel-tabs" });
    const body = el(doc, "div", { className: "npde-panel-body" });

    const addView = (view: PanelView, label: string, content: HTMLElement) => {
      const button = el(doc, "button", {
        className: "npde-panel-tab",
        textContent: label,
        onClick: () => this._showPanel(view),
      });
      tabs.append(button);
      const wrap = el(doc, "div", { className: "npde-panel-view" }, [content]);
      body.append(wrap);
      this._panelButtons.set(view, button);
      this._panelViews.set(view, wrap);
    };

    if (this._flag("ide.terminal")) {
      const terminalHostEl = el(doc, "div", { className: "npde-terminal-host" });
      terminalHostEl.style.cssText = "flex:1;min-height:0;display:flex;flex-direction:column;";
      this.terminal.mount(terminalHostEl);
      addView("terminal", "Terminal", terminalHostEl);
    }

    this._outputLog = el(doc, "pre", { className: "npde-console-log" });
    addView("output", "Output", this._outputLog);
    addView("runtime", "Runtime", this._buildRuntimeView(doc));

    this._showPanel(this._flag("ide.terminal") ? "terminal" : "output");
    return el(doc, "div", { className: "npde-panel" }, [tabs, body]);
  }

  private _buildRuntimeView(doc: Document): HTMLElement {
    const view = el(doc, "div", { className: "npde-runtime" });
    view.append(
      el(doc, "h3", { textContent: "Feature flags" }),
    );
    const flagTable = el(doc, "table");
    for (const [name, value] of Object.entries(this._flags)) {
      flagTable.append(
        el(doc, "tr", {}, [
          el(doc, "td", { textContent: name }),
          el(doc, "td", { textContent: value ? "on" : "off" }),
        ]),
      );
    }
    view.append(flagTable);

    view.append(
      el(doc, "h3", { textContent: "Node.js module support (plan 5.2/5.3)" }),
    );
    const moduleTable = el(doc, "table");
    for (const entry of getModuleManifest()) {
      moduleTable.append(
        el(doc, "tr", {}, [
          el(doc, "td", { textContent: entry.name }),
          el(doc, "td", {}, [
            el(doc, "span", {
              className:
                entry.status === "full" ? "npde-badge-full" : "npde-badge-stub",
              textContent: entry.status,
            }),
            el(doc, "span", {
              textContent: entry.note ? ` — ${entry.note}` : "",
            }),
          ]),
        ]),
      );
    }
    view.append(moduleTable);
    return view;
  }

  private _buildStatusbar(doc: Document): HTMLElement {
    this._statusPorts = el(doc, "span", { className: "npde-status-item" });
    this._statusFile = el(doc, "span", { className: "npde-status-item" });
    return el(doc, "div", { className: "npde-statusbar" }, [
      el(doc, "span", { className: "npde-status-item", textContent: "⚡ Nodepod" }),
      el(doc, "span", {
        className: "npde-status-item",
        textContent: this._opts.host.cwd,
      }),
      el(doc, "span", { className: "npde-statusbar-spacer" }),
      this._statusPorts,
      this._statusFile,
    ]);
  }

  private _activityButton(
    doc: Document,
    label: string,
    title: string,
    onClick: () => void,
  ): HTMLElement {
    return el(doc, "button", {
      className: "npde-activity-button",
      textContent: label,
      title,
      onClick,
    });
  }

  /* ---- helpers ---- */

  private _flag(name: string): boolean {
    return isFlagEnabled(this._flags, name);
  }

  private _applyLayout(): void {
    if (!this._root) return;
    this._root.classList.toggle("npde-hide-sidebar", !this._sidebarVisible);
    this._root.classList.toggle("npde-hide-panel", !this._panelVisible);
    this._root.classList.toggle("npde-hide-preview", !this._previewVisible);
    this._root.classList.toggle("npde-show-preview", this._previewVisible);
  }

  private _showPanel(view: PanelView): void {
    for (const [name, wrap] of this._panelViews) {
      wrap.hidden = name !== view;
      this._panelButtons.get(name)?.classList.toggle("npde-active", name === view);
    }
    if (view === "terminal") this.terminal.fit();
  }

  private _appendOutput(text: string, kind: "out" | "err" | "cmd" | "info"): void {
    if (!this._outputLog) return;
    const doc = this._outputLog.ownerDocument;
    this._outputLog.append(
      el(doc, "span", { className: `npde-console-${kind}`, textContent: text }),
    );
    this._outputLog.scrollTop = this._outputLog.scrollHeight;
  }

  private _syncPorts(): void {
    if (!this._statusPorts) return;
    const servers = this.previews.servers();
    this._statusPorts.textContent = servers.length
      ? `ports: ${servers.map((server) => server.port).join(", ")}`
      : "";
  }

  private _schedulePersist(): void {
    if (!this._store || !this._opts.host.snapshot) return;
    if (this._persistTimer) clearTimeout(this._persistTimer);
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null;
      try {
        this._store!.save(
          this._opts.host as { snapshot: NonNullable<IdeHost["snapshot"]> },
        );
      } catch (err) {
        console.warn("[NodepodIde] workspace persist failed:", err);
      }
    }, 1000);
  }
}
