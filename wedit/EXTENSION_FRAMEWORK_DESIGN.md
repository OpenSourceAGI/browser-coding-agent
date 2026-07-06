# Wedit Extension Framework Design

## Overview
This document outlines the design for a TypeScript/Next.js-based extension framework for Wedit, inspired by Zed's Rust/WASM architecture but adapted for web environments.

## Architecture

### 1. Core Components

#### 1.1 Extension Manifest (`extension.toml` → `extension.json`)
- **Purpose**: Define extension metadata, capabilities, and provided features
- **Format**: JSON (easier for web/TypeScript)
- **Schema**:
```typescript
interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  schemaVersion: number;
  description?: string;
  repository?: string;
  authors: string[];
  
  // Extension code
  lib?: {
    kind: 'typescript' | 'javascript';
    entry: string; // e.g., "dist/index.js"
  };
  
  // Features provided
  themes?: string[];
  iconThemes?: string[];
  languages?: string[];
  grammars?: Record<string, GrammarEntry>;
  languageServers?: Record<string, LanguageServerEntry>;
  contextServers?: Record<string, ContextServerEntry>;
  slashCommands?: Record<string, SlashCommandEntry>;
  snippets?: string | string[];
  
  // Security
  capabilities?: ExtensionCapability[];
}
```

#### 1.2 Extension API
Inspired by Zed's extension API but adapted for TypeScript/web:

```typescript
// Core extension interface
interface Extension {
  // Lifecycle
  activate(context: ExtensionContext): Promise<void>;
  deactivate?(): Promise<void>;
  
  // Language Server Protocol
  languageServerCommand?(
    languageServerId: string,
    worktree: Worktree
  ): Promise<Command>;
  
  languageServerInitializationOptions?(
    languageServerId: string,
    worktree: Worktree
  ): Promise<object | null>;
  
  // Slash commands
  runSlashCommand?(
    command: SlashCommand,
    args: string[],
    worktree?: Worktree
  ): Promise<SlashCommandOutput>;
  
  // Context servers (MCP-like)
  contextServerCommand?(
    contextServerId: string,
    project: Project
  ): Promise<Command>;
}

// Extension context provided to extensions
interface ExtensionContext {
  extensionPath: string;
  storagePath: string;
  globalState: KeyValueStore;
  workspaceState: KeyValueStore;
  
  // APIs available to extensions
  http: HttpClient;
  process: ProcessApi;
  settings: SettingsApi;
  fs: FileSystemApi;
}
```

#### 1.3 Extension Capabilities (Permissions System)
```typescript
type ExtensionCapability =
  | { kind: 'process:exec'; command: string; args: string[] }
  | { kind: 'network:fetch'; domains: string[] }
  | { kind: 'fs:read'; paths: string[] }
  | { kind: 'fs:write'; paths: string[] }
  | { kind: 'settings:read'; keys: string[] }
  | { kind: 'settings:write'; keys: string[] };
```

### 2. Extension Runtime

#### 2.1 Isolation Strategy
**Zed uses WASM for isolation**. For Wedit (web-based), we have several options:

1. **Web Workers** (Recommended for Phase 1)
   - Good isolation
   - Native browser support
   - Can run CPU-intensive tasks without blocking UI
   - Limited but sufficient API surface

2. **IFrames with sandboxing** (Alternative)
   - Strong isolation
   - More complex communication
   - Good for UI extensions

3. **VM2 / isolated-vm** (Node.js environments)
   - For server-side extension execution
   - Better control but adds dependency

**Decision**: Start with Web Workers for client-side extensions, with option to add server-side execution later.

#### 2.2 Extension Loader
```typescript
class ExtensionLoader {
  private extensions = new Map<string, LoadedExtension>();
  private manifests = new Map<string, ExtensionManifest>();
  
  async loadExtension(extensionPath: string): Promise<LoadedExtension> {
    // 1. Read and validate manifest
    const manifest = await this.loadManifest(extensionPath);
    
    // 2. Validate capabilities
    await this.validateCapabilities(manifest);
    
    // 3. Create isolated runtime (Web Worker)
    const runtime = await this.createRuntime(manifest);
    
    // 4. Load extension code
    const extension = await this.instantiateExtension(
      manifest,
      runtime
    );
    
    // 5. Activate extension
    await extension.activate();
    
    return extension;
  }
  
  async unloadExtension(extensionId: string): Promise<void> {
    const ext = this.extensions.get(extensionId);
    if (ext) {
      await ext.deactivate();
      ext.runtime.terminate();
      this.extensions.delete(extensionId);
    }
  }
}
```

#### 2.3 Extension Host (Web Worker)
```typescript
// extension-host.worker.ts
// Runs in Web Worker - isolated from main thread

class ExtensionHost {
  private extension: Extension | null = null;
  private context: ExtensionContext | null = null;
  
  async initialize(config: ExtensionConfig) {
    // Create sandboxed context
    this.context = this.createContext(config);
    
    // Load extension module
    const ExtensionClass = await this.loadExtensionModule(
      config.entryPoint
    );
    
    this.extension = new ExtensionClass();
  }
  
  async activate() {
    if (this.extension && this.context) {
      await this.extension.activate(this.context);
    }
  }
  
  // RPC methods called from main thread
  async executeMethod(method: string, ...args: any[]) {
    if (!this.extension || !(method in this.extension)) {
      throw new Error(`Method ${method} not found`);
    }
    return await (this.extension as any)[method](...args);
  }
}
```

### 3. Communication Layer

#### 3.1 Extension RPC (Main Thread ↔ Worker)
```typescript
class ExtensionRPC {
  private worker: Worker;
  private pendingCalls = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }>();
  private callId = 0;
  
  async call<T>(method: string, ...args: any[]): Promise<T> {
    const id = this.callId++;
    
    return new Promise((resolve, reject) => {
      this.pendingCalls.set(id, { resolve, reject });
      
      this.worker.postMessage({
        type: 'call',
        id,
        method,
        args
      });
      
      setTimeout(() => {
        this.pendingCalls.delete(id);
        reject(new Error('RPC timeout'));
      }, 30000);
    });
  }
  
  private handleMessage(event: MessageEvent) {
    const { type, id, result, error } = event.data;
    
    if (type === 'result') {
      const pending = this.pendingCalls.get(id);
      if (pending) {
        if (error) {
          pending.reject(new Error(error));
        } else {
          pending.resolve(result);
        }
        this.pendingCalls.delete(id);
      }
    }
  }
}
```

### 4. Extension APIs

#### 4.1 HTTP Client API
```typescript
interface HttpClient {
  request(options: HttpRequestOptions): Promise<HttpResponse>;
  get(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
  post(url: string, body: any, options?: HttpRequestOptions): Promise<HttpResponse>;
}
```

#### 4.2 Process API (Limited in Web)
```typescript
interface ProcessApi {
  // Only allowed if capability granted
  spawn(command: string, args: string[]): Promise<ProcessResult>;
  
  // For Node.js/server-side extensions
  exec(command: string): Promise<ProcessResult>;
}
```

#### 4.3 Settings API
```typescript
interface SettingsApi {
  get<T>(key: string, defaultValue?: T): T;
  set(key: string, value: any): Promise<void>;
  has(key: string): boolean;
  delete(key: string): Promise<void>;
  watch(key: string, callback: (value: any) => void): Disposable;
}
```

#### 4.4 FileSystem API
```typescript
interface FileSystemApi {
  readFile(path: string): Promise<Uint8Array>;
  readTextFile(path: string): Promise<string>;
  writeFile(path: string, contents: Uint8Array): Promise<void>;
  writeTextFile(path: string, contents: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  readDir(path: string): Promise<DirEntry[]>;
  createDir(path: string): Promise<void>;
}
```

### 5. Extension Registry & Storage

#### 5.1 Extension Registry
```typescript
class ExtensionRegistry {
  private dbName = 'weditor-extensions';
  private db: IDBDatabase;
  
  async install(extensionPackage: Blob): Promise<ExtensionManifest> {
    // 1. Extract package (zip)
    // 2. Validate manifest
    // 3. Store in IndexedDB
    // 4. Return manifest
  }
  
  async uninstall(extensionId: string): Promise<void> {
    // Remove from storage
  }
  
  async list(): Promise<ExtensionManifest[]> {
    // List all installed extensions
  }
  
  async get(extensionId: string): Promise<ExtensionManifest | null> {
    // Get specific extension
  }
}
```

#### 5.2 Storage Backends
- **IndexedDB**: For extension code, assets, and persistent state
- **localStorage/sessionStorage**: For lightweight settings
- **File System Access API**: For direct file access (when granted)

### 6. UI Components

#### 6.1 Extension Marketplace UI
```typescript
// components/extensions/ExtensionMarketplace.tsx
export function ExtensionMarketplace() {
  // Browse, search, install extensions
}

// components/extensions/ExtensionManager.tsx
export function ExtensionManager() {
  // Manage installed extensions
  // Enable/disable
  // Configure
  // Update
  // Uninstall
}

// components/extensions/ExtensionDetails.tsx
export function ExtensionDetails({ extensionId }: Props) {
  // Show extension details
  // Permissions required
  // Installation status
}
```

## Implementation Phases

### Phase 1: Core Infrastructure (Current)
- [x] Design document
- [ ] Extension manifest schema and validation
- [ ] Extension loader and lifecycle
- [ ] Basic Web Worker runtime
- [ ] Simple RPC communication
- [ ] Extension registry (IndexedDB)

### Phase 2: Extension APIs
- [ ] HTTP Client API
- [ ] Settings API
- [ ] FileSystem API (with capabilities)
- [ ] Process API (limited)
- [ ] Storage API (key-value store)

### Phase 3: Features
- [ ] Language Server support
- [ ] Slash command system
- [ ] Theme extensions
- [ ] Grammar/syntax support
- [ ] Context servers (MCP)

### Phase 4: UI & UX
- [ ] Extension marketplace UI
- [ ] Extension manager UI
- [ ] Extension settings UI
- [ ] Extension permissions UI

### Phase 5: Ecosystem
- [ ] Extension development kit
- [ ] Extension templates
- [ ] Documentation
- [ ] Example extensions
- [ ] Extension publishing workflow

## Key Differences from Zed

| Aspect | Zed | Wedit |
|--------|-----|------|
| Runtime | WASM (wasmtime) | Web Workers / Service Workers |
| Language | Rust → WASM | TypeScript / JavaScript |
| IPC | WIT bindings | postMessage / RPC |
| Isolation | WASM sandbox | Web Worker isolation |
| Process execution | Native (with capabilities) | Limited (browser sandbox) |
| File access | Native FS | File System Access API / IndexedDB |
| Distribution | .wasm files | .weditor packages (zip) |

## Security Considerations

1. **Capability-based security**: Extensions must declare capabilities upfront
2. **Code review**: Community review for marketplace extensions
3. **Sandboxing**: Web Workers provide process-level isolation
4. **CSP**: Content Security Policy headers
5. **Limited API surface**: Only expose safe APIs to extensions
6. **Signed extensions**: Optional signature verification for trusted sources

## Next Steps

1. Implement core types and interfaces
2. Build extension loader with Web Worker runtime
3. Create RPC communication layer
4. Implement basic APIs (HTTP, Settings, Storage)
5. Build example extension
6. Create extension manager UI
