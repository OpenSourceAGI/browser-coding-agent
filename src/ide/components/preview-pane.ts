// Preview component (plan step 4.2): an iframe routed by PreviewManager.
// Requires the Nodepod service worker at /__sw__.js — virtual servers are
// served through it on the page's own origin.

import { el } from "./dom";
import type { PreviewManager } from "../preview-manager";

export interface PreviewPaneOptions {
  previews: PreviewManager;
  /** Open-in-new-tab handler. Defaults to window.open. */
  openExternal?: (url: string) => void;
}

export class PreviewPane {
  private _opts: PreviewPaneOptions;
  private _iframe: HTMLIFrameElement | null = null;
  private _portSelect: HTMLSelectElement | null = null;
  private _placeholder: HTMLElement | null = null;
  private _addressEl: HTMLElement | null = null;
  private _unsubscribes: (() => void)[] = [];

  constructor(opts: PreviewPaneOptions) {
    this._opts = opts;
  }

  mount(container: HTMLElement): void {
    const doc = container.ownerDocument;
    container.classList.add("npde-preview");
    const previews = this._opts.previews;

    this._portSelect = el(doc, "select", {
      className: "npde-preview-ports",
      title: "Preview port",
    });
    this._portSelect.addEventListener("change", () => {
      const port = Number(this._portSelect!.value);
      if (port) previews.open(port);
    });

    this._addressEl = el(doc, "span", {
      className: "npde-preview-address",
      textContent: "no server running",
    });

    const toolbar = el(doc, "div", { className: "npde-preview-toolbar" }, [
      el(doc, "button", {
        className: "npde-icon-button",
        textContent: "↻",
        title: "Reload preview",
        onClick: () => void previews.refresh(),
      }),
      this._portSelect,
      this._addressEl,
      el(doc, "button", {
        className: "npde-icon-button",
        textContent: "⧉",
        title: "Open in new tab",
        onClick: () => {
          const port = previews.activePort;
          const url = port === null ? null : previews.urlFor(port);
          if (!url) return;
          const open =
            this._opts.openExternal ??
            ((target: string) => (globalThis as any).open?.(target, "_blank"));
          open(url);
        },
      }),
    ]);

    this._iframe = el(doc, "iframe", {
      className: "npde-preview-frame",
      title: "App preview",
      attrs: { allow: "cross-origin-isolated" },
    });
    this._placeholder = el(doc, "div", {
      className: "npde-preview-placeholder",
      textContent:
        "Waiting for a server… run a script that calls listen() and the preview loads automatically.",
    });

    container.append(toolbar, this._placeholder, this._iframe);

    previews.attach(this._iframe);
    this._unsubscribes.push(
      previews.on("server-ready", () => this._syncToolbar()),
      previews.on("server-closed", () => this._syncToolbar()),
      previews.on("navigate", ({ url }) => {
        if (this._placeholder) this._placeholder.style.display = "none";
        if (this._iframe) this._iframe.style.display = "";
        if (this._addressEl) this._addressEl.textContent = url;
        this._syncToolbar();
      }),
    );

    this._iframe.style.display = "none";
    this._syncToolbar();
  }

  dispose(): void {
    for (const unsubscribe of this._unsubscribes) unsubscribe();
    this._unsubscribes = [];
    this._opts.previews.detach();
    this._iframe = null;
    this._portSelect = null;
    this._placeholder = null;
    this._addressEl = null;
  }

  private _syncToolbar(): void {
    if (!this._portSelect) return;
    const doc = this._portSelect.ownerDocument;
    const previews = this._opts.previews;
    const servers = previews.servers();
    this._portSelect.textContent = "";
    for (const server of servers) {
      const option = doc.createElement("option");
      option.value = String(server.port);
      option.textContent = `:${server.port}`;
      if (server.port === previews.activePort) option.selected = true;
      this._portSelect.append(option);
    }
    this._portSelect.disabled = servers.length === 0;
    if (servers.length === 0) {
      if (this._placeholder) this._placeholder.style.display = "";
      if (this._iframe) this._iframe.style.display = "none";
      if (this._addressEl) this._addressEl.textContent = "no server running";
    }
  }
}
