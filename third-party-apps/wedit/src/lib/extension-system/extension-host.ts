// Central extension host that loads, activates, and manages all extensions
/**
 * Extension host system for loading and managing Zed extensions
 */

import type * as monaco from "monaco-editor";
import type {
  ZedExtensionManifest,
  ExtensionContext,
  LoadedExtension,
  ExtensionModule,
  Disposable,
  EditorAPI,
  WorkspaceAPI,
  CommandsAPI,
  LanguagesAPI,
  ThemesAPI,
  SettingsAPI,
  ExtensionEditorAction,
  ExtensionDecorator,
  LanguageRegistration,
  DiagnosticsProvider,
  ExtensionTheme,
} from "./extension-types";

/**
 * Central extension host managing all loaded extensions
 */
export class ExtensionHost {
  private extensions = new Map<string, LoadedExtension>();
  private contexts = new Map<string, ExtensionContext>();
  private commandHandlers = new Map<string, (...args: any[]) => void | Promise<void>>();
  private activeEditorChangeCallbacks: Array<(editor: monaco.editor.IStandaloneCodeEditor | undefined) => void> = [];
  private fileOpenCallbacks: Array<(path: string) => void> = [];
  private fileSaveCallbacks: Array<(path: string) => void> = [];
  private fileCloseCallbacks: Array<(path: string) => void> = [];
  private settingsChangeCallbacks: Array<(key: string, value: any) => void> = [];

  // Store references
  private monacoRef?: typeof monaco;
  private workspaceStoreRef?: any;
  private settingsStoreRef?: any;
  private nodepodStoreRef?: any;

  constructor() {}

  /**
   * Initialize the extension host with required dependencies
   */
  initialize(deps: {
    monaco: typeof monaco;
    workspaceStore: any;
    settingsStore: any;
    nodepodStore: any;
  }) {
    this.monacoRef = deps.monaco;
    this.workspaceStoreRef = deps.workspaceStore;
    this.settingsStoreRef = deps.settingsStore;
    this.nodepodStoreRef = deps.nodepodStore;
  }

  /**
   * Load an extension from a manifest and optional entry point
   */
  async loadExtension(manifest: ZedExtensionManifest, module: ExtensionModule | undefined, path: string): Promise<void> {
    if (this.extensions.has(manifest.id)) {
      console.warn(`Extension ${manifest.id} is already loaded`);
      return;
    }

    const extension: LoadedExtension = {
      id: manifest.id,
      manifest,
      path,
      active: false,
      module,
    };

    this.extensions.set(manifest.id, extension);
    await this.activateExtension(manifest.id);
  }

  /**
   * Activate an extension
   */
  async activateExtension(extensionId: string): Promise<void> {
    const extension = this.extensions.get(extensionId);
    if (!extension) {
      throw new Error(`Extension ${extensionId} not found`);
    }

    if (extension.active) {
      console.warn(`Extension ${extensionId} is already active`);
      return;
    }

    const context = this.createExtensionContext(extension);
    this.contexts.set(extensionId, context);

    try {
      // If extension has a module with activate function, call it
      if (extension.module?.activate) {
        await extension.module.activate(context);
      }

      // Load themes for theme extensions (regardless of whether they have JS)
      const isThemeExtension =
        extensionId.toLowerCase().includes("theme") ||
        extension.manifest.name?.toLowerCase().includes("theme") ||
        extensionId.toLowerCase().includes("icons");

      if (isThemeExtension && extension.manifest.repository) {
        // Dynamically load themes from the extension
        console.log(`Loading themes for extension: ${extensionId}`);
        try {
          const { loadExtensionThemes } = await import("@/lib/theme-management/theme-converter");
          const { registerExtensionThemes } = await import("@/lib/theme-management/theme-registry");

          const themes = await loadExtensionThemes(extension.manifest.repository);
          if (themes.length > 0) {
            registerExtensionThemes(themes);
            console.log(`✓ Registered ${themes.length} theme(s) from ${extensionId}:`, themes.map(t => t.name).join(", "));
          } else {
            console.log(`No themes found in ${extensionId}`);
          }
        } catch (e) {
          console.error(`Failed to load themes from ${extensionId}:`, e);
        }
      }

      extension.active = true;
      console.log(`Activated extension: ${extensionId}`);
    } catch (error) {
      console.error(`Failed to activate extension ${extensionId}:`, error);
      throw error;
    }
  }

  /**
   * Deactivate an extension
   */
  async deactivateExtension(extensionId: string): Promise<void> {
    const extension = this.extensions.get(extensionId);
    const context = this.contexts.get(extensionId);

    if (!extension || !context) {
      return;
    }

    if (!extension.active) {
      return;
    }

    try {
      // Dispose all subscriptions
      context.subscriptions.forEach(sub => sub.dispose());
      context.subscriptions = [];

      // Call deactivate if defined
      if (extension.module?.deactivate) {
        await extension.module.deactivate();
      }

      extension.active = false;
      this.contexts.delete(extensionId);
      console.log(`Deactivated extension: ${extensionId}`);
    } catch (error) {
      console.error(`Failed to deactivate extension ${extensionId}:`, error);
    }
  }

  /**
   * Create extension context with all APIs
   */
  private createExtensionContext(extension: LoadedExtension): ExtensionContext {
    const subscriptions: Disposable[] = [];

    const context: ExtensionContext = {
      extension,
      subscriptions,
      editor: this.createEditorAPI(subscriptions),
      workspace: this.createWorkspaceAPI(subscriptions),
      commands: this.createCommandsAPI(subscriptions),
      languages: this.createLanguagesAPI(subscriptions),
      themes: this.createThemesAPI(subscriptions),
      settings: this.createSettingsAPI(subscriptions),
    };

    return context;
  }

  /**
   * Editor API implementation
   */
  private createEditorAPI(subscriptions: Disposable[]): EditorAPI {
    return {
      getActiveEditor: () => {
        // Get active editor from workspace store
        return (window as any).__activeMonacoEditor;
      },

      onDidChangeActiveEditor: (callback) => {
        this.activeEditorChangeCallbacks.push(callback);
        return {
          dispose: () => {
            const idx = this.activeEditorChangeCallbacks.indexOf(callback);
            if (idx >= 0) this.activeEditorChangeCallbacks.splice(idx, 1);
          },
        };
      },

      registerAction: (action: ExtensionEditorAction) => {
        const editor = this.getMonaco();
        if (!editor) return { dispose: () => {} };

        // Store action for registration on editor mount
        const actionId = action.id;
        (window as any).__extensionActions = (window as any).__extensionActions || [];
        (window as any).__extensionActions.push(action);

        return {
          dispose: () => {
            const actions = (window as any).__extensionActions || [];
            const idx = actions.findIndex((a: any) => a.id === actionId);
            if (idx >= 0) actions.splice(idx, 1);
          },
        };
      },

      registerDecorator: (decorator: ExtensionDecorator) => {
        // Store decorator for application
        (window as any).__extensionDecorators = (window as any).__extensionDecorators || [];
        (window as any).__extensionDecorators.push(decorator);

        return {
          dispose: () => {
            const decorators = (window as any).__extensionDecorators || [];
            const idx = decorators.findIndex((d: any) => d.id === decorator.id);
            if (idx >= 0) decorators.splice(idx, 1);
          },
        };
      },
    };
  }

  /**
   * Workspace API implementation
   */
  private createWorkspaceAPI(subscriptions: Disposable[]): WorkspaceAPI {
    return {
      getOpenFiles: () => {
        const store = this.workspaceStoreRef?.getState?.();
        return Object.keys(store?.openFiles || {});
      },

      getFileContent: async (path: string) => {
        const store = this.workspaceStoreRef?.getState?.();
        const file = store?.openFiles?.[path];
        if (file) return file.content;

        // Read from nodepod
        try {
          const nodepod = this.nodepodStoreRef?.getState?.().nodepod;
          if (nodepod) {
            return await nodepod.fs.readFile(path, "utf-8");
          }
        } catch (e) {
          console.error(`Failed to read file ${path}:`, e);
        }
        return undefined;
      },

      saveFile: async (path: string, content: string) => {
        const nodepod = this.nodepodStoreRef?.getState?.().nodepod;
        if (nodepod) {
          await nodepod.fs.writeFile(path, content);

          // Update workspace store
          const store = this.workspaceStoreRef?.getState?.();
          if (store?.openFiles?.[path]) {
            this.workspaceStoreRef.setState((s: any) => ({
              openFiles: {
                ...s.openFiles,
                [path]: { ...s.openFiles[path], content, modified: false },
              },
            }));
          }
        }
      },

      onDidOpenFile: (callback) => {
        this.fileOpenCallbacks.push(callback);
        return {
          dispose: () => {
            const idx = this.fileOpenCallbacks.indexOf(callback);
            if (idx >= 0) this.fileOpenCallbacks.splice(idx, 1);
          },
        };
      },

      onDidSaveFile: (callback) => {
        this.fileSaveCallbacks.push(callback);
        return {
          dispose: () => {
            const idx = this.fileSaveCallbacks.indexOf(callback);
            if (idx >= 0) this.fileSaveCallbacks.splice(idx, 1);
          },
        };
      },

      onDidCloseFile: (callback) => {
        this.fileCloseCallbacks.push(callback);
        return {
          dispose: () => {
            const idx = this.fileCloseCallbacks.indexOf(callback);
            if (idx >= 0) this.fileCloseCallbacks.splice(idx, 1);
          },
        };
      },
    };
  }

  /**
   * Commands API implementation
   */
  private createCommandsAPI(subscriptions: Disposable[]): CommandsAPI {
    return {
      registerCommand: (id: string, callback: (...args: any[]) => void | Promise<void>) => {
        if (this.commandHandlers.has(id)) {
          console.warn(`Command ${id} is already registered`);
        }
        this.commandHandlers.set(id, callback);

        return {
          dispose: () => {
            this.commandHandlers.delete(id);
          },
        };
      },

      executeCommand: async (id: string, ...args: any[]) => {
        const handler = this.commandHandlers.get(id);
        if (handler) {
          await handler(...args);
        } else {
          console.warn(`Command ${id} not found`);
        }
      },
    };
  }

  /**
   * Languages API implementation
   */
  private createLanguagesAPI(subscriptions: Disposable[]): LanguagesAPI {
    return {
      registerLanguage: (config: LanguageRegistration) => {
        const monaco = this.getMonaco();
        if (!monaco) return { dispose: () => {} };

        monaco.languages.register({
          id: config.id,
          extensions: config.extensions,
          aliases: config.aliases,
        });

        if (config.configuration) {
          monaco.languages.setLanguageConfiguration(config.id, config.configuration);
        }

        if (config.monarchTokensProvider) {
          monaco.languages.setMonarchTokensProvider(config.id, config.monarchTokensProvider);
        }

        return {
          dispose: () => {
            // Monaco doesn't support unregistering languages
            console.warn(`Cannot unregister language ${config.id} - Monaco limitation`);
          },
        };
      },

      registerCompletionProvider: (language: string, provider: monaco.languages.CompletionItemProvider) => {
        const monaco = this.getMonaco();
        if (!monaco) return { dispose: () => {} };

        const disposable = monaco.languages.registerCompletionItemProvider(language, provider);
        return disposable;
      },

      registerHoverProvider: (language: string, provider: monaco.languages.HoverProvider) => {
        const monaco = this.getMonaco();
        if (!monaco) return { dispose: () => {} };

        const disposable = monaco.languages.registerHoverProvider(language, provider);
        return disposable;
      },

      registerDefinitionProvider: (language: string, provider: monaco.languages.DefinitionProvider) => {
        const monaco = this.getMonaco();
        if (!monaco) return { dispose: () => {} };

        const disposable = monaco.languages.registerDefinitionProvider(language, provider);
        return disposable;
      },

      registerDiagnosticsProvider: (language: string, provider: DiagnosticsProvider) => {
        // Store diagnostics provider for periodic application
        (window as any).__extensionDiagnosticsProviders = (window as any).__extensionDiagnosticsProviders || {};
        (window as any).__extensionDiagnosticsProviders[language] = provider;

        return {
          dispose: () => {
            delete (window as any).__extensionDiagnosticsProviders?.[language];
          },
        };
      },
    };
  }

  /**
   * Themes API implementation
   */
  private createThemesAPI(subscriptions: Disposable[]): ThemesAPI {
    return {
      registerTheme: (theme: ExtensionTheme) => {
        const monaco = this.getMonaco();
        if (!monaco) return { dispose: () => {} };

        monaco.editor.defineTheme(theme.id, {
          base: theme.uiTheme,
          inherit: true,
          rules: theme.tokenColors || [],
          colors: theme.colors,
        });

        // Add to themes list
        (window as any).__extensionThemes = (window as any).__extensionThemes || [];
        (window as any).__extensionThemes.push(theme);

        return {
          dispose: () => {
            const themes = (window as any).__extensionThemes || [];
            const idx = themes.findIndex((t: any) => t.id === theme.id);
            if (idx >= 0) themes.splice(idx, 1);
          },
        };
      },

      getActiveTheme: () => {
        return this.settingsStoreRef?.getState?.().theme || "onedark-pro";
      },

      setTheme: (themeId: string) => {
        this.settingsStoreRef?.setState?.({ theme: themeId });
      },
    };
  }

  /**
   * Settings API implementation
   */
  private createSettingsAPI(subscriptions: Disposable[]): SettingsAPI {
    return {
      get: <T = any>(key: string): T | undefined => {
        const settings = this.settingsStoreRef?.getState?.();
        return settings?.[key] as T;
      },

      set: async (key: string, value: any) => {
        this.settingsStoreRef?.setState?.({ [key]: value });
      },

      onDidChange: (callback: (key: string, value: any) => void) => {
        this.settingsChangeCallbacks.push(callback);
        return {
          dispose: () => {
            const idx = this.settingsChangeCallbacks.indexOf(callback);
            if (idx >= 0) this.settingsChangeCallbacks.splice(idx, 1);
          },
        };
      },
    };
  }

  /**
   * Get monaco reference
   */
  private getMonaco() {
    return this.monacoRef;
  }

  /**
   * Event dispatchers (to be called from app code)
   */
  notifyActiveEditorChanged(editor: monaco.editor.IStandaloneCodeEditor | undefined) {
    this.activeEditorChangeCallbacks.forEach(cb => cb(editor));
  }

  notifyFileOpened(path: string) {
    this.fileOpenCallbacks.forEach(cb => cb(path));
  }

  notifyFileSaved(path: string) {
    this.fileSaveCallbacks.forEach(cb => cb(path));
  }

  notifyFileClosed(path: string) {
    this.fileCloseCallbacks.forEach(cb => cb(path));
  }

  notifySettingChanged(key: string, value: any) {
    this.settingsChangeCallbacks.forEach(cb => cb(key, value));
  }

  /**
   * Get all loaded extensions
   */
  getExtensions(): LoadedExtension[] {
    return Array.from(this.extensions.values());
  }

  /**
   * Get extension by ID
   */
  getExtension(id: string): LoadedExtension | undefined {
    return this.extensions.get(id);
  }

  /**
   * Execute a command
   */
  async executeCommand(id: string, ...args: any[]): Promise<void> {
    const handler = this.commandHandlers.get(id);
    if (handler) {
      await handler(...args);
    } else {
      console.warn(`Command ${id} not found`);
    }
  }
}

// Global extension host instance
export const extensionHost = new ExtensionHost();
