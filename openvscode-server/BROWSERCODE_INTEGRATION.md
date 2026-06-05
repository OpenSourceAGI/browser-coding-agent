# BrowserCode Integration for OpenVSCode

This document describes the integration of BrowserCode runtime with OpenVSCode Server.

## Overview

The BrowserCode integration allows OpenVSCode to run natively in the browser using BrowserCode's browser-native agent runtime, replacing the traditional remote server architecture with browser-native execution primitives.

## Architecture

### Core Components

1. **Platform Services** (`src/vs/platform/browsercode/`)
   - `browsercode.ts` - Core interfaces and types
   - `browsercodeService.ts` - Service interface and DI registration
   - `browser/browsercodeService.ts` - Browser implementation
   - `browser/browsercodeTransportService.ts` - Transport layer for RPC

2. **Server Layer** (`src/vs/server/browsercode/`)
   - `server.main.ts` - Main server entry point
   - `managementServer.ts` - Management connection (filesystem, terminals, RPC)
   - `extensionHostBroker.ts` - Extension host lifecycle management
   - `fileSystemBridge.ts` - Filesystem operations bridge
   - `terminalBridge.ts` - PTY/terminal emulation
   - `cliBridge.ts` - CLI commands handler
   - `resourceServer.ts` - Static resources and webview hosting

3. **Workbench Services** (`src/vs/workbench/services/browsercode/`)
   - `browsercodeWorkbenchEnvironmentService.ts` - Environment configuration
   - `browsercodeRemoteAgentService.ts` - Remote agent implementation

4. **Composition Roots**
   - `workbench.web.browsercode.ts` - Workbench initialization
   - `server.main.ts` - Server initialization

## Integration Points

### Filesystem

BrowserCode's filesystem provider is exposed through the `IBrowserCodeFileSystemProvider` interface:

```typescript
interface IBrowserCodeFileSystemProvider {
  stat(uri: URI): Promise<FileStat>;
  readdir(uri: URI): Promise<[string, number][]>;
  readFile(uri: URI): Promise<Uint8Array>;
  writeFile(uri: URI, content: Uint8Array, options): Promise<void>;
  delete(uri: URI, options): Promise<void>;
  rename(from: URI, to: URI, options): Promise<void>;
  mkdir(uri: URI): Promise<void>;
  watch(uri: URI): IDisposable;
  readonly onDidChange: Event<URI[]>;
}
```

### Terminals

Terminal processes are created through the `BrowserCodeTerminalBridge`:

```typescript
const terminal = terminalBridge.createTerminal({
  command: '/bin/bash',
  args: [],
  cwd: '/workspace',
  env: { TERM: 'xterm-256color' },
  cols: 80,
  rows: 24
});

terminal.onProcessData(data => console.log(data));
terminal.onProcessExit(code => console.log('Exit:', code));
await terminal.start();
```

### Extensions

Extension hosts are managed by `BrowserCodeExtensionHostBroker`:

- **Browser extensions**: Run in WebWorker
- **Node/Remote extensions**: Run in BrowserCode runtime (if supported)

Capability detection determines which extension types are supported.

### Transport

The transport layer uses BrowserCode channels for RPC communication:

- Request/response messaging
- Streaming channels
- Binary payload support
- Reconnection semantics

## Runtime Requirements

BrowserCode runtime must be exposed on `window.browsercode.runtime`:

```typescript
interface IBrowserCodeRuntime {
  readonly capabilities: BrowserCodeCapability;
  readonly session: IBrowserCodeSession;
  
  createProcess(options: IBrowserCodeProcessOptions): Promise<IBrowserCodeProcess>;
  getFileSystemProvider(): IBrowserCodeFileSystemProvider;
  createChannel(name: string): IBrowserCodeChannel;
  executeBrowserCode(code: string): Promise<any>;
}
```

### Capabilities

```typescript
enum BrowserCodeCapability {
  Terminal = 1 << 0,         // Terminal/PTY support
  FileSystem = 1 << 1,       // Filesystem operations
  Process = 1 << 2,          // Process execution
  BrowserExecution = 1 << 3, // Browser script execution
  NodeExtensions = 1 << 4,   // Node.js extensions
  BrowserExtensions = 1 << 5 // Browser extensions
}
```

## Usage

### Basic Setup

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>BrowserCode VSCode</title>
</head>
<body>
  <div id="workbench"></div>
  
  <script src="browsercode-runtime.js"></script>
  <script src="vs/workbench/workbench.web.browsercode.js"></script>
  <script>
    const runtime = window.browsercode.runtime;
    
    window.createBrowserCodeWorkbench(
      document.getElementById('workbench'),
      {
        workspaceUri: { scheme: 'file', path: '/workspace' },
        productConfiguration: {
          nameShort: 'BrowserCode',
          nameLong: 'BrowserCode VSCode',
        }
      }
    );
  </script>
</body>
</html>
```

### Server-Side Initialization

```typescript
import { startBrowserCodeServer } from 'vs/server/browsercode/server.main';

const runtime = window.browsercode.runtime;
const server = await startBrowserCodeServer(runtime, {
  workspaceUri: URI.file('/workspace')
});
```

## Milestones

### Milestone 1: Basic Workbench ✓
- [x] Platform service interfaces
- [x] Transport layer
- [x] Filesystem bridge
- [x] Management server
- [x] Workbench boots and opens workspace
- [x] File read/write operations

### Milestone 2: Terminals
- [ ] Terminal process creation
- [ ] PTY stream handling
- [ ] Resize support
- [ ] Environment variables
- [ ] Shell integration

### Milestone 3: Extensions
- [ ] Browser extension support
- [ ] Extension host broker
- [ ] Extension installation
- [ ] Extension activation
- [ ] Node extension support (if runtime supports)

### Milestone 4: Advanced Features
- [ ] CLI bridge integration
- [ ] Search/ripgrep support
- [ ] SCM operations
- [ ] Debug adapter
- [ ] Webview hosting

### Milestone 5: Production
- [ ] Build configuration
- [ ] Production bundling
- [ ] Performance optimization
- [ ] Error handling
- [ ] Reconnection logic

## File Structure

```
src/vs/
├── platform/
│   └── browsercode/
│       ├── common/
│       │   ├── browsercode.ts
│       │   └── browsercodeService.ts
│       └── browser/
│           ├── browsercodeService.ts
│           └── browsercodeTransportService.ts
├── server/
│   └── browsercode/
│       ├── server.main.ts
│       ├── managementServer.ts
│       ├── extensionHostBroker.ts
│       ├── fileSystemBridge.ts
│       ├── terminalBridge.ts
│       ├── cliBridge.ts
│       └── resourceServer.ts
├── workbench/
│   ├── workbench.web.browsercode.ts
│   └── services/
│       └── browsercode/
│           └── browser/
│               ├── browsercodeWorkbenchEnvironmentService.ts
│               └── browsercodeRemoteAgentService.ts
└── code/
    └── browser/
        └── workbench/
            └── workbench-browsercode.html
```

## Next Steps

1. Implement BrowserCode runtime interface in the BrowserCode package
2. Create build configuration for BrowserCode workbench bundle
3. Test filesystem operations end-to-end
4. Implement terminal support
5. Add extension host support
6. Performance profiling and optimization

## References

- [OpenVSCode Server Docs](https://github.com/gitpod-io/openvscode-server/blob/main/README.md)
- [VS Code Extension Host](https://code.visualstudio.com/api/advanced-topics/extension-host)
- [BrowserCode Repository](https://github.com/anomalyco/browsercode)
