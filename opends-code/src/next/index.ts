import { createOpenDSRouter } from "../server/router.js";
import { CROSS_ORIGIN_ISOLATION_HEADERS } from "../workbench/html.js";
import type { OpenDSServerConfig } from "../server/types.js";

export type RouteHandler = (request: Request) => Promise<Response>;

export interface OpenDSNextHandlers {
  GET: RouteHandler;
  POST: RouteHandler;
  PUT: RouteHandler;
  DELETE: RouteHandler;
  HEAD: RouteHandler;
  OPTIONS: RouteHandler;
}

/**
 * App Router handlers for a catch-all route.
 *
 * ```ts
 * // app/api/opends/[...path]/route.ts
 * import { createOpenDSHandlers } from "@opensourceagi/opends-code/next";
 * import { R2BindingStore } from "@opensourceagi/opends-code/server";
 *
 * export const { GET, POST, PUT, DELETE } = createOpenDSHandlers({
 *   authorize: async (request) => {
 *     const session = await auth(request);       // your login, your rules
 *     return session ? { userId: session.user.id } : null;
 *   },
 *   store: new R2BindingStore(getBucket()),
 * });
 * ```
 */
export function createOpenDSHandlers(
  config: OpenDSServerConfig,
): OpenDSNextHandlers {
  const handle = createOpenDSRouter(config);
  return {
    GET: handle,
    POST: handle,
    PUT: handle,
    DELETE: handle,
    HEAD: handle,
    OPTIONS: handle,
  };
}

/**
 * `headers()` entries for `next.config.js`.
 *
 * Nodepod needs `SharedArrayBuffer`, which requires the page to be
 * cross-origin isolated — so the host page, the workbench route and the static
 * workbench assets all need COOP/COEP. Without these the editor still loads but
 * the runtime silently drops to its slower, less capable non-SAB mode.
 *
 * ```js
 * // next.config.js
 * const { openDSHeaders } = require("@opensourceagi/opends-code/next");
 * module.exports = { async headers() { return openDSHeaders(); } };
 * ```
 */
export function openDSHeaders(
  options: { paths?: string[] } = {},
): Array<{ source: string; headers: Array<{ key: string; value: string }> }> {
  const paths = options.paths ?? ["/:path*"];
  const headers = Object.entries(CROSS_ORIGIN_ISOLATION_HEADERS).map(
    ([key, value]) => ({ key, value }),
  );
  return paths.map((source) => ({ source, headers }));
}

/**
 * Middleware helper for hosts that would rather set the isolation headers per
 * request than globally in `next.config.js`.
 */
export function withOpenDSHeaders(response: Response): Response {
  for (const [key, value] of Object.entries(CROSS_ORIGIN_ISOLATION_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export { CROSS_ORIGIN_ISOLATION_HEADERS } from "../workbench/html.js";
export type { OpenDSServerConfig } from "../server/types.js";
