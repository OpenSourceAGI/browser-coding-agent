# Wedit

A [Zed](https://zed.dev)-inspired playground for [Nodepod](https://github.com/ScelarOrg/Nodepod) — the browser-native Node.js runtime. Features split panes, an integrated terminal running real Node.js in the browser, Monaco code editing, git integration, AI assistant, and live preview — all without a backend.

> **Experimental:** Both Wedit and [Nodepod](https://github.com/ScelarOrg/Nodepod) are in early development. Expect bugs, missing features, and breaking changes.

> **Disclaimer:** Wedit is not affiliated with [Zed Industries](https://zed.dev). This is an independent playground with a Zed-inspired design, built as a frontend for [Nodepod](https://github.com/ScelarOrg/Nodepod).

![React](https://img.shields.io/badge/React-19.2-blue)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

**Editor**
- Monaco-powered code editing with 20+ language grammars
- N-way split panes (horizontal/vertical nesting) with drag-to-resize
- Tab management with reorder, close, and back/forward navigation
- Minimap, word wrap, line numbers, indentation guides, cursor styling

**Extensions**
- Full Zed extension support with custom languages, commands, and themes
- **Built-in marketplace** with access to hundreds of real Zed extensions
- Extension API for Monaco editor, workspace, commands, and settings
- Install from marketplace, URL, or filesystem
- Hot-reload extensions without restart

**Terminal**
- Integrated xterm.js terminal with multiple tabs
- Runs real Node.js commands in the browser via nodepod (npm, node, shell builtins)
- ANSI color output themed to match the editor

**File Explorer**
- Project file tree with create, rename, delete, and duplicate
- Import local files and folders from your machine
- Drag-and-drop files between panes
- Auto-syncs with the in-memory virtual filesystem

**Git**
- Full git integration (init, stage, unstage, commit, push, pull)
- Visual diff view with staged/unstaged file lists
- GitHub token support for authenticated operations (push, pull, clone)

**AI Assistant**
- AI-powered chat panel with tool execution (file edit, terminal commands, search)
- OpenRouter integration with model selection
- Bug report tool — detects runtime issues and offers to report them on GitHub

**Live Preview**
- Embedded browser panel for previewing localhost servers
- Auto-navigates when a server starts (Express, Next.js, Vite, etc.)

**Extras**
- Command palette with fuzzy search (`Ctrl+Shift+P`)
- File finder (`Ctrl+P`)
- Global text search across project files
- Customizable keybindings (VSCode, JetBrains, Vim presets)
- 15+ color themes (One Dark Pro, GitHub, Catppuccin, and more)
- Persistent layout and settings per project
- Bug report button for quick issue filing

## Getting Started

### Install and run

```bash
git clone https://github.com/ScelarOrg/Wedit.git weditor
cd weditor
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Extensions & Marketplace

Wedit supports real Zed extensions with a built-in marketplace! See [ZED_EXTENSIONS.md](ZED_EXTENSIONS.md) for documentation.

**Browse the marketplace:**
1. Open the Marketplace panel (Shopping Bag icon in status bar)
2. Search from hundreds of real Zed extensions
3. Install themes, languages, and tools with one click

**Try the example extension:**
1. Copy `example-extension/` to your project at `/project/.weditor/extensions/`
2. Open the Extensions panel (Package icon in status bar)
3. Enable the extension and use `Ctrl+Shift+U` to convert text to uppercase

> **Note:** SharedArrayBuffer is required for the nodepod runtime. The Next.js config sets the necessary COEP/COOP headers automatically.

### Git integration

To use push/pull with GitHub, set a personal access token in **Settings > Git > GitHub Token**. The token is stored locally in your browser and never sent to any server.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server (localhost:3000) |
| `npm run build` | Production build (static export) |
| `npm run start` | Serve production build |
| `npm run lint` | Run ESLint |

## Project Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout, theme setup
│   └── page.tsx                # Main application shell
├── components/
│   ├── TitleBar.tsx            # Menu bar and panel toggles
│   ├── EditorPane.tsx          # Split pane layout and drag-drop
│   ├── CodeEditor.tsx          # Monaco editor integration
│   ├── FileTree.tsx            # Project file explorer
│   ├── TabBar.tsx              # File tab management
│   ├── TerminalPanel.tsx       # xterm.js terminal with tabs
│   ├── BrowserPanel.tsx        # Embedded preview browser
│   ├── GitPanel.tsx            # Git status, staging, commit, push/pull
│   ├── AIPanel.tsx             # AI assistant with tool execution
│   ├── CommandPalette.tsx      # Fuzzy command/file search
│   ├── SearchPanel.tsx         # Global text search
│   ├── SettingsModal.tsx       # Preferences UI
│   ├── KeymapEditor.tsx        # Keybinding customization
│   ├── HomeScreen.tsx          # Welcome screen with templates
│   └── ...                     # Context menus, icons, resize handles
├── stores/
│   ├── workspace-store.ts      # Editor layout, tabs, panes, open files
│   ├── nodepod-store.ts        # Nodepod instance and file tree sync
│   ├── settings-store.ts       # User preferences (persisted)
│   └── keymap-store.ts         # Keyboard shortcuts
├── lib/
│   ├── ai-sdk.ts               # AI agent loop and tool definitions
│   ├── themes.ts               # Color theme definitions
│   ├── keybind-dispatcher.ts   # Global keybinding handler
│   └── mock-data.ts            # Language detection, types
└── hooks/
    └── use-resizable.ts        # Resize drag handler
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16](https://nextjs.org) (static export) |
| UI | [React 19](https://react.dev), [Tailwind CSS 4](https://tailwindcss.com) |
| State | [Zustand 5](https://zustand.docs.pmnd.rs) |
| Code Editor | [Monaco Editor](https://microsoft.github.io/monaco-editor/) |
| Terminal | [xterm.js](https://xtermjs.org) |
| Runtime | [Nodepod](https://github.com/ScelarOrg/Nodepod) — browser-native Node.js (VFS, npm, shell, workers) |
| Icons | [Lucide React](https://lucide.dev) |

## How It Works

1. **Boot** — The app dynamically imports Nodepod and creates an in-memory Node.js environment with a virtual filesystem at `/project`.
2. **Edit** — Files are read/written through Nodepod's async fs API. Monaco renders with language detection and theme-matched colors.
3. **Run** — Terminal commands spawn worker-based processes. Output streams back in real time. HTTP servers register in Nodepod's server registry.
4. **Preview** — When a server starts on a port, the browser panel navigates to it. Requests are intercepted and dispatched through Nodepod's HTTP polyfill.

## Project Templates

When creating a new project, choose from:

- **Blank** — Empty workspace
- **React** — Vite + React starter
- **Node.js** — HTTP server example
- **Vite** — Vanilla JS with Vite

Each template comes with starter files and an optional auto-run command.

## Contributing

Found a bug or have a feature request? [Open an issue](https://github.com/ScelarOrg/Wedit/issues).
