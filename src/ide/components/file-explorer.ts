// FileExplorer component (plan step 1.1): renders the workspace tree from
// NodepodFileSystem and re-renders on its change events. All mutations
// (new file/folder, delete) flow back through the same layer.

import { el } from "./dom";
import type {
  FileTreeNode,
  NodepodFileSystem,
  ReadTreeOptions,
} from "../nodepod-file-system";

export interface FileExplorerOptions {
  fs: NodepodFileSystem;
  onOpenFile?: (path: string) => void;
  tree?: ReadTreeOptions;
  /** Used for "new file"/"new folder" name input. Defaults to window.prompt. */
  promptFn?: (message: string, defaultValue?: string) => string | null;
  /** Used for delete confirmation. Defaults to window.confirm. */
  confirmFn?: (message: string) => boolean;
}

const FILE_ICON = "·";
const DIR_CLOSED_ICON = "▸";
const DIR_OPEN_ICON = "▾";

export class FileExplorer {
  private _opts: FileExplorerOptions;
  private _container: HTMLElement | null = null;
  private _listEl: HTMLElement | null = null;
  private _expanded = new Set<string>(["/"]);
  private _selected: string | null = null;
  private _unsubscribe: (() => void) | null = null;
  private _refreshQueued = false;

  constructor(opts: FileExplorerOptions) {
    this._opts = opts;
  }

  mount(container: HTMLElement): void {
    this._container = container;
    const doc = container.ownerDocument;
    container.classList.add("npde-explorer");

    const header = el(doc, "div", { className: "npde-pane-header" }, [
      el(doc, "span", { className: "npde-pane-title", textContent: "Explorer" }),
      el(doc, "span", { className: "npde-pane-actions" }, [
        this._actionButton(doc, "＋", "New file", () => this._createEntry(false)),
        this._actionButton(doc, "🗀", "New folder", () => this._createEntry(true)),
        this._actionButton(doc, "🗑", "Delete selected", () => this._deleteSelected()),
        this._actionButton(doc, "↻", "Refresh", () => void this.refresh()),
      ]),
    ]);

    this._listEl = el(doc, "div", { className: "npde-explorer-list" });
    container.append(header, this._listEl);

    // Coalesce change bursts (npm install, process writes) into one refresh
    this._unsubscribe = this._opts.fs.onDidChange(() => this._queueRefresh());
    void this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this._listEl) return;
    const tree = await this._opts.fs.readTree("/", this._opts.tree);
    if (!this._listEl) return; // disposed while reading
    this._listEl.textContent = "";
    this._renderNodes(tree, this._listEl, 0);
  }

  get selectedPath(): string | null {
    return this._selected;
  }

  dispose(): void {
    this._unsubscribe?.();
    this._unsubscribe = null;
    this._listEl = null;
    this._container = null;
  }

  /* ---- rendering ---- */

  private _renderNodes(
    nodes: FileTreeNode[],
    parent: HTMLElement,
    depth: number,
  ): void {
    const doc = parent.ownerDocument;
    for (const node of nodes) {
      const isDir = node.kind === "directory";
      const isOpen = isDir && this._expanded.has(node.path);
      const row = el(doc, "div", {
        className:
          "npde-explorer-row" +
          (this._selected === node.path ? " npde-selected" : ""),
        title: node.path,
        attrs: { "data-path": node.path, "data-kind": node.kind },
      });
      row.style.paddingLeft = `${8 + depth * 14}px`;
      row.append(
        el(doc, "span", {
          className: isDir ? "npde-icon-dir" : "npde-icon-file",
          textContent: isDir
            ? isOpen
              ? DIR_OPEN_ICON
              : DIR_CLOSED_ICON
            : FILE_ICON,
        }),
        el(doc, "span", { className: "npde-explorer-name", textContent: node.name }),
      );
      row.addEventListener("click", () => {
        this._selected = node.path;
        if (isDir) {
          if (this._expanded.has(node.path)) this._expanded.delete(node.path);
          else this._expanded.add(node.path);
          void this.refresh();
        } else {
          void this.refresh();
          this._opts.onOpenFile?.(node.path);
        }
      });
      parent.append(row);
      if (isDir && isOpen && node.children) {
        this._renderNodes(node.children, parent, depth + 1);
      }
    }
  }

  private _actionButton(
    doc: Document,
    label: string,
    title: string,
    onClick: () => void,
  ): HTMLElement {
    return el(doc, "button", {
      className: "npde-icon-button",
      textContent: label,
      title,
      onClick,
    });
  }

  /* ---- actions ---- */

  private _prompt(message: string, defaultValue?: string): string | null {
    const fn =
      this._opts.promptFn ??
      ((m: string, d?: string) => (globalThis as any).prompt?.(m, d) ?? null);
    return fn(message, defaultValue);
  }

  private _confirm(message: string): boolean {
    const fn =
      this._opts.confirmFn ??
      ((m: string) => (globalThis as any).confirm?.(m) ?? false);
    return fn(message);
  }

  /** Directory new entries are created in: selected dir, or parent of selected file. */
  private _targetDir(): string {
    if (!this._selected) return "/";
    return this._expanded.has(this._selected)
      ? this._selected
      : this._opts.fs.parentOf(this._selected);
  }

  private _createEntry(directory: boolean): void {
    const base = this._targetDir();
    const name = this._prompt(
      directory ? "New folder name" : "New file name",
      directory ? "folder" : "untitled.js",
    );
    if (!name) return;
    const path = base === "/" ? `/${name}` : `${base}/${name}`;
    const action = directory
      ? this._opts.fs.mkdir(path, { recursive: true })
      : this._opts.fs.writeFile(path, "");
    action
      .then(() => {
        this._selected = path;
        if (!directory) this._opts.onOpenFile?.(path);
      })
      .catch((err) => console.error("[FileExplorer] create failed:", err));
  }

  private _deleteSelected(): void {
    const path = this._selected;
    if (!path) return;
    if (!this._confirm(`Delete ${path}?`)) return;
    this._selected = null;
    this._opts.fs
      .rm(path)
      .catch((err) => console.error("[FileExplorer] delete failed:", err));
  }

  private _queueRefresh(): void {
    if (this._refreshQueued) return;
    this._refreshQueued = true;
    setTimeout(() => {
      this._refreshQueued = false;
      void this.refresh();
    }, 50);
  }
}
