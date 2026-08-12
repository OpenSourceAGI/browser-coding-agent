/**
 * Settings the workbench starts with.
 *
 * These are user settings, so anything here can be changed in the UI and
 * persists to storage; they exist to make the first run sane rather than to
 * lock anything down.
 */
export const DEFAULT_USER_CONFIGURATION = JSON.stringify(
  {
    "workbench.colorTheme": "Default Dark Modern",
    "workbench.startupEditor": "readme",
    "editor.fontSize": 13,
    "editor.minimap.enabled": false,
    "editor.tabSize": 2,
    "editor.renderWhitespace": "selection",
    "editor.guides.bracketPairs": true,
    "files.autoSave": "afterDelay",
    "files.autoSaveDelay": 1000,
    // The in-browser filesystem has no trash can to restore from.
    "files.enableTrash": false,
    "files.exclude": {
      "**/.git": true,
      "**/node_modules": false,
    },
    // Every search runs against the in-memory volume, so the usual "this
    // might be slow" guards are counterproductive.
    "search.followSymlinks": false,
    "search.useIgnoreFiles": true,
    "terminal.integrated.fontSize": 12,
    "terminal.integrated.cursorBlinking": true,
    // Without an explicit default, VS Code picks whichever detected profile
    // it likes — which can mean booting a container just to open a terminal.
    // Use the profile name from the runtime's nodepod driver.
    "terminal.integrated.defaultProfile.linux": "Nodepod (in-browser)",
    "terminal.integrated.profiles.linux": {
      "Nodepod (in-browser)": { path: "/bin/sh" },
      "Cloudflare Sandbox (container)": { path: "/bin/bash" },
    },
    // Nodepod's shell writes its own prompt; shell integration injection
    // would fight it.
    "terminal.integrated.shellIntegration.enabled": false,
    // There is no pty host to reattach to after a reload, so a "restored"
    // terminal is a dead tab that can never produce output. Start clean.
    "terminal.integrated.enablePersistentSessions": false,
    "telemetry.telemetryLevel": "off",
    "update.mode": "none",
  },
  null,
  2,
);

export const DEFAULT_KEYBINDINGS = JSON.stringify(
  [
    {
      key: "ctrl+`",
      command: "workbench.action.terminal.toggleTerminal",
    },
    {
      key: "ctrl+shift+`",
      command: "workbench.action.terminal.new",
    },
    {
      key: "ctrl+shift+p",
      command: "workbench.action.showCommands",
    },
  ],
  null,
  2,
);

export const PRODUCT_CONFIGURATION = {
  nameShort: "OpenVSCode Nodepod",
  nameLong: "OpenVSCode on Nodepod",
  applicationName: "openvscode-nodepod",
  dataFolderName: ".openvscode-nodepod",
  version: "1.0.0",
  // No marketplace: extensions would need a Node extension host we do not
  // have. The built-in extension host is web-worker only.
  extensionsGallery: undefined,
} as const;
