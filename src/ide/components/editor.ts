// Editor component (plan step 1.1): tabbed text editor whose only data
// path is NodepodFileSystem (plan step 2.2). Rendering is a textarea with
// a syntax-highlight overlay — the textarea owns input/selection, the
// overlay just paints colors underneath it.

import { el } from "./dom";
import { highlightToHtml, languageFromPath } from "../highlight";
import type { NodepodFileSystem } from "../nodepod-file-system";

export interface EditorOptions {
  fs: NodepodFileSystem;
  onSave?: (path: string) => void;
  onActiveChange?: (path: string | null) => void;
  onStatus?: (status: { path: string | null; line: number; column: number; dirty: boolean }) => void;
}

export interface EditorTab {
  path: string;
  content: string;
  savedContent: string;
}

export function isTabDirty(tab: EditorTab): boolean {
  return tab.content !== tab.savedContent;
}

/**
 * Which tab becomes active after closing `closing`? The neighbor to the
 * right, else the left, else none (VS Code behavior). Pure for tests.
 */
export function nextActivePath(
  paths: string[],
  closing: string,
  current: string | null,
): string | null {
  if (current !== closing) return current;
  const idx = paths.indexOf(closing);
  if (idx === -1) return current;
  const remaining = paths.filter((p) => p !== closing);
  if (remaining.length === 0) return null;
  return remaining[Math.min(idx, remaining.length - 1)];
}

export function lineColumnAt(text: string, offset: number): { line: number; column: number } {
  const upToCaret = text.slice(0, offset);
  const lines = upToCaret.split("\n");
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

export class Editor {
  private _opts: EditorOptions;
  private _tabs: EditorTab[] = [];
  private _active: string | null = null;

  private _container: HTMLElement | null = null;
  private _tabBar: HTMLElement | null = null;
  private _gutter: HTMLElement | null = null;
  private _overlay: HTMLElement | null = null;
  private _textarea: HTMLTextAreaElement | null = null;
  private _placeholder: HTMLElement | null = null;
  private _body: HTMLElement | null = null;
  private _unsubscribe: (() => void) | null = null;

  constructor(opts: EditorOptions) {
    this._opts = opts;
  }

  mount(container: HTMLElement): void {
    this._container = container;
    const doc = container.ownerDocument;
    container.classList.add("npde-editor");

    this._tabBar = el(doc, "div", { className: "npde-editor-tabs" });

    this._body = el(doc, "div", { className: "npde-editor-body" });
    this._gutter = el(doc, "div", { className: "npde-editor-gutter" });
    const surface = el(doc, "div", { className: "npde-editor-surface" });
    this._overlay = el(doc, "pre", { className: "npde-editor-highlight" });
    this._textarea = el(doc, "textarea", {
      className: "npde-editor-input",
      spellcheck: false,
      attrs: { autocapitalize: "off", autocomplete: "off", wrap: "off" },
    });
    this._placeholder = el(doc, "div", {
      className: "npde-editor-placeholder",
      textContent: "Open a file from the explorer to start editing",
    });
    surface.append(this._overlay, this._textarea);
    this._body.append(this._gutter, surface, this._placeholder);
    container.append(this._tabBar, this._body);

    this._textarea.addEventListener("input", () => this._onInput());
    this._textarea.addEventListener("scroll", () => this._syncScroll());
    this._textarea.addEventListener("keydown", (event) => this._onKeydown(event));
    const reportStatus = () => this._reportStatus();
    this._textarea.addEventListener("keyup", reportStatus);
    this._textarea.addEventListener("click", reportStatus);

    // Reload open files changed behind our back (spawned processes), but
    // never clobber unsaved edits.
    this._unsubscribe = this._opts.fs.onDidChange((event) => {
      if (event.kind === "delete") {
        if (this._tabs.some((tab) => tab.path === event.path)) {
          this.close(event.path, { force: true });
        }
        return;
      }
      if (event.path !== this._active) return;
      const tab = this._tab(this._active);
      if (!tab || isTabDirty(tab)) return;
      void this._reloadActive();
    });

    this._render();
  }

  /* ---- public API ---- */

  get activePath(): string | null {
    return this._active;
  }

  get openPaths(): string[] {
    return this._tabs.map((tab) => tab.path);
  }

  isDirty(path?: string): boolean {
    const target = path ?? this._active;
    const tab = this._tab(target);
    return tab ? isTabDirty(tab) : false;
  }

  async open(path: string): Promise<void> {
    let tab = this._tab(path);
    if (!tab) {
      const content = await this._opts.fs.readFile(path);
      tab = { path, content, savedContent: content };
      this._tabs.push(tab);
    }
    this._setActive(path);
  }

  async save(): Promise<void> {
    const tab = this._tab(this._active);
    if (!tab) return;
    await this._opts.fs.writeFile(tab.path, tab.content);
    tab.savedContent = tab.content;
    this._render();
    this._opts.onSave?.(tab.path);
  }

  async saveAll(): Promise<void> {
    for (const tab of this._tabs) {
      if (!isTabDirty(tab)) continue;
      await this._opts.fs.writeFile(tab.path, tab.content);
      tab.savedContent = tab.content;
    }
    this._render();
  }

  close(path: string, opts: { force?: boolean } = {}): void {
    const tab = this._tab(path);
    if (!tab) return;
    if (!opts.force && isTabDirty(tab)) {
      const ok = (globalThis as any).confirm?.(
        `${path} has unsaved changes. Close anyway?`,
      );
      if (!ok) return;
    }
    const next = nextActivePath(this.openPaths, path, this._active);
    this._tabs = this._tabs.filter((t) => t.path !== path);
    this._setActive(next);
  }

  dispose(): void {
    this._unsubscribe?.();
    this._unsubscribe = null;
    this._container = null;
    this._tabBar = null;
    this._textarea = null;
    this._overlay = null;
    this._gutter = null;
    this._placeholder = null;
    this._body = null;
  }

  /* ---- internals ---- */

  private _tab(path: string | null): EditorTab | undefined {
    return path ? this._tabs.find((tab) => tab.path === path) : undefined;
  }

  private _setActive(path: string | null): void {
    this._active = path;
    this._render();
    this._opts.onActiveChange?.(path);
    this._reportStatus();
    this._textarea?.focus();
  }

  private async _reloadActive(): Promise<void> {
    const tab = this._tab(this._active);
    if (!tab) return;
    const fresh = await this._opts.fs.readFile(tab.path);
    if (fresh === tab.content) return;
    tab.content = fresh;
    tab.savedContent = fresh;
    this._render();
  }

  private _onInput(): void {
    const tab = this._tab(this._active);
    if (!tab || !this._textarea) return;
    tab.content = this._textarea.value;
    this._paint(tab);
    this._renderTabs();
    this._reportStatus();
  }

  private _onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void this.save();
      return;
    }
    if (event.key === "Tab" && this._textarea) {
      event.preventDefault();
      const area = this._textarea;
      const { selectionStart, selectionEnd, value } = area;
      area.value = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
      area.selectionStart = area.selectionEnd = selectionStart + 2;
      this._onInput();
    }
  }

  private _syncScroll(): void {
    if (!this._textarea) return;
    if (this._overlay) {
      this._overlay.scrollTop = this._textarea.scrollTop;
      this._overlay.scrollLeft = this._textarea.scrollLeft;
    }
    if (this._gutter) this._gutter.scrollTop = this._textarea.scrollTop;
  }

  private _reportStatus(): void {
    if (!this._opts.onStatus) return;
    const tab = this._tab(this._active);
    if (!tab || !this._textarea) {
      this._opts.onStatus({ path: null, line: 1, column: 1, dirty: false });
      return;
    }
    const { line, column } = lineColumnAt(
      this._textarea.value,
      this._textarea.selectionStart ?? 0,
    );
    this._opts.onStatus({ path: tab.path, line, column, dirty: isTabDirty(tab) });
  }

  private _render(): void {
    this._renderTabs();
    const tab = this._tab(this._active);
    if (!this._textarea || !this._body) return;
    const empty = !tab;
    this._body.classList.toggle("npde-editor-empty", empty);
    if (this._placeholder) this._placeholder.style.display = empty ? "" : "none";
    this._textarea.style.visibility = empty ? "hidden" : "visible";
    if (tab) {
      if (this._textarea.value !== tab.content) {
        this._textarea.value = tab.content;
      }
      this._paint(tab);
    } else {
      this._textarea.value = "";
      if (this._overlay) this._overlay.textContent = "";
      if (this._gutter) this._gutter.textContent = "";
    }
  }

  private _renderTabs(): void {
    if (!this._tabBar) return;
    const doc = this._tabBar.ownerDocument;
    this._tabBar.textContent = "";
    for (const tab of this._tabs) {
      const name = tab.path.slice(tab.path.lastIndexOf("/") + 1);
      const tabEl = el(doc, "div", {
        className:
          "npde-tab" + (tab.path === this._active ? " npde-tab-active" : ""),
        title: tab.path,
      });
      tabEl.append(
        el(doc, "span", {
          className: "npde-tab-name",
          textContent: name + (isTabDirty(tab) ? " ●" : ""),
        }),
        el(doc, "button", {
          className: "npde-tab-close",
          textContent: "×",
          title: `Close ${name}`,
          onClick: (event) => {
            event.stopPropagation();
            this.close(tab.path);
          },
        }),
      );
      tabEl.addEventListener("click", () => this._setActive(tab.path));
      this._tabBar.append(tabEl);
    }
  }

  private _paint(tab: EditorTab): void {
    if (this._overlay) {
      // Trailing newline keeps overlay height in sync with the textarea
      this._overlay.innerHTML =
        highlightToHtml(tab.content, languageFromPath(tab.path)) + "\n";
    }
    if (this._gutter) {
      const lineCount = tab.content.split("\n").length;
      const doc = this._gutter.ownerDocument;
      this._gutter.textContent = "";
      for (let i = 1; i <= lineCount; i++) {
        this._gutter.append(
          el(doc, "div", { className: "npde-gutter-line", textContent: String(i) }),
        );
      }
    }
    this._syncScroll();
  }
}
