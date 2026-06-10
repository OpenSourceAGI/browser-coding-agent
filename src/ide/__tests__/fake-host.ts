// Scripted IdeHost for IDE tests. The filesystem is the real
// MemoryVolume + NodepodFS (no mocks); only process execution and the
// preview proxy are scripted, since those need Web Workers / a service
// worker in a real browser.

import { MemoryVolume } from "../../memory-volume";
import { NodepodFS } from "../../sdk/nodepod-fs";
import { NodepodProcess } from "../../sdk/nodepod-process";
import type { Snapshot, SnapshotOptions, SpawnOptions } from "../../sdk/types";
import type { IdeHost, IdeProcess } from "../host";

export interface CommandContext {
  cmd: string;
  args: string[];
  opts: SpawnOptions | undefined;
  volume: MemoryVolume;
  proc: NodepodProcess;
  host: FakeNodepodHost;
}

export type CommandScript = (
  ctx: CommandContext,
) => Promise<number | void> | number | void;

export class FakeNodepodHost implements IdeHost {
  readonly volume = new MemoryVolume();
  readonly fs = new NodepodFS(this.volume);
  readonly cwd = "/";

  /** Wire buildBootOptions(...).onServerReady here, like Nodepod.boot does. */
  onServerReady: ((port: number, url: string) => void) | null = null;

  previewScript: string | null = null;
  spawned: string[] = [];

  private _ports = new Map<number, string>();
  private _commands = new Map<string, CommandScript>();

  /** Seed initial files the way Nodepod.boot({ files }) does. */
  seed(files: Record<string, string | Uint8Array>): void {
    for (const [path, content] of Object.entries(files)) {
      const dir = path.substring(0, path.lastIndexOf("/")) || "/";
      if (dir !== "/" && !this.volume.existsSync(dir)) {
        this.volume.mkdirSync(dir, { recursive: true });
      }
      this.volume.writeFileSync(path, content as any);
    }
  }

  /** Register the behavior for a command name (e.g. "node", "echo"). */
  command(name: string, script: CommandScript): void {
    this._commands.set(name, script);
  }

  /** Simulate a virtual HTTP server starting on a port. */
  listen(port: number): string {
    const url = `https://nodepod.test/__virtual__/pod1/${port}/`;
    this._ports.set(port, url);
    this.onServerReady?.(port, url);
    return url;
  }

  closePort(port: number): void {
    this._ports.delete(port);
  }

  /* ---- IdeHost ---- */

  async spawn(
    cmd: string,
    args: string[] = [],
    opts?: SpawnOptions,
  ): Promise<IdeProcess> {
    const proc = new NodepodProcess();
    this.spawned.push([cmd, ...args].join(" "));
    proc._setKillFn(() => {
      proc._pushStderr("killed\n");
      proc._finish(130);
    });
    const script = this._commands.get(cmd);
    queueMicrotask(() => {
      if (!script) {
        proc._pushStderr(`${cmd}: command not found\n`);
        proc._finish(127);
        return;
      }
      Promise.resolve(
        script({ cmd, args, opts, volume: this.volume, proc, host: this }),
      )
        .then((code) => {
          if (!proc.exited) proc._finish(typeof code === "number" ? code : 0);
        })
        .catch((err) => {
          if (!proc.exited) {
            proc._pushStderr(`${err instanceof Error ? err.message : err}\n`);
            proc._finish(1);
          }
        });
    });
    return proc;
  }

  port(num: number): string | null {
    return this._ports.get(num) ?? null;
  }

  async setPreviewScript(script: string): Promise<void> {
    this.previewScript = script;
  }

  async clearPreviewScript(): Promise<void> {
    this.previewScript = null;
  }

  snapshot(opts?: SnapshotOptions): Snapshot {
    const shallow = opts?.shallow ?? true;
    return this.volume.toSnapshot(
      undefined,
      shallow ? new Set(["node_modules", ".cache", ".npm"]) : undefined,
    );
  }

  async restore(snapshot: Snapshot): Promise<void> {
    const fresh = MemoryVolume.fromSnapshot(snapshot);
    (this.volume as any).tree = (fresh as any).tree;
  }
}
