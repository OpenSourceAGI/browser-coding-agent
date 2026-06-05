# BrowserCode + OpenVSCode Integration

Run a full VSCode editor natively in the browser using BrowserCode's agent runtime.

## 🎯 Overview

This integration brings OpenVSCode Server into BrowserCode, enabling:
- Full VSCode editor in browser
- Real filesystem operations
- Native terminal (PTY) support
- Extension loading
- Browser automation integration

## 🚀 Quick Start

```bash
# Install dependencies
make -f Makefile.vscode install

# Build OpenVSCode
make -f Makefile.vscode build-vscode

# Test integration
make -f Makefile.vscode test-vscode

# Opens http://localhost:3456
```

## 📁 Project Structure

```
browsercode/
├── openvscode-server/          # OpenVSCode fork with BrowserCode support
│   └── src/vs/
│       ├── platform/browsercode/    # Platform services
│       ├── server/browsercode/      # Server layer
│       └── workbench/               # Workbench integration
│
├── packages/opencode/src/vscode/
│   ├── runtime.ts              # BrowserCode runtime implementation
│   ├── test-server.ts          # Development server
│   └── test.html               # Test page
│
└── Documentation
    ├── BROWSERCODE_INTEGRATION.md           # Technical guide
    ├── OPENVSCODE_BROWSERCODE_IMPLEMENTATION.md  # Implementation details
    ├── QUICKSTART_OPENVSCODE.md            # Getting started
    ├── VSCODE_INTEGRATION_STATUS.md        # Status tracker
    └── IMPLEMENTATION_COMPLETE.md          # Summary
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│         Browser Window                   │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │     OpenVSCode Workbench           │ │
│  │  • File Explorer                   │ │
│  │  • Terminal                        │ │
│  │  • Extensions                      │ │
│  │  • Editor                          │ │
│  └────────────────────────────────────┘ │
│              ↕ RPC over Channels         │
│  ┌────────────────────────────────────┐ │
│  │   BrowserCode Management Server    │ │
│  │  • Filesystem Bridge               │ │
│  │  • Terminal Bridge                 │ │
│  │  • Extension Host Broker           │ │
│  │  • Resource Server                 │ │
│  └────────────────────────────────────┘ │
│              ↕                           │
│  ┌────────────────────────────────────┐ │
│  │     BrowserCode Runtime            │ │
│  │  • Node.js fs/promises             │ │
│  │  • node-pty (terminals)            │ │
│  │  • Process execution               │ │
│  │  • Browser CDP control             │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

## ✨ Features

### Implemented ✅
- ✅ Full VSCode service integration
- ✅ Real filesystem with CRUD operations
- ✅ Terminal support with node-pty
- ✅ Process execution
- ✅ Channel-based RPC
- ✅ Extension host architecture
- ✅ Resource serving
- ✅ CLI bridge

### In Progress 🔄
- 🔄 Build configuration
- 🔄 Workbench loading
- 🔄 UI integration

### Planned 📋
- 📋 Extension marketplace
- 📋 Search/ripgrep integration
- 📋 Git/SCM operations
- 📋 Debug adapter
- 📋 Multi-workspace support

## 🧪 Testing

### Runtime Test
```bash
make -f Makefile.vscode test-vscode
```

Verifies:
- Runtime initialization
- Filesystem operations
- Terminal creation
- Process execution
- Channel communication

### Development Mode
```bash
make -f Makefile.vscode vscode-dev
```

Watches for changes and rebuilds automatically.

## 📖 Documentation

| Document | Description |
|----------|-------------|
| [BROWSERCODE_INTEGRATION.md](openvscode-server/BROWSERCODE_INTEGRATION.md) | Technical integration guide with API details |
| [OPENVSCODE_BROWSERCODE_IMPLEMENTATION.md](OPENVSCODE_BROWSERCODE_IMPLEMENTATION.md) | Complete implementation summary |
| [QUICKSTART_OPENVSCODE.md](QUICKSTART_OPENVSCODE.md) | Step-by-step getting started guide |
| [VSCODE_INTEGRATION_STATUS.md](VSCODE_INTEGRATION_STATUS.md) | Current status and checklist |
| [IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md) | Summary of completed work |

## 🔧 Configuration

### Runtime Interface

The runtime is exposed on `window.browsercode.runtime`:

```typescript
interface IBrowserCodeRuntime {
  capabilities: BrowserCodeCapability;
  session: {
    id: string;
    workspaceUri?: { scheme: string; path: string };
    ready: Promise<void>;
  };
  
  createProcess(options): Promise<IBrowserCodeProcess>;
  getFileSystemProvider(): IBrowserCodeFileSystemProvider;
  createChannel(name: string): IBrowserCodeChannel;
  executeBrowserCode(code: string): Promise<any>;
}
```

### Capabilities

```typescript
enum BrowserCodeCapability {
  Terminal        = 1 << 0,  // Terminal/PTY support
  FileSystem      = 1 << 1,  // Filesystem operations
  Process         = 1 << 2,  // Process execution
  BrowserExecution = 1 << 3, // Browser script execution
  NodeExtensions   = 1 << 4, // Node.js extensions
  BrowserExtensions = 1 << 5 // Browser extensions
}
```

## 🎮 Usage

### From BrowserCode CLI (Future)
```bash
# Open VSCode for current directory
bcode vscode

# Open specific workspace
bcode vscode /path/to/workspace

# Open with specific file
bcode vscode /path/to/file.ts
```

### From TUI (Future)
```
BrowserCode TUI
├── Chat
├── Browser
├── Tools
│   └── VSCode Editor  ← New menu item
└── Settings
```

### Programmatic (Current)
```typescript
import { initializeBrowserCodeRuntime } from '@browser-use/browsercode-core/vscode/runtime';

// Initialize runtime
const runtime = initializeBrowserCodeRuntime(
  '/workspace/path',
  async (code) => {
    // Optional browser executor
    return eval(code);
  }
);

// Runtime is now available at window.browsercode.runtime
```

## 🛠️ Development

### File Watching
```bash
# Terminal 1: Watch OpenVSCode
cd openvscode-server && yarn watch

# Terminal 2: Watch BrowserCode
bun run dev

# Terminal 3: Test server
make -f Makefile.vscode test-vscode
```

### Adding Features

1. **Platform Service**: Add to `src/vs/platform/browsercode/`
2. **Server Bridge**: Add to `src/vs/server/browsercode/`
3. **Workbench Service**: Add to `src/vs/workbench/services/browsercode/`
4. **Register**: Update composition root in `workbench.web.browsercode.ts`

### Debugging

```javascript
// Browser console
console.log(window.browsercode.runtime);
console.log(window.browsercode.runtime.capabilities);

// Test filesystem
const fs = window.browsercode.runtime.getFileSystemProvider();
await fs.stat({ scheme: 'file', path: '/' });

// Test terminal
const proc = await window.browsercode.runtime.createProcess({
  command: 'bash',
  args: []
});
```

## 📊 Status

| Component | Status | Files | Progress |
|-----------|--------|-------|----------|
| Platform Services | ✅ Complete | 4 | 100% |
| Server Layer | ✅ Complete | 7 | 100% |
| Workbench | ✅ Complete | 4 | 100% |
| Runtime | ✅ Complete | 1 | 100% |
| Testing | ✅ Complete | 2 | 100% |
| Build Config | 🔄 Pending | 0 | 0% |
| Integration | 🔄 Testing | - | 20% |

**Overall: 60% Complete**

## 🐛 Troubleshooting

### "Runtime not found"
- Ensure `window.browsercode.runtime` is defined before loading workbench
- Check browser console for initialization errors
- Verify runtime.ts is loading correctly

### "Workbench won't load"
- Build OpenVSCode first: `make build-vscode`
- Check for TypeScript compilation errors
- Verify all files are in correct locations

### "Filesystem errors"
- Check workspace path is accessible
- Verify file permissions
- Test individual fs operations in console

### "Terminal not working"
- Verify node-pty is installed
- Check PTY device availability
- Test process creation directly

## 🤝 Contributing

When adding features:

1. Follow VS Code's service-based architecture
2. Use dependency injection
3. Write TypeScript with strict typing
4. Add tests for new functionality
5. Update documentation

## 📜 License

MIT License - Same as OpenVSCode Server and BrowserCode

## 🙏 Acknowledgments

- **Microsoft** - Original VS Code
- **Gitpod** - OpenVSCode Server fork
- **BrowserCode Team** - Browser-native agent runtime

---

**Status**: Foundation Complete ✅ | Ready for Testing 🚀

**Next**: Build configuration and end-to-end testing
