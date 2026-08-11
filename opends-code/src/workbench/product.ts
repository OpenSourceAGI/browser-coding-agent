/**
 * Builds the object the workbench boots from.
 *
 * `vscode-web`'s `workbench.js` reads `window.product` (falling back to
 * fetching `product.json`) and passes it straight to `create()`, so this single
 * object carries both product metadata and `IWorkbenchConstructionOptions`.
 */

export const BRIDGE_EXTENSION_ID = "opensourceagi.opends-bridge";

export interface WorkbenchProductOptions {
  sessionId: string;
  /** URI scheme the bridge extension registers a FileSystemProvider for. */
  scheme: string;
  /** Folder name shown as the workspace root. */
  workspaceName: string;
  /** URL of the folder containing the bridge extension's `package.json`. */
  bridgeExtensionUrl: string;
  /** True when a "Cloud Sandbox" terminal profile should be offered. */
  sandboxAvailable: boolean;
  /** Base URL of the server routes, handed to the extension for sandbox calls. */
  apiBase?: string | undefined;
  /** Extra built-in extension folder URLs. */
  additionalBuiltinExtensions?: string[];
  /** VS Code settings applied as workbench defaults. */
  settings?: Record<string, unknown>;
  /** Open VSX or another gallery. Omit to run with no marketplace. */
  extensionGallery?: Record<string, string>;
  /**
   * Origin used to absolutise relative extension URLs. Required when building
   * the document on a server, where `location` does not exist — a wrong origin
   * here means the workbench silently fails to load the bridge extension.
   */
  origin?: string;

  /** Shallow-merged over everything above. */
  overrides?: Record<string, unknown>;
}

export interface UriComponentsLike {
  scheme: string;
  authority?: string;
  path: string;
}

const DEFAULT_SETTINGS: Record<string, unknown> = {
  "workbench.startupEditor": "readme",
  "workbench.colorTheme": "Default Dark Modern",
  "files.autoSave": "afterDelay",
  "files.autoSaveDelay": 800,
  // The virtual filesystem has no notion of a trash can, so a deleted file is
  // gone. Confirming first keeps that from being a surprise.
  "explorer.confirmDelete": true,
  "telemetry.telemetryLevel": "off",
  "update.mode": "none",
  "extensions.autoCheckUpdates": false,
  "extensions.autoUpdate": false,
  // A web workbench has no local pty, so the contributed profiles are the only
  // ones available — name the browser shell as default on every host platform.
  "terminal.integrated.defaultProfile.linux": "node (browser)",
  "terminal.integrated.defaultProfile.osx": "node (browser)",
  "terminal.integrated.defaultProfile.windows": "node (browser)",
  "npm.autoDetect": "on",
  "typescript.tsserver.web.projectWideIntellisense.enabled": true,
};

export function buildWorkbenchProduct(
  options: WorkbenchProductOptions,
): Record<string, unknown> {
  // The workspace name lives in the *authority*, not the path, so that a file's
  // `uri.path` is already workspace-relative (`/src/index.ts`). That removes a
  // whole class of prefix-stripping bugs between the extension and the runtime.
  const folderUri: UriComponentsLike = {
    scheme: options.scheme,
    authority: options.workspaceName,
    path: "/",
  };

  const builtinExtensions = [
    options.bridgeExtensionUrl,
    ...(options.additionalBuiltinExtensions ?? []),
  ].map((url) => toUriComponents(url, options.origin));

  const product: Record<string, unknown> = {
    // ---- workbench construction options -----------------------------------
    folderUri,
    additionalBuiltinExtensions: builtinExtensions,
    configurationDefaults: {
      ...DEFAULT_SETTINGS,
      ...options.settings,
      // How the extension finds its way back to this page's bridge. Settings
      // are the only channel available to a web extension at activation time.
      "opends.sessionId": options.sessionId,
      "opends.scheme": options.scheme,
      "opends.workspaceName": options.workspaceName,
      "opends.apiBase": options.apiBase ?? "",
      "opends.sandboxAvailable": options.sandboxAvailable,
    },
    developmentOptions: {
      logLevel: 2, // Info
    },

    // ---- product metadata --------------------------------------------------
    productConfiguration: {
      nameShort: "OpenDS Code",
      nameLong: "OpenDS Code (Web)",
      applicationName: "opends-code",
      dataFolderName: ".opends-code",
      version: "1.91.1",
      urlProtocol: "opends-code",
      reportIssueUrl: "",
      licenseUrl: "",
      // Grants the bridge extension the proposed search APIs. Without this,
      // Ctrl+P and Ctrl+Shift+F silently return nothing in a virtual workspace.
      extensionEnabledApiProposals: {
        [BRIDGE_EXTENSION_ID]: [
          "fileSearchProvider",
          "textSearchProvider",
          "terminalDataWriteEvent",
        ],
      },
      ...(options.extensionGallery
        ? { extensionsGallery: options.extensionGallery }
        : {}),
      // `webEndpointUrlTemplate`, `commit` and `quality` are deliberately unset.
      // When all three are present VS Code serves the web extension host from a
      // separate CDN origin; leaving them out keeps that iframe same-origin,
      // which is what lets the extension share a BroadcastChannel with this page.
    },
  };

  return { ...product, ...options.overrides };
}

/** Open VSX — the marketplace VS Code derivatives are permitted to use. */
export const OPEN_VSX_GALLERY = {
  serviceUrl: "https://open-vsx.org/vscode/gallery",
  itemUrl: "https://open-vsx.org/vscode/item",
  resourceUrlTemplate:
    "https://open-vsx.org/vscode/unpkg/{publisher}/{name}/{version}/{path}",
};

function toUriComponents(url: string, origin?: string): UriComponentsLike {
  // Relative paths are the common case (the extension is served next to the
  // workbench assets) and `new URL` needs an absolute base for those. On the
  // server the base comes from the request; in the browser, from `location`.
  const base =
    origin ?? (typeof location !== "undefined" ? location.origin : undefined);
  if (!base) {
    throw new Error(
      `cannot resolve "${url}" without an origin — pass \`origin\` when building workbench options on a server`,
    );
  }

  const parsed = new URL(url, base);
  return {
    scheme: parsed.protocol.replace(/:$/, ""),
    authority: parsed.host,
    path: parsed.pathname.replace(/\/+$/, ""),
  };
}
