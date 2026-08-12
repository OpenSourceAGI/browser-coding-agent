# OpenDS Code on vinext + Cloudflare Workers

A complete Next.js App Router app running on [vinext](https://github.com/cloudflare/vinext)
(Next.js on Vite) and deployed as **one Worker**: the marketing page, the
editor, the storage routes and the optional container terminal.

```
Request
  │
  ├─ dist/client/**   ── Cloudflare asset layer (never reaches the Worker)
  │                      isolated by the `_headers` opendsVinext() emits
  │
  └─ Worker (worker/index.ts)
       ├─ /__sw__.js        Nodepod service worker
       ├─ /api/opends/**    workbench doc · R2 storage · sandbox terminal
       └─ everything else   vinext app router (RSC + SSR)
                            …with COOP/COEP stamped on the way out
```

## Run it

```bash
npm install                       # also stages the workbench into public/
npm run dev                       # vite dev, cross-origin isolated
```

`npm install` runs `stage:workbench`, which drops a `vscode-web` build into
`public/vscode` and the bridge extension into `public/opends/extension`. Both
are static files; nothing in them is generated at request time.

Without a login wired up the routes 401 by design. To click around locally, set
`ALLOW_ANONYMOUS=1` in `wrangler.jsonc` `vars` and open
`/editor?user=<anything>`.

## Deploy

```bash
npx wrangler r2 bucket create opends-workspaces
npx wrangler secret put SHELL_TICKET_SECRET      # 32+ random bytes
npm run deploy
```

Set `R2_ACCOUNT_ID` in `wrangler.jsonc` first. Cloud terminals stay disabled
until `SHELL_TICKET_SECRET` exists — the ticket it signs is the only thing
standing between a stranger and a shell in someone else's workspace.

To deploy without containers, delete the `containers`, `durable_objects` and
`migrations` blocks from `wrangler.jsonc` and the `@cloudflare/sandbox` import
from `worker/index.ts`. Everything else keeps working.

## The three places headers come from

Nodepod needs `SharedArrayBuffer`, which needs the document to be cross-origin
isolated, which is a property of the **whole origin** — one un-isolated
document loses it. On Workers that takes three mechanisms, because no single
one covers every response:

| | Covers | Configured in |
|---|---|---|
| `_headers` | static assets, which the asset layer serves without invoking the Worker | emitted by `opendsVinext()` |
| Worker wrapper | app pages, RSC payloads, OpenDS routes | `createOpenDSVinextWorker()` |
| `next.config` `headers()` | the same app running off-Workers (`vinext start`, Node) | `next.config.mjs` |

Drop the first and the workbench bundle loads un-isolated, `SharedArrayBuffer`
disappears, and the runtime silently falls back to its slower path — an
easy failure to misread as "the editor is just slow".

## Files

```
vite.config.ts       vinext() + opendsVinext() + cloudflare()
wrangler.jsonc       Worker entry, assets, R2, optional container
worker/index.ts      OpenDS routes in front of the app router
next.config.mjs      isolation headers for non-Worker hosts
app/page.tsx         server component, no editor code
app/editor/page.tsx  "use client" — mounts <OpenDSCode />
```
