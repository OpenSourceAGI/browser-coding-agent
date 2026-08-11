import {
  buildWorkbenchHtml,
  workbenchResponseHeaders,
} from "../workbench/html.js";
import { FileRoutes, badRequest, json } from "./fs-routes.js";
import type { AuthContext, OpenDSServerConfig } from "./types.js";

/**
 * One `fetch` handler for every OpenDS route, framework-agnostic on purpose.
 *
 * Next.js, Hono, Bun, Workers and plain `Request`/`Response` tests all mount
 * the same function; `src/next` is a thin adapter over this.
 *
 * Routes (relative to `basePath`):
 *   GET    /workbench      the editor document (no auth: it contains no data)
 *   GET    /fs/list        manifest of the caller's workspace
 *   GET    /fs/read        one object
 *   PUT    /fs/write       one object
 *   POST   /fs/batch       many objects in a single request
 *   DELETE /fs/delete      one object or prefix
 *   POST   /sandbox/start  boot a container and mint a terminal WebSocket URL
 */
export function createOpenDSRouter(
  config: OpenDSServerConfig,
): (request: Request) => Promise<Response> {
  const basePath = (config.basePath ?? "/api/opends").replace(/\/+$/, "");
  const files = config.store ? new FileRoutes(config.store, config) : null;

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const route = routeOf(url.pathname, basePath);

    if (route === "/workbench" && request.method === "GET") {
      return serveWorkbench(url, config);
    }

    // The terminal WebSocket authenticates with the signed ticket minted by
    // `/sandbox/start`, because a browser cannot attach headers to a WS
    // handshake. It therefore bypasses `authorize()` by design.
    if (route === "/sandbox/ws") {
      if (!config.sandbox?.terminal) {
        return json({ error: "sandbox terminals are not available here" }, 501);
      }
      return config.sandbox.terminal(request);
    }

    const context = await config.authorize(request);
    if (!context?.userId) {
      return new Response("unauthorized", { status: 401 });
    }

    if (route.startsWith("/fs/")) {
      if (!files) {
        return json(
          { error: "no storage configured for this deployment" },
          501,
        );
      }
      switch (`${request.method} ${route}`) {
        case "GET /fs/list":
          return files.list(context);
        case "GET /fs/read":
          return files.read(context, url);
        case "PUT /fs/write":
          return files.write(context, url, request);
        case "POST /fs/batch":
          return files.batch(context, request);
        case "DELETE /fs/delete":
          return files.remove(context, url);
        default:
          return new Response("method not allowed", { status: 405 });
      }
    }

    if (route === "/sandbox/start" && request.method === "POST") {
      return startSandbox(request, context, config);
    }

    return new Response("not found", { status: 404 });
  };
}

/* -------------------------------------------------------------------------- */

function serveWorkbench(url: URL, config: OpenDSServerConfig): Response {
  const sessionId = url.searchParams.get("session");
  if (!sessionId) return badRequest("missing session parameter");

  const html = buildWorkbenchHtml({
    sessionId,
    // Relative asset URLs are resolved against the origin this document was
    // requested from, so the same build works on localhost, a preview
    // deployment and production without configuration.
    origin: url.origin,
    scheme: url.searchParams.get("scheme") ?? "opends",
    workspaceName: url.searchParams.get("workspace") ?? "workspace",
    sandboxAvailable:
      url.searchParams.get("sandbox") === "1" && Boolean(config.sandbox?.enabled),
    workbenchBaseUrl: config.workbenchBaseUrl ?? "/vscode",
    bridgeExtensionUrl: config.bridgeExtensionUrl ?? "/opends/extension",
    apiBase: config.basePath ?? "/api/opends",
    ...(config.additionalBuiltinExtensions
      ? { additionalBuiltinExtensions: config.additionalBuiltinExtensions }
      : {}),
    ...(config.settings ? { settings: config.settings } : {}),
    ...(config.extensionGallery
      ? { extensionGallery: config.extensionGallery }
      : {}),
    ...(config.productOverrides ? { overrides: config.productOverrides } : {}),
  });

  return new Response(html, { headers: workbenchResponseHeaders() });
}

async function startSandbox(
  request: Request,
  context: AuthContext,
  config: OpenDSServerConfig,
): Promise<Response> {
  if (!config.sandbox?.enabled) {
    return json({ error: "sandbox is not enabled for this deployment" }, 501);
  }

  const body = (await request.json().catch(() => ({}))) as {
    cols?: number;
    rows?: number;
    cwd?: string;
    command?: string;
    terminalId?: string;
  };

  try {
    const result = await config.sandbox.start(context, {
      cols: body.cols ?? 80,
      rows: body.rows ?? 24,
      cwd: body.cwd ?? "/workspace",
      ...(body.command ? { command: body.command } : {}),
      ...(body.terminalId ? { terminalId: body.terminalId } : {}),
      request,
    });
    return json(result);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      502,
    );
  }
}

/** Strips the mount point, tolerating both `/api/opends/fs/list` and `/fs/list`. */
function routeOf(pathname: string, basePath: string): string {
  if (basePath && pathname.startsWith(basePath)) {
    return pathname.slice(basePath.length) || "/";
  }
  return pathname;
}
