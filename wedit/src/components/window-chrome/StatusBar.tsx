/**
 * StatusBar
 * Shows status messages, cursor position, and background tasks at the bottom.
 */
"use client";
import { cn } from '@/lib/shared-utilities/cn';
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  FolderTree,
  Search,
  GitBranch,
  Sparkles,
  Globe,
  Package,
  ShoppingBag,
} from "lucide-react";
import { PerfMonitor } from "@/components/developer-tools/PerfMonitor";

const LANG_DISPLAY: Record<string, string> = {
  rust: "Rust",
  typescript: "TypeScript",
  javascript: "JavaScript",
  json: "JSON",
  toml: "TOML",
  markdown: "Markdown",
  css: "CSS",
  scss: "SCSS",
  less: "Less",
  html: "HTML",
  xml: "XML",
  yaml: "YAML",
  python: "Python",
  shell: "Shell",
  svelte: "Svelte",
  vue: "Vue",
  graphql: "GraphQL",
  sql: "SQL",
  go: "Go",
  java: "Java",
  kotlin: "Kotlin",
  ruby: "Ruby",
  php: "PHP",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  swift: "Swift",
  r: "R",
  lua: "Lua",
  perl: "Perl",
  ini: "INI",
  dockerfile: "Dockerfile",
  plaintext: "Plain Text",
};

export function StatusBar() {
  const leftDockVisible = useWorkspaceStore((s) => s.leftDock.visible);
  const leftDockPanel = useWorkspaceStore((s) => s.leftDock.activePanel);
  const rightDockVisible = useWorkspaceStore((s) => s.rightDock.visible);
  const setLeftPanel = useWorkspaceStore((s) => s.setLeftPanel);
  const toggleLeftDock = useWorkspaceStore((s) => s.toggleLeftDock);
  const toggleRightDock = useWorkspaceStore((s) => s.toggleRightDock);
  const openTab = useWorkspaceStore((s) => s.openTab);
  const activeFileLanguage = useWorkspaceStore((s) => {
    const pane = s.panes[s.activePaneId];
    const tab = pane?.activeTab;
    return tab ? (s.openFiles[tab]?.language ?? null) : null;
  });

  const panelIcons = [
    { kind: "project" as const, icon: <FolderTree size={16} />, label: "Project" },
    { kind: "search" as const, icon: <Search size={16} />, label: "Search" },
    { kind: "git" as const, icon: <GitBranch size={16} />, label: "Git" },
    { kind: "extensions" as const, icon: <Package size={16} />, label: "Extensions" },
    { kind: "marketplace" as const, icon: <ShoppingBag size={16} />, label: "Marketplace" },
  ];

  return (
    <div
      className={cn(
        "h-[26px] flex items-center justify-between px-2 text-[11px] select-none shrink-0",
        "bg-bg0 border-t border-border text-t4"
      )}
    >
      {/* Left side */}
      <div className="flex items-center gap-2">
        {/* Panel toggle icons */}
        {panelIcons.map(({ kind, icon, label }) => {
          const isActive = leftDockVisible && leftDockPanel === kind;
          return (
            <button
              key={kind}
              onClick={() => {
                if (isActive) {
                  toggleLeftDock();
                } else {
                  setLeftPanel(kind);
                }
              }}
              className={cn(
                "p-0.5 rounded hover:bg-hover",
                isActive ? "text-accent" : "hover:text-t3"
              )}
              title={label}
            >
              {icon}
            </button>
          );
        })}

        {/* Separator */}
        <div className="w-px self-stretch bg-border" />

        {/* Git branch icon */}
        <span className="flex items-center">
          <GitBranch size={11} className="text-git-branch" />
        </span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Performance monitor */}
        <PerfMonitor />

        {/* Language */}
        {activeFileLanguage && (
          <span>{LANG_DISPLAY[activeFileLanguage] || activeFileLanguage}</span>
        )}

        {/* Browser tab */}
        <button
          onClick={() => openTab("tab:browser")}
          className="p-0.5 rounded hover:bg-hover hover:text-t3"
          title="Open Browser (Ctrl+Shift+I)"
        >
          <Globe size={16} />
        </button>

        {/* AI panel toggle */}
        <button
          onClick={toggleRightDock}
          className={cn(
            "p-0.5 rounded hover:bg-hover",
            rightDockVisible ? "text-accent" : "hover:text-t3"
          )}
          title="Toggle AI Panel"
        >
          <Sparkles size={16} />
        </button>
      </div>
    </div>
  );
}
