// Polyfill coverage checks (plan steps 5.2 and 5.3): the manifest the IDE
// shows users must match the actual files in src/polyfills, and the
// critical modules for running servers must be in the "full" list.

import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  POLYFILLED_MODULES,
  STUB_MODULES,
  getModuleManifest,
  getModuleSupport,
} from "../polyfill-manifest";

const polyfillDir = fileURLToPath(new URL("../../polyfills/", import.meta.url));
const polyfillFiles = new Set(
  readdirSync(polyfillDir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => name.replace(/\.ts$/, "")),
);

describe("polyfill manifest", () => {
  it("every claimed-full module has a polyfill file", () => {
    const missing = POLYFILLED_MODULES.filter(
      (name) => !polyfillFiles.has(name),
    );
    expect(missing).toEqual([]);
  });

  it("every documented stub has a stub file and a workaround note", () => {
    const missing = STUB_MODULES.filter(
      (entry) => !polyfillFiles.has(entry.name),
    );
    expect(missing).toEqual([]);
    for (const entry of STUB_MODULES) {
      expect(entry.note, `${entry.name} needs a workaround note`).toBeTruthy();
      expect(entry.status).toBe("stub");
    }
  });

  it("full and stub lists do not overlap", () => {
    const full = new Set(POLYFILLED_MODULES);
    const overlap = STUB_MODULES.filter((entry) => full.has(entry.name));
    expect(overlap).toEqual([]);
  });

  it("covers the modules needed to run HTTP servers (plan 5.2)", () => {
    for (const name of ["fs", "http", "net", "crypto", "child_process"]) {
      expect(getModuleSupport(name)?.status, name).toBe("full");
    }
  });

  it("documents the known stubs (plan 5.3)", () => {
    for (const name of ["dns", "worker_threads", "vm", "tls", "http2"]) {
      expect(getModuleSupport(name)?.status, name).toBe("stub");
    }
  });

  it("resolves node: prefixed specifiers and unknown modules", () => {
    expect(getModuleSupport("node:fs")?.status).toBe("full");
    expect(getModuleSupport("left-pad")).toBeNull();
    expect(getModuleManifest().length).toBe(
      POLYFILLED_MODULES.length + STUB_MODULES.length,
    );
  });
});
