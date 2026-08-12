# OpenVSCode on Nodepod

The VS Code workbench running **frontend-only**, with [Nodepod](https://www.npmjs.com/package/@scelar/nodepod)
supplying the things an editor normally gets from an operating system:
a filesystem, processes, sockets, and a shell. No backend, no remote extension
host, no container — until you ask for one.

Deploys to Cloudflare Workers, built with [vinext](https://www.npmjs.com/package/vinext)
(Next App Router on Vite).

```
Browser tab
│
├─ VS Code workbench            @codingame/monaco-vscode-api (real VS Code, no REH server)
│    ├─ file:// provider  ──────► Nodepod MemoryVolume
│    ├─ terminal backend  ──────► Nodepod shell (Web Worker)   ← default
│    │                     └────► Cloudflare Sandbox PTY       ← opt-in
│    └─ resolveExternalUri ─────► Nodepod virtual ports (service worker)
│
└─ Cloudflare Worker
     ├─ /__sw__.js         Nodepod service worker (virtual HTTP servers)
     ├─ /__np__/<url>      CORS proxy for in-browser Node code
     └─ /api/sandbox/*     container terminal + workspace mirroring (the only
                           routes that can touch a container)
```

## What actually works

Verified in a real browser by `npm run test:smoke`:

- The workbench mounts — activity bar, sidebar, editor, panel.
- The explorer lists files from Nodepod's in-memory volume.
- Opening a file reads through the filesystem provider into Monaco.
- The integrated terminal runs a command through Nodepod's shell, and the
  file it writes shows up in the volume.

`node server.js` in the terminal starts a real HTTP server; the port it opens
is forwarded through the service worker and announced in the IDE.

## Quick start

```bash
npm install
npm run build:workbench     # builds the IDE into public/workbench/
npm run serve:workbench     # http://localhost:4321 — no Worker needed
```

For the full app (landing page + Worker routes):

```bash
npm run build               # workbench + vinext app
npm run deploy              # wrangler deploy
```

The IDE lives at `/ide`; the Worker rewrites that to the built workbench and
adds the COOP/COEP headers it needs.

## Two places a terminal can run

The terminal dropdown (the `v` next to `+`) lists two profiles. The command
palette entry **Nodepod: Select Terminal Backend…** does the same thing and
sets the default for new terminals.

**Nodepod (in-browser)** — the default. A shell in a Web Worker in this tab,
with line editing, history, tab completion, and raw mode for full-screen TUIs.
Nothing leaves the browser. `node`, `npm`, and `git` all work.

**Cloudflare Sandbox (container)** — boots a Linux container, clones the
workspace into it, and gives you bash with a real toolchain. Files the
container creates (installs, build output, generated code) are pulled back
every few seconds so the explorer stays truthful. Also available as
**Nodepod: Clone Workspace Into Sandbox Container** and
**Nodepod: Pull Changes From Sandbox Container**.

The editor keeps using the in-browser filesystem in both modes — only the
shell moves. That is deliberate: editing stays instant, and the container is
there for the cases the browser genuinely cannot cover.

### Container setup

Containers need Docker at deploy time to build the image, and the
`@cloudflare/sandbox` version in `package.json` must match the tag in
`Dockerfile` — a mismatch shows up as a terminal that connects and then
immediately closes.

```bash
npx wrangler deploy                       # builds the image, then deploys
npx wrangler deploy --containers-rollout=none   # skip the container entirely
```

Skipping it is fine: the IDE runs without a container, it just loses the
Sandbox terminal profile.

## How the pieces fit

| Concern | Where |
|---|---|
| Runtime contract (fs, pty, ports) | `src/runtime/types.ts` |
| Nodepod filesystem | `src/runtime/nodepod-fs.ts` |
| In-browser terminals | `src/runtime/nodepod-terminal-driver.ts` |
| Container terminals + file mirroring | `src/runtime/sandbox-terminal-driver.ts` |
| Boot + driver switching | `src/runtime/workspace-runtime.ts` |
| VS Code `file://` provider | `src/workbench/file-system-provider.ts` |
| VS Code terminal backend | `src/workbench/terminal-backend.ts` |
| Service overrides + boot | `src/workbench/main.ts` |
| Part layout and sashes | `src/workbench/layout.ts` |
| Worker routes | `worker/index.ts` |
| Sandbox routes (only container-aware file) | `worker/sandbox-routes.ts` |

Two details worth knowing before changing things:

**The headless xterm shim** (`src/runtime/headless-xterm.ts`). Nodepod's
`createTerminal()` wants an xterm constructor because it drives a real
terminal — it owns line editing, history, and raw mode. VS Code owns a real
xterm too and wants a *process*. The shim puts the two back to back: VS Code's
keystrokes arrive as `pushInput()`, and what Nodepod "renders" is forwarded to
VS Code as process output. Neither side reimplements the other.

**The sandbox import boundary.** `worker/sandbox-routes.ts` is the only module
that imports `@cloudflare/sandbox`. Nothing on the asset, service-worker, or
proxy path can reach it, which is what makes "no container until you ask for
one" enforceable in review rather than just documented.

## Known limitations

- **No title bar or status bar.** monaco-vscode-api v36 does not ship those
  parts. `layout.ts` detects the absence and collapses their tracks; the
  window indicator and command palette carry the runtime status instead.
- **No extension marketplace.** Extensions would need a Node extension host.
  The built-in runtime extension runs in the in-page host.
- **Terminal profiles do not carry per-terminal env.** Nodepod's terminals
  share the pod's environment.
- **Sandbox sync is one workspace deep and poll-based.** It skips
  `node_modules`, `.git`, `dist` and friends, and caps a push at 64 MB.
- **`SharedArrayBuffer` is required** for Nodepod's synchronous cross-worker
  filesystem, so every response needs COOP/COEP. The Worker and the dev
  servers set them; a host that strips them will degrade the runtime.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | vinext dev server (landing page + Worker routes) |
| `npm run dev:workbench` | Vite dev server for the IDE itself |
| `npm run build:workbench` | Build the IDE into `public/workbench/` |
| `npm run build` | Workbench + app |
| `npm run serve:workbench` | Static server with COOP/COEP + `/__sw__.js` |
| `npm run test:smoke` | Drive the built IDE in a real browser |
| `npm run type-check` | Both TypeScript programs (browser + Worker) |

The smoke test needs the static server running and a Chromium:

```bash
npm run serve:workbench &
CHROMIUM_PATH=/path/to/chrome npm run test:smoke
```
