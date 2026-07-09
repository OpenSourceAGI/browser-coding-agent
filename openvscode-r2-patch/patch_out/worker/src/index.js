import { Sandbox } from '@cloudflare/sandbox';
import * as fs from './r2fs.js';
import { startShellHandler, terminalWsHandler } from './shellSandbox.js';

export { Sandbox };

async function authenticate(request, env) {
  // Wire this to better-auth / your D1 users table. Returning a stable
  // userId is all the rest of this Worker needs.
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return null;
  const row = await env.DB.prepare(
    'SELECT user_id FROM sessions WHERE token = ?1 AND expires_at > ?2'
  ).bind(match[1], Date.now()).first();
  return row?.user_id ?? null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ---- static web IDE assets: plain asset serving, NO sandbox involved ----
    // Point [assets] in wrangler.jsonc at the vscode-web build output and let
    // the platform serve it; this branch only exists if you're proxying
    // manually instead of using the [assets] binding.
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    const userId = await authenticate(request, env);
    if (!userId) return new Response('unauthorized', { status: 401 });

    // ---- R2-backed filesystem API: no sandbox, no container, ever ----
    if (url.pathname === '/api/fs/stat') return fs.statHandler(request, env, userId);
    if (url.pathname === '/api/fs/readdir') return fs.readdirHandler(request, env, userId);
    if (url.pathname === '/api/fs/read') return fs.readFileHandler(request, env, userId);
    if (url.pathname === '/api/fs/write') return fs.writeFileHandler(request, env, userId);
    if (url.pathname === '/api/fs/mkdir') return fs.mkdirHandler(request, env, userId);
    if (url.pathname === '/api/fs/delete') return fs.deleteHandler(request, env, userId);
    if (url.pathname === '/api/fs/rename') return fs.renameHandler(request, env, userId);

    // ---- on-demand shell: the ONLY routes that boot/touch a Sandbox ----
    if (url.pathname === '/api/shell/start' && request.method === 'POST') {
      return startShellHandler(request, env, userId);
    }
    if (url.pathname === '/api/shell/ws') {
      return terminalWsHandler(request, env);
    }

    return new Response('not found', { status: 404 });
  },
};
