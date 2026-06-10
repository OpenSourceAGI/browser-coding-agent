// Workspace boot options (plan 2.1, 4.3), snapshot persistence (phase 2),
// and feature flags (plan 0.2 / 6.3).

import { describe, it, expect } from "vitest";
import { buildBootOptions, WorkspaceStore, type StorageLike } from "../workspace";
import { PreviewManager } from "../preview-manager";
import {
  DEFAULT_IDE_FLAGS,
  flagsFromStorage,
  isFlagEnabled,
  parseFlagOverrides,
  resolveFlags,
} from "../feature-flags";
import { FakeNodepodHost } from "./fake-host";

class MemoryStorage implements StorageLike {
  private _map = new Map<string, string>();
  getItem(key: string): string | null {
    return this._map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this._map.set(key, value);
  }
  removeItem(key: string): void {
    this._map.delete(key);
  }
}

describe("buildBootOptions", () => {
  it("passes files, workdir and env through to Nodepod.boot", () => {
    const options = buildBootOptions({
      files: { "/a.js": "1" },
      workdir: "/work",
      env: { NODE_ENV: "test" },
    });
    expect(options.files).toEqual({ "/a.js": "1" });
    expect(options.workdir).toBe("/work");
    expect(options.env).toEqual({ NODE_ENV: "test" });
  });

  it("forwards allowedFetchDomains, including the null wildcard (plan 4.3)", () => {
    expect(
      buildBootOptions({ allowedFetchDomains: ["example.com"] })
        .allowedFetchDomains,
    ).toEqual(["example.com"]);
    expect(
      buildBootOptions({ allowedFetchDomains: null }).allowedFetchDomains,
    ).toBeNull();
    // omitted → key absent so Nodepod's defaults apply
    expect("allowedFetchDomains" in buildBootOptions({})).toBe(false);
  });

  it("chains onServerReady into the PreviewManager and the user callback", () => {
    const previews = new PreviewManager();
    const seen: Array<[number, string]> = [];
    const options = buildBootOptions(
      { onServerReady: (port, url) => seen.push([port, url]) },
      previews,
    );

    options.onServerReady?.(3000, "https://x/3000/");
    expect(previews.urlFor(3000)).toBe("https://x/3000/");
    expect(seen).toEqual([[3000, "https://x/3000/"]]);
  });
});

describe("WorkspaceStore", () => {
  it("round-trips a workspace snapshot through storage", async () => {
    const source = new FakeNodepodHost();
    source.seed({
      "/package.json": `{"name":"ws"}`,
      "/src/app.js": "console.log('persisted')",
    });

    const storage = new MemoryStorage();
    const store = new WorkspaceStore(storage);
    store.save(source);

    const destination = new FakeNodepodHost();
    expect(await store.restoreInto(destination)).toBe(true);
    expect(destination.volume.readFileSync("/src/app.js", "utf8")).toBe(
      "console.log('persisted')",
    );
  });

  it("excludes node_modules from shallow snapshots", () => {
    const source = new FakeNodepodHost();
    source.seed({
      "/keep.js": "1",
      "/node_modules/pkg/index.js": "2",
    });
    const storage = new MemoryStorage();
    const store = new WorkspaceStore(storage);
    store.save(source);

    const snapshot = store.load();
    const paths = snapshot!.entries.map((entry) => entry.path);
    expect(paths).toContain("/keep.js");
    expect(paths.some((path) => path.includes("node_modules"))).toBe(false);
  });

  it("returns null for missing or corrupted snapshots", async () => {
    const storage = new MemoryStorage();
    const store = new WorkspaceStore(storage);
    expect(store.load()).toBeNull();
    expect(await store.restoreInto(new FakeNodepodHost())).toBe(false);

    storage.setItem("nodepod-ide.workspace.v1", "{not json");
    expect(store.load()).toBeNull();

    storage.setItem("nodepod-ide.workspace.v1", `{"unexpected":true}`);
    expect(store.load()).toBeNull();
  });

  it("clear removes the stored snapshot", () => {
    const storage = new MemoryStorage();
    const store = new WorkspaceStore(storage);
    store.save(new FakeNodepodHost());
    expect(store.load()).not.toBeNull();
    store.clear();
    expect(store.load()).toBeNull();
  });
});

describe("feature flags", () => {
  it("parses ?ff= query overrides", () => {
    expect(parseFlagOverrides("?ff=ide.preview:off,ide.persistence:on,x")).toEqual({
      "ide.preview": false,
      "ide.persistence": true,
      x: true,
    });
    expect(parseFlagOverrides("")).toEqual({});
    expect(parseFlagOverrides("?other=1")).toEqual({});
  });

  it("reads boolean flags from storage and ignores junk", () => {
    const storage = new MemoryStorage();
    storage.setItem("nodepod-ide.flags", `{"ide.terminal":false,"bad":"yes"}`);
    expect(flagsFromStorage(storage)).toEqual({ "ide.terminal": false });

    storage.setItem("nodepod-ide.flags", "not json");
    expect(flagsFromStorage(storage)).toEqual({});
    expect(flagsFromStorage(null)).toEqual({});
  });

  it("resolves precedence left-to-right and defaults unknown flags on", () => {
    const flags = resolveFlags(
      DEFAULT_IDE_FLAGS,
      { "ide.preview": false },
      { "ide.preview": true, "ide.install": false },
    );
    expect(isFlagEnabled(flags, "ide.preview")).toBe(true);
    expect(isFlagEnabled(flags, "ide.install")).toBe(false);
    expect(isFlagEnabled(flags, "ide.terminal")).toBe(true);
    expect(isFlagEnabled(flags, "never-declared")).toBe(true);
  });
});
