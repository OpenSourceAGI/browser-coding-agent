# IDE Architecture: UI loaded from Nodepod

This document records the architecture delivered by [docs/plan.md](./plan.md):
an OpenVSCode-inspired web IDE that boots **Nodepod** as the in-browser
Node.js runtime and loads everything — files, processes, previews — from it.
No backend server is involved.

## Entry points (plan 0.3)

| Entry | What it is |
|---|---|
| `ide/vscode.html` + `ide/main.ts` | The IDE app. Boots Nodepod, mounts `NodepodIde`. Built by `npm run build:ide` into `out/vscode.html`. |
| `src/ide/index.ts` | The IDE kit as a library, published as `@scelar/nodepod/ide` (`dist/ide.mjs` / `dist/ide.cjs`). |
| `/__sw__.js` | Nodepod service worker. Served in dev and emitted into `out/` by the `@scelar/nodepod/vite` plugin (plan 4.1). Required for preview iframes and virtual HTTP servers. |
| `scripts/run-vscode-nodepod.mjs` | Static server for `out/` with COOP/COEP (SharedArrayBuffer) and `Service-Worker-Allowed` headers. `npm run run:vscode-nodepod`. |

Commands:

```bash
npm run dev:ide            # vite dev server (serves /__sw__.js itself)
npm run build:ide          # build the app into out/
npm run build              # library + types + IDE app
npm run run:vscode-nodepod # serve out/vscode.html with the right headers
```

## Data flow

```
┌────────────────────────────────────────────────────────────────┐
│  NodepodIde shell (src/ide/app.ts)                             │
│  ┌────────────┐ ┌────────┐ ┌──────────────┐ ┌───────────────┐  │
│  │FileExplorer│ │ Editor │ │ TerminalPane │ │  PreviewPane  │  │
│  └─────┬──────┘ └───┬────┘ └──────┬───────┘ └───────┬───────┘  │
│        │            │            │                  │          │
│  ┌─────▼────────────▼───┐  ┌─────▼─────────┐  ┌─────▼───────┐  │
│  │  NodepodFileSystem   │  │ ProcessRunner │  │PreviewManager│ │
│  │  (repository layer)  │  │ (spawn wrap)  │  │(port/iframe) │ │
│  └─────────┬────────────┘  └─────┬─────────┘  └─────┬───────┘  │
└────────────┼─────────────────────┼──────────────────┼──────────┘
             │ nodepod.fs.*        │ nodepod.spawn    │ nodepod.port
┌────────────▼─────────────────────▼──────────────────▼──────────┐
│  Nodepod (booted via Nodepod.boot({ files, workdir, env }))    │
│  MemoryVolume VFS · process workers · npm installer ·          │
│  RequestProxy + service worker (/__sw__.js, /__virtual__/…)    │
└────────────────────────────────────────────────────────────────┘
```

- **`NodepodFileSystem`** (plan 1.2) wraps `nodepod.fs`
  (`readFile/writeFile/readdir/stat/mkdir/rm/rename`), normalizes paths,
  emits change events for every mutation, and bridges external changes
  (spawned processes, `npm install`) into the same event stream via the
  host watcher. The explorer re-renders and open editors reload (when not
  dirty) from these events.
- **`ProcessRunner`** (plan 1.3) wraps `nodepod.spawn` /
  `proc.on('output'|'error'|'exit')` / `proc.completion` with streaming
  callbacks, active-process tracking, and `killAll()`.
- **`PreviewManager`** (plan 1.4) is wired into `Nodepod.boot`'s
  `onServerReady` by `buildBootOptions()`. When a process calls
  `listen()`, the manager records the port, resolves the preview URL via
  `nodepod.port(port)`, and routes it into the attached iframe.
  `setPreviewScript` / `clearPreviewScript` pass through to the host.

## Boot sequence (ide/main.ts)

1. Resolve feature flags: defaults ← storage (`nodepod-ide.flags`) ← URL
   (`?ff=ide.preview:off,…`).
2. `const previews = new PreviewManager()` — created **before** boot so no
   `onServerReady` event is missed.
3. `Nodepod.boot(buildBootOptions({ files: STARTER_FILES, workdir, env }, previews))`.
4. `previews.bindHost(nodepod)`.
5. If `ide.persistence` is on, restore the last workspace snapshot from
   `localStorage` (`WorkspaceStore`).
6. `new NodepodIde({ host, previews, xterm: { Terminal, FitAddon }, … }).mount(el)`.

## Single data layer (plan phase 2, 6.4)

The Nodepod virtual filesystem is the **only** data layer:

- The UI reads and writes exclusively through `NodepodFileSystem` — there
  is no parallel store, so the dual-write migration steps (plan 2.3–2.5)
  terminate in this end state with nothing legacy left to remove.
- Persistence is a Nodepod snapshot (`nodepod.snapshot()`, shallow — no
  `node_modules`) serialized to `localStorage` by `WorkspaceStore`, and
  restored with `nodepod.restore()` on the next boot. Deps reinstall from
  `package.json` on demand.

## Terminal and processes (plan phase 3)

- `TerminalPane` plugs xterm.js into
  `nodepod.createTerminal({ Terminal, FitAddon })` (plan 3.1). xterm is a
  peer dependency injected by the app, never imported by the library.
- Without xterm, a fallback console wires typed commands directly to
  `nodepod.spawn` through `ProcessRunner` (plan 3.2).
- `ProcessRunner` stdout/stderr/exit behavior is covered in
  `src/ide/__tests__/process-runner.test.ts` (plan 3.3).

## Preview and HTTP servers (plan phase 4)

- The service worker must be reachable at `/__sw__.js` (plan 4.1): the
  vite plugin serves it in dev and emits it at build; the static server
  script and `examples/serve.js` send `Service-Worker-Allowed: /`.
- `buildBootOptions` forwards `allowedFetchDomains` (including the `null`
  wildcard) to the CORS proxy (plan 4.3).

## npm packages (plan phase 5)

- The title-bar **npm install** action calls `nodepod.install()` — added
  to the SDK in this refactor (it was documented in the README but
  missing) — which installs from `/package.json` and streams progress to
  the Output panel (plan 5.1).
- `src/ide/polyfill-manifest.ts` is the machine-readable coverage list
  (plan 5.2) surfaced in the IDE's **Runtime** panel, with a workaround
  note for every stub (plan 5.3). `polyfill-coverage.test.ts` asserts the
  manifest matches the actual files in `src/polyfills/`.

### Stubbed modules and workarounds

| Stub | Workaround |
|---|---|
| `dns` | Name resolution happens in the browser fetch layer; use `http`/`https`. |
| `worker_threads` | Use `nodepod.spawn()` — each process already runs in its own Web Worker. |
| `vm` | Spawn a separate node process instead of an in-process sandbox. |
| `tls` | TLS terminates at the browser; use `https`. |
| `http2` | Servers fall back to HTTP/1.1 semantics through the SW bridge. |
| `dgram`, `cluster`, `v8`, `inspector`, `domain`, `diagnostics_channel`, `async_hooks` | See notes in `src/ide/polyfill-manifest.ts`. |

## Rollout and QA (plan phase 6)

- Feature flags (`src/ide/feature-flags.ts`) gate terminal, preview,
  install, and persistence independently — `?ff=ide.preview:off` etc. —
  for gradual rollout without redeploys (plan 0.2 / 6.3).
- Integration tests cover boot → file I/O → spawn → preview routing
  (`src/ide/__tests__/ide-integration.test.ts`, plan 0.1 / 6.1).
  Filesystem and snapshots use the real `MemoryVolume`/`NodepodFS`;
  process execution and the preview proxy are scripted
  (`fake-host.ts`), since they need Web Workers / a service worker.
- The layout is responsive (plan 6.2): below 900px the preview becomes a
  toggled overlay, below 640px the sidebar does too; the activity bar
  buttons control all three regions down to 375px.

## Testing

```bash
npm run type-check   # 0 TypeScript errors
npm test             # unit + integration suites
npm run build        # library + types + IDE app
```
