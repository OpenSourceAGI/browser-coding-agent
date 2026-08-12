# Architecture

How Ope**nVSCode runs with no backend, and where the seam**s are.

## The problem

VS Code Web normally comes in two shapes:

1. `vscode-reh-web` — the workbench *plus* a Remote Extension Host server. This is what `openvscode-server` and Code Server ship. Every file read, every terminal keystroke and every search crosses a socket to a Node process. It needs a container per user, and that container has to exist before the editor is usable at all.
2. `vscode-web` — the browser-only build, as used by vscode.dev and github.dev. No server process. The workspace has to come from a `FileSystemProvider` implemented by a web extension.

This package takes the second shape and gives it something the first had and the second normally does not: **a real Node.js runtime**, supplied by Nodepod running in the same browser tab.

That inverts the usual cost model. The container stops being a prerequisite and becomes an escalation.

## Layout of a running session

```
┌─ browser tab ─────────────────────────────────────────────────────────┐
│                                                                       │
│  host page (your Next.js app)                                         │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ OpenDSSession                                                    │ │
│  │   FileSystemService ─┐                                           │ │
│  │   SearchService      ├── Nodepod ── VFS · shell · procs · npm    │ │
│  │   TerminalService  ──┘        │                                  │ │
│  │   SyncEngine ─────────────────┴── debounced ──► /api/opends/fs/* │ │
│  │   BridgeServer  ◄── BroadcastChannel ──┐                         │ │
│  └────────────────────────────────────────┼─────────────────────────┘ │
│                                           │                           │
│  workbench iframe (same origin)           │                           │
│  ┌────────────────────────────────────────┼─────────────────────────┐ │
│  │ vscode-web  ──►  web extension host (same-origin iframe + worker)│ │
│  │                    └── opends-bridge extension                   │ │
│  │                          BridgeClient ─┘                         │ │
│  │                          FileSystemProvider                      │ │
│  │                          File/TextSearchProvider                 │ │
│  │                          TerminalProfileProvider ×2              │ │
│  │                          TaskProvider                            │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
```

## Why a BroadcastChannel

The bridge has to connect an extension running in VS Code's web extension host to the page that owns the Nodepod runtime. Those are different execution contexts: the extension host is a `Worker` inside an `<iframe>`.

VS Code decides that iframe's origin here (from `workbench.web.main.js`):

```js
if (isWeb) {
  const template = product.webEndpointUrlTemplate;
  const commit = product.commit;
  const quality = product.quality;
  if (template && commit && quality) {
    /* … serve the extension host from a separate CDN origin … */
  }
  console.warn("The web worker extension host is started in a same-origin iframe!");
}
return `${asBrowserUri(iframePath)}${query}`;
```

So the CDN isolation is conditional on all three product fields being present. `buildWorkbenchProduct()` deliberately omits them, the iframe stays same-origin, and a `BroadcastChannel` reaches from the extension host worker to the host page with no relay through the workbench.

The alternative — `IWorkbenchConstructionOptions.messagePorts` — also exists in modern builds, and `src/protocol/channel.ts` has a `MessagePort` transport ready for it. `BroadcastChannel` is the default because it does not depend on the workbench version, survives the extension host being recreated, and needs no handshake plumbing on the workbench side.

**The consequence you must respect:** if you set `webEndpointUrlTemplate` in `productOverrides`, the extension host moves to another origin and the bridge goes silent. The editor loads and the explorer stays empty.

## The protocol is the only coupling

`src/protocol/messages.ts` declares two maps:

```ts
interface BridgeRequests  { "fs.readFile": { path: string }; /* … */ }
interface BridgeResponses { "fs.readFile": { data: Uint8Array }; /* … */ }
```

Both halves are typed off them: `BridgeServer.handle()` on the host, `BridgeClient.request()` in the extension. Adding a method without handling it is a compile error, and the extension's `tsc` run typechecks the shared protocol sources directly (`extension/tsconfig.json` includes `../src/protocol`).

The result is that **the extension never imports Nodepod, and the runtime never imports** `vscode`. Either side can be replaced independently — the runtime is already swappable via `OpenDSCodeConfig.nodepod`, typed structurally in `client/nodepod-types.ts` rather than against the real package.

## The terminal trick

Nodepod ships a full line discipline: history, tab completion, raw mode, Ctrl+C handling, resize propagation into the shell worker. It drives that through an `@xterm/xterm` `Terminal` instance.

VS Code's terminal panel *is* an xterm, and a `Pseudoterminal` speaks plain strings. Rather than reimplementing the line editor over the bridge, `client/headless-xterm.ts` implements the ten-member subset of the xterm API that Nodepod actually touches (`write`, `onData`, `onResize`, `open`, `focus`, `clear`, `dispose`, `loadAddon`, `cols`, `rows`) and forwards bytes across the channel.

Nodepod thinks it is talking to a terminal. VS Code thinks it is talking to a pty. Neither is modified.

## Persistence is off the critical path

Writes land in the VFS synchronously and return. The `SyncEngine` records the path, debounces, then pushes changed files in one batched request. Deletes go first so a rename cannot resurrect the old key.

Design points worth knowing:

- **Failed pushes are re-queued**, not dropped: a network blip retries on the next flush rather than losing the edit.
- **Hydration suppresses change notifications**, otherwise restoring a workspace would immediately mark every file dirty and push it straight back.
- `node_modules` is excluded. It is reinstallable from `package.json`, and excluding it is the difference between a workspace snapshot measured in kilobytes and one measured in hundreds of megabytes.
- **Concurrent** `flush()` calls coalesce onto the in-flight push, then run once more so writes that arrived mid-flush are not stranded.

The batch upload uses a length-prefixed binary frame format (`[u32 pathLen][path][u32 dataLen][data]…`) rather than multipart or base64 — dependency-free on both ends and no size inflation.

## The container boundary

The claim "a container is only created when a user opens a cloud terminal" is enforced by the import graph, not by documentation:

- `@cloudflare/sandbox` is reached from exactly one module, `server/sandbox.ts`, and even there it is *injected* (`getSandbox` is a parameter) rather than imported, so a deployment without cloud terminals never bundles it.
- `server/fs-routes.ts` and `server/object-store.ts` have no path to it.
- `worker/index.ts` returns `undefined` for the sandbox config unless both the binding and a `SHELL_TICKET_SECRET` are present — failing closed, because that ticket is the only thing between a stranger and someone else's shell.

That is checkable in review: grep for `sandbox` in the import graph of the file routes and you should find nothing.

## Authentication seam

`authorize(request) => AuthContext | null` is the entire contract. It runs before every storage and sandbox route. `userId` becomes the R2 key prefix, and `fs-routes.ts` `encodeURIComponent`s it so a userId containing `/` cannot escape its own prefix.

The terminal WebSocket is the one exception, and necessarily so: a browser cannot attach headers to a WS handshake. `/sandbox/start` (authorized normally) mints a 60-second HMAC-SHA256 ticket; `/sandbox/ws` verifies it with a constant-time compare and derives the identity from the payload. It never consults `authorize()`, and that is called out at the branch in `router.ts`.

## Cross-origin isolation, and who can set a header

Everything in the browser half rests on `SharedArrayBuffer`: Nodepod uses it for synchronous filesystem reads from worker threads and for blocking `execSync`. The browser only exposes it to a cross-origin-isolated document, and isolation is a property of the **origin**, not of a page — one un-isolated document takes it away from everything.

On a Node host that is one line in `next.config`, because one server answers every request. On Cloudflare it is not, and the reason is worth stating plainly: **the Worker is not the only thing serving the origin.** Cloudflare's asset layer answers matching paths without invoking the Worker at all, which is what makes the workbench cheap to serve — and also means no code in the app can put a header on those responses. So the property is maintained in three places:

| Mechanism | Covers | Written by |
| --- | --- | --- |
| `_headers` in the asset directory | static assets: the workbench build, the bridge extension, the service worker | `opendsVinext()` at build time |
| The Worker wrapper | app pages, RSC payloads, OpenDS routes, anything the Worker returns | `createOpenDSVinextWorker()` |
| `next.config` `headers()` | the same app running off-Workers | `openDSHeaders()` |

They overlap on purpose. The failure mode of missing one is not an error — the editor loads, `SharedArrayBuffer` is quietly absent, and the runtime falls back to message passing. It looks like slowness, not misconfiguration, which is exactly why it is worth three mechanisms and a table.

Two related consequences of the same "who is answering?" question:

- **Bindings are not reachable from a route handler.** R2 and the Sandbox namespace live on `env`, which only the Worker entry receives. That is why the Worker builds the server config (`worker/env.ts`) and why `authorize` is handed `env` as well as the request, and why `createOpenDSRouter` accepts a *function* returning config — a catch-all route can then resolve it per request from `cloudflare:workers`.
- **Nodepod's service worker is a static file, not a route.** `serveSW()` finds `__sw__.js` through `node:fs` and `import.meta.url`; neither survives the workerd bundle, so on Workers the file is copied into `public/` and served by the asset layer, with a `Service-Worker-Allowed` rule so it can claim the root scope.

## Path coordinates

Three systems, one translation point:

| System | Root | Example |
| --- | --- | --- |
| VS Code `Uri` | `opends://workspace/` | `uri.path === "/src/index.ts"` |
| Bridge wire | `/` | `"/src/index.ts"` |
| Nodepod VFS | `workspaceRoot` | `"/workspace/src/index.ts"` |

The workspace name lives in the URI *authority*, not the path, specifically so `uri.path` is already wire-shaped. Translation to VFS coordinates happens only in `FileSystemService.toVfs()`. `normalizePath()` rejects `..` rather than clamping it — on the server a traversal attempt is a bug or an attack, and silently rewriting it hides which.

## What this cannot do

- **Node extensions.** Only web extensions activate. Same constraint as vscode.dev.
- **Native modules in the browser terminal.** Nodepod covers a large surface (fs, http, net, crypto, child_process, …) but a package that needs a real native binding must run in the cloud terminal instead.
- **Cross-tab collaboration.** One session, one tab. Two tabs on the same `sessionId` each hold their own VFS and will overwrite each other in R2.
- **Search at ripgrep scale.** The walk is JavaScript over an in-memory tree.