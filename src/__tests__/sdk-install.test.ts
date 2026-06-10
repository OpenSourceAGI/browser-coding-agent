// Guards the SDK surface documented in the README — notably install(),
// which the IDE's npm-install flow uses (plan step 5.1).

import { describe, it, expect, vi } from "vitest";

// the virtual module is provided by a vite plugin only in the lib build,
// tests run under vitest without that plugin so we stub it here
vi.mock("virtual:process-worker-bundle", () => ({
  PROCESS_WORKER_BUNDLE: "",
}));

import { Nodepod } from "../sdk/nodepod";

describe("Nodepod SDK surface", () => {
  it("exposes the documented instance methods", () => {
    for (const method of [
      "install",
      "spawn",
      "createTerminal",
      "snapshot",
      "restore",
      "port",
      "setPreviewScript",
      "clearPreviewScript",
      "teardown",
    ]) {
      expect(
        typeof (Nodepod.prototype as any)[method],
        `Nodepod.prototype.${method}`,
      ).toBe("function");
    }
  });

  it("install() delegates to the package installer", async () => {
    // bypass boot (needs Web Workers) — call install with a stubbed
    // DependencyInstaller to verify the specifier fan-out
    const calls: Array<[string, string | undefined]> = [];
    let manifestInstalls = 0;
    const fake = {
      _packages: {
        install: async (name: string, version?: string) => {
          calls.push([name, version]);
          return { resolved: new Map(), newPackages: [] };
        },
        installFromManifest: async () => {
          manifestInstalls += 1;
          return { resolved: new Map(), newPackages: [] };
        },
      },
    };

    await Nodepod.prototype.install.call(fake, ["express", "vite@5"]);
    expect(calls).toEqual([
      ["express", undefined],
      ["vite@5", undefined],
    ]);

    await Nodepod.prototype.install.call(fake, "pako");
    expect(calls).toHaveLength(3);

    await Nodepod.prototype.install.call(fake);
    expect(manifestInstalls).toBe(1);
  });
});
