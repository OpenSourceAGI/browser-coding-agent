// Full-flow integration test: boot → file I/O → spawn → preview routing
// (plan steps 0.1 and 6.1). Filesystem and snapshots are real; process
// execution and the preview proxy are scripted by FakeNodepodHost.

import { describe, it, expect } from "vitest";
import { NodepodFileSystem } from "../nodepod-file-system";
import { ProcessRunner } from "../process-runner";
import { PreviewManager } from "../preview-manager";
import { buildBootOptions } from "../workspace";
import { FakeNodepodHost } from "./fake-host";

const WORKSPACE_FILES = {
  "/package.json": `{"name":"app","main":"server.js"}`,
  "/server.js": `require('http').createServer().listen(3000)`,
  "/src/util.js": `module.exports = 41`,
};

function bootFakeWorkspace() {
  const host = new FakeNodepodHost();
  const previews = new PreviewManager();

  // same wiring the real app does: PreviewManager into boot options,
  // then bind the booted host
  const options = buildBootOptions({ files: WORKSPACE_FILES }, previews);
  host.onServerReady = options.onServerReady ?? null;
  host.seed(options.files!);
  previews.bindHost(host);

  // "node server.js" starts a virtual HTTP server like the real runtime
  host.command("node", ({ args, proc, volume, host: fakeHost }) => {
    const file = args[0];
    if (!file || !volume.existsSync(file)) {
      proc._pushStderr(`Cannot find module '${file}'\n`);
      return 1;
    }
    const source = volume.readFileSync(file, "utf8") as string;
    const listenMatch = source.match(/listen\((\d+)/);
    if (listenMatch) {
      const port = Number(listenMatch[1]);
      fakeHost.listen(port);
      proc._pushStdout(`Server listening on port ${port}\n`);
    } else {
      proc._pushStdout(`ran ${file}\n`);
    }
    // processes can write files too — must surface in the IDE layer
    volume.writeFileSync("/proc-was-here.txt", "yes");
    return 0;
  });

  const files = new NodepodFileSystem(host.fs);
  const runner = new ProcessRunner(host);
  return { host, files, runner, previews };
}

describe("IDE integration: boot → file ops → spawn → preview", () => {
  it("boot seeds the workspace into the Nodepod filesystem", async () => {
    const { files } = bootFakeWorkspace();
    expect(await files.readFile("/server.js")).toContain("listen(3000)");
    const tree = await files.readTree("/");
    expect(tree.map((node) => node.name)).toEqual([
      "src",
      "package.json",
      "server.js",
    ]);
  });

  it("edits flow through NodepodFileSystem and are visible to processes", async () => {
    const { files, runner, host } = bootFakeWorkspace();

    await files.writeFile("/script.js", "console.log('edited in UI')");
    // the process resolves the file from the same volume the UI wrote to
    const result = await runner.runNode("/script.js");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("ran /script.js\n");

    // and process-written files are readable back through the same layer
    expect(await files.readFile("/proc-was-here.txt")).toBe("yes");
    expect(host.volume.existsSync("/script.js")).toBe(true);
  });

  it("spawning a server routes its preview URL into the iframe target", async () => {
    const { runner, previews } = bootFakeWorkspace();
    const iframe = { src: "" };
    previews.attach(iframe);

    const readyPorts: number[] = [];
    previews.on("server-ready", ({ port }) => readyPorts.push(port));

    const result = await runner.runNode("/server.js");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("listening on port 3000");

    expect(readyPorts).toEqual([3000]);
    expect(previews.activePort).toBe(3000);
    expect(iframe.src).toBe(previews.urlFor(3000));
    expect(iframe.src).toContain("/3000/");
  });

  it("preview script injection reaches the host", async () => {
    const { previews, host } = bootFakeWorkspace();
    await previews.setPreviewScript("console.log('bridge')");
    expect(host.previewScript).toBe("console.log('bridge')");
  });

  it("snapshot persistence survives a reboot of the workspace", async () => {
    const { files, host } = bootFakeWorkspace();
    await files.writeFile("/notes.md", "remember me");

    const snapshot = host.snapshot();
    const rebooted = new FakeNodepodHost();
    await rebooted.restore(snapshot);
    const rebootedFiles = new NodepodFileSystem(rebooted.fs);
    expect(await rebootedFiles.readFile("/notes.md")).toBe("remember me");
    expect(await rebootedFiles.readFile("/server.js")).toContain("listen");
  });
});
