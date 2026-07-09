# OpenVSCode, patched: R2-only web UI, Sandbox only for the shell

This replaces the earlier "sandbox runs the whole IDE" design with the pattern
vscode.dev / github.dev use: **the web client runs with zero backend**, backed
by a `FileSystemProvider` extension that talks to R2 over plain HTTP. A
Sandbox container is only created the moment a user opens an integrated
terminal — editing, browsing, saving, diffing, and searching never touch it.

```
Browser (vscode-web static build, no REH server)
   │
   ├─ file open/save/list  ──► Worker /api/fs/*  ──► R2 binding directly
   │                                                   (no container, ever)
   │
   └─ terminal opened      ──► Worker /api/shell/start ──► getSandbox() boots
                                       │                    a container on demand
                                       └─► Worker /api/shell/ws ──► sandbox.terminal()
                                                                     (PTY, xterm protocol)
```

Verified locally: `npx wrangler deploy --dry-run --containers-rollout=none`
resolves every binding (Sandbox DO, D1, R2, Assets) and bundles cleanly — see
`worker/` output. The container itself only fails to build in this sandbox
because there's no Docker daemon here; that step is unaffected by any of the
application code.

## What changed vs. the "sandbox runs the IDE" version

1. **No `vscode-reh-web` server anywhere.** Build (or fetch a release of) the
   plain **`vscode-web`** browser bundle instead — the same shape as
   vscode.dev, no Node process required client-side. If you're patching an
   openvscode-server checkout, look for the browser-only gulp targets
   (`vscode-web-*`) rather than `vscode-reh-web-*`; the REH targets bundle a
   Remote Extension Host server you no longer need.
2. **A workspace virtual filesystem, not a real one.** `extension/` is a
   built-in web extension that registers `r2fs:` as a scheme via
   `vscode.workspace.registerFileSystemProvider`. VS Code calls this a
   "virtual workspace" — first-class, no server required
   (https://code.visualstudio.com/api/extension-guides/virtual-workspaces).
   Open the IDE on `r2fs:/` and every file op is a `fetch()` to your Worker.
3. **Sandbox is imported in exactly one file:** `worker/src/shellSandbox.js`.
   `index.js`'s file routes never import `@cloudflare/sandbox`. This is the
   enforcement mechanism for "web UI never needs the sandbox" — check that
   import graph in code review, not just the docs.
4. **Terminal uses the SDK's real terminal API**, not a hand-rolled PTY:
   `sandbox.terminal(request, { session })` proxies a WebSocket upgrade
   straight to a bash PTY in the container, with binary frames for I/O and
   JSON frames for resize/control
   (https://developers.cloudflare.com/sandbox/concepts/terminal/). Sessions
   persist server-side, so a dropped tab or reload reattaches to the same
   shell instead of losing state.
5. **RPC transport, not WebSocket/HTTP transport.** Cloudflare deprecated the
   old transports for the SDK as of April 2026 and removes them after
   2026-07-09 — `wrangler.jsonc` already sets `SANDBOX_TRANSPORT: "rpc"`
   (https://developers.cloudflare.com/sandbox/guides/2026-deprecation/).
   `exposePort()` is also being replaced by a tunnels API; this design
   doesn't need `exposePort` at all anymore, since nothing public-facing runs
   in the container.

## Files

```
Dockerfile                     container image, only pulled when a shell boots
extension/
  package.json                 browser-only web extension manifest
  esbuild.js                   bundles for the browser (no Node built-ins)
  src/extension.js             R2FileSystemProvider + on-demand SandboxPty
worker/
  wrangler.jsonc                assets + R2 + D1 + Sandbox container bindings
  src/index.js                  router: static assets, /api/fs/*, /api/shell/*
  src/r2fs.js                   pure R2 CRUD -- no sandbox import
  src/shellSandbox.js           the ONLY file that imports @cloudflare/sandbox
```

## Wiring it up

1. **Build the extension:**
   ```bash
   cd extension && npm install && npm run build   # -> dist/extension.js
   ```
   Already verified in this session (esbuild, no errors).

2. **Register it as a built-in extension** of your `vscode-web` build. In an
   openvscode-server-derived build this goes in `product.json`:
   ```json
   { "builtInExtensions": [{ "name": "vtempest.r2fs-provider", "path": "extensions/r2fs-provider" }] }
   ```
   Copy `extension/package.json` + `extension/dist/` into that path in the
   static build output.

3. **Point the web client at the virtual workspace.** However you construct
   the initial workbench options (`product.json` default folder, or the
   `folderUri` query param your host page sets), use
   `r2fs:/` as the folder URI instead of a `vscode-remote://` authority.
   No `--connection-token`, no remote authority resolver needed.

4. **Set `r2fs.apiBase`** (Worker origin) via the extension's default
   configuration or a workspace settings file baked into your host page.

5. **Deploy the Worker:**
   ```bash
   cd worker
   npm install
   npx wrangler secret put SHELL_TOKEN_SECRET     # random 32+ byte string
   npx wrangler secret put R2_ACCESS_KEY_ID        # for mountBucket()
   npx wrangler secret put R2_SECRET_ACCESS_KEY
   npx wrangler deploy
   ```
   First deploy builds the container image (needs Docker locally) — that
   only happens once, and the container itself won't *run* until a user
   opens a terminal.

6. **Serve the vscode-web static build** into `worker/public/` (the `assets`
   binding in `wrangler.jsonc`), replacing the placeholder `index.html`
   created for the dry-run check.

## Known limitation carried over

Prefix-scoped R2 mounts aren't supported by the Sandbox SDK yet (open
feature request: https://community.cloudflare.com/t/sandbox-sdk-support-mounting-specific-bucket-subdirectories-prefixes/878401).
`shellSandbox.js` works around it by mounting the whole bucket once and
symlinking each user's own prefix to `/workspace` inside their own
container — sufficient isolation for "user can't casually browse siblings,"
but a user who deliberately runs `cd /mnt/r2/users/other-id` in their shell
can still read another user's files. Move to bucket-per-user if that's
unacceptable for your threat model; nothing else in this design needs to
change to do that migration.
