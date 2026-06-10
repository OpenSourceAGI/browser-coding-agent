// Nodepod IDE — an OpenVSCode-inspired web IDE built entirely on the
// Nodepod in-browser runtime (docs/plan.md). The data layer
// (NodepodFileSystem / ProcessRunner / PreviewManager) wraps a booted
// Nodepod; the components (FileExplorer / Editor / TerminalPane /
// PreviewPane) and the NodepodIde shell render on top of it.

export type { IdeHost, IdeFsApi, IdeProcess, IdeTerminal } from "./host";

export {
  NodepodFileSystem,
  normalizePath,
  sortTreeNodes,
  DEFAULT_TREE_EXCLUDES,
} from "./nodepod-file-system";
export type {
  FileTreeNode,
  FileChangeEvent,
  FileChangeKind,
  ReadTreeOptions,
} from "./nodepod-file-system";

export { ProcessRunner } from "./process-runner";
export type {
  SpawnHost,
  RunOptions,
  RunResult,
  RunningProcess,
} from "./process-runner";

export { PreviewManager } from "./preview-manager";
export type {
  PreviewHost,
  PreviewTarget,
  PreviewServer,
  PreviewEvent,
  PreviewManagerOptions,
} from "./preview-manager";

export {
  buildBootOptions,
  WorkspaceStore,
  WORKSPACE_STORE_KEY,
} from "./workspace";
export type {
  IdeWorkspaceConfig,
  StorageLike,
  SnapshotHost,
} from "./workspace";

export {
  DEFAULT_IDE_FLAGS,
  FLAGS_QUERY_PARAM,
  FLAGS_STORAGE_KEY,
  parseFlagOverrides,
  flagsFromStorage,
  resolveFlags,
  isFlagEnabled,
} from "./feature-flags";
export type { FlagMap } from "./feature-flags";

export {
  POLYFILLED_MODULES,
  STUB_MODULES,
  getModuleManifest,
  getModuleSupport,
} from "./polyfill-manifest";
export type { ModuleSupport, ModuleSupportStatus } from "./polyfill-manifest";

export {
  highlightToHtml,
  languageFromPath,
  escapeHtml,
} from "./highlight";
export type { HighlightLanguage } from "./highlight";

export { FileExplorer } from "./components/file-explorer";
export type { FileExplorerOptions } from "./components/file-explorer";
export {
  Editor,
  nextActivePath,
  lineColumnAt,
  isTabDirty,
} from "./components/editor";
export type { EditorOptions, EditorTab } from "./components/editor";
export { TerminalPane } from "./components/terminal-pane";
export type { TerminalPaneOptions } from "./components/terminal-pane";
export { PreviewPane } from "./components/preview-pane";
export type { PreviewPaneOptions } from "./components/preview-pane";

export { NodepodIde } from "./app";
export type { NodepodIdeOptions } from "./app";

export { IDE_CSS, injectIdeStyles } from "./styles";
