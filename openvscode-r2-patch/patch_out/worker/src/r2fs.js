// Direct R2 CRUD for the workspace tree. Every route here is served straight
// off the R2 binding -- there is no Sandbox, no container, no cold start.
// This is what the web UI's FileSystemProvider talks to.

function keyFor(userId, path) {
  // path comes in as a posix-style vscode Uri path, e.g. "/src/index.js"
  const clean = path.replace(/^\/+/, '');
  return `users/${userId}/workspace/${clean}`;
}

function dirKeyPrefix(userId, path) {
  const clean = path.replace(/^\/+/, '').replace(/\/+$/, '');
  return clean ? `users/${userId}/workspace/${clean}/` : `users/${userId}/workspace/`;
}

export async function statHandler(request, env, userId) {
  const path = new URL(request.url).searchParams.get('path') ?? '/';
  const key = keyFor(userId, path);

  const obj = await env.WORKSPACES.head(key);
  if (obj) {
    return Response.json({
      isDirectory: false,
      size: obj.size,
      ctime: obj.uploaded ? new Date(obj.uploaded).getTime() : Date.now(),
      mtime: obj.uploaded ? new Date(obj.uploaded).getTime() : Date.now(),
    });
  }

  // directories are implicit in R2 -- treat "has any object under this prefix" as existing
  const prefix = dirKeyPrefix(userId, path);
  const listing = await env.WORKSPACES.list({ prefix, limit: 1 });
  if (listing.objects.length > 0 || path === '/' ) {
    return Response.json({ isDirectory: true, size: 0, ctime: Date.now(), mtime: Date.now() });
  }
  return new Response('not found', { status: 404 });
}

export async function readdirHandler(request, env, userId) {
  const path = new URL(request.url).searchParams.get('path') ?? '/';
  const prefix = dirKeyPrefix(userId, path);

  const listing = await env.WORKSPACES.list({ prefix, delimiter: '/' });
  const entries = [];

  for (const p of listing.delimitedPrefixes ?? []) {
    const name = p.slice(prefix.length).replace(/\/$/, '');
    if (name) entries.push({ name, isDirectory: true });
  }
  for (const obj of listing.objects) {
    const name = obj.key.slice(prefix.length);
    if (name && !name.includes('/')) entries.push({ name, isDirectory: false });
  }
  return Response.json(entries);
}

export async function readFileHandler(request, env, userId) {
  const path = new URL(request.url).searchParams.get('path');
  const key = keyFor(userId, path);
  const obj = await env.WORKSPACES.get(key);
  if (!obj) return new Response('not found', { status: 404 });
  return new Response(obj.body, {
    headers: { 'content-type': 'application/octet-stream' },
  });
}

export async function writeFileHandler(request, env, userId) {
  const url = new URL(request.url);
  const path = url.searchParams.get('path');
  const create = url.searchParams.get('create') === 'true';
  const overwrite = url.searchParams.get('overwrite') === 'true';
  const key = keyFor(userId, path);

  const existing = await env.WORKSPACES.head(key);
  if (existing && !overwrite) return new Response('exists', { status: 409 });
  if (!existing && !create) return new Response('not found', { status: 404 });

  const body = await request.arrayBuffer();
  await env.WORKSPACES.put(key, body);
  return new Response(null, { status: 204 });
}

export async function mkdirHandler(request, env, userId) {
  const path = new URL(request.url).searchParams.get('path');
  // R2 has no real directories -- write a zero-byte marker so readdir can find it
  // even before any file is created inside it.
  const marker = `${dirKeyPrefix(userId, path)}.keep`;
  await env.WORKSPACES.put(marker, new Uint8Array(0));
  return new Response(null, { status: 204 });
}

export async function deleteHandler(request, env, userId) {
  const url = new URL(request.url);
  const path = url.searchParams.get('path');
  const recursive = url.searchParams.get('recursive') === 'true';
  const key = keyFor(userId, path);

  const obj = await env.WORKSPACES.head(key);
  if (obj) {
    await env.WORKSPACES.delete(key);
    return new Response(null, { status: 204 });
  }

  if (recursive) {
    const prefix = dirKeyPrefix(userId, path);
    let cursor;
    do {
      const listing = await env.WORKSPACES.list({ prefix, cursor });
      if (listing.objects.length) {
        await env.WORKSPACES.delete(listing.objects.map((o) => o.key));
      }
      cursor = listing.truncated ? listing.cursor : undefined;
    } while (cursor);
    return new Response(null, { status: 204 });
  }

  return new Response('not found', { status: 404 });
}

export async function renameHandler(request, env, userId) {
  const { from, to, overwrite } = await request.json();
  const fromKey = keyFor(userId, from);
  const toKey = keyFor(userId, to);

  const existing = await env.WORKSPACES.head(toKey);
  if (existing && !overwrite) return new Response('exists', { status: 409 });

  const obj = await env.WORKSPACES.get(fromKey);
  if (!obj) return new Response('not found', { status: 404 });

  await env.WORKSPACES.put(toKey, obj.body);
  await env.WORKSPACES.delete(fromKey);
  return new Response(null, { status: 204 });
}
