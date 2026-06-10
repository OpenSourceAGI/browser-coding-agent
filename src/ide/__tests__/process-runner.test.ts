// ProcessRunner tests for stdout/stderr/exit codes (plan step 3.3).
// Processes are real NodepodProcess instances driven by scripted commands.

import { describe, it, expect } from "vitest";
import { ProcessRunner } from "../process-runner";
import { FakeNodepodHost } from "./fake-host";

function makeRunner(): { runner: ProcessRunner; host: FakeNodepodHost } {
  const host = new FakeNodepodHost();
  host.command("echo", ({ args, proc }) => {
    proc._pushStdout(args.join(" ") + "\n");
  });
  host.command("fail", ({ proc }) => {
    proc._pushStderr("boom\n");
    return 2;
  });
  host.command("node", ({ args, proc, volume }) => {
    const file = args[0];
    if (!file || !volume.existsSync(file)) {
      proc._pushStderr(`Cannot find module '${file}'\n`);
      return 1;
    }
    proc._pushStdout(`ran ${file}\n`);
    return 0;
  });
  host.command("sleep", () => new Promise<number>(() => {})); // runs until killed
  return { runner: new ProcessRunner(host), host };
}

describe("ProcessRunner", () => {
  it("collects stdout and exit code 0", async () => {
    const { runner } = makeRunner();
    const result = await runner.run("echo", ["hello", "world"]);
    expect(result.stdout).toBe("hello world\n");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("collects stderr and non-zero exit codes", async () => {
    const { runner } = makeRunner();
    const result = await runner.run("fail");
    expect(result.stderr).toBe("boom\n");
    expect(result.exitCode).toBe(2);
  });

  it("reports exit 127 for unknown commands", async () => {
    const { runner } = makeRunner();
    const result = await runner.run("nope");
    expect(result.exitCode).toBe(127);
    expect(result.stderr).toContain("command not found");
  });

  it("streams output chunks and exit notifications", async () => {
    const { runner } = makeRunner();
    const out: string[] = [];
    const err: string[] = [];
    let exit = -1;
    await runner.run("echo", ["streamed"], {
      onOutput: (chunk) => out.push(chunk),
      onError: (chunk) => err.push(chunk),
      onExit: (code) => (exit = code),
    });
    expect(out.join("")).toBe("streamed\n");
    expect(err).toEqual([]);
    expect(exit).toBe(0);
  });

  it("runNode spawns node with the script path", async () => {
    const { runner, host } = makeRunner();
    host.seed({ "/app.js": "console.log(1)" });
    const result = await runner.runNode("/app.js");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("ran /app.js\n");
    expect(host.spawned).toContain("node /app.js");
  });

  it("tracks active processes and killAll terminates them", async () => {
    const { runner } = makeRunner();
    const running = await runner.start("sleep");
    expect(runner.activeCount).toBe(1);

    runner.killAll();
    const result = await running.completion;
    expect(result.exitCode).toBe(130);
    expect(runner.activeCount).toBe(0);
  });

  it("supports stdin writes on running processes", async () => {
    const host = new FakeNodepodHost();
    const received: string[] = [];
    host.command("cat", ({ proc }) => {
      proc._setSendStdin((data) => {
        received.push(data);
        proc._pushStdout(data);
        proc._finish(0);
      });
      return new Promise<number>(() => {});
    });
    const runner = new ProcessRunner(host);
    const running = await runner.start("cat");
    await new Promise((resolve) => setTimeout(resolve, 0));
    running.write("piped input");
    const result = await running.completion;
    expect(received).toEqual(["piped input"]);
    expect(result.stdout).toBe("piped input");
  });
});
