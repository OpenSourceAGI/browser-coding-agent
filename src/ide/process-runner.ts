// Wrapper around nodepod.spawn (plan step 1.3). Centralizes process
// lifecycle for the IDE: streaming callbacks, active-process tracking,
// kill-all on teardown, and a promise API over proc.completion.

import type { SpawnOptions } from "../sdk/types";
import type { IdeProcess } from "./host";

export interface SpawnHost {
  spawn(
    cmd: string,
    args?: string[],
    opts?: SpawnOptions,
  ): Promise<IdeProcess>;
}

export interface RunOptions extends SpawnOptions {
  /** Streamed stdout chunks. */
  onOutput?: (chunk: string) => void;
  /** Streamed stderr chunks. */
  onError?: (chunk: string) => void;
  /** Exit notification (also reflected in the completion result). */
  onExit?: (code: number) => void;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface RunningProcess {
  readonly command: string;
  readonly process: IdeProcess;
  /** Resolves when the process exits. */
  readonly completion: Promise<RunResult>;
  write(data: string): void;
  kill(): void;
}

export class ProcessRunner {
  private _host: SpawnHost;
  private _active = new Set<RunningProcess>();

  constructor(host: SpawnHost) {
    this._host = host;
  }

  get activeCount(): number {
    return this._active.size;
  }

  /** Spawn without waiting for exit — for dev servers and watchers. */
  async start(
    cmd: string,
    args?: string[],
    opts: RunOptions = {},
  ): Promise<RunningProcess> {
    const { onOutput, onError, onExit, ...spawnOpts } = opts;
    const proc = await this._host.spawn(cmd, args, spawnOpts);

    // Always subscribe both streams: an unhandled "error" event throws in
    // Node EventEmitter semantics, and the runner owns the process lifecycle.
    proc.on("output", (chunk: string) => onOutput?.(chunk));
    proc.on("error", (chunk: string) => onError?.(chunk));
    if (onExit) proc.on("exit", onExit);

    const label = args?.length ? `${cmd} ${args.join(" ")}` : cmd;
    const running: RunningProcess = {
      command: label,
      process: proc,
      completion: proc.completion,
      write: (data) => proc.write(data),
      kill: () => proc.kill(),
    };

    this._active.add(running);
    proc.completion.finally(() => this._active.delete(running));
    return running;
  }

  /** Spawn and wait for exit, returning collected stdout/stderr/exitCode. */
  async run(
    cmd: string,
    args?: string[],
    opts: RunOptions = {},
  ): Promise<RunResult> {
    const running = await this.start(cmd, args, opts);
    return running.completion;
  }

  /** Sugar for `node <script>` (plan step 3.2). */
  async runNode(
    script: string,
    args: string[] = [],
    opts: RunOptions = {},
  ): Promise<RunResult> {
    return this.run("node", [script, ...args], opts);
  }

  /** Kill every process started through this runner. */
  killAll(): void {
    for (const running of [...this._active]) {
      try {
        running.kill();
      } catch {
        /* already dead */
      }
    }
  }
}
