/**
 * @opensourceagi/opends-code
 *
 * OpenVSCode Web that runs entirely in the browser.
 *
 *   • The workbench is static — no remote extension host, no `vscode-server`.
 *   • The workspace filesystem, shell, processes and npm are Nodepod polyfills
 *     running on the page, reached over a same-origin bridge.
 *   • Persistence is a debounced push to Cloudflare R2, off the editing path.
 *   • A Cloudflare Sandbox container is created only if a user opens a cloud
 *     terminal, and never for editing, browsing, searching or saving.
 *   • Authentication is the host application's job; this package only ever
 *     asks it "who is this request?".
 *
 * Subpath exports:
 *   `/client`   runtime + session (browser)
 *   `/react`    <OpenDSCode /> and hooks
 *   `/protocol` the host <-> extension wire contract
 *   `/storage`  persistence adapters and the sync engine
 *   `/server`   framework-agnostic route handlers
 *   `/next`     Next.js App Router adapter
 *   `/worker`   Cloudflare Worker entry
 */

export const VERSION = "0.1.0";

export type {
  OpenDSCodeConfig,
  ResolvedConfig,
  SandboxConfig,
} from "./client/config.js";
export type { OpenDSSessionEvents } from "./client/session.js";
export type {
  RuntimeInfoDTO,
  SyncStatusDTO,
  PreviewPortDTO,
  TerminalMode,
  FileStatDTO,
  FileChangeDTO,
} from "./protocol/messages.js";
export type { StorageAdapter, StorageEntry } from "./storage/types.js";
export type {
  AuthContext,
  Authorize,
  OpenDSServerConfig,
} from "./server/types.js";

export { PROTOCOL_VERSION } from "./protocol/messages.js";
export { WORKSPACE_ROOT, normalizePath } from "./protocol/paths.js";
