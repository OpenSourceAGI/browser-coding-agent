// This module is the ONLY place Sandbox/Containers get touched. Nothing in
// r2fs.js or the static-asset route below ever calls getSandbox() -- so the
// editor UI, file tree, opening/saving files, and diffing all work with zero
// container involved. A container only spins up the moment someone opens a
// terminal panel.

import { getSandbox } from '@cloudflare/sandbox';

const MOUNT_ROOT = '/mnt/r2'; // whole bucket mounted here once per container
const SESSION_TTL_MS = 20 * 60 * 1000; // matches sleepAfter below

async function ensureShellReady(env, userId) {
  const sandbox = getSandbox(env.Sandbox, `shell-${userId}`, {
    sleepAfter: '20m',
  });

  // Idempotent: mounting twice is a no-op error we can safely swallow.
  try {
    await sandbox.mountBucket('vscode-workspaces', MOUNT_ROOT, {
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentialProxy: true,
    });
  } catch (err) {
    if (!String(err).includes('already mounted')) throw err;
  }

  // Bind the user's own subtree to /workspace so the shell only ever sees
  // its own files, even though the whole bucket is technically mounted.
  // (Prefix-scoped mounts aren't supported by the SDK yet -- this symlink
  // is the workaround. Move to bucket-per-user if you need a hard boundary
  // against a user escaping via `cd ../other-user`.)
  await sandbox.exec(
    `mkdir -p ${MOUNT_ROOT}/users/${userId}/workspace && ` +
    `ln -sfn ${MOUNT_ROOT}/users/${userId}/workspace /workspace`
  );

  return sandbox;
}

export async function startShellHandler(request, env, userId) {
  const { cols, rows } = await request.json().catch(() => ({}));
  await ensureShellReady(env, userId);

  // Hand the browser a same-origin WS URL; the actual upgrade + PTY proxy
  // happens in terminalWsHandler below via sandbox.terminal(request).
  const token = await mintShellToken(env, userId);
  const wsUrl = new URL(request.url);
  wsUrl.pathname = '/api/shell/ws';
  wsUrl.protocol = wsUrl.protocol.replace('http', 'ws');
  wsUrl.searchParams.set('token', token);
  if (cols) wsUrl.searchParams.set('cols', String(cols));
  if (rows) wsUrl.searchParams.set('rows', String(rows));

  return Response.json({ wsUrl: wsUrl.toString() });
}

export async function terminalWsHandler(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const userId = await verifyShellToken(env, token); // throws/returns null if invalid
  if (!userId) return new Response('unauthorized', { status: 401 });

  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('expected websocket', { status: 400 });
  }

  const sandbox = getSandbox(env.Sandbox, `shell-${userId}`);

  // One persistent bash session per user; reconnects (tab reload, network
  // blip) attach to the same PTY instead of spawning a new shell. The
  // container-side ring buffer replays missed output automatically.
  const session = await sandbox.createSession({ id: `main`, cwd: '/workspace' });

  // sandbox.terminal() proxies the WS upgrade straight to the container PTY --
  // binary frames for I/O, JSON text frames for resize/status, per the SDK's
  // terminal protocol.
  return sandbox.terminal(request, { session });
}

// --- minimal signed-token helpers (swap for your real session/auth system) ---

async function mintShellToken(env, userId) {
  const payload = `${userId}.${Date.now() + SESSION_TTL_MS}`;
  const sig = await hmac(env.SHELL_TOKEN_SECRET, payload);
  return btoa(`${payload}.${sig}`);
}

async function verifyShellToken(env, token) {
  try {
    const decoded = atob(token);
    const [userId, expStr, sig] = decoded.split('.');
    const payload = `${userId}.${expStr}`;
    const expected = await hmac(env.SHELL_TOKEN_SECRET, payload);
    if (expected !== sig) return null;
    if (Date.now() > Number(expStr)) return null;
    return userId;
  } catch {
    return null;
  }
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
