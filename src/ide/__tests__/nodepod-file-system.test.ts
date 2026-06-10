// Integration tests for the NodepodFileSystem repository layer over the
// real virtual filesystem (plan steps 0.1, 1.2, 2.2).

import { describe, it, expect } from "vitest";
import { MemoryVolume } from "../../memory-volume";
import { NodepodFS } from "../../sdk/nodepod-fs";
import {
  NodepodFileSystem,
  normalizePath,
  sortTreeNodes,
  type FileChangeEvent,
  type FileTreeNode,
} from "../nodepod-file-system";

function makeFs(): { files: NodepodFileSystem; volume: MemoryVolume } {
  const volume = new MemoryVolume();
  return { files: new NodepodFileSystem(new NodepodFS(volume)), volume };
}

describe("normalizePath", () => {
  it("makes paths absolute", () => {
    expect(normalizePath("a/b.txt")).toBe("/a/b.txt");
  });

  it("collapses duplicate slashes and dot segments", () => {
    expect(normalizePath("//x///y")).toBe("/x/y");
    expect(normalizePath("/a/./b/../c")).toBe("/a/c");
  });

  it("keeps root as root", () => {
    expect(normalizePath("/")).toBe("/");
  });
});

describe("sortTreeNodes", () => {
  it("puts directories before files, each alphabetical", () => {
    const nodes: FileTreeNode[] = [
      { name: "z.txt", path: "/z.txt", kind: "file" },
      { name: "src", path: "/src", kind: "directory" },
      { name: "a.txt", path: "/a.txt", kind: "file" },
      { name: "docs", path: "/docs", kind: "directory" },
    ];
    expect(sortTreeNodes(nodes).map((node) => node.name)).toEqual([
      "docs",
      "src",
      "a.txt",
      "z.txt",
    ]);
  });
});

describe("NodepodFileSystem", () => {
  it("round-trips file content through the volume", async () => {
    const { files, volume } = makeFs();
    await files.writeFile("/src/app.js", "console.log('hi')");
    expect(await files.readFile("/src/app.js")).toBe("console.log('hi')");
    // the Nodepod volume is the single source of truth
    expect(volume.readFileSync("/src/app.js", "utf8")).toBe(
      "console.log('hi')",
    );
  });

  it("reads binary content as Uint8Array", async () => {
    const { files } = makeFs();
    await files.writeFile("/bin.dat", new Uint8Array([1, 2, 3]));
    const data = await files.readFileBinary("/bin.dat");
    expect(data).toBeInstanceOf(Uint8Array);
    expect([...data]).toEqual([1, 2, 3]);
  });

  it("supports readdir, stat and exists", async () => {
    const { files } = makeFs();
    await files.writeFile("/dir/file.txt", "x");
    expect(await files.readdir("/dir")).toEqual(["file.txt"]);
    const stat = await files.stat("/dir/file.txt");
    expect(stat.isFile).toBe(true);
    expect(stat.isDirectory).toBe(false);
    expect(await files.exists("/dir/file.txt")).toBe(true);
    expect(await files.exists("/missing")).toBe(false);
  });

  it("creates directories and removes files and directories", async () => {
    const { files } = makeFs();
    await files.mkdir("/a/b/c", { recursive: true });
    expect(await files.exists("/a/b/c")).toBe(true);

    await files.writeFile("/a/b/c/one.txt", "1");
    await files.rm("/a/b/c/one.txt");
    expect(await files.exists("/a/b/c/one.txt")).toBe(false);

    await files.writeFile("/a/b/c/two.txt", "2");
    await files.rm("/a"); // recursive directory removal
    expect(await files.exists("/a")).toBe(false);
  });

  it("renames files", async () => {
    const { files } = makeFs();
    await files.writeFile("/old.txt", "content");
    await files.rename("/old.txt", "/new.txt");
    expect(await files.exists("/old.txt")).toBe(false);
    expect(await files.readFile("/new.txt")).toBe("content");
  });

  it("emits change events for every mutation", async () => {
    const { files } = makeFs();
    const events: FileChangeEvent[] = [];
    const unsubscribe = files.onDidChange((event) => events.push(event));

    await files.writeFile("/f.txt", "x");
    await files.mkdir("/d");
    await files.rename("/f.txt", "/g.txt");
    await files.rm("/g.txt");

    expect(events.map((event) => event.kind)).toEqual([
      "write",
      "mkdir",
      "rename",
      "delete",
    ]);
    expect(events[2]).toMatchObject({ path: "/f.txt", toPath: "/g.txt" });

    unsubscribe();
    await files.writeFile("/h.txt", "x");
    expect(events).toHaveLength(4);
  });

  it("bridges external volume writes through watchHost", async () => {
    const { files, volume } = makeFs();
    const events: FileChangeEvent[] = [];
    files.onDidChange((event) => events.push(event));
    const stop = files.watchHost("/");

    // simulate a spawned process writing directly to the volume
    volume.writeFileSync("/proc-output.txt", "from process");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(events.some((event) => event.kind === "external")).toBe(true);
    stop();
  });

  it("builds a sorted tree and excludes node_modules by default", async () => {
    const { files } = makeFs();
    await files.writeFile("/src/index.js", "x");
    await files.writeFile("/readme.md", "x");
    await files.writeFile("/node_modules/pkg/index.js", "x");

    const tree = await files.readTree("/");
    expect(tree.map((node) => node.name)).toEqual(["src", "readme.md"]);
    expect(tree[0].children?.map((node) => node.name)).toEqual(["index.js"]);
  });

  it("respects maxDepth and custom excludes", async () => {
    const { files } = makeFs();
    await files.writeFile("/a/b/c.txt", "x");
    await files.writeFile("/skip/me.txt", "x");

    const tree = await files.readTree("/", {
      maxDepth: 1,
      excludeDirs: ["skip"],
    });
    expect(tree.map((node) => node.name)).toEqual(["a"]);
    expect(tree[0].children).toBeUndefined();
  });
});
