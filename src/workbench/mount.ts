import { OpenDSSession, type OpenDSSessionEvents } from "../client/session.js";
import type { OpenDSCodeConfig, ResolvedConfig } from "../client/config.js";

export interface MountOptions extends OpenDSSessionEvents {
  /** Element the workbench iframe is appended to. */
  container: HTMLElement;
  config: OpenDSCodeConfig;
  /**
   * Route that serves the workbench HTML (see `createWorkbenchHandler`).
   * Defaults to `${apiBase}/workbench`, or `/api/opends/workbench`.
   */
  workbenchUrl?: string;
  /** Reuse an already-started session instead of creating one. */
  session?: OpenDSSession;
}

export interface OpenDSCodeInstance {
  readonly session: OpenDSSession;
  readonly iframe: HTMLIFrameElement;
  /** Resolves once the Nodepod runtime is up. The workbench boots in parallel. */
  readonly ready: Promise<void>;
  dispose(): Promise<void>;
}

/**
 * Boots the runtime on this page and drops the workbench into `container`.
 *
 * The workbench lives in an iframe rather than the page itself for two reasons:
 * it wants to own `document.body`, and keeping it in a separate document stops
 * VS Code's global keybindings from fighting with the host app's. The iframe is
 * same-origin, which is what lets the bridge use a BroadcastChannel.
 */
export function mountOpenDSCode(options: MountOptions): OpenDSCodeInstance {
  const session =
    options.session ??
    new OpenDSSession(options.config, {
      ...(options.onReady ? { onReady: options.onReady } : {}),
      ...(options.onSyncStatus ? { onSyncStatus: options.onSyncStatus } : {}),
      ...(options.onPreview ? { onPreview: options.onPreview } : {}),
      ...(options.onError ? { onError: options.onError } : {}),
    });

  const ready = session.start();

  const iframe = document.createElement("iframe");
  // Take the session id from the session itself. Re-resolving the raw config
  // would mint a *second* random id when the caller did not supply one, and the
  // workbench would then listen on a channel nobody is serving.
  iframe.src = buildWorkbenchUrl(options, session.config);
  iframe.title = "OpenDS Code";
  iframe.style.cssText =
    "display:block;width:100%;height:100%;border:0;background:#1f1f1f;";
  // Needed for the workbench's own webview/extension-host iframes and for
  // clipboard access inside the editor.
  iframe.allow = "clipboard-read; clipboard-write; cross-origin-isolated";
  options.container.appendChild(iframe);

  return {
    session,
    iframe,
    ready,
    async dispose() {
      iframe.remove();
      await session.dispose();
    },
  };
}

export function buildWorkbenchUrl(
  options: Pick<MountOptions, "workbenchUrl">,
  resolved: ResolvedConfig,
): string {
  const base =
    options.workbenchUrl ?? `${resolved.apiBase ?? "/api/opends"}/workbench`;

  const url = new URL(
    base,
    typeof location !== "undefined" ? location.href : "http://localhost",
  );
  url.searchParams.set("session", resolved.sessionId);
  url.searchParams.set("scheme", resolved.scheme);
  url.searchParams.set("workspace", resolved.workspaceName);
  if (resolved.sandbox.enabled) url.searchParams.set("sandbox", "1");
  return url.toString();
}
