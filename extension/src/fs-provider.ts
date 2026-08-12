import * as vscode from "vscode";
import type { BridgeClient } from "../../src/protocol/channel.js";
import { BridgeError } from "../../src/protocol/channel.js";
import {
  FileChangeTypeDTO,
  type FileChangeDTO,
} from "../../src/protocol/messages.js";

let watcherSequence = 0;

/**
 * The workspace filesystem.
 *
 * Every call is one bridge round trip to the host page, where it lands in
 * Nodepod's in-memory VFS. There is no server in this path at all — a save is a
 * `postMessage`, not an HTTP request — which is what makes editing feel local.
 * Durability is a separate concern handled by the sync engine on the host side.
 */
export class OpenDSFileSystemProvider implements vscode.FileSystemProvider {
  private readonly _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this._emitter.event;

  private readonly _client: BridgeClient;
  private readonly _watchers = new Map<string, string>();
  private readonly _scheme: string;
  private readonly _authority: string;

  constructor(client: BridgeClient, scheme: string, authority: string) {
    this._client = client;
    this._scheme = scheme;
    this._authority = authority;
    client.on("fs.changed", ({ changes }) => {
      this._emitter.fire(changes.map((change) => this._toFileChangeEvent(change)));
    });
  }

  watch(
    uri: vscode.Uri,
    options: { recursive: boolean; excludes: readonly string[] },
  ): vscode.Disposable {
    const id = `w${++watcherSequence}`;
    this._watchers.set(id, uri.path);

    void this._client
      .request("fs.watch", {
        id,
        path: uri.path,
        recursive: options.recursive,
        excludes: [...options.excludes],
      })
      .catch(() => undefined);

    return new vscode.Disposable(() => {
      this._watchers.delete(id);
      void this._client.request("fs.unwatch", { id }).catch(() => undefined);
    });
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const stat = await this._call(() =>
      this._client.request("fs.stat", { path: uri.path }),
    uri);
    return {
      type: stat.type as vscode.FileType,
      ctime: stat.ctime,
      mtime: stat.mtime,
      size: stat.size,
    };
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const entries = await this._call(
      () => this._client.request("fs.readDirectory", { path: uri.path }),
      uri,
    );
    return entries.map(([name, type]) => [name, type as vscode.FileType]);
  }

  async createDirectory(uri: vscode.Uri): Promise<void> {
    await this._call(
      () => this._client.request("fs.createDirectory", { path: uri.path }),
      uri,
    );
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const { data } = await this._call(
      () => this._client.request("fs.readFile", { path: uri.path }),
      uri,
    );
    return data;
  }

  async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean },
  ): Promise<void> {
    await this._call(
      () =>
        this._client.request("fs.writeFile", {
          path: uri.path,
          // Copy out of any pooled buffer before it crosses the channel: the
          // structured clone is asynchronous and VS Code may reuse the memory.
          data: new Uint8Array(content),
          create: options.create,
          overwrite: options.overwrite,
        }),
      uri,
    );
  }

  async delete(
    uri: vscode.Uri,
    options: { recursive: boolean },
  ): Promise<void> {
    await this._call(
      () =>
        this._client.request("fs.delete", {
          path: uri.path,
          recursive: options.recursive,
        }),
      uri,
    );
  }

  async rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { overwrite: boolean },
  ): Promise<void> {
    await this._call(
      () =>
        this._client.request("fs.rename", {
          from: oldUri.path,
          to: newUri.path,
          overwrite: options.overwrite,
        }),
      newUri,
    );
  }

  async copy(
    source: vscode.Uri,
    destination: vscode.Uri,
    options: { overwrite: boolean },
  ): Promise<void> {
    await this._call(
      () =>
        this._client.request("fs.copy", {
          from: source.path,
          to: destination.path,
          overwrite: options.overwrite,
        }),
      destination,
    );
  }

  /**
   * Translates bridge errors into the `FileSystemError` variants VS Code
   * branches on. Returning a generic error here makes the explorer refuse to
   * create files ("unavailable") instead of proceeding after a normal ENOENT.
   */
  private async _call<T>(
    operation: () => Promise<T>,
    uri: vscode.Uri,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw toFileSystemError(error, uri);
    }
  }

  private _toFileChangeEvent(change: FileChangeDTO): vscode.FileChangeEvent {
    const type =
      change.type === FileChangeTypeDTO.Created
        ? vscode.FileChangeType.Created
        : change.type === FileChangeTypeDTO.Deleted
          ? vscode.FileChangeType.Deleted
          : vscode.FileChangeType.Changed;
    return {
      type,
      uri: vscode.Uri.from({
        scheme: this._scheme,
        authority: this._authority,
        path: change.path,
      }),
    };
  }
}

export function toFileSystemError(
  error: unknown,
  uri: vscode.Uri,
): vscode.FileSystemError {
  const code = error instanceof BridgeError ? error.code : "Unknown";
  const message = error instanceof Error ? error.message : String(error);

  switch (code) {
    case "FileNotFound":
      return vscode.FileSystemError.FileNotFound(uri);
    case "FileExists":
      return vscode.FileSystemError.FileExists(uri);
    case "FileNotADirectory":
      return vscode.FileSystemError.FileNotADirectory(uri);
    case "FileIsADirectory":
      return vscode.FileSystemError.FileIsADirectory(uri);
    case "NoPermissions":
      return vscode.FileSystemError.NoPermissions(uri);
    default:
      return vscode.FileSystemError.Unavailable(`${message} (${uri.toString()})`);
  }
}
