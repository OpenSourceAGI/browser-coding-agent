#!/usr/bin/env node
/**
 * End-to-end smoke test for the bridge.
 *
 * Runs the *built* `dist/` against a fake Nodepod runtime and a real
 * `BroadcastChannel` (global in Node 18+), driving it through a `BridgeClient`
 * exactly as the VS Code extension does. This exercises the parts that are
 * otherwise only observable in a browser: envelope routing, error code
 * translation, watcher fan-out, the headless-xterm terminal path and the
 * debounced R2 sync.
 *
 *   node tests/smoke.mjs
 */

import assert from "node:assert/strict";

import { OpenDSSession } from "../dist/client/session.js";
import { BridgeClient } from "../dist/protocol/channel.js";
import { MemoryStorage } from "../dist/storage/memory-storage.js";
import { fuzzyScore } from "../dist/client/search-service.js";
import { encodeBatch, decodeBatch } from "../dist/storage/http-storage.js";
import { globToRegExp, isExcludedDirectory, normalizePath } from "../dist/protocol/paths.js";
import {
  applyIsolationHeaders,
  createOpenDSVinextHandlers,
  createOpenDSVinextWorker,
  openDSAssetHeaders,
  opendsVinext,
} from "../dist/vinext/index.js";

const results = [];
let failures = 0;

async function test(name, fn) {
  try {
    await fn();
    results.push(`  ok   ${name}`);
  } catch (error) {
    failures++;
    results.push(`  FAIL ${name}\n       ${error?.message ?? error}`);
  }
}

/* -------------------------------------------------------------------------- */
/* A minimal in-memory Nodepod stand-in                                        */
/* -------------------------------------------------------------------------- */

function createFakeNodepod() {
  /** @type {Map<string, Uint8Array|null>} null marks a directory */
  const files = new Map([["/workspace", null]]);
  const watchers = new Set();

  const enoent = (path) => {
    const error = new Error(`ENOENT: no such file or directory, '${path}'`);
    error.code = "ENOENT";
    return error;
  };

  const notify = (event, path) => {
    for (const watcher of watchers) {
      if (path === watcher.path || path.startsWith(`${watcher.path}/`)) {
        const relative = path === watcher.path ? null : path.slice(watcher.path.length + 1);
        watcher.callback(event, relative);
      }
    }
  };

  const ensureDirs = (path) => {
    const parts = path.split("/").filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      const dir = `/${parts.slice(0, i).join("/")}`;
      if (!files.has(dir)) files.set(dir, null);
    }
  };

  const fs = {
    async exists(path) {
      return files.has(normalizePath(path));
    },
    async stat(path) {
      const key = normalizePath(path);
      if (!files.has(key)) throw enoent(key);
      const value = files.get(key);
      return {
        isFile: value !== null,
        isDirectory: value === null,
        size: value?.byteLength ?? 0,
        mtime: 1_700_000_000_000,
      };
    },
    async readFile(path, encoding) {
      const key = normalizePath(path);
      const value = files.get(key);
      if (value === undefined || value === null) throw enoent(key);
      return encoding ? new TextDecoder().decode(value) : value;
    },
    async writeFile(path, data) {
      const key = normalizePath(path);
      ensureDirs(key);
      files.set(
        key,
        typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data),
      );
      notify("change", key);
    },
    async mkdir(path) {
      const key = normalizePath(path);
      ensureDirs(key);
      files.set(key, null);
      notify("rename", key);
    },
    async readdir(path) {
      const key = normalizePath(path);
      if (!files.has(key)) throw enoent(key);
      const prefix = key === "/" ? "/" : `${key}/`;
      const names = new Set();
      for (const candidate of files.keys()) {
        if (!candidate.startsWith(prefix) || candidate === key) continue;
        names.add(candidate.slice(prefix.length).split("/")[0]);
      }
      return [...names];
    },
    async unlink(path) {
      files.delete(normalizePath(path));
    },
    async rm(path, options) {
      const key = normalizePath(path);
      if (!files.has(key) && !options?.force) throw enoent(key);
      for (const candidate of [...files.keys()]) {
        if (candidate === key || candidate.startsWith(`${key}/`)) files.delete(candidate);
      }
      notify("rename", key);
    },
    async rename(from, to) {
      const fromKey = normalizePath(from);
      const toKey = normalizePath(to);
      for (const candidate of [...files.keys()]) {
        if (candidate === fromKey || candidate.startsWith(`${fromKey}/`)) {
          files.set(toKey + candidate.slice(fromKey.length), files.get(candidate));
          files.delete(candidate);
        }
      }
      notify("rename", fromKey);
      notify("rename", toKey);
    },
    watch(path, _options, callback) {
      const watcher = { path: normalizePath(path), callback };
      watchers.add(watcher);
      return { close: () => watchers.delete(watcher) };
    },
  };

  return {
    fs,
    _files: files,
    async spawn(_cmd, args) {
      const command = args?.[1] ?? "";
      const listeners = { output: [], error: [], exit: [] };
      // Mirrors Nodepod: `completion` resolves with the fully buffered output,
      // and streamed chunks may fire before the caller attaches listeners.
      const stdout = `ran: ${command}\n`;
      const proc = {
        on: (event, listener) => listeners[event]?.push(listener),
        completion: new Promise((resolve) =>
          setTimeout(() => {
            for (const listener of listeners.exit) listener(0);
            resolve({ stdout, stderr: "", exitCode: 0 });
          }, 5),
        ),
      };
      // Emitted immediately — before the caller has subscribed — which is the
      // race the completion payload exists to cover.
      for (const listener of listeners.output) listener(stdout);
      return proc;
    },
    async install(packages) {
      return { installed: packages ?? [] };
    },
    createTerminal({ Terminal }) {
      let term = null;
      return {
        attach() {
          term = new Terminal();
          // Stand in for Nodepod's line editor: echo input, print a prompt.
          term.onData((data) => term.write(`echo:${data}`));
          term.write("$ ");
        },
        write: (data) => term?.write(data),
        input: (text) => term?.write(`ran:${text.trim()}\r\n`),
        detach() {},
      };
    },
    port: (num) => `https://preview-${num}.example.dev`,
    teardown() {},
  };
}

/* -------------------------------------------------------------------------- */

const sessionId = `smoke-${Date.now()}`;
const nodepod = createFakeNodepod();
const storage = new MemoryStorage();

const session = new OpenDSSession({
  sessionId,
  nodepod,
  storage,
  syncDebounceMs: 20,
  initialFiles: {
    "/package.json": '{"name":"smoke","scripts":{"start":"node index.js"}}',
    "/src/index.js": "console.log('hello');\nconsole.log('again');\n",
  },
});

await session.start();

const client = new BridgeClient({ session: sessionId, timeoutMs: 5000 });

await test("runtime reports ready with the configured workspace", async () => {
  const info = await client.request("runtime.info", undefined);
  assert.equal(info.ready, true);
  assert.equal(info.workspaceRoot, "/workspace");
  assert.equal(info.persistence.enabled, true);
});

await test("initial files are seeded and readable", async () => {
  const { data } = await client.request("fs.readFile", { path: "/package.json" });
  assert.match(new TextDecoder().decode(data), /"name":"smoke"/);
});

await test("readDirectory reports types", async () => {
  const entries = await client.request("fs.readDirectory", { path: "/" });
  const map = Object.fromEntries(entries);
  assert.equal(map["package.json"], 1, "package.json should be a File");
  assert.equal(map["src"], 2, "src should be a Directory");
});

await test("write then stat round-trips through the VFS", async () => {
  await client.request("fs.writeFile", {
    path: "/src/added.ts",
    data: new TextEncoder().encode("export const x = 1;\n"),
    create: true,
    overwrite: true,
  });
  const stat = await client.request("fs.stat", { path: "/src/added.ts" });
  assert.equal(stat.type, 1);
  assert.equal(stat.size, 20);
});

await test("missing file surfaces as FileNotFound, not a generic failure", async () => {
  await assert.rejects(
    () => client.request("fs.stat", { path: "/nope.txt" }),
    (error) => {
      assert.equal(error.code, "FileNotFound");
      return true;
    },
  );
});

await test("writing without overwrite over an existing file is FileExists", async () => {
  await assert.rejects(
    () =>
      client.request("fs.writeFile", {
        path: "/package.json",
        data: new Uint8Array([1]),
        create: true,
        overwrite: false,
      }),
    (error) => error.code === "FileExists",
  );
});

await test("rename moves the file and its contents", async () => {
  await client.request("fs.rename", {
    from: "/src/added.ts",
    to: "/src/renamed.ts",
    overwrite: false,
  });
  const stat = await client.request("fs.stat", { path: "/src/renamed.ts" });
  assert.equal(stat.type, 1);
  await assert.rejects(() => client.request("fs.stat", { path: "/src/added.ts" }));
});

await test("watchers deliver change events to the extension", async () => {
  const seen = [];
  const off = client.on("fs.changed", (event) => seen.push(event));
  await client.request("fs.watch", { id: "w1", path: "/", recursive: true });

  await client.request("fs.writeFile", {
    path: "/watched.txt",
    data: new TextEncoder().encode("hi"),
    create: true,
    overwrite: true,
  });
  await delay(80);
  off();
  await client.request("fs.unwatch", { id: "w1" });

  assert.ok(
    seen.some((event) =>
      event.changes.some((change) => change.path === "/watched.txt"),
    ),
    `expected a change for /watched.txt, saw ${JSON.stringify(seen)}`,
  );
});

await test("file search ranks by fuzzy relevance", async () => {
  const paths = await client.request("search.file", { pattern: "index" });
  assert.ok(paths.includes("/src/index.js"), `got ${JSON.stringify(paths)}`);
});

await test("text search returns line numbers and match ranges", async () => {
  const hits = await client.request("search.text", { pattern: "hello" });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, "/src/index.js");
  assert.equal(hits[0].line, 0);
  assert.deepEqual(hits[0].ranges, [[13, 18]]);
});

await test("regex text search honours case sensitivity", async () => {
  const insensitive = await client.request("search.text", {
    pattern: "CONSOLE",
    isCaseSensitive: false,
  });
  const sensitive = await client.request("search.text", {
    pattern: "CONSOLE",
    isCaseSensitive: true,
  });
  assert.equal(insensitive.length, 2);
  assert.equal(sensitive.length, 0);
});

await test("debounced sync pushes the workspace to storage", async () => {
  const status = await client.request("sync.flush", undefined);
  assert.equal(status.phase, "idle");
  const stored = await storage.list();
  const paths = stored.map((entry) => entry.path);
  assert.ok(paths.includes("/package.json"), `stored: ${paths.join(", ")}`);
  assert.ok(paths.includes("/src/index.js"));
});

await test("node_modules is never pushed to storage", async () => {
  await client.request("fs.writeFile", {
    path: "/node_modules/left-pad/index.js",
    data: new TextEncoder().encode("module.exports = 1;"),
    create: true,
    overwrite: true,
  });
  await client.request("sync.flush", undefined);
  const paths = (await storage.list()).map((entry) => entry.path);
  assert.ok(!paths.some((path) => path.startsWith("/node_modules")), paths.join(", "));
});

await test("deletes propagate to storage", async () => {
  await client.request("fs.delete", { path: "/watched.txt", recursive: false });
  await client.request("sync.flush", undefined);
  const paths = (await storage.list()).map((entry) => entry.path);
  assert.ok(!paths.includes("/watched.txt"), paths.join(", "));
});

await test("a local terminal streams output and echoes input", async () => {
  const chunks = [];
  const off = client.on("term.data", ({ data }) => chunks.push(data));

  const opened = await client.request("term.open", {
    id: "term-1",
    mode: "local",
    cols: 100,
    rows: 30,
  });
  assert.equal(opened.mode, "local");

  await client.request("term.input", { id: "term-1", data: "ls\r" });
  await delay(30);
  off();
  await client.request("term.close", { id: "term-1" });

  const output = chunks.join("");
  assert.match(output, /\$ /, "expected a prompt");
  assert.match(output, /echo:ls/, `expected the echo, got ${JSON.stringify(output)}`);
});

await test("sandbox terminals are refused when none is configured", async () => {
  await assert.rejects(
    () => client.request("term.open", { id: "term-2", mode: "sandbox", cols: 80, rows: 24 }),
    (error) => /not configured/.test(error.message),
  );
});

await test("proc.exec runs through the shell and returns output", async () => {
  const result = await client.request("proc.exec", { command: "echo hi" });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /ran: echo hi/);
});

await test("unknown methods fail rather than hang", async () => {
  await assert.rejects(() => client.request("does.not.exist", {}));
});

/* ---- vinext on Cloudflare Workers ---------------------------------------- */

/**
 * A stand-in for the `WORKSPACES` R2 binding. Only the four methods
 * `R2BindingStore` uses are implemented, which is also all `R2BucketLike`
 * promises.
 */
function createFakeBucket() {
  const objects = new Map();
  return {
    async list({ prefix = "" } = {}) {
      return {
        objects: [...objects.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, value]) => ({
            key,
            size: value.byteLength,
            uploaded: new Date(1_700_000_000_000),
          })),
        truncated: false,
      };
    },
    async get(key) {
      const value = objects.get(key);
      if (!value) return null;
      return { arrayBuffer: async () => value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) };
    },
    async put(key, value) {
      objects.set(key, new Uint8Array(value));
    },
    async delete(keys) {
      for (const key of [].concat(keys)) objects.delete(key);
    },
    async head(key) {
      const value = objects.get(key);
      return value ? { size: value.byteLength, uploaded: new Date(0) } : null;
    },
    _objects: objects,
  };
}

/** vinext's app-router entry, reduced to the part this Worker depends on. */
const fakeVinextHandler = {
  async fetch(request) {
    return new Response(`app: ${new URL(request.url).pathname}`, {
      headers: { "content-type": "text/plain" },
    });
  },
};

function makeVinextWorker(overrides = {}) {
  return createOpenDSVinextWorker({
    handler: fakeVinextHandler,
    authorize: (request) =>
      request.headers.get("x-user") ? { userId: request.headers.get("x-user") } : null,
    ...overrides,
  });
}

const isolationHeaders = (response) => ({
  coop: response.headers.get("cross-origin-opener-policy"),
  coep: response.headers.get("cross-origin-embedder-policy"),
});

await test("unmatched paths fall through to the vinext app router", async () => {
  const worker = makeVinextWorker();
  const response = await worker.fetch(new Request("https://app.dev/dashboard"), {});
  assert.equal(await response.text(), "app: /dashboard");
});

await test("app router responses are cross-origin isolated", async () => {
  // The whole origin has to be isolated for SharedArrayBuffer to exist, so the
  // host page matters as much as the workbench iframe.
  const worker = makeVinextWorker();
  const response = await worker.fetch(new Request("https://app.dev/"), {});
  assert.deepEqual(isolationHeaders(response), {
    coop: "same-origin",
    coep: "credentialless",
  });
});

await test("immutable framework responses are copied, not mutated", async () => {
  const frozen = {
    async fetch() {
      // `Response.redirect` produces immutable headers, as several frameworks
      // do; setting on them throws.
      return Response.redirect("https://app.dev/login", 302);
    },
  };
  const worker = makeVinextWorker({ handler: frozen });
  const response = await worker.fetch(new Request("https://app.dev/private"), {});
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://app.dev/login");
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
});

await test("WebSocket upgrades are passed through untouched", async () => {
  // A 101 cannot be reconstructed — `new Response(body, { status: 101 })`
  // throws, and the attached socket would be lost anyway.
  const upgrade = { status: 101, headers: new Headers(), webSocket: {} };
  assert.equal(applyIsolationHeaders(upgrade), upgrade);
});

await test("the R2 binding is read from env, not from module scope", async () => {
  const bucket = createFakeBucket();
  // keyPrefix / userId / workspaceId / path
  bucket._objects.set(
    "workspaces/alice/alice/index.js",
    new TextEncoder().encode("console.log(1)"),
  );

  const worker = makeVinextWorker();
  const response = await worker.fetch(
    new Request("https://app.dev/api/opends/fs/list", {
      headers: { "x-user": "alice" },
    }),
    { WORKSPACES: bucket },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(
    (await response.json()).map((entry) => entry.path),
    ["/index.js"],
  );
});

await test("one tenant cannot list another's workspace", async () => {
  const bucket = createFakeBucket();
  bucket._objects.set(
    "workspaces/alice/alice/secret.txt",
    new TextEncoder().encode("x"),
  );

  const worker = makeVinextWorker();
  const response = await worker.fetch(
    new Request("https://app.dev/api/opends/fs/list", {
      headers: { "x-user": "mallory" },
    }),
    { WORKSPACES: bucket },
  );

  assert.deepEqual(await response.json(), []);
});

await test("OpenDS routes reject unauthorized callers before touching storage", async () => {
  const worker = makeVinextWorker();
  const response = await worker.fetch(
    new Request("https://app.dev/api/opends/fs/list"),
    { WORKSPACES: createFakeBucket() },
  );
  assert.equal(response.status, 401);
});

await test("authorize receives the bindings", async () => {
  let seen = null;
  const worker = makeVinextWorker({
    authorize: (_request, env) => {
      seen = env?.TENANT ?? null;
      return { userId: "u1" };
    },
  });
  await worker.fetch(new Request("https://app.dev/api/opends/fs/list"), {
    WORKSPACES: createFakeBucket(),
    TENANT: "acme",
  });
  assert.equal(seen, "acme");
});

await test("a path merely prefixed by basePath is not an OpenDS route", async () => {
  const worker = makeVinextWorker();
  const response = await worker.fetch(
    new Request("https://app.dev/api/opends-docs"),
    {},
  );
  assert.equal(await response.text(), "app: /api/opends-docs");
});

await test("the Nodepod service worker is served from the app origin", async () => {
  const worker = makeVinextWorker({
    serveSW: () =>
      new Response("self.addEventListener('fetch', () => {})", {
        headers: { "content-type": "text/javascript" },
      }),
  });
  const response = await worker.fetch(new Request("https://app.dev/__sw__.js"), {});
  assert.match(await response.text(), /addEventListener/);
  assert.equal(response.headers.get("content-type"), "text/javascript");
});

await test("the workbench document is served without authentication", async () => {
  // It contains no user data — only the session id the caller already has —
  // and requiring auth here would mean the iframe could not boot from a
  // cookie-less context.
  const worker = makeVinextWorker();
  const response = await worker.fetch(
    new Request("https://app.dev/api/opends/workbench?session=s1"),
    {},
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /workbench\.web\.main\.js/);
  assert.equal(response.headers.get("cross-origin-embedder-policy"), "credentialless");
});

await test("route handlers resolve config per request", async () => {
  // The `/vinext` handler form exists for hosts that mount a catch-all route
  // instead of a Worker entry; it has to read `env` at request time.
  let calls = 0;
  const bucket = createFakeBucket();
  const { GET } = createOpenDSVinextHandlers({
    env: () => {
      calls++;
      return { WORKSPACES: bucket };
    },
    authorize: () => ({ userId: "alice" }),
  });

  assert.equal((await GET(new Request("https://app.dev/api/opends/fs/list"))).status, 200);
  assert.equal((await GET(new Request("https://app.dev/api/opends/fs/list"))).status, 200);
  assert.equal(calls, 2);
});

await test("_headers isolates the assets the Worker never sees", () => {
  const headers = openDSAssetHeaders();
  assert.match(headers, /^\/\*$/m);
  assert.match(headers, /^ {2}Cross-Origin-Opener-Policy: same-origin$/m);
  assert.match(headers, /^ {2}Cross-Origin-Embedder-Policy: credentialless$/m);
});

await test("_headers lets the staged service worker claim the origin", () => {
  // `serveSW()` cannot run on Workers — it reads the file with node:fs — so
  // __sw__.js is a static asset, and a static asset needs this header to
  // register at a scope broader than its own path.
  assert.match(openDSAssetHeaders(), /^\/__sw__\.js\n {2}Service-Worker-Allowed: \/$/m);
  assert.doesNotMatch(
    openDSAssetHeaders({ serviceWorkerPath: null }),
    /Service-Worker-Allowed/,
  );
});

await test("the Vite plugin isolates dev and preview servers", () => {
  const config = opendsVinext().config();
  assert.equal(config.server.headers["Cross-Origin-Opener-Policy"], "same-origin");
  assert.equal(config.preview.headers["Cross-Origin-Embedder-Policy"], "credentialless");
  assert.ok(config.optimizeDeps.exclude.includes("@scelar/nodepod"));
});

await test("the Vite plugin emits _headers into the client build only", () => {
  const plugin = opendsVinext();
  const emitted = [];
  const context = (name) => ({
    environment: { name },
    emitFile: (file) => emitted.push({ ...file, environment: name }),
  });

  plugin.generateBundle.call(context("client"));
  plugin.generateBundle.call(context("ssr"));
  plugin.generateBundle.call(context("rsc"));

  assert.equal(emitted.length, 1, "only the client build becomes the asset dir");
  assert.equal(emitted[0].fileName, "_headers");
  assert.match(emitted[0].source, /Cross-Origin-Opener-Policy/);
});

/* ---- pure units ---------------------------------------------------------- */

await test("glob translation handles **, braces and ?", () => {
  assert.ok(globToRegExp("**/node_modules/**").test("a/b/node_modules/c.js"));
  assert.ok(globToRegExp("**/node_modules/**").test("node_modules/c.js"));
  assert.ok(globToRegExp("*.{ts,tsx}").test("index.tsx"));
  assert.ok(!globToRegExp("*.{ts,tsx}").test("index.js"));
  assert.ok(globToRegExp("src/?.ts").test("src/a.ts"));
});

await test("directory exclusion matches the directory itself", () => {
  // The bare name does not match `**/node_modules/**`; the tree walk relies on
  // this helper to avoid descending into it anyway.
  assert.ok(isExcludedDirectory("node_modules", ["**/node_modules/**"]));
  assert.ok(isExcludedDirectory("a/node_modules", ["**/node_modules/**"]));
  assert.ok(!isExcludedDirectory("src", ["**/node_modules/**"]));
});

await test("path normalisation rejects traversal", () => {
  assert.equal(normalizePath("/a//b/"), "/a/b");
  assert.equal(normalizePath("a/./b"), "/a/b");
  assert.throws(() => normalizePath("/a/../../etc/passwd"));
});

await test("batch frame codec round-trips binary payloads", () => {
  const ops = [
    { path: "/a.txt", data: new Uint8Array([1, 2, 3]) },
    { path: "/nested/b.bin", data: new Uint8Array([0, 255, 0, 128]) },
  ];
  const decoded = decodeBatch(encodeBatch(ops));
  assert.equal(decoded.length, 2);
  assert.equal(decoded[0].path, "/a.txt");
  assert.deepEqual([...decoded[1].data], [0, 255, 0, 128]);
});

await test("fuzzy scoring prefers filename matches over path matches", () => {
  assert.ok(fuzzyScore("src/index.js", "index") > fuzzyScore("index/src/a.js", "index"));
  assert.equal(fuzzyScore("src/a.js", "zzz"), -1);
});

/* -------------------------------------------------------------------------- */

client.dispose();
await session.dispose();

console.log(`\nopends-code smoke test\n${results.join("\n")}`);
console.log(
  `\n${results.length - failures}/${results.length} passed${failures ? ` — ${failures} FAILED` : ""}\n`,
);
process.exit(failures ? 1 : 0);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
