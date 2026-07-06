import { create } from "zustand";
import type { FileNode } from '@/lib/mock-testing/mock-data';
import { useWorkspaceStore } from "@/stores/workspace-store";
import { saveProjectSnapshot, loadProjectSnapshot } from '@/lib/data-persistence/snapshot-db';

const DEFAULT_STARTER_FILES: Record<string, string> = {
  "/project/package.json": JSON.stringify(
    { name: "my-project", version: "1.0.0", main: "index.js" },
    null,
    2,
  ),
  "/project/index.js":
    'const http = require("http");\n\nconst server = http.createServer((req, res) => {\n  res.writeHead(200, { "Content-Type": "text/html" });\n  res.end("<h1>Hello from nodepod!</h1>");\n});\n\nserver.listen(3000, () => {\n  console.log("Server running on port 3000");\n});\n',
  "/project/README.md":
    "# My Project\n\nRun `node index.js` in the terminal to start the server.\n",
};

const TEMPLATE_STARTER_FILES: Record<string, Record<string, string>> = {
  blank: {
    "/project/package.json": JSON.stringify(
      { name: "my-project", version: "1.0.0" },
      null,
      2,
    ),
    "/project/index.js": 'console.log("Hello world!");\n',
  },
  react: {
    "/project/package.json": JSON.stringify(
      {
        name: "react-app",
        version: "1.0.0",
        scripts: { dev: "vite" },
        dependencies: { react: "^19", "react-dom": "^19" },
        devDependencies: { vite: "^7", "@vitejs/plugin-react": "^4" },
      },
      null,
      2,
    ),
    "/project/index.html":
      '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>React App</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n',
    "/project/src/main.jsx":
      'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\n\nReactDOM.createRoot(document.getElementById("root")).render(<App />);\n',
    "/project/src/App.jsx":
      'import { useState } from "react";\n\nexport default function App() {\n  const [count, setCount] = useState(0);\n\n  return (\n    <div style={{ fontFamily: "system-ui", textAlign: "center", padding: "4rem" }}>\n      <h1>Vite + React</h1>\n      <button onClick={() => setCount(c => c + 1)}\n        style={{ padding: "0.5rem 1rem", fontSize: "1rem", cursor: "pointer" }}>\n        count: {count}\n      </button>\n    </div>\n  );\n}\n',
    "/project/vite.config.js":
      'import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({\n  plugins: [react()],\n});\n',
  },
  node: DEFAULT_STARTER_FILES,
  vite: {
    "/project/package.json": JSON.stringify(
      {
        name: "vite-app",
        version: "1.0.0",
        scripts: { dev: "vite" },
        devDependencies: { vite: "^7" },
      },
      null,
      2,
    ),
    "/project/index.html":
      '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Vite App</title>\n  </head>\n  <body>\n    <h1>Hello Vite!</h1>\n    <p id="info"></p>\n    <script type="module" src="/main.js"></script>\n  </body>\n</html>\n',
    "/project/main.js":
      'document.getElementById("info").textContent = "Vite is running!";\nconsole.log("Hello from Vite");\n',
  },
};

type NodepodInstance = any;
type NodepodFSInstance = any;

let _vfsWatcher: { close(): void } | null = null;
let _refreshTimer: ReturnType<typeof setTimeout> | null = null;
let _snapshotTimer: ReturnType<typeof setTimeout> | null = null;
let _lastTreeHash = "";

// quick hash of the tree structure so we can skip no-op updates
function treeFingerprint(nodes: FileNode[]): string {
  const parts: string[] = [];
  function walk(ns: FileNode[]) {
    for (const n of ns) {
      parts.push(n.type === "folder" ? `d:${n.path}` : `f:${n.path}`);
      if (n.children) walk(n.children);
    }
  }
  walk(nodes);
  return parts.join("\n");
}
let _nodepodModuleCache: any = null;

let _vfsDirty = false;
let _cachedSnapshot: unknown = null;

function getCurrentProjectId(): string | null {
  return useWorkspaceStore.getState().currentProject?.id ?? null;
}

interface NodepodState {
  instance: NodepodInstance | null;
  booting: boolean;
  error: string | null;
  serverPorts: Map<number, string>;
  startupCommand: string | null;
  dirty: boolean;

  boot: (templateId?: string) => Promise<void>;
  teardown: () => void;
  refreshFileTree: () => Promise<void>;
  saveSnapshot: () => Promise<void>;
  restoreSnapshot: () => Promise<boolean>;
  getShareUrl: () => Promise<{ url: string } | { error: string } | null>;
}

async function vfsToFileNodes(
  fs: NodepodFSInstance,
  dirPath: string,
): Promise<FileNode[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dirPath);
  } catch {
    return [];
  }

  const folders: FileNode[] = [];
  const files: FileNode[] = [];
  for (const name of entries.sort()) {
    if (name === "node_modules" || name === ".cache" || name === ".npm")
      continue;
    const fullPath = dirPath.endsWith("/")
      ? `${dirPath}${name}`
      : `${dirPath}/${name}`;
    try {
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory) {
        const children = await vfsToFileNodes(fs, fullPath);
        folders.push({ name, type: "folder", path: fullPath, children });
      } else {
        files.push({ name, type: "file", path: fullPath });
      }
    } catch { /* skip */ }
  }
  return [...folders, ...files];
}

export const useNodepodStore = create<NodepodState>((set, get) => ({
  instance: null,
  booting: false,
  error: null,
  serverPorts: new Map(),
  startupCommand: null,
  dirty: false,

  boot: async (templateId?: string) => {
    if (get().booting) return;
    const existing = get().instance;
    if (existing) {
      get().teardown();
    }

    set({
      booting: true,
      error: null,
      instance: null,
      serverPorts: new Map(),
      startupCommand: null,
    });

    try {
      if (!_nodepodModuleCache)
        _nodepodModuleCache = await import("@scelar/nodepod");
      const Nodepod = _nodepodModuleCache.Nodepod;

      const files =
        TEMPLATE_STARTER_FILES[templateId ?? "node"] ?? DEFAULT_STARTER_FILES;

      const instance = await Nodepod.boot({
        files,
        workdir: "/project",
        swUrl: "/__sw__.js",
        allowedFetchDomains: [
          "api.zed.dev",
          "raw.githubusercontent.com",
          "github.com",
          "api.github.com",
          "registry.npmjs.org",
          "esm.sh",
          "unpkg.com",
          "cdn.jsdelivr.net",
        ],
        onServerReady: (port: number, url: string) => {
          set((s) => {
            const newPorts = new Map(s.serverPorts);
            newPorts.set(port, url);
            return { serverPorts: newPorts };
          });
          const ws = useWorkspaceStore.getState();
          ws.openTab("tab:browser");
        },
      });

      const wsTemplates = useWorkspaceStore.getState().templates;
      const matchedTemplate = templateId
        ? wsTemplates.find((t) => t.id === templateId)
        : null;
      const startupCmd = matchedTemplate?.startupCommand ?? null;

      set({ instance, booting: false, startupCommand: startupCmd });

      // Enable CORS proxy so Nodepod's http/https polyfills can make
      // outgoing requests through the server, bypassing browser CORS.
      try {
        localStorage.setItem("__corsProxyUrl", "/__np__/");
      } catch { /* ignore in SSR */ }

      const projectId = getCurrentProjectId();
      if (projectId) {
        try {
          const snapshot = await loadProjectSnapshot(projectId);
          if (snapshot) {
            await instance.restore(snapshot);
          }
        } catch (e) {
          console.error("Failed to restore snapshot:", e);
        }
      }

      await get().refreshFileTree();

      if (_vfsWatcher) {
        _vfsWatcher.close();
        _vfsWatcher = null;
      }
      _vfsWatcher = instance.fs.watch("/project", { recursive: true }, () => {
        _vfsDirty = true;
        if (!get().dirty) set({ dirty: true });
        if (_refreshTimer) clearTimeout(_refreshTimer);
        _refreshTimer = setTimeout(() => {
          _refreshTimer = null;
          get().refreshFileTree();
        }, 200);
        if (_snapshotTimer) clearTimeout(_snapshotTimer);
        _snapshotTimer = setTimeout(() => {
          _snapshotTimer = null;
          if (_vfsDirty) get().saveSnapshot();
        }, 30_000);
      });
    } catch (e: any) {
      set({ error: e?.message || "Failed to boot nodepod", booting: false });
      console.error("Nodepod boot error:", e);
    }
  },

  teardown: () => {
    if (_vfsWatcher) {
      _vfsWatcher.close();
      _vfsWatcher = null;
    }
    if (_snapshotTimer) {
      clearTimeout(_snapshotTimer);
      _snapshotTimer = null;
    }
    if (_refreshTimer) {
      clearTimeout(_refreshTimer);
      _refreshTimer = null;
    }
    const instance = get().instance;
    if (instance) {
      try {
        instance.teardown();
      } catch {
        /* ignore */
      }
    }
    _vfsDirty = false;
    _cachedSnapshot = null;
    _lastTreeHash = "";
    set({ instance: null, serverPorts: new Map(), error: null, dirty: false });
  },

  refreshFileTree: async () => {
    const instance = get().instance;
    if (!instance) return;

    try {
      const tree = await vfsToFileNodes(instance.fs, "/project");
      const hash = treeFingerprint(tree);
      if (hash === _lastTreeHash) return;
      _lastTreeHash = hash;
      useWorkspaceStore.getState().setProjectFiles(tree);
    } catch (e) {
      console.error("Failed to refresh file tree:", e);
    }
  },

  saveSnapshot: async () => {
    const instance = get().instance;
    if (!instance) return;
    const projectId = getCurrentProjectId();
    if (!projectId) return;
    if (!_vfsDirty && _cachedSnapshot) {
      await saveProjectSnapshot(projectId, _cachedSnapshot);
      set({ dirty: false });
      return;
    }
    try {
      await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      const snapshot = instance.snapshot();
      _cachedSnapshot = snapshot;
      _vfsDirty = false;
      set({ dirty: false });
      await saveProjectSnapshot(projectId, snapshot);
    } catch (e) {
      console.error("Failed to save snapshot:", e);
    }
  },

  restoreSnapshot: async () => {
    const instance = get().instance;
    if (!instance) return false;
    const projectId = getCurrentProjectId();
    if (!projectId) return false;
    try {
      const snapshot = await loadProjectSnapshot(projectId);
      if (!snapshot) return false;
      await instance.restore(snapshot);
      await get().refreshFileTree();
      return true;
    } catch (e) {
      console.error("Failed to restore snapshot:", e);
      return false;
    }
  },

  getShareUrl: async () => {
    const instance = get().instance;
    if (!instance) return null;
    const ws = useWorkspaceStore.getState();
    if (!ws.currentProject) return null;
    try {
      await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      const snapshot = (!_vfsDirty && _cachedSnapshot)
        ? _cachedSnapshot
        : instance.snapshot();
      _cachedSnapshot = snapshot;
      _vfsDirty = false;
      const { createShareUrl } = await import("@/lib/sharing-collaboration/share");
      return await createShareUrl(
        ws.currentProject.name,
        ws.currentProject.templateId || "blank",
        snapshot,
      );
    } catch (e) {
      console.error("Failed to create share URL:", e);
      return { error: "Failed to create share URL" };
    }
  },
}));
