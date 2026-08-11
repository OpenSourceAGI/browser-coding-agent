import handler from "vinext/server/app-router-entry";
import { serveSW } from "@scelar/nodepod/server";
import {
  handleSandboxRequest,
  type SandboxEnv,
  type SandboxVars,
} from "./sandbox-routes";

export { Sandbox } from "@cloudflare/sandbox";

interface Env extends SandboxEnv, SandboxVars {
  ASSETS: Fetcher;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

/**
 * SharedArrayBuffer — which Nodepod uses for synchronous cross-worker
 * filesystem reads and for blocking `execSync` — is only available in a
 * cross-origin-isolated document. Both headers must be present on every
 * document and worker response, not just the IDE page.
 */
const ISOLATION_HEADERS: Record<string, string> = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

function withIsolation(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(ISOLATION_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // Nodepod's service worker. It has to come from this origin at the root
    // scope; browsers refuse to register one served out of node_modules.
    if (url.pathname === "/__sw__.js") {
      return withIsolation(await serveSW(request));
    }

    // Container terminal + workspace mirroring. This is the only branch that
    // can touch a Sandbox, and it is never reached by the IDE itself.
    if (url.pathname.startsWith("/api/sandbox")) {
      return handleSandboxRequest(request, env, url);
    }

    // CORS proxy for code running inside Nodepod: an in-browser Node process
    // fetching a registry or an API is subject to browser CORS, which the
    // real Node it emulates is not.
    if (url.pathname.startsWith("/__np__/")) {
      return handleCorsProxy(request, url);
    }

    // The workbench is a separately built static bundle, served under a
    // friendlier path than its filename.
    if (url.pathname === "/ide" || url.pathname === "/ide/") {
      const asset = await env.ASSETS.fetch(
        new Request(new URL("/workbench/workbench.html", url), request),
      );
      return withIsolation(asset);
    }

    return withIsolation(await handler.fetch(request, env, ctx));
  },
};

async function handleCorsProxy(request: Request, url: URL): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  let target: URL;
  try {
    target = new URL(decodeURIComponent(url.pathname.slice("/__np__/".length)));
  } catch {
    return new Response("invalid proxy target", { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return new Response("invalid protocol", { status: 400 });
  }

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("origin");

  const upstream = await fetch(
    new Request(target, {
      method: request.method,
      headers,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : request.body,
    }),
  );

  const responseHeaders = new Headers(upstream.headers);
  for (const [key, value] of Object.entries(corsHeaders())) {
    responseHeaders.set(key, value);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Max-Age": "86400",
  };
}
