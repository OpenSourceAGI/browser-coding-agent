Yes — for **full OpenVSCode compatibility with BrowserCode**, the safest plan is to keep OpenVSCode’s **workbench/server/extension-host architecture** and replace the **remote server substrate** with BrowserCode-compatible adapters only where the contracts allow it. OpenVSCode’s web workbench depends on RPC over WebSockets for filesystem, terminals, and extension-host connections, while BrowserCode is a browser-native runtime focused on Node-based agent execution and browser control, not a drop-in VS Code remote server. [github](https://github.com/leaningtech/webvm)

## Folder map

- `src/vs/base`: leave mostly untouched; this layer is foundational and should remain runtime-agnostic. Refactor only to remove accidental Node/server assumptions from browser paths. [reddit](https://www.reddit.com/r/programming/comments/1gqazit/webvm_20_a_complete_linux_desktop_environment_in/)
- `src/vs/platform`: this is the **main refactor zone**; introduce service interfaces and BrowserCode-backed implementations for process launch, terminal/pty, env resolution, auth/session, storage, and transport wiring. VS Code’s platform layer is specifically where shared services belong. [reddit](https://www.reddit.com/r/programming/comments/1gqazit/webvm_20_a_complete_linux_desktop_environment_in/)
- `src/vs/editor`: keep as-is unless you are fixing browser/runtime assumptions; this is editor core and should not know about BrowserCode. [reddit](https://www.reddit.com/r/programming/comments/1gqazit/webvm_20_a_complete_linux_desktop_environment_in/)
- `src/vs/workbench`: preserve contribution IDs, commands, context keys, and registrations; refactor only service consumers so Explorer, Terminal, Search, Extensions, SCM, and Debug talk to abstract services rather than assuming the stock server transport. The workbench is contribution-driven, and contrib internals should stay isolated. [reddit](https://www.reddit.com/r/programming/comments/1gqazit/webvm_20_a_complete_linux_desktop_environment_in/)
- `src/vs/server`: replace with a **BrowserCode compatibility server layer** that exposes the same remote-management and extension-host semantics expected by the web workbench, even if the actual execution happens inside BrowserCode/BrowserPod. OpenVSCode’s docs define this server as the layer gluing web workbench, remote server, and remote CLI. 

## By folder

### `src/vs/base`
- Audit for imports from `node`, `fs`, process globals, and path assumptions leaking upward into `browser` targets. VS Code’s source organization is strict about target environments like `common`, `browser`, and `node`. [reddit](https://www.reddit.com/r/programming/comments/1gqazit/webvm_20_a_complete_linux_desktop_environment_in/)
- Add no new BrowserCode logic here.
- Deliverable: zero BrowserCode-specific code in `base`, only portability fixes. [reddit](https://www.reddit.com/r/programming/comments/1gqazit/webvm_20_a_complete_linux_desktop_environment_in/)

### `src/vs/platform`
- Create a new subtree such as:
  - `src/vs/platform/browsercode/common`
  - `src/vs/platform/browsercode/browser`
  - `src/vs/platform/browsercode/node` only if you need dev/test parity outside the browser. [reddit](https://www.reddit.com/r/programming/comments/1gqazit/webvm_20_a_complete_linux_desktop_environment_in/)
- Add interfaces/adapters for:
  - `IBrowserCodeTransportService` — wraps BrowserCode session messaging and maps it to OpenVSCode RPC expectations. OpenVSCode requires RPC/WebSocket-like channels for management and extension connections. 
  - `IBrowserCodeProcessService` — starts commands inside BrowserCode runtime instead of a remote machine process.
  - `IBrowserCodePtyService` — emulates or bridges PTY semantics for terminals.
  - `IBrowserCodeFileServiceBackend` — maps filesystem RPC calls to BrowserCode runtime FS/workspace.
  - `IBrowserCodeEnvService` — resolves env vars, cwd, workspace paths, CLI socket equivalents.
- Refactor existing service registrations so stock implementations and BrowserCode implementations can be swapped by composition root, not by `if` ladders across the codebase. VS Code relies on service registration and DI rather than ad hoc globals. [reddit](https://www.reddit.com/r/programming/comments/1gqazit/webvm_20_a_complete_linux_desktop_environment_in/)
- Deliverable: a **service matrix** with stock-server vs BrowserCode implementations per service.

### `src/vs/editor`
- Keep untouched except for integration shims where editor features assume stock extension/language service transport.
- Ensure model resolution, diagnostics, hover, completion, and code actions still flow through existing provider/service abstractions rather than direct server assumptions.
- Deliverable: editor features passing against BrowserCode-backed language/runtime paths without editor-level forks.

### `src/vs/workbench`
Break it down by subsystem:

- `src/vs/workbench/services`
  - Add BrowserCode-aware implementations behind existing service interfaces.
  - Refactor service consumers to avoid importing server specifics directly.
- `src/vs/workbench/contrib/files`
  - Rewire Explorer/open/save/watch operations to use the BrowserCode file backend through the existing file service abstractions.
- `src/vs/workbench/contrib/terminal`
  - Highest-risk area. OpenVSCode expects terminals from the remote server over management connection. You need a BrowserCode PTY bridge with stream handling, resize, env injection, cwd, shell launch, exit codes, and reconnection behavior. The server docs explicitly call terminals part of the management connection surface. 
- `src/vs/workbench/contrib/extensions`
  - Preserve extension install/uninstall UI and Open VSX flows, but redirect actual install, resolve, unpack, and activation plumbing to the BrowserCode compatibility server.
- `src/vs/workbench/contrib/search`
  - Reimplement ripgrep/search backend expectations via BrowserCode runtime command execution or indexed fallback if the browser sandbox limits native search behavior.
- `src/vs/workbench/contrib/debug`
  - Treat as phase-later; full debug compatibility may need browser/runtime-specific adapters for sockets, process attach, and debug transports.
- `src/vs/workbench/contrib/webview`
  - Keep close to upstream; only adjust resource loading, origin policy, and message bridge if BrowserCode changes iframe/resource hosting behavior.
- Deliverable: each contrib folder has a short ADR listing “stock contract,” “BrowserCode adapter,” “gaps,” and “tests.”

### `src/vs/server`
This is the biggest BrowserCode compatibility rewrite.

- Replace the stock assumption of “remote machine server” with a **BrowserCode-backed remote facade** that still looks like the same server to the web workbench. OpenVSCode defines the server as providing filesystem, terminals, extensions, static resources, and CLI support over RPC/WebSockets. 
- Split it into:
  - `src/vs/server/browsercode/managementServer.ts`
  - `src/vs/server/browsercode/extensionHostBroker.ts`
  - `src/vs/server/browsercode/fileSystemBridge.ts`
  - `src/vs/server/browsercode/terminalBridge.ts`
  - `src/vs/server/browsercode/cliBridge.ts`
  - `src/vs/server/browsercode/resourceServer.ts`
- Implement two required logical connections:
  - **management connection** for filesystem/terminal/server RPC. 
  - **extension connection** for per-window extension host creation. 
- BrowserCode is a fork of OpenCode centered on a browser-native agent runtime and browser execution primitive, so this layer must translate from VS Code remote expectations to BrowserCode’s runtime/session model. [github](https://github.com/leaningtech/webvm)
- Deliverable: browser workbench can boot against this server layer without knowing it is not talking to a normal remote machine.

## Detailed refactorings

### 1. Composition roots
- Create separate composition roots:
  - `workbench.web.stock.ts`
  - `workbench.web.browsercode.ts`
  - `server.main.stock.ts`
  - `server.main.browsercode.ts`
- Goal: all BrowserCode-specific service wiring lives here first, then moves down only where needed. Only code reachable from main entrypoints is included in product builds, so composition-root discipline matters. [reddit](https://www.reddit.com/r/programming/comments/1gqazit/webvm_20_a_complete_linux_desktop_environment_in/)

### 2. Transport compatibility
- OpenVSCode expects WebSocket RPC semantics. 
- BrowserCode likely gives you an in-browser runtime/session model rather than a conventional remote daemon. [github](https://github.com/leaningtech/webvm)
- Refactor to a transport abstraction:
  - request/response channels
  - streaming channels
  - reconnect semantics
  - binary payload support
  - window/session affinity
- Preserve message shapes where possible to avoid breaking workbench callers.

### 3. Filesystem compatibility
- Map VS Code file operations to BrowserCode workspace storage.
- Required behaviors:
  - stat/read/write/delete/rename
  - directory watch events
  - URI semantics
  - workspace roots
  - extension install locations
  - settings/keybindings/tasks storage
- OpenVSCode smoke guidance explicitly calls out opening projects and extension management, so FS compatibility is essential. 

### 4. Terminal compatibility
- Build a terminal bridge that can:
  - start shells/commands in BrowserCode runtime
  - stream stdout/stderr
  - accept stdin
  - resize terminals
  - expose env vars
  - preserve shell sessions across UI refresh if possible
- BrowserCode is for AI coding CLIs and local browser-connected execution, so terminal behavior may not naturally match a remote PTY; this is one of the hardest compatibility shims. [github](https://github.com/leaningtech/webvm)

### 5. Extension host compatibility
- Preserve separate extension-host lifecycle, because VS Code uses dedicated extension hosts and distinguishes among Node, browser, and remote extension hosts. [code.visualstudio](https://code.visualstudio.com/api/advanced-topics/extension-host)
- Build an `ExtensionHostBroker` that decides:
  - browser extension runs in-browser
  - Node/remote extension runs in BrowserCode runtime if supported
  - unsupported extension is blocked with explicit capability metadata
- Full compatibility means minimizing these blocks, but you should model them explicitly first.

### 6. CLI compatibility
- OpenVSCode installs a CLI socket server per window and injects env vars into terminals so `code` can target the right window. 
- BrowserCode likely has no native socket file in the classic sense, so:
  - create a virtual CLI bridge
  - map “open file”, “install extension”, “reuse window” commands to an internal bus/session registry
  - preserve `code` CLI semantics as much as possible at the API level
- This is required for true OpenVSCode parity, not just UI parity. 

### 7. Resource and webview hosting
- Keep the workbench’s expectations for static resources, extension assets, and webviews.
- Refactor resource resolution so BrowserCode-hosted assets still satisfy:
  - workspace/resource URIs
  - extension asset URLs
  - CSP/webview isolation
  - subpath/base-path awareness
- OpenVSCode can serve workbench independently and has server base-path concerns, so path discipline matters. [discourse.linuxserver](https://discourse.linuxserver.io/t/using-subfolder-proxy-with-openvscode-server/10207)

## Recommended repo plan

| Folder | Action | Priority |
|---|---|---|
| `src/vs/base` | Portability audit only.  [reddit](https://www.reddit.com/r/programming/comments/1gqazit/webvm_20_a_complete_linux_desktop_environment_in/) | Low |
| `src/vs/platform` | New BrowserCode service adapters, transport, env, process, file, pty.  [reddit](https://www.reddit.com/r/programming/comments/1gqazit/webvm_20_a_complete_linux_desktop_environment_in/) | Critical |
| `src/vs/editor` | Keep stable; only integration shims.  [reddit](https://www.reddit.com/r/programming/comments/1gqazit/webvm_20_a_complete_linux_desktop_environment_in/) | Low |
| `src/vs/workbench/services` | Inject BrowserCode-backed services.  [reddit](https://www.reddit.com/r/programming/comments/1gqazit/webvm_20_a_complete_linux_desktop_environment_in/) | Critical |
| `src/vs/workbench/contrib/terminal` | PTY/stream compatibility rewrite.  | Critical |
| `src/vs/workbench/contrib/extensions` | Install/activate/host compatibility.  [code.visualstudio](https://code.visualstudio.com/api/advanced-topics/extension-host) | Critical |
| `src/vs/workbench/contrib/files` | FS/watch/workspace compatibility.  | Critical |
| `src/vs/server` | BrowserCode remote facade replacing stock remote server assumptions.  [github](https://github.com/leaningtech/webvm) | Critical |

## Suggested milestones

- **Milestone 1:** workbench boots, opens workspace, reads/writes files via BrowserCode backend. 
- **Milestone 2:** integrated terminal works with resize/stdin/stdout/env. 
- **Milestone 3:** browser extensions + basic remote/Node extensions activate through extension host broker. [code.visualstudio](https://code.visualstudio.com/api/advanced-topics/extension-host)
- **Milestone 4:** extension install/uninstall, settings sync-like persistence, CLI open-file flow. 
- **Milestone 5:** search, SCM, tasks, debug, webviews, production packaging.

## Biggest risks

- Terminal/PTTY semantics may not map cleanly onto BrowserCode’s execution model. [github](https://github.com/leaningtech/webvm)
- Node/remote extension compatibility may be partial unless BrowserCode runtime can satisfy enough Node/process/fs assumptions. [code.visualstudio](https://code.visualstudio.com/api/advanced-topics/extension-host)
- Treating BrowserCode as the whole server would be a mistake; it should back a **compatibility facade**, not replace OpenVSCode contracts directly. [github](https://github.com/leaningtech/webvm)

## First concrete files to add

- `src/vs/platform/browsercode/common/browsercode.ts`
- `src/vs/platform/browsercode/browser/browsercodeService.ts`
- `src/vs/platform/browsercode/browser/browsercodeTransportService.ts`
- `src/vs/server/browsercode/managementServer.ts`
- `src/vs/server/browsercode/extensionHostBroker.ts`
- `src/vs/server/browsercode/terminalBridge.ts`
- `src/vs/server/browsercode/fileSystemBridge.ts`
- `src/vs/workbench/services/browsercode/browsercodeWorkbenchEnvironmentService.ts`
- `src/vs/workbench/services/browsercode/browsercodeRemoteAgentService.ts`

Would you like the next step as a **file-by-file checklist with class/interface names**?