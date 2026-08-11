# Running this checkout fully client-side

This fork is no longer the thing that serves the IDE. It is the *source* for a
browser-only workbench build that is then hosted as static files by
[`../opends-code`](../opends-code), with the filesystem, shell, processes and
npm supplied by Nodepod running in the browser.

## What changed conceptually

| Before | Now |
|---|---|
| `vscode-reh-web` — workbench **+** Remote Extension Host server | `vscode-web` — workbench only, no server process |
| A container per user, required before the editor is usable | No container. One is created only if a user opens a cloud terminal |
| File I/O over a socket to a Node process | `FileSystemProvider` → same-origin bridge → in-browser VFS |
| Terminal = pty in the container | Terminal = Nodepod shell in the tab; container is opt-in |
| Search = ripgrep in the container | `FileSearchProvider` / `TextSearchProvider` over the VFS |

The remote-server pieces of this tree (`src/vs/server`, `resources/server`) are
`.gitignore`d and unused by that path.

## Two ways to get a workbench

**1. Don't build this fork.** The default. `opends-code` stages a prebuilt
`vscode-web` distribution and loads the bridge at runtime through
`additionalBuiltinExtensions`, so no fork compile is involved at all:

```bash
cd ../opends-code
node scripts/fetch-workbench.mjs --out ../your-app/public/vscode
```

**2. Build this fork**, when you need fork-specific patches baked in:

```bash
cd ../opends-code
npm run build:extension
node scripts/install-into-openvscode.mjs --repo ../openvscode
```

That copies the bridge into `extensions/opends-bridge/`, registers it in
`product.json` under `builtInExtensions`, and grants it the
`fileSearchProvider` / `textSearchProvider` proposals. Then compile a
**`vscode-web-*`** gulp target — *not* `vscode-reh-web-*`, which bundles the
remote extension host server this architecture does not use — and stage the
output:

```bash
node scripts/fetch-workbench.mjs --out ../your-app/public/vscode \
  --source ../openvscode/out-vscode-web-min
```

> Note: the build gulpfiles (`build/gulpfile.*.js`) are not present in this
> checkout, so option 2 needs them restored from upstream first. Option 1 works
> today and is what the package is tested against.

## The one setting you must not change

`product.json` must **not** define `webEndpointUrlTemplate` together with
`commit` and `quality`. When all three are present, VS Code serves the web
extension host from a separate CDN origin; leaving them unset keeps that iframe
same-origin, which is what lets the bridge extension share a `BroadcastChannel`
with the host page. Set them and the editor still loads, but the explorer stays
empty because the bridge can never connect.

See [`../opends-code/ARCHITECTURE.md`](../opends-code/ARCHITECTURE.md) for the
full picture.
