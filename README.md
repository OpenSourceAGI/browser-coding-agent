# WEDITOR - Browser AI Code Editor

OpenVSCode Web, running **entirely in the browser**.

The workbench is static. The filesystem, shell, processes and npm are
[Nodepod](https://github.com/ScelarOrg/Nodepod) polyfills running on the page.
Files persist to Cloudflare R2. A Docker container is created **only** if a user
explicitly opens a cloud terminal — never for editing, browsing, searching or
saving.

```
Browser tab
├─ host page ───────────── Nodepod: VFS · shell · processes · npm
│     │                        │
│     │  BroadcastChannel      └─ debounced push ──► /api/opends/fs/* ──► R2
│     │  (same origin)
│     ▼
└─ workbench iframe ────── vscode-web (static) + bridge extension
                                │
                                ├─ "cloud terminal" ──────► /api/opends/sandbox/*
                                └─ "full editor" ──────────► /api/opends/sandbox/editor/*
                                                              └─ Cloudflare Sandbox
                                                                 (container, on demand,
                                                                  openvscode-server inside)
```

## What you get

| | |
|---|---|
| **Editor** | The real VS Code workbench — editors, diffs, Git decorations, settings, keybindings, themes, extensions from Open VSX |
| **Filesystem** | `FileSystemProvider` over an in-browser VFS. Open, save, rename, delete, drag-drop. A save is a `postMessage`, not an HTTP call |
| **Search** | Quick Open (`Ctrl+P`) and global search (`Ctrl+Shift+F`) via `FileSearchProvider` / `TextSearchProvider` |
| **Terminal** | Real `node`, `npm`, and shell builtins in the browser. No container, no cold start |
| **Tasks** | `package.json` scripts as VS Code tasks, executed in the browser shell |
| **Preview** | Servers started in the terminal are reachable and openable in the Simple Browser |
| **Persistence** | Debounced incremental sync to R2, off the editing path |
| **Extensions** | Web extensions from Open VSX, plus best-effort `process`/`Buffer`/`global` polyfills for browser bundles that assume they exist |
| **Cloud terminal** | Opt-in bash PTY in a Cloudflare Sandbox container, mounting the same workspace |
| **Full editor (cloud sandbox)** | Opt-in: the real `openvscode-server`, with a genuine Node extension host, opened in a new tab against the same workspace |
| **Auth** | Not included, on purpose. You supply `authorize(request)` |

## Install

```bash
npm install @opensourceagi/opends-code @scelar/nodepod
```

Stage the workbench assets (a one-time copy into `public/`):

```bash
npx opends-fetch-workbench --out ./public/vscode
# or: node node_modules/@opensourceagi/opends-code/scripts/fetch-workbench.mjs --out ./public/vscode
```

Copy the bridge extension next to them:

```bash
cp -r node_modules/@opensourceagi/opends-code/extension ./public/opends/extension
```

## Wire it up (Next.js App Router)

**1. Headers** — Nodepod needs `SharedArrayBuffer`, which needs cross-origin isolation.

```js
// next.config.mjs
import { openDSHeaders } from "@opensourceagi/opends-code/next";
export default { async headers() { return openDSHeaders(); } };
```

**2. Routes** — one catch-all.

```ts
// app/api/opends/[...path]/route.ts
import { createOpenDSHandlers } from "@opensourceagi/opends-code/next";
import { S3Store } from "@opensourceagi/opends-code/server";

export const { GET, POST, PUT, DELETE } = createOpenDSHandlers({
  authorize: async (request) => {
    const session = await auth(request);        // your login, untouched
    return session ? { userId: session.userId } : null;
  },
  store: new S3Store({
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    bucket: process.env.R2_BUCKET!,
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  }),
});
```

**3. Editor**

```tsx
"use client";
import { OpenDSCode } from "@opensourceagi/opends-code/react";
import { createHttpStorage } from "@opensourceagi/opends-code/storage";

export default function Page({ userId }: { userId: string }) {
  return (
    <OpenDSCode
      config={{
        sessionId: userId,
        apiBase: "/api/opends",
        storage: createHttpStorage({ apiBase: "/api/opends", workspaceId: userId }),
      }}
    />
  );
}
```

That is a complete, persistent, multi-user web IDE with no container in the
picture. A working copy of these three files is in [`example/`](./example).

## Wire it up (vinext on Cloudflare Workers)

[vinext](https://github.com/cloudflare/vinext) runs the same App Router code on
Vite and deploys it as a Worker. Three things change, and all three come from
the same fact: **the Worker is not the only thing answering requests.**

**1. Plugin** — isolates the dev server and writes the `_headers` that isolates
deployed assets.

```ts
// vite.config.ts
import { cloudflare } from "@cloudflare/vite-plugin";
import { opendsVinext } from "@opensourceagi/opends-code/vinext";
import { defineConfig } from "vite";
import vinext from "vinext";

export default defineConfig({
  plugins: [
    vinext(),
    opendsVinext(),
    cloudflare({ viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] } }),
  ],
});
```

**2. Worker entry** — OpenDS routes in front of the app router. Point `main` in
`wrangler.jsonc` at it; vinext uses `worker/index.ts` instead of its own entry
when it exists.

```ts
// worker/index.ts
import { createOpenDSVinextWorker } from "@opensourceagi/opends-code/vinext";
import handler from "vinext/server/app-router-entry";
import { Sandbox, getSandbox } from "@cloudflare/sandbox";

export { Sandbox };
export default createOpenDSVinextWorker({
  handler,                                       // fall-through: the Next app
  authorize: (request, env) => verifySession(request, env),
  getSandbox,                                    // omit for no cloud terminals
});
```

`env` reaches `authorize` because session lookups usually need a binding, and
the R2 store is built from `env.WORKSPACES` — a route handler never sees either.
Prefer a catch-all route anyway? `createOpenDSVinextHandlers({ env: () => env })`
takes `env` from `cloudflare:workers` and resolves it per request.

**3. Service worker** — copy it into `public/`, do not serve it from the Worker:

```bash
cp node_modules/@scelar/nodepod/dist/__sw__.js public/__sw__.js
```

`serveSW()` locates that file with `node:fs` and `import.meta.url`, neither of
which survives the workerd bundle; it throws at request time. As a static asset
it is served by the asset layer, with the `Service-Worker-Allowed` rule the
plugin writes.

A complete, deployable app is in [`example/vinext/`](./example/vinext).

### Why isolation takes three mechanisms there

`SharedArrayBuffer` requires cross-origin isolation, and isolation is a property
of the **whole origin** — one un-isolated document loses it for everything. On
Workers no single mechanism covers every response:

| | Covers | Comes from |
|---|---|---|
| `_headers` | static assets — the asset layer serves them without ever invoking the Worker | `opendsVinext()` |
| Worker wrapper | app pages, RSC payloads, OpenDS routes | `createOpenDSVinextWorker()` |
| `next.config` `headers()` | the same app off-Workers (`vinext start`, Node, Vercel) | `openDSHeaders()` |

Miss the first and the workbench bundle loads un-isolated, `SharedArrayBuffer`
disappears, and the runtime drops to its slower path — which reads as "the
editor is just slow", not as a configuration error.

## Modes

### Browser-only (the default)

Everything runs on the page. No `apiBase`, no `storage`, no server:

```tsx
<OpenDSCode config={{ initialFiles: { "/index.js": "console.log(1)" } }} />
```

Instant boot, works offline, workspace is lost on reload. Good for playgrounds,
docs, and reproductions.

### Browser + R2 persistence

Add `storage` and the routes. Edits land in the VFS immediately and are pushed
after a quiet period (1.5s by default), so typing never waits on the network.
The status bar shows `saved` / `n pending` / `save failed`.

### Browser + cloud terminal

Add `sandbox: { enabled: true }` on the client and a `sandbox` config on the
server. A second terminal profile appears — **bash (cloud sandbox)**. Opening it:

1. flushes pending edits to R2,
2. boots (or resumes) a container that mounts the same bucket at `/workspace`,
3. proxies a real PTY over a WebSocket into the VS Code terminal.

So the shell operates on the files you are looking at, with a full Linux
toolchain — native modules, debuggers, ripgrep — and openvscode-server itself is
in the image. Users who never open one never cause a container to exist.

```ts
// Cloudflare Worker
import { createOpenDSWorker } from "@opensourceagi/opends-code/worker";
import { Sandbox, getSandbox } from "@cloudflare/sandbox";

export { Sandbox };
export default createOpenDSWorker({
  authorize: (request) => verifySession(request),
  getSandbox,
});
```

See [`docker/`](./docker) for the image and a reference `wrangler.jsonc`.

### Browser + cloud terminal + full editor

Same `sandbox` config as above. A second command appears in the palette —
**OpenDS: Open Full Editor in Cloud Sandbox**. Opening it:

1. flushes pending edits to R2 (same as the terminal),
2. boots (or resumes) the same container,
3. starts `openvscode-server` inside it — a real Node.js extension host, not
   a Web Worker — if it is not already running,
4. exposes its port through the Sandbox SDK's public preview URL and opens it
   in a new tab.

That gives you the genuine `vscode-reh-web` experience — a real marketplace
(if the image's `openvscode-server` build is configured with one), native
modules, debuggers — against the exact same R2-backed workspace, no reverse
proxy involved: the exposed URL *is* the container's own origin, so
`openvscode-server` serves its own assets with no path-rewriting needed on our
side.

`openvscode-server` is started with a per-session connection token derived as
`HMAC-SHA256(ticketSecret, "editor:" + sandboxId)` — the same secret and
pattern as the terminal's WebSocket ticket, just deterministic so no extra
state needs to be stored. Rotating `ticketSecret` invalidates every
outstanding editor URL along with every terminal ticket. As with the cloud
terminal, a user who never opens the full editor never causes it to start.

## Authentication

There is none in this package, and that is deliberate — it is a component, not
an application. The single seam is:

```ts
authorize(request: Request): AuthContext | null | Promise<AuthContext | null>
```

Return `{ userId }` (optionally `workspaceId`, `readOnly`) or `null` for a 401.
`userId` becomes the R2 key prefix, so it must identify exactly one tenant.
Cookies flow automatically (`credentials: "include"`); for bearer tokens pass
`headers` in the client config.

The one exception is the terminal WebSocket: browsers cannot set headers on a
WS handshake, so `/sandbox/start` mints a 60-second HMAC-signed ticket that
`/sandbox/ws` verifies.

## Architecture

The design and its trade-offs are written up in
[ARCHITECTURE.md](./ARCHITECTURE.md). The short version:

- **No remote extension host in the default path.** Build (or fetch) the
  browser-only `vscode-web` target, not `vscode-reh-web` — no `vscode-server`
  process runs unless a user explicitly opens the full editor in the cloud
  sandbox (see [Modes](#browser--cloud-terminal--full-editor)), which starts a
  real one on demand.
- **The bridge is a BroadcastChannel.** The workbench's web extension host runs
  in a *same-origin* iframe as long as `product.json` leaves
  `webEndpointUrlTemplate` unset, so the extension and the host page can share a
  channel directly.
- **The extension knows nothing about Nodepod; the runtime knows nothing about
  VS Code.** The wire protocol in [`src/protocol`](./src/protocol) is the only
  coupling, and it is fully typed in both directions.
- **The Sandbox SDK is imported from exactly one module.** `src/server/sandbox.ts`.
  Nothing on the file-serving path can reach it — that is the enforcement
  mechanism for "no container unless you ask for one", and it is checkable in
  code review.

## Package layout

```
src/protocol/     wire contract + RPC channel (shared by both halves)
src/client/       Nodepod runtime, fs, search, terminals, session
src/storage/      StorageAdapter, sync engine, HTTP + memory adapters
src/workbench/    product.json + workbench HTML + iframe mount
src/react/        <OpenDSCode /> and useOpenDSSession()
src/server/       object stores (R2 binding + S3), routes, sandbox
src/next/         App Router adapter and header helpers
src/worker/       Cloudflare Worker entry + env/bindings resolution
src/vinext/       vinext-on-Workers entry, route handlers, Vite plugin
extension/        the VS Code bridge extension (esbuild -> dist/extension.js)
docker/           container image for the optional cloud terminal
scripts/          workbench staging + openvscode fork integration
```

## Building from source

```bash
npm install
npm run build       # library (tsc) + extension (esbuild)
npm run type-check  # library, and the extension against real @types/vscode
npm test            # end-to-end smoke test over the built dist/
```

`npm test` drives the built package through a real `BroadcastChannel` with a
fake Nodepod runtime, exercising exactly what the extension does: fs round
trips, error-code translation, watchers, both search providers, the terminal
path and the debounced sync.

To bake the bridge into an openvscode fork instead of loading it at runtime:

```bash
node scripts/install-into-openvscode.mjs --repo ../openvscode
```

Then build a `vscode-web-*` gulp target — **not** `vscode-reh-web-*`, which
bundles the remote extension host server this architecture does not use.

## Known limitations

- **Prefix-scoped R2 mounts** are not supported by the Sandbox SDK yet, so the
  cloud terminal mounts the whole bucket and symlinks the caller's prefix to
  `/workspace`. That hides other tenants from casual browsing but is not a hard
  boundary — a user who deliberately walks into the mount root can read other
  prefixes. Use a bucket per tenant if that matters to you.
- **`node_modules` is never synced.** It is reinstalled from `package.json` on
  demand, which keeps hydration fast. A workspace that depends on an
  unpublished local package needs that package committed as source.
- **Search is not ripgrep.** It walks the VFS in the browser. Fine for normal
  projects, slower than native on very large ones.
- **Extensions still need a Node extension host to be Node extensions.** The
  browser workbench remains a `vscode-web` target — the polyfills it installs
  (`process`, `Buffer`, `global`) help browser bundles that reference them
  ambiently, but native bindings, `child_process`, `net`, or a `main` entry
  point still need a real extension host process. Open the full editor in the
  cloud sandbox for those.
- **Extensions installed inside the full editor are not persisted.** They live
  in the container's own (ephemeral) filesystem, not the R2-backed workspace,
  so they are lost the next time the container goes cold. Baking a fixed set
  into the image, or mounting `~/.openvscode-server` under R2, are both
  reasonable follow-ups this repo does not implement.

## License

MIT.
