// IDE stylesheet, shipped as a string so the library needs no CSS build
// plumbing. injectIdeStyles() is idempotent per document.

export const IDE_STYLE_ATTR = "data-nodepod-ide-styles";

export const IDE_CSS = /* css */ `
.npde-root {
  --npde-bg: #1e1e1e;
  --npde-panel-bg: #181818;
  --npde-side-bg: #252526;
  --npde-activity-bg: #333333;
  --npde-accent: #007acc;
  --npde-border: #3c3c3c;
  --npde-fg: #cccccc;
  --npde-fg-dim: #8a8a8a;
  --npde-tab-bg: #2d2d2d;
  --npde-mono: "SF Mono", Monaco, Menlo, Consolas, "Liberation Mono", monospace;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: var(--npde-bg);
  color: var(--npde-fg);
  font-family: -apple-system, "Segoe UI", Ubuntu, Helvetica, Arial, sans-serif;
  font-size: 13px;
  overflow: hidden;
}
.npde-root *, .npde-root *::before, .npde-root *::after { box-sizing: border-box; }
.npde-root button { font: inherit; color: inherit; }

/* ---- title bar ---- */
.npde-titlebar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 35px;
  padding: 0 10px;
  background: var(--npde-activity-bg);
  border-bottom: 1px solid var(--npde-border);
  flex: none;
}
.npde-title { font-weight: 600; white-space: nowrap; }
.npde-title-dot { color: var(--npde-accent); }
.npde-titlebar-spacer { flex: 1; }
.npde-action {
  border: 1px solid var(--npde-border);
  background: #3c3c3c;
  border-radius: 3px;
  padding: 3px 10px;
  cursor: pointer;
  white-space: nowrap;
}
.npde-action:hover { background: #4a4a4a; }
.npde-action:disabled { opacity: 0.5; cursor: default; }
.npde-action-primary { background: var(--npde-accent); border-color: var(--npde-accent); color: #fff; }
.npde-action-primary:hover { background: #0e639c; }

/* ---- main row ---- */
.npde-main { display: flex; flex: 1; min-height: 0; position: relative; }

.npde-activitybar {
  width: 44px;
  flex: none;
  background: var(--npde-activity-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 6px;
  gap: 4px;
}
.npde-activity-button {
  width: 34px;
  height: 34px;
  border: none;
  background: transparent;
  color: var(--npde-fg-dim);
  font-size: 17px;
  cursor: pointer;
  border-left: 2px solid transparent;
  border-radius: 4px;
}
.npde-activity-button:hover { color: var(--npde-fg); }
.npde-activity-button.npde-active { color: #ffffff; background: #ffffff14; }

.npde-sidebar {
  width: 220px;
  flex: none;
  background: var(--npde-side-bg);
  border-right: 1px solid var(--npde-border);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.npde-root.npde-hide-sidebar .npde-sidebar { display: none; }

.npde-center { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.npde-editor-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; }

.npde-right {
  width: 36%;
  min-width: 260px;
  flex: none;
  border-left: 1px solid var(--npde-border);
  display: flex;
  flex-direction: column;
  background: var(--npde-panel-bg);
  min-height: 0;
}
.npde-root.npde-hide-preview .npde-right { display: none; }

/* ---- panes ---- */
.npde-pane-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--npde-fg-dim);
  flex: none;
}
.npde-pane-actions { display: flex; gap: 2px; }
.npde-icon-button {
  border: none;
  background: transparent;
  color: var(--npde-fg-dim);
  cursor: pointer;
  font-size: 13px;
  padding: 2px 5px;
  border-radius: 3px;
  line-height: 1;
}
.npde-icon-button:hover { color: var(--npde-fg); background: #ffffff14; }

/* ---- explorer ---- */
.npde-explorer { display: flex; flex-direction: column; min-height: 0; flex: 1; }
.npde-explorer-list { overflow: auto; flex: 1; padding-bottom: 12px; }
.npde-explorer-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
}
.npde-explorer-row:hover { background: #2a2d2e; }
.npde-explorer-row.npde-selected { background: #094771; color: #fff; }
.npde-icon-dir { color: var(--npde-fg-dim); width: 10px; flex: none; }
.npde-icon-file { color: #519aba; width: 10px; flex: none; text-align: center; }
.npde-explorer-name { overflow: hidden; text-overflow: ellipsis; }

/* ---- editor ---- */
.npde-editor { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.npde-editor-tabs {
  display: flex;
  background: var(--npde-side-bg);
  border-bottom: 1px solid var(--npde-border);
  overflow-x: auto;
  flex: none;
  min-height: 32px;
}
.npde-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px 6px 12px;
  background: var(--npde-tab-bg);
  border-right: 1px solid var(--npde-border);
  cursor: pointer;
  white-space: nowrap;
  color: var(--npde-fg-dim);
}
.npde-tab-active { background: var(--npde-bg); color: var(--npde-fg); border-top: 1px solid var(--npde-accent); }
.npde-tab-close { border: none; background: transparent; color: inherit; cursor: pointer; padding: 0 2px; border-radius: 3px; }
.npde-tab-close:hover { background: #ffffff22; }

.npde-editor-body { flex: 1; display: flex; min-height: 0; position: relative; }
.npde-editor-gutter {
  flex: none;
  width: 46px;
  overflow: hidden;
  text-align: right;
  padding: 8px 8px 8px 0;
  color: #6e7681;
  background: var(--npde-bg);
  font-family: var(--npde-mono);
  font-size: 13px;
  line-height: 1.5;
  user-select: none;
}
.npde-editor-surface { position: relative; flex: 1; min-width: 0; }
.npde-editor-highlight,
.npde-editor-input {
  position: absolute;
  inset: 0;
  margin: 0;
  border: none;
  padding: 8px 12px;
  font-family: var(--npde-mono);
  font-size: 13px;
  line-height: 1.5;
  white-space: pre;
  tab-size: 2;
  overflow: auto;
}
.npde-editor-highlight {
  pointer-events: none;
  color: #d4d4d4;
  background: transparent;
  overflow: hidden;
  z-index: 1;
}
.npde-editor-input {
  background: transparent;
  color: transparent;
  caret-color: #aeafad;
  outline: none;
  resize: none;
  z-index: 2;
}
.npde-editor-input::selection { background: #264f7899; }
.npde-editor-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--npde-fg-dim);
  padding: 24px;
  text-align: center;
  z-index: 3;
}
.npde-gutter-line { height: 1.5em; }

.tok-comment { color: #6a9955; }
.tok-string { color: #ce9178; }
.tok-number { color: #b5cea8; }
.tok-keyword { color: #569cd6; }
.tok-literal { color: #569cd6; }
.tok-property { color: #9cdcfe; }

/* ---- bottom panel (terminal / output) ---- */
.npde-panel {
  flex: none;
  height: 220px;
  border-top: 1px solid var(--npde-border);
  background: var(--npde-panel-bg);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.npde-root.npde-hide-panel .npde-panel { display: none; }
.npde-panel-tabs {
  display: flex;
  gap: 14px;
  padding: 5px 12px;
  border-bottom: 1px solid var(--npde-border);
  flex: none;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.npde-panel-tab { border: none; background: none; color: var(--npde-fg-dim); cursor: pointer; padding: 2px 0; }
.npde-panel-tab.npde-active { color: var(--npde-fg); border-bottom: 1px solid var(--npde-accent); }
.npde-panel-body { flex: 1; min-height: 0; position: relative; }
.npde-panel-view { position: absolute; inset: 0; display: flex; flex-direction: column; }
.npde-panel-view[hidden] { display: none; }

.npde-terminal { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 2px; }
.npde-console-log {
  flex: 1;
  margin: 0;
  overflow: auto;
  font-family: var(--npde-mono);
  font-size: 12px;
  line-height: 1.45;
  padding: 6px 10px;
  white-space: pre-wrap;
  word-break: break-word;
}
.npde-console-cmd { color: #dcdcaa; }
.npde-console-out { color: var(--npde-fg); }
.npde-console-err { color: #f48771; }
.npde-console-info { color: #8ac4e6; }
.npde-console-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  border-top: 1px solid var(--npde-border);
  padding: 4px 10px;
  flex: none;
}
.npde-console-prompt { color: #4ec9b0; font-family: var(--npde-mono); }
.npde-console-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--npde-fg);
  font-family: var(--npde-mono);
  font-size: 12px;
}

/* ---- preview ---- */
.npde-preview { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.npde-preview-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-bottom: 1px solid var(--npde-border);
  flex: none;
}
.npde-preview-ports {
  background: #3c3c3c;
  border: 1px solid var(--npde-border);
  color: var(--npde-fg);
  border-radius: 3px;
  font-size: 12px;
  padding: 1px 4px;
}
.npde-preview-address {
  flex: 1;
  color: var(--npde-fg-dim);
  font-family: var(--npde-mono);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.npde-preview-frame { flex: 1; border: none; background: #fff; width: 100%; }
.npde-preview-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--npde-fg-dim);
  padding: 24px;
  text-align: center;
}

/* ---- status bar ---- */
.npde-statusbar {
  height: 22px;
  flex: none;
  background: var(--npde-accent);
  color: #ffffff;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 10px;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
}
.npde-statusbar-spacer { flex: 1; }
.npde-status-item { overflow: hidden; text-overflow: ellipsis; }

/* ---- runtime info view ---- */
.npde-runtime { padding: 10px 14px; overflow: auto; flex: 1; font-size: 12px; }
.npde-runtime h3 { margin: 10px 0 6px; font-size: 12px; color: var(--npde-fg); }
.npde-runtime table { border-collapse: collapse; width: 100%; }
.npde-runtime td { padding: 2px 8px 2px 0; vertical-align: top; color: var(--npde-fg-dim); }
.npde-runtime td:first-child { color: var(--npde-fg); font-family: var(--npde-mono); white-space: nowrap; }
.npde-badge-full { color: #4ec9b0; }
.npde-badge-stub { color: #dcdcaa; }

/* ---- responsive (plan 6.2: usable at 375px) ---- */
@media (max-width: 900px) {
  .npde-right { display: none; }
  .npde-root.npde-show-preview .npde-right {
    display: flex;
    position: absolute;
    inset: 0 0 0 44px;
    width: auto;
    z-index: 20;
  }
}
@media (max-width: 640px) {
  .npde-sidebar {
    position: absolute;
    inset: 0 auto 0 44px;
    z-index: 10;
    width: min(240px, 80vw);
    box-shadow: 4px 0 12px #00000088;
  }
  .npde-root.npde-hide-sidebar .npde-sidebar { display: none; }
  .npde-titlebar { gap: 4px; padding: 0 6px; }
  .npde-action { padding: 3px 7px; font-size: 12px; }
  .npde-title { font-size: 12px; }
  .npde-statusbar { gap: 8px; font-size: 11px; }
  .npde-panel { height: 180px; }
}
`;

/** Add the IDE stylesheet to a document once. */
export function injectIdeStyles(doc: Document): void {
  if (doc.querySelector(`style[${IDE_STYLE_ATTR}]`)) return;
  const style = doc.createElement("style");
  style.setAttribute(IDE_STYLE_ATTR, "");
  style.textContent = IDE_CSS;
  doc.head.append(style);
}
