import type { Nodepod, Snapshot } from "@scelar/nodepod";
import { Emitter } from "./emitter";
import { NodepodFileSystem } from "./nodepod-fs";
import { NodepodTerminalDriver } from "./nodepod-terminal-driver";
import { SandboxTerminalDriver } from "./sandbox-terminal-driver";
import type {
  Disposable,
  ForwardedPort,
  TerminalDriver,
  TerminalDriverId,
  WorkspaceRuntime,
} from "./types";

export interface RuntimeBootOptions {
  workspaceRoot?: string;
  files?: Record<string, string | Uint8Array>;
  env?: Record<string, string>;
  swUrl?: string;
  /** Which driver terminals use at boot. Switchable later. */
  terminalDriver?: TerminalDriverId;
  allowedFetchDomains?: string[] | null;
  onStatus?: (message: string) => void;
}

/**
 * The runtime the workbench sees: one Nodepod-backed filesystem plus a
 * terminal driver that can be swapped between "this tab" and "a container"
 * without reloading the IDE or losing the workspace.
 */
export class NodepodWorkspaceRuntime implements WorkspaceRuntime {
  readonly fs: NodepodFileSystem;
  readonly workspaceRoot: string;
  readonly env: Record<string, string>;

  private readonly _onPortOpen = new Emitter<ForwardedPort>();
  private readonly _onPortClose = new Emitter<number>();
  private readonly _onDriverChange = new Emitter<TerminalDriver>();
  private readonly _ports = new Map<number, ForwardedPort>();
  private readonly _drivers = new Map<TerminalDriverId, TerminalDriver>();
  private _active: TerminalDriver;

  private constructor(
    private readonly _pod: Nodepod,
    workspaceRoot: string,
    env: Record<string, string>,
    initialDriver: TerminalDriverId,
  ) {
    this.workspaceRoot = workspaceRoot;
    this.env = env;
    this.fs = new NodepodFileSystem(_pod.fs.volume, workspaceRoot);
    this.fs.start();

    this._drivers.set("nodepod", new NodepodTerminalDriver(_pod));
    // Container boot progress is reported through the `prepare()` callback so
    // it lands in the terminal the user is watching, not in the boot splash
    // that is already gone by then.
    this._drivers.set(
      "sandbox",
      new SandboxTerminalDriver(this.fs, { workspaceRoot }),
    );
    this._active = this._drivers.get(initialDriver) ?? this._drivers.get("nodepod")!;
  }

  static async boot(
    opts: RuntimeBootOptions = {},
  ): Promise<NodepodWorkspaceRuntime> {
    const workspaceRoot = opts.workspaceRoot ?? "/workspace";
    const env = {
      NODE_ENV: "development",
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      ...opts.env,
    };

    opts.onStatus?.("Booting Nodepod runtime…");

    // Bound late so the boot callback can reach the instance it belongs to.
    let runtime: NodepodWorkspaceRuntime | null = null;

    const { Nodepod } = await import("@scelar/nodepod");

    const pod = await Nodepod.boot({
      files: opts.files,
      workdir: workspaceRoot,
      env,
      swUrl: opts.swUrl ?? "/__sw__.js",
      allowedFetchDomains: opts.allowedFetchDomains ?? null,
      onServerReady: (port: number, url: string) => {
        runtime?._registerPort(port, url);
      },
    });

    runtime = new NodepodWorkspaceRuntime(
      pod,
      workspaceRoot,
      env,
      opts.terminalDriver ?? "nodepod",
    );
    return runtime;
  }

  get terminals(): TerminalDriver {
    return this._active;
  }

  get terminalDriverId(): TerminalDriverId {
    return this._active.id as TerminalDriverId;
  }

  availableDrivers(): TerminalDriver[] {
    return [...this._drivers.values()];
  }

  onTerminalDriverChange(listener: (driver: TerminalDriver) => void): Disposable {
    return this._onDriverChange.on(listener);
  }

  /**
   * Switch where new terminals run. Existing terminals keep their driver —
   * killing a running dev server because the user changed a preference would
   * be worse than the inconsistency.
   */
  async setTerminalDriver(id: TerminalDriverId): Promise<TerminalDriver> {
    const driver = this._drivers.get(id);
    if (!driver) throw new Error(`Unknown terminal driver: ${id}`);
    if (driver === this._active) return driver;
    this._active = driver;
    this._onDriverChange.fire(driver);
    return driver;
  }

  get sandbox(): SandboxTerminalDriver {
    return this._drivers.get("sandbox") as SandboxTerminalDriver;
  }

  onPortOpen(listener: (p: ForwardedPort) => void): Disposable {
    return this._onPortOpen.on(listener);
  }

  onPortClose(listener: (port: number) => void): Disposable {
    return this._onPortClose.on(listener);
  }

  listPorts(): ForwardedPort[] {
    return [...this._ports.values()];
  }

  resolveExternalUri(port: number): string | undefined {
    const known = this._ports.get(port);
    if (known) return known.url;
    return this._pod.port(port) ?? undefined;
  }

  /**
   * Run a command to completion in the in-browser runtime and collect its
   * output. Used for one-shot work (npm install, scaffolding) that should not
   * take over a visible terminal.
   */
  async run(
    command: string,
    args: string[] = [],
    opts: { cwd?: string } = {},
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const proc = await this._pod.spawn(command, args, {
      cwd: opts.cwd ?? this.workspaceRoot,
      env: this.env,
    });
    return proc.completion;
  }

  snapshot(): Snapshot {
    return this._pod.snapshot();
  }

  async restore(snapshot: Snapshot): Promise<void> {
    await this._pod.restore(snapshot);
  }

  dispose(): void {
    for (const driver of this._drivers.values()) driver.dispose();
    this._drivers.clear();
    this.fs.dispose();
    this._onPortOpen.clear();
    this._onPortClose.clear();
    this._onDriverChange.clear();
    try {
      this._pod.teardown();
    } catch {
      // Already torn down.
    }
  }

  private _registerPort(port: number, url: string): void {
    const entry = { port, url };
    this._ports.set(port, entry);
    this._onPortOpen.fire(entry);
  }
}
