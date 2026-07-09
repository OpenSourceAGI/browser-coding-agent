// Direct R2 CRUD for the workspace tree. Every route here is served straight
// off the R2 binding -- there is no Sandbox, no container, no cold start.
// This is what the web UI's FileSystemProvider talks to.

const CACHE_TTL_MS = 5000;
const statCache = new Map();
const readdirCache = new Map();

function now() {
  return Date.now();
}

function getCache(cache, key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function setCache(cache, key, value, ttlMs = CACHE_TTL_MS) {
  cache.set(key, { value, expiresAt: now() + ttlMs });
}

function invalidatePathCaches(userId, path) {
  const abs = normalizeWorkspacePath(path);
  const parent = parentPath(abs);
  statCache.delete(cacheKey(userId, abs));
  readdirCache.delete(cacheKey(userId, abs));
  readdirCache.delete(cacheKey(userId, parent));
}

function invalidatePrefixCaches(userId, path) {
  const abs = normalizeWorkspacePath(path);
  const keyPrefix = `${userId}:${abs}`;
  const dirPrefix = `${userId}:readdir:${abs}`;
  for (const k of statCache.keys()) {
    if (k.startsWith(`${userId}:`) && (k.includes(`:${abs}`) || k.startsWith(keyPrefix))) {
      statCache.delete(k);
    }
  }
  for (const k of readdirCache.keys()) {
    if (k.startsWith(dirPrefix) || k === cacheKey(userId, abs) || k === cacheKey(userId, parentPath(abs))) {
      readdirCache.delete(k);
    }
  }
}

function cacheKey(userId, path) {
  return `${userId}:${normalizeWorkspacePath(path)}`;
}

function normalizeWorkspacePath(path) {
  const raw = String(path ?? '/');
  const parts = raw.split('/');
  const out = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') throw new Error('invalid path segment');
    out.push(part);
  }
  return `/${out.join('/')}`;
}

function parentPath(path) {
  if (path === '/') return '/';
  const idx = path.lastIndexOf('/');
  if (idx <= 0) return '/';
  return path.slice(0, idx);
}

function keyFor(userId, path) {
  // path comes in as a posix-style vscode Uri path, e.g. "/src/index.js"
  const clean = normalizeWorkspacePath(path).replace(/^\/+/, '');
  return `users/${userId}/workspace/${clean}`;
}

function dirKeyPrefix(userId, path) {
  const clean = normalizeWorkspacePath(path).replace(/^\/+/, '').replace(/\/+$/, '');
  return clean ? `users/${userId}/workspace/${clean}/` : `users/${userId}/workspace/`;
}

async function pathExistsAsDir(env, userId, path) {
  const prefix = dirKeyPrefix(userId, path);
  const listing = await env.WORKSPACES.list({ prefix, limit: 1 });
  return listing.objects.length > 0;
}

async function copyPrefix(env, fromPrefix, toPrefix) {
  let cursor;
  do {
    const listing = await env.WORKSPACES.list({ prefix: fromPrefix, cursor });
    for (const obj of listing.objects) {
      const suffix = obj.key.slice(fromPrefix.length);
      const source = await env.WORKSPACES.get(obj.key);
      if (source) {
        await env.WORKSPACES.put(`${toPrefix}${suffix}`, source.body);
      }
    }
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);
}

async function deletePrefix(env, prefix) {
  let cursor;
  do {
    const listing = await env.WORKSPACES.list({ prefix, cursor });
    if (listing.objects.length > 0) {
      await env.WORKSPACES.delete(listing.objects.map((o) => o.key));
    }
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);
}

export async function statHandler(request, env, userId) {
  const path = normalizeWorkspacePath(new URL(request.url).searchParams.get('path') ?? '/');
  const cached = getCache(statCache, cacheKey(userId, path));
  if (cached) return Response.json(cached);
  const key = keyFor(userId, path);

  const obj = await env.WORKSPACES.head(key);
  if (obj) {
    const result = {
      isDirectory: false,
      size: obj.size,
      ctime: obj.uploaded ? new Date(obj.uploaded).getTime() : Date.now(),
      mtime: obj.uploaded ? new Date(obj.uploaded).getTime() : Date.now(),
    };
    setCache(statCache, cacheKey(userId, path), result);
    return Response.json(result);
  }

  // directories are implicit in R2 -- treat "has any object under this prefix" as existing
  const prefix = dirKeyPrefix(userId, path);
  const listing = await env.WORKSPACES.list({ prefix, limit: 1 });
  if (listing.objects.length > 0 || path === '/' ) {
    const result = { isDirectory: true, size: 0, ctime: Date.now(), mtime: Date.now() };
    setCache(statCache, cacheKey(userId, path), result);
    return Response.json(result);
  }
  return new Response('not found', { status: 404 });
}

export async function readdirHandler(request, env, userId) {
  const path = normalizeWorkspacePath(new URL(request.url).searchParams.get('path') ?? '/');
  const cached = getCache(readdirCache, cacheKey(userId, path));
  if (cached) return Response.json(cached);
  const prefix = dirKeyPrefix(userId, path);

  const listing = await env.WORKSPACES.list({ prefix, delimiter: '/' });
  const entries = [];

  for (const p of listing.delimitedPrefixes ?? []) {
    const name = p.slice(prefix.length).replace(/\/$/, '');
    if (name) entries.push({ name, isDirectory: true });
  }
  for (const obj of listing.objects) {
    const name = obj.key.slice(prefix.length);
    if (name && !name.includes('/') && name !== '.keep') entries.push({ name, isDirectory: false });
  }
  setCache(readdirCache, cacheKey(userId, path), entries);
  return Response.json(entries);
}

export async function readFileHandler(request, env, userId) {
  const path = normalizeWorkspacePath(new URL(request.url).searchParams.get('path'));
  const key = keyFor(userId, path);
  const obj = await env.WORKSPACES.get(key);
  if (!obj) return new Response('not found', { status: 404 });
  return new Response(obj.body, {
    headers: { 'content-type': 'application/octet-stream' },
  });
}

export async function writeFileHandler(request, env, userId) {
  const url = new URL(request.url);
  const path = normalizeWorkspacePath(url.searchParams.get('path'));
  const create = url.searchParams.get('create') === 'true';
  const overwrite = url.searchParams.get('overwrite') === 'true';
  const key = keyFor(userId, path);

  const existing = await env.WORKSPACES.head(key);
  if (existing && !overwrite) return new Response('exists', { status: 409 });
  if (!existing && !create) return new Response('not found', { status: 404 });

  const body = await request.arrayBuffer();
  await env.WORKSPACES.put(key, body);
  invalidatePathCaches(userId, path);
  return new Response(null, { status: 204 });
}

export async function mkdirHandler(request, env, userId) {
  const path = normalizeWorkspacePath(new URL(request.url).searchParams.get('path'));
  // R2 has no real directories -- write a zero-byte marker so readdir can find it
  // even before any file is created inside it.
  const marker = `${dirKeyPrefix(userId, path)}.keep`;
  await env.WORKSPACES.put(marker, new Uint8Array(0));
  invalidatePathCaches(userId, path);
  return new Response(null, { status: 204 });
}

export async function deleteHandler(request, env, userId) {
  const url = new URL(request.url);
  const path = normalizeWorkspacePath(url.searchParams.get('path'));
  const recursive = url.searchParams.get('recursive') === 'true';
  const key = keyFor(userId, path);

  const obj = await env.WORKSPACES.head(key);
  if (obj) {
    await env.WORKSPACES.delete(key);
    invalidatePathCaches(userId, path);
    return new Response(null, { status: 204 });
  }

  if (recursive) {
    const prefix = dirKeyPrefix(userId, path);
    await deletePrefix(env, prefix);
    invalidatePrefixCaches(userId, path);
    return new Response(null, { status: 204 });
  }

  return new Response('not found', { status: 404 });
}

export async function renameHandler(request, env, userId) {
  const { from, to, overwrite } = await request.json();
  const fromPath = normalizeWorkspacePath(from);
  const toPath = normalizeWorkspacePath(to);
  const fromKey = keyFor(userId, fromPath);
  const toKey = keyFor(userId, toPath);

  const existing = await env.WORKSPACES.head(toKey);
  if (existing && !overwrite) return new Response('exists', { status: 409 });

  const obj = await env.WORKSPACES.get(fromKey);
  if (obj) {
    await env.WORKSPACES.put(toKey, obj.body);
    await env.WORKSPACES.delete(fromKey);
    invalidatePathCaches(userId, fromPath);
    invalidatePathCaches(userId, toPath);
    return new Response(null, { status: 204 });
  }

  const fromIsDir = await pathExistsAsDir(env, userId, fromPath);
  if (!fromIsDir) return new Response('not found', { status: 404 });

  const toHasObjects = await pathExistsAsDir(env, userId, toPath);
  if (toHasObjects && !overwrite) return new Response('exists', { status: 409 });
  if (toHasObjects && overwrite) {
    await deletePrefix(env, dirKeyPrefix(userId, toPath));
  }

  const fromPrefix = dirKeyPrefix(userId, fromPath);
  const toPrefix = dirKeyPrefix(userId, toPath);
  await copyPrefix(env, fromPrefix, toPrefix);
  await deletePrefix(env, fromPrefix);
  invalidatePrefixCaches(userId, fromPath);
  invalidatePrefixCaches(userId, toPath);
  return new Response(null, { status: 204 });
}
