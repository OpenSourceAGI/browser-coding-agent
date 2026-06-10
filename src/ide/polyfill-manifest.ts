// Machine-readable record of Node.js module coverage in Nodepod (plan
// steps 5.2 and 5.3). The IDE surfaces this in its runtime panel and the
// test suite checks it against the actual files in src/polyfills, so the
// list can't silently drift from reality.

export type ModuleSupportStatus = "full" | "stub";

export interface ModuleSupport {
  name: string;
  status: ModuleSupportStatus;
  /** For stubs: the recommended workaround. */
  note?: string;
}

/** Modules with working polyfills. */
export const POLYFILLED_MODULES: string[] = [
  "fs",
  "path",
  "events",
  "stream",
  "buffer",
  "process",
  "http",
  "https",
  "net",
  "crypto",
  "zlib",
  "url",
  "querystring",
  "util",
  "os",
  "tty",
  "child_process",
  "assert",
  "readline",
  "module",
  "timers",
  "string_decoder",
  "perf_hooks",
  "constants",
  "punycode",
];

/** Modules that exist but are inert stubs, with workarounds. */
export const STUB_MODULES: ModuleSupport[] = [
  {
    name: "dns",
    status: "stub",
    note: "Name resolution happens in the browser fetch layer; use http/https directly.",
  },
  {
    name: "worker_threads",
    status: "stub",
    note: "Use nodepod.spawn() — each process already runs in its own Web Worker.",
  },
  {
    name: "vm",
    status: "stub",
    note: "Spawn a separate node process instead of an in-process sandbox.",
  },
  {
    name: "v8",
    status: "stub",
    note: "Engine introspection is unavailable in the browser.",
  },
  {
    name: "tls",
    status: "stub",
    note: "TLS terminates at the browser; use https for encrypted requests.",
  },
  {
    name: "dgram",
    status: "stub",
    note: "UDP sockets cannot be opened from a browser context.",
  },
  {
    name: "cluster",
    status: "stub",
    note: "Spawn multiple processes with nodepod.spawn() instead of fork().",
  },
  {
    name: "http2",
    status: "stub",
    note: "Servers fall back to HTTP/1.1 semantics through the service worker bridge.",
  },
  {
    name: "inspector",
    status: "stub",
    note: "Use the browser devtools against the page itself.",
  },
  {
    name: "domain",
    status: "stub",
    note: "Deprecated in Node; use try/catch and 'error' events.",
  },
  {
    name: "diagnostics_channel",
    status: "stub",
    note: "Channels exist but no subscribers fire; use console-based tracing.",
  },
  {
    name: "async_hooks",
    status: "stub",
    note: "AsyncLocalStorage works for common cases; low-level hooks are no-ops.",
  },
];

/** Full manifest, one entry per module. */
export function getModuleManifest(): ModuleSupport[] {
  return [
    ...POLYFILLED_MODULES.map(
      (name): ModuleSupport => ({ name, status: "full" }),
    ),
    ...STUB_MODULES,
  ];
}

export function getModuleSupport(name: string): ModuleSupport | null {
  const bare = name.replace(/^node:/, "");
  return getModuleManifest().find((entry) => entry.name === bare) ?? null;
}
