import {
  getSandbox,
  proxyTerminal,
  type SandboxEnv,
} from "@cloudflare/sandbox";

export type { SandboxEnv };

/**
 * The one and only module that touches `@cloudflare/sandbox`.
 *
 * That boundary is the enforcement mechanism for "the IDE needs no server":
 * nothing on the asset path, the service-worker path, or the CORS proxy can
 * reach a container, so no container is ever created until a user explicitly
 * asks for a container terminal. Check this import graph in review, not just
 * the docs.
 */

/** Set to pin every browser session to a single shared container. */
export interface SandboxVars {
  SANDBOX_ID?: string;
}

/** Where the workspace is mirrored inside the container. */
const CONTAINER_WORKSPACE = "/workspace";
const SLEEP_AFTER = "20m";
const SESSION_COOKIE = "ovn_sandbox";

interface PushBody {
  sessionId?: string;
  clean?: boolean;
  files?: Array<{ path: string; content: string }>;
}

export async function handleSandboxRequest(
  request: Request,
  env: SandboxEnv & SandboxVars,
  url: URL,
): Promise<Response> {
  const route = url.pathname.slice("/api/sandbox".length);

  try {
    switch (route) {
      case "/session":
        return await createSession(request, env);
      case "/files/push":
        return await pushFiles(request, env);
      case "/files/changes":
        return await checkChanges(env, url);
      case "/files/list":
        return await listFiles(env, url);
      case "/files/read":
        return await readFile(env, url);
      case "/terminal":
        return await openTerminal(request, env, url);
      default:
        return new Response("not found", { status: 404 });
    }
  } catch (err) {
    // Surface the reason: the browser shows this text in the terminal, and
    // "500" alone is useless when a container fails to start.
    const message = err instanceof Error ? err.message : String(err);
    return new Response(message, { status: 500 });
  }
}

async function createSession(
  request: Request,
  env: SandboxEnv & SandboxVars,
): Promise<Response> {
  const sessionId = env.SANDBOX_ID ?? readSessionId(request) ?? crypto.randomUUID();
  const sandbox = getSandbox(env.Sandbox, sessionId, { sleepAfter: SLEEP_AFTER });
  await sandbox.mkdir(CONTAINER_WORKSPACE, { recursive: true });

  return Response.json(
    { sessionId, workspace: CONTAINER_WORKSPACE },
    {
      headers: {
        // Pin the browser to its container so a reload reattaches to the same
        // shell instead of provisioning a second one.
        "Set-Cookie": `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
      },
    },
  );
}

async function pushFiles(request: Request, env: SandboxEnv): Promise<Response> {
  const body = (await request.json()) as PushBody;
  const sessionId = requireSessionId(body.sessionId);
  const sandbox = getSandbox(env.Sandbox, sessionId, { sleepAfter: SLEEP_AFTER });

  if (body.clean) {
    // Start from an empty workspace so files deleted in the browser do not
    // linger in the container and reappear on the next pull.
    await sandbox.exec(
      `rm -rf ${CONTAINER_WORKSPACE}/* ${CONTAINER_WORKSPACE}/.[!.]* 2>/dev/null || true`,
    );
    await sandbox.mkdir(CONTAINER_WORKSPACE, { recursive: true });
  }

  let written = 0;
  for (const file of body.files ?? []) {
    const path = safeContainerPath(file.path);
    if (!path) continue;
    const dir = path.slice(0, path.lastIndexOf("/"));
    if (dir && dir !== CONTAINER_WORKSPACE) {
      await sandbox.mkdir(dir, { recursive: true });
    }
    // The SDK writes text; base64 keeps binary files intact end to end.
    await sandbox.writeFile(path, file.content, { encoding: "base64" });
    written++;
  }

  return Response.json({ written });
}

async function checkChanges(env: SandboxEnv & SandboxVars, url: URL): Promise<Response> {
  const sessionId = requireSessionId(url.searchParams.get("sessionId"));
  const sandbox = getSandbox(env.Sandbox, sessionId, { sleepAfter: SLEEP_AFTER });
  const since = url.searchParams.get("since") ?? undefined;

  const result = await sandbox.checkChanges(CONTAINER_WORKSPACE, {
    recursive: true,
    ...(since ? { since } : {}),
  });
  return Response.json({ status: result.status, version: result.version });
}

async function listFiles(env: SandboxEnv & SandboxVars, url: URL): Promise<Response> {
  const sessionId = requireSessionId(url.searchParams.get("sessionId"));
  const sandbox = getSandbox(env.Sandbox, sessionId, { sleepAfter: SLEEP_AFTER });

  const result = await sandbox.listFiles(CONTAINER_WORKSPACE, {
    recursive: true,
    includeHidden: true,
  });
  return Response.json({
    files: result.files.map((file) => ({
      path: file.absolutePath,
      type: file.type,
      size: file.size,
      modifiedAt: file.modifiedAt,
    })),
  });
}

async function readFile(env: SandboxEnv & SandboxVars, url: URL): Promise<Response> {
  const sessionId = requireSessionId(url.searchParams.get("sessionId"));
  const path = safeContainerPath(url.searchParams.get("path"));
  if (!path) return new Response("invalid path", { status: 400 });

  const sandbox = getSandbox(env.Sandbox, sessionId, { sleepAfter: SLEEP_AFTER });
  const result = await sandbox.readFile(path, { encoding: "base64" });
  const bytes = base64ToBytes(result.content);

  return new Response(bytes.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-store",
    },
  });
}

async function openTerminal(
  request: Request,
  env: SandboxEnv & SandboxVars,
  url: URL,
): Promise<Response> {
  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("expected websocket upgrade", { status: 426 });
  }
  const sessionId = requireSessionId(url.searchParams.get("sessionId"));
  const sandbox = getSandbox(env.Sandbox, sessionId, { sleepAfter: SLEEP_AFTER });

  // `terminal()` proxies the upgrade straight through to a PTY in the
  // container: binary frames carry terminal bytes, JSON text frames carry
  // resize and lifecycle messages.
  return proxyTerminal(sandbox, sessionId, request, {
    cols: Number(url.searchParams.get("cols")) || 80,
    rows: Number(url.searchParams.get("rows")) || 24,
  });
}

/* ---- helpers ---- */

function readSessionId(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ?? null;
}

function requireSessionId(value: string | null | undefined): string {
  if (!value) throw new Error("sessionId is required");
  return value;
}

/**
 * Keep every path inside the workspace. Without this a crafted `path` could
 * read or overwrite anything in the container image.
 */
function safeContainerPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const normalized = normalizePosix(path);
  if (normalized !== CONTAINER_WORKSPACE && !normalized.startsWith(`${CONTAINER_WORKSPACE}/`)) {
    return null;
  }
  return normalized;
}

function normalizePosix(path: string): string {
  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return `/${segments.join("/")}`;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
