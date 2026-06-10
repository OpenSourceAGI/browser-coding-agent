// The narrow slice of a booted Nodepod that the IDE layers consume.
// Keeping the IDE coupled to these interfaces (instead of the Nodepod class)
// lets tests drive the data layer with fakes and keeps the UI swappable.

import type { NodepodFS } from "../sdk/nodepod-fs";
import type {
  SpawnOptions,
  TerminalOptions,
  Snapshot,
  SnapshotOptions,
} from "../sdk/types";
import type { InstallFlags } from "../packages/installer";

/** Filesystem surface used by the IDE — exactly the nodepod.fs API. */
export type IdeFsApi = Pick<
  NodepodFS,
  | "readFile"
  | "writeFile"
  | "readdir"
  | "stat"
  | "mkdir"
  | "unlink"
  | "rmdir"
  | "rename"
  | "exists"
  | "watch"
>;

/** Process surface returned by spawn() — matches NodepodProcess. */
export interface IdeProcess {
  on(event: "output" | "error" | "exit", handler: (arg: any) => void): unknown;
  readonly completion: Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>;
  readonly exited: boolean;
  write(data: string): void;
  kill(): void;
}

/** Terminal surface returned by createTerminal() — matches NodepodTerminal. */
export interface IdeTerminal {
  attach(target: HTMLElement | string): void;
  fit?(): void;
  dispose?(): void;
}

/** Everything the IDE needs from a booted Nodepod instance. */
export interface IdeHost {
  readonly fs: IdeFsApi;
  readonly cwd: string;
  spawn(
    cmd: string,
    args?: string[],
    opts?: SpawnOptions,
  ): Promise<IdeProcess>;
  port(num: number): string | null;
  setPreviewScript(script: string): Promise<void>;
  clearPreviewScript(): Promise<void>;
  createTerminal?(opts: TerminalOptions): IdeTerminal;
  install?(packages?: string | string[], flags?: InstallFlags): Promise<void>;
  snapshot?(opts?: SnapshotOptions): Snapshot;
  restore?(snapshot: Snapshot, opts?: SnapshotOptions): Promise<void>;
}
