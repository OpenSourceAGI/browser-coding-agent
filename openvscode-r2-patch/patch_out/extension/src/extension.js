const vscode = require('vscode');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function apiBase() {
  const cfg = vscode.workspace.getConfiguration('r2fs').get('apiBase', '');
  return String(cfg).replace(/\/+$/, '');
}

async function authedFetch(path, init = {}) {
  const base = apiBase();
  if (!base) throw vscode.FileSystemError.Unavailable('r2fs.apiBase is not configured');
  const res = await fetch(`${base}${path}`, {
    ...init,
    credentials: 'include', // same auth cookie/session as the rest of your app
  });
  return res;
}

// ---------------------------------------------------------------------------
// R2-backed FileSystemProvider
//
// No Sandbox, no container, no REH server involved in any of these calls --
// they hit a plain Worker route that reads/writes the R2 bucket directly.
// This is what lets the web UI boot with zero container cold-start.
// ---------------------------------------------------------------------------

class R2FileSystemProvider {
  constructor() {
    this._emitter = new vscode.EventEmitter();
    this.onDidChangeFile = this._emitter.event;
  }

  watch(_uri, _options) {
    // No push invalidation from R2 itself; poll-on-focus is good enough for v1.
    // Return a no-op disposable to satisfy the API.
    return new vscode.Disposable(() => {});
  }

  async stat(uri) {
    const res = await authedFetch(`/api/fs/stat?path=${encodeURIComponent(uri.path)}`);
    if (res.status === 404) throw vscode.FileSystemError.FileNotFound(uri);
    if (!res.ok) throw vscode.FileSystemError.Unavailable(uri);
    const meta = await res.json();
    return {
      type: meta.isDirectory ? vscode.FileType.Directory : vscode.FileType.File,
      ctime: meta.ctime,
      mtime: meta.mtime,
      size: meta.size,
    };
  }

  async readDirectory(uri) {
    const res = await authedFetch(`/api/fs/readdir?path=${encodeURIComponent(uri.path)}`);
    if (res.status === 404) throw vscode.FileSystemError.FileNotFound(uri);
    if (!res.ok) throw vscode.FileSystemError.Unavailable(uri);
    const entries = await res.json();
    return entries.map((e) => [e.name, e.isDirectory ? vscode.FileType.Directory : vscode.FileType.File]);
  }

  async readFile(uri) {
    const res = await authedFetch(`/api/fs/read?path=${encodeURIComponent(uri.path)}`);
    if (res.status === 404) throw vscode.FileSystemError.FileNotFound(uri);
    if (!res.ok) throw vscode.FileSystemError.Unavailable(uri);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }

  async writeFile(uri, content, options) {
    const res = await authedFetch(
      `/api/fs/write?path=${encodeURIComponent(uri.path)}&create=${!!options.create}&overwrite=${!!options.overwrite}`,
      { method: 'PUT', body: content }
    );
    if (res.status === 404) throw vscode.FileSystemError.FileNotFound(uri);
    if (res.status === 409) throw vscode.FileSystemError.FileExists(uri);
    if (!res.ok) throw vscode.FileSystemError.Unavailable(uri);
    this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  async rename(oldUri, newUri, options) {
    const res = await authedFetch('/api/fs/rename', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from: oldUri.path, to: newUri.path, overwrite: !!options.overwrite }),
    });
    if (!res.ok) throw vscode.FileSystemError.Unavailable(newUri);
    this._emitter.fire([
      { type: vscode.FileChangeType.Deleted, uri: oldUri },
      { type: vscode.FileChangeType.Created, uri: newUri },
    ]);
  }

  async delete(uri, options) {
    const res = await authedFetch(
      `/api/fs/delete?path=${encodeURIComponent(uri.path)}&recursive=${!!options.recursive}`,
      { method: 'DELETE' }
    );
    if (!res.ok) throw vscode.FileSystemError.Unavailable(uri);
    this._emitter.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
  }

  async createDirectory(uri) {
    const res = await authedFetch(`/api/fs/mkdir?path=${encodeURIComponent(uri.path)}`, { method: 'POST' });
    if (!res.ok) throw vscode.FileSystemError.Unavailable(uri);
    this._emitter.fire([{ type: vscode.FileChangeType.Created, uri }]);
  }
}

// ---------------------------------------------------------------------------
// On-demand shell: only touches Sandbox when the user actually opens a
// terminal. Boots (or resumes) a container, which mounts the SAME R2 bucket
// at /workspace, then streams a real PTY over WebSocket into a Pseudoterminal.
// ---------------------------------------------------------------------------

class SandboxPty {
  constructor() {
    this._writeEmitter = new vscode.EventEmitter();
    this._closeEmitter = new vscode.EventEmitter();
    this.onDidWrite = this._writeEmitter.event;
    this.onDidClose = this._closeEmitter.event;
    this._ws = null;
  }

  async open(initialDimensions) {
    this._writeEmitter.fire('\x1b[90mBooting sandbox shell...\x1b[0m\r\n');
    try {
      const res = await authedFetch('/api/shell/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cols: initialDimensions?.columns ?? 80,
          rows: initialDimensions?.rows ?? 24,
        }),
      });
      if (!res.ok) throw new Error(`shell/start failed: ${res.status}`);
      const { wsUrl } = await res.json();

      this._ws = new WebSocket(wsUrl);
      this._ws.binaryType = 'arraybuffer';

      this._ws.addEventListener('open', () => {
        this._writeEmitter.fire('\x1b[90mconnected.\x1b[0m\r\n');
      });
      this._ws.addEventListener('message', (ev) => {
        const text = typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data);
        this._writeEmitter.fire(text);
      });
      this._ws.addEventListener('close', () => this._closeEmitter.fire());
      this._ws.addEventListener('error', () => {
        this._writeEmitter.fire('\r\n\x1b[31mshell connection error\x1b[0m\r\n');
        this._closeEmitter.fire();
      });
    } catch (err) {
      this._writeEmitter.fire(`\r\n\x1b[31mfailed to start sandbox shell: ${String(err)}\x1b[0m\r\n`);
      this._closeEmitter.fire(1);
    }
  }

  close() {
    this._ws?.close();
  }

  handleInput(data) {
    this._ws?.readyState === WebSocket.OPEN && this._ws.send(JSON.stringify({ type: 'stdin', data }));
  }

  setDimensions(dims) {
    this._ws?.readyState === WebSocket.OPEN &&
      this._ws.send(JSON.stringify({ type: 'resize', cols: dims.columns, rows: dims.rows }));
  }
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

function activate(context) {
  const provider = new R2FileSystemProvider();
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider('r2fs', provider, {
      isCaseSensitive: true,
      isReadonly: false,
    })
  );

  context.subscriptions.push(
    vscode.window.registerTerminalProfileProvider('r2fs.shell', {
      provideTerminalProfile() {
        return { options: { name: 'R2 Sandbox Shell', pty: new SandboxPty() } };
      },
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
