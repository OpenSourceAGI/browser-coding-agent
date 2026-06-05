# Quick Start: OpenVSCode in BrowserCode

This guide shows how to get OpenVSCode running in BrowserCode.

## Prerequisites

- BrowserCode runtime available
- Node.js 18+ and npm/yarn
- Basic understanding of TypeScript

## Step 1: Build OpenVSCode with BrowserCode Support

```bash
cd /home/admin/browsercode/openvscode-server

# Install dependencies
yarn install

# Build the workbench with BrowserCode support
# (You'll need to add this target to the build configuration)
yarn gulp compile-web-browsercode
```

## Step 2: Implement BrowserCode Runtime

In your BrowserCode package (e.g., `packages/opencode`), implement the runtime interface:

```typescript
// packages/opencode/src/vscode-runtime.ts
import { BrowserCodeRuntimeAdapter, initializeBrowserCodeRuntime } from './browsercode-runtime-adapter';

// Connect to actual BrowserCode capabilities
class BrowserCodeVSCodeRuntime extends BrowserCodeRuntimeAdapter {
  constructor() {
    super('/workspace');
    
    // Wire up to actual BrowserCode filesystem
    this.fsProvider = new ActualBrowserCodeFS();
  }
  
  async createProcess(options) {
    // Connect to BrowserPod or your execution environment
    return await browserPod.createProcess(options);
  }
  
  async executeBrowserCode(code) {
    // Use your browser harness
    return await browserHarness.execute(code);
  }
}

// Initialize on page load
export function initVSCode() {
  const runtime = new BrowserCodeVSCodeRuntime();
  (window as any).browsercode = { runtime };
}
```

## Step 3: Create HTML Entry Point

```html
<!-- packages/app/public/vscode.html -->
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>BrowserCode VSCode</title>
  <style>
    body, html {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
  </style>
</head>
<body>
  <!-- BrowserCode Runtime -->
  <script src="/browsercode/vscode-runtime.js"></script>
  <script>
    window.initVSCode();
  </script>

  <!-- OpenVSCode Workbench -->
  <script src="/openvscode/vs/loader.js"></script>
  <script src="/openvscode/vs/workbench/workbench.web.browsercode.js"></script>
  
  <script>
    // Wait for runtime to be ready
    window.browsercode.runtime.session.ready.then(() => {
      window.createBrowserCodeWorkbench(document.body, {
        workspaceUri: { 
          scheme: 'file', 
          path: '/workspace' 
        },
        productConfiguration: {
          nameShort: 'BrowserCode',
          nameLong: 'BrowserCode VSCode'
        }
      });
    });
  </script>
</body>
</html>
```

## Step 4: Add to BrowserCode CLI

```typescript
// packages/cli/src/commands/vscode.ts
import { Command } from 'commander';

export const vscodeCommand = new Command('vscode')
  .description('Open VSCode editor in browser')
  .option('-w, --workspace <path>', 'Workspace directory', process.cwd())
  .action(async (options) => {
    const { workspace } = options;
    
    console.log('Starting BrowserCode VSCode...');
    console.log('Workspace:', workspace);
    
    // Start server with VSCode route
    await startServer({
      workspace,
      routes: {
        '/vscode': '/path/to/vscode.html',
        '/openvscode': '/path/to/openvscode-server/out'
      }
    });
    
    // Open browser
    await open('http://localhost:3000/vscode');
  });
```

## Step 5: Test Basic Functionality

```bash
# Launch BrowserCode with VSCode
bcode vscode --workspace ~/my-project

# Or add to TUI menu
bcode
# Then select: Tools > Open VSCode Editor
```

## Minimal Runtime Implementation

If you want to test quickly with a minimal runtime:

```typescript
// Minimal test runtime
window.browsercode = {
  runtime: {
    capabilities: 0b111111, // All capabilities
    session: {
      id: 'test-session',
      workspaceUri: { scheme: 'file', path: '/workspace' },
      ready: Promise.resolve(),
      dispose: () => {}
    },
    
    // Mock filesystem - replace with real implementation
    getFileSystemProvider() {
      return {
        async stat(uri) {
          return { type: 1, size: 0, mtime: Date.now(), ctime: Date.now() };
        },
        async readFile(uri) {
          return new TextEncoder().encode('// File content');
        },
        async writeFile(uri, content) {
          console.log('Write:', uri.path, content);
        },
        async readdir(uri) {
          return [['example.js', 1]];
        },
        async delete(uri) {},
        async rename(from, to) {},
        async mkdir(uri) {},
        watch(uri) {
          return { dispose: () => {} };
        },
        onDidChange(listener) {
          return { dispose: () => {} };
        }
      };
    },
    
    // Mock process execution
    async createProcess(options) {
      return {
        pid: 1234,
        onExit: (cb) => ({ dispose: () => {} }),
        onStdout: (cb) => {
          setTimeout(() => cb('$ '), 100);
          return { dispose: () => {} };
        },
        onStderr: (cb) => ({ dispose: () => {} }),
        write: (data) => console.log('stdin:', data),
        resize: (cols, rows) => {},
        kill: () => {},
        dispose: () => {}
      };
    },
    
    // Mock channel
    createChannel(name) {
      return {
        onMessage: (cb) => ({ dispose: () => {} }),
        send: (msg) => console.log('Channel send:', name, msg),
        dispose: () => {}
      };
    },
    
    // Mock browser execution
    async executeBrowserCode(code) {
      return eval(code);
    }
  }
};
```

## Directory Structure

```
browsercode/
├── openvscode-server/          # OpenVSCode fork
│   ├── src/vs/
│   │   ├── platform/browsercode/  # BrowserCode platform services
│   │   ├── server/browsercode/    # BrowserCode server layer
│   │   └── workbench/
│   │       ├── workbench.web.browsercode.ts
│   │       └── services/browsercode/
│   └── BROWSERCODE_INTEGRATION.md
│
└── packages/
    ├── opencode/
    │   └── browsercode-runtime-adapter.ts  # Runtime reference
    ├── app/
    │   └── public/
    │       └── vscode.html                 # Entry point
    └── cli/
        └── src/commands/vscode.ts          # CLI command
```

## Troubleshooting

### "Runtime not found" Error

Make sure `window.browsercode.runtime` is set before loading the workbench:

```javascript
// Check in console
console.log(window.browsercode?.runtime);
```

### Blank Screen

1. Check browser console for errors
2. Verify all scripts loaded successfully
3. Check that runtime.session.ready resolves

### Files Not Loading

1. Verify filesystem provider implementation
2. Check URI scheme handling (file:// vs vscode-file://)
3. Test filesystem methods individually:

```javascript
const fs = window.browsercode.runtime.getFileSystemProvider();
await fs.readdir({ scheme: 'file', path: '/workspace' });
```

### Terminal Not Working

1. Verify `createProcess` implementation
2. Check process event handlers (onStdout, onStderr, onExit)
3. Test process creation directly:

```javascript
const proc = await window.browsercode.runtime.createProcess({
  command: '/bin/bash',
  args: []
});
```

## Next Steps

1. **Replace mock implementations** with actual BrowserCode capabilities
2. **Test file operations** end-to-end
3. **Implement terminal** with real PTY
4. **Add extensions** support
5. **Optimize performance** and bundle size

## Resources

- [BROWSERCODE_INTEGRATION.md](./openvscode-server/BROWSERCODE_INTEGRATION.md) - Full integration guide
- [OPENVSCODE_BROWSERCODE_IMPLEMENTATION.md](./OPENVSCODE_BROWSERCODE_IMPLEMENTATION.md) - Implementation details
- [browsercode-runtime-adapter.ts](./packages/opencode/browsercode-runtime-adapter.ts) - Reference implementation

## Support

For issues or questions:
- Check implementation docs
- Review browser console logs
- Test runtime methods individually
- Verify OpenVSCode build completed successfully

## Run with Nodepod

You can host the built OpenVSCode workbench with Nodepod so that the browser-hosted VS Code runs against Nodepod's virtual Node.js environment. High-level steps:

- Build OpenVSCode per this quickstart.
- Serve the built assets from a static host that also exposes Nodepod's service worker at `/__sw__.js`.

Minimal example (adjust paths to your build output):

```bash
# serve built assets
npm install -g serve
serve -s ./out -l 3000

# make the Nodepod service worker available
cp node_modules/@scelar/nodepod/dist/__sw__.js public/__sw__.js

# open the workbench
open http://localhost:3000/vscode.html
```

Ensure `window.browsercode.runtime` is initialized before the workbench loads (see runtime examples above). For more Nodepod-specific runtime wiring, refer to `README.md`.
