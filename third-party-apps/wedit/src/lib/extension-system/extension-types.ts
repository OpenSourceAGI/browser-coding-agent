// Type definitions for the Zed extension manifest and extension API
/**
 * Type definitions for Zed extension integration in Wedit
 */

import type * as monaco from "monaco-editor";

// --- Zed Extension Manifest (extension.toml format) ---

export interface ZedExtensionManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  authors?: string[];
  repository?: string;

  // Language definitions
  languages?: Record<string, ZedLanguageConfig>;

  // Grammar configurations
  grammars?: Record<string, ZedGrammarConfig>;

  // Themes
  themes?: Record<string, ZedThemeConfig>;

  // Commands
  commands?: Record<string, ZedCommandConfig>;

  // Settings schema
  settings?: Record<string, ZedSettingConfig>;

  // Language servers
  language_servers?: Record<string, ZedLanguageServerConfig> | Record<string, any>;

  // Snippets
  snippets?: Record<string, string>;
}

export interface ZedLanguageConfig {
  name: string;
  grammar: string; // Reference to grammar key
  icon?: string;
  file_extensions?: string[];
  line_comment?: string;
  block_comment?: [string, string];
  brackets?: Array<[string, string]>;
  auto_closing_pairs?: Array<[string, string]>;
  word_pattern?: string;
}

export interface ZedGrammarConfig {
  repository?: string;
  commit?: string;
  path?: string;

  // Tree-sitter grammar (wasm)
  tree_sitter?: {
    url?: string;
    path?: string;
  };

  // TextMate grammar (JSON/PLIST)
  textmate?: {
    url?: string;
    path?: string;
  };

  // Monarch tokenizer (for Monaco)
  monarch?: {
    tokenizer: any;
    languageConfig?: any;
  };
}

export interface ZedThemeConfig {
  name: string;
  appearance: "light" | "dark";
  style: ZedThemeStyle;
}

export interface ZedThemeStyle {
  background?: string;
  foreground?: string;
  cursor?: string;
  selection?: string;

  // Syntax colors
  comment?: string;
  string?: string;
  number?: string;
  keyword?: string;
  function?: string;
  variable?: string;
  type?: string;
  operator?: string;

  // UI colors
  panel?: {
    background?: string;
    border?: string;
  };
  editor?: {
    background?: string;
    gutter?: string;
    line_number?: string;
  };
  terminal?: {
    background?: string;
    foreground?: string;
  };
}

export interface ZedCommandConfig {
  label: string;
  description?: string;
  keybinding?: string;
  context?: string;
  when?: string;
}

export interface ZedSettingConfig {
  type: "boolean" | "string" | "number" | "enum";
  default?: any;
  description?: string;
  enum_values?: string[];
}

export interface ZedLanguageServerConfig {
  name: string;
  language: string;

  // WASM language server
  wasm?: {
    url: string;
  };

  // Remote language server
  remote?: {
    url: string;
  };

  // Initialization options
  initialization_options?: Record<string, any>;
}

// --- Wedit Extension API ---

export interface ExtensionContext {
  extension: LoadedExtension;
  subscriptions: Disposable[];

  // Editor API
  editor: EditorAPI;

  // Workspace API
  workspace: WorkspaceAPI;

  // Commands API
  commands: CommandsAPI;

  // Language API
  languages: LanguagesAPI;

  // Themes API
  themes: ThemesAPI;

  // Settings API
  settings: SettingsAPI;
}

export interface EditorAPI {
  getActiveEditor(): monaco.editor.IStandaloneCodeEditor | undefined;
  onDidChangeActiveEditor(callback: (editor: monaco.editor.IStandaloneCodeEditor | undefined) => void): Disposable;
  registerAction(action: ExtensionEditorAction): Disposable;
  registerDecorator(decorator: ExtensionDecorator): Disposable;
}

export interface WorkspaceAPI {
  getOpenFiles(): string[];
  getFileContent(path: string): Promise<string | undefined>;
  saveFile(path: string, content: string): Promise<void>;
  onDidOpenFile(callback: (path: string) => void): Disposable;
  onDidSaveFile(callback: (path: string) => void): Disposable;
  onDidCloseFile(callback: (path: string) => void): Disposable;
}

export interface CommandsAPI {
  registerCommand(id: string, callback: (...args: any[]) => void | Promise<void>): Disposable;
  executeCommand(id: string, ...args: any[]): Promise<void>;
}

export interface LanguagesAPI {
  registerLanguage(config: LanguageRegistration): Disposable;
  registerCompletionProvider(language: string, provider: monaco.languages.CompletionItemProvider): Disposable;
  registerHoverProvider(language: string, provider: monaco.languages.HoverProvider): Disposable;
  registerDefinitionProvider(language: string, provider: monaco.languages.DefinitionProvider): Disposable;
  registerDiagnosticsProvider(language: string, provider: DiagnosticsProvider): Disposable;
}

export interface ThemesAPI {
  registerTheme(theme: ExtensionTheme): Disposable;
  getActiveTheme(): string;
  setTheme(themeId: string): void;
}

export interface SettingsAPI {
  get<T = any>(key: string): T | undefined;
  set(key: string, value: any): Promise<void>;
  onDidChange(callback: (key: string, value: any) => void): Disposable;
}

// --- Extension Types ---

export interface LoadedExtension {
  id: string;
  manifest: ZedExtensionManifest;
  path: string;
  active: boolean;
  module?: ExtensionModule;
}

export interface ExtensionModule {
  activate(context: ExtensionContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

export interface ExtensionEditorAction {
  id: string;
  label: string;
  keybindings?: number[];
  contextMenuGroupId?: string;
  contextMenuOrder?: number;
  run: (editor: monaco.editor.IStandaloneCodeEditor) => void | Promise<void>;
}

export interface ExtensionDecorator {
  id: string;
  provide: (editor: monaco.editor.IStandaloneCodeEditor) => monaco.editor.IModelDecoration[];
}

export interface ExtensionTheme {
  id: string;
  label: string;
  uiTheme: "vs" | "vs-dark" | "hc-black";
  colors: Record<string, string>;
  tokenColors?: any[];
}

export interface LanguageRegistration {
  id: string;
  extensions: string[];
  aliases?: string[];
  configuration?: monaco.languages.LanguageConfiguration;
  monarchTokensProvider?: monaco.languages.IMonarchLanguage;
}

export interface DiagnosticsProvider {
  provideDiagnostics(model: monaco.editor.ITextModel): monaco.editor.IMarkerData[] | Promise<monaco.editor.IMarkerData[]>;
}

export interface Disposable {
  dispose(): void;
}

// --- Extension Store State ---

export interface ExtensionState {
  extensions: LoadedExtension[];
  activeExtensions: string[];
  extensionPaths: string[];
}
