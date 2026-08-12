import {
  FileChangeType,
  FileSystemProviderCapabilities,
  FileSystemProviderError,
  FileSystemProviderErrorCode,
  FileType,
  type IFileChange,
  type IFileDeleteOptions,
  type IFileOverwriteOptions,
  type IFileSystemProviderWithFileReadWriteCapability,
  type IFileWriteOptions,
  type IStat,
  type IWatchOptions,
} from "@codingame/monaco-vscode-files-service-override";
import { Emitter } from "@codingame/monaco-vscode-api/vscode/vs/base/common/event";
import {
  Disposable,
  type IDisposable,
  toDisposable,
} from "@codingame/monaco-vscode-api/vscode/vs/base/common/lifecycle";
import type { URI } from "@codingame/monaco-vscode-api/vscode/vs/base/common/uri";
import type { RuntimeFileSystem } from "../runtime/types";

/**
 * Backs VS Code's `file://` scheme with the runtime filesystem.
 *
 * Registered as an overlay rather than under a custom scheme on purpose: the
 * explorer, search, tasks, and every extension that assumes `file://` keep
 * working, and terminal cwds line up with editor paths without translation.
 */
export class RuntimeFileSystemProvider
  extends Disposable
  implements IFileSystemProviderWithFileReadWriteCapability
{
  readonly capabilities =
    FileSystemProviderCapabilities.FileReadWrite |
    FileSystemProviderCapabilities.PathCaseSensitive;

  private readonly _onDidChangeCapabilities = this._register(new Emitter<void>());
  readonly onDidChangeCapabilities = this._onDidChangeCapabilities.event;

  private readonly _onDidChangeFile = this._register(
    new Emitter<readonly IFileChange[]>(),
  );
  readonly onDidChangeFile = this._onDidChangeFile.event;

  constructor(private readonly _fs: RuntimeFileSystem) {
    super();
  }

  watch(resource: URI, _opts: IWatchOptions): IDisposable {
    // The runtime watches recursively already; `opts.recursive` and excludes
    // are handled by the file service on top of what we emit.
    const subscription = this._fs.watch(resource.path, (change) => {
      this._onDidChangeFile.fire([
        {
          resource: resource.with({ path: change.path }),
          type:
            change.kind === "created"
              ? FileChangeType.ADDED
              : change.kind === "deleted"
                ? FileChangeType.DELETED
                : FileChangeType.UPDATED,
        },
      ]);
    });
    return toDisposable(() => subscription.dispose());
  }

  async stat(resource: URI): Promise<IStat> {
    return this._wrap(resource, async () => {
      const stat = await this._fs.stat(resource.path);
      return {
        type: stat.type === "directory" ? FileType.Directory : FileType.File,
        mtime: stat.mtime,
        ctime: stat.ctime,
        size: stat.size,
      };
    });
  }

  async readdir(resource: URI): Promise<[string, FileType][]> {
    return this._wrap(resource, async () => {
      const entries = await this._fs.readdir(resource.path);
      return entries.map(
        (entry) =>
          [
            entry.name,
            entry.type === "directory"
              ? FileType.Directory
              : entry.type === "symlink"
                ? FileType.File | FileType.SymbolicLink
                : FileType.File,
          ] as [string, FileType],
      );
    });
  }

  async readFile(resource: URI): Promise<Uint8Array> {
    return this._wrap(resource, () => this._fs.readFile(resource.path));
  }

  async writeFile(
    resource: URI,
    content: Uint8Array,
    opts: IFileWriteOptions,
  ): Promise<void> {
    return this._wrap(resource, async () => {
      // VS Code relies on the provider to enforce these: `create: false` means
      // "only overwrite", `overwrite: false` means "only create".
      let exists = true;
      try {
        await this._fs.stat(resource.path);
      } catch {
        exists = false;
      }
      if (!exists && !opts.create) {
        throw FileSystemProviderError.create(
          `File does not exist: ${resource.path}`,
          FileSystemProviderErrorCode.FileNotFound,
        );
      }
      if (exists && !opts.overwrite) {
        throw FileSystemProviderError.create(
          `File already exists: ${resource.path}`,
          FileSystemProviderErrorCode.FileExists,
        );
      }
      await this._fs.writeFile(resource.path, content);
    });
  }

  async mkdir(resource: URI): Promise<void> {
    return this._wrap(resource, () => this._fs.mkdir(resource.path));
  }

  async delete(resource: URI, opts: IFileDeleteOptions): Promise<void> {
    return this._wrap(resource, () =>
      this._fs.delete(resource.path, { recursive: opts.recursive }),
    );
  }

  async rename(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void> {
    return this._wrap(from, () =>
      this._fs.rename(from.path, to.path, { overwrite: opts.overwrite }),
    );
  }

  /**
   * Translate runtime errors into the codes VS Code branches on. Without
   * this, a missing file surfaces as a generic failure and the editor offers
   * to "retry" instead of showing the file-not-found flow.
   */
  private async _wrap<T>(resource: URI, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof FileSystemProviderError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string } | undefined)?.code;
      if (code === "ENOENT" || /ENOENT|no such file/i.test(message)) {
        throw FileSystemProviderError.create(
          `${message} (${resource.path})`,
          FileSystemProviderErrorCode.FileNotFound,
        );
      }
      if (code === "EEXIST" || /EEXIST|already exists/i.test(message)) {
        throw FileSystemProviderError.create(
          message,
          FileSystemProviderErrorCode.FileExists,
        );
      }
      if (code === "ENOTDIR" || /ENOTDIR/i.test(message)) {
        throw FileSystemProviderError.create(
          message,
          FileSystemProviderErrorCode.FileNotADirectory,
        );
      }
      if (code === "EISDIR" || /EISDIR/i.test(message)) {
        throw FileSystemProviderError.create(
          message,
          FileSystemProviderErrorCode.FileIsADirectory,
        );
      }
      throw FileSystemProviderError.create(
        message,
        FileSystemProviderErrorCode.Unknown,
      );
    }
  }
}
