/**
 * DockPanel
 * Hosts dockable panels and sidebars (such as explorer, search, and extensions),
 * and manages their layout and visibility.
 */
"use client";
import { useWorkspaceStore, type PanelKind } from "@/stores/workspace-store";
import { ProjectPanel } from "@/components/file-management/ProjectPanel";
import { GitPanel } from "@/components/sidebar-panels/GitPanel";
import { SearchPanel } from "@/components/sidebar-panels/SearchPanel";
import { TerminalPanel } from "@/components/terminal-console/TerminalPanel";
import { BrowserPanel } from "@/components/documentation-browser/BrowserPanel";
import { AIPanel } from "@/components/artificial-intelligence/AIPanel";
import { ExtensionsPanel } from "@/components/marketplace-extensions/ExtensionsPanel";
import { MarketplacePanel } from "@/components/marketplace-extensions/MarketplacePanel";
import { cn } from '@/lib/shared-utilities/cn';
import { ErrorBoundary } from "@/components/user-interface/ErrorBoundary";
import {
  FolderOpen,
  Search,
  GitBranch,
  Terminal,
  Globe,
  Bot,
  Puzzle,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";

function PanelContent({ panel }: { panel: PanelKind }) {
  let content;
  switch (panel) {
    case "project":
      content = <ProjectPanel />;
      break;
    case "git":
      content = <GitPanel />;
      break;
    case "search":
      content = <SearchPanel />;
      break;
    case "terminal":
      content = <TerminalPanel />;
      break;
    case "browser":
      content = <BrowserPanel />;
      break;
    case "ai":
      content = <AIPanel />;
      break;
    case "extensions":
      content = <ExtensionsPanel />;
      break;
    case "marketplace":
      content = <MarketplacePanel />;
      break;
    default:
      return null;
  }
  return <ErrorBoundary>{content}</ErrorBoundary>;
}

const PANEL_ICONS: Record<PanelKind, LucideIcon> = {
  project: FolderOpen,
  search: Search,
  git: GitBranch,
  terminal: Terminal,
  browser: Globe,
  ai: Bot,
  extensions: Puzzle,
  marketplace: ShoppingBag,
};

const PANEL_LABELS: Record<PanelKind, string> = {
  project: "Explorer",
  search: "Search",
  git: "Source Control",
  terminal: "Terminal",
  browser: "Browser",
  ai: "AI Assistant",
  extensions: "Extensions",
  marketplace: "Marketplace",
};

interface DockPanelProps {
  position: "left" | "right" | "bottom";
  panels: PanelKind[];
}

export function DockPanel({ position, panels }: DockPanelProps) {
  const dock = useWorkspaceStore((s) =>
    position === "left" ? s.leftDock : position === "right" ? s.rightDock : s.bottomDock
  );
  const setLeftPanel = useWorkspaceStore((s) => s.setLeftPanel);
  const setRightPanel = useWorkspaceStore((s) => s.setRightPanel);
  const setBottomPanel = useWorkspaceStore((s) => s.setBottomPanel);

  const setPanel = position === "left" ? setLeftPanel : position === "right" ? setRightPanel : setBottomPanel;
  const hasBrowser = panels.includes("browser");
  const showActivityBar = position === "left" && panels.length > 1;

  return (
    <div className="flex h-full bg-bg0">
      {/* Activity bar — only for left dock with multiple panels */}
      {showActivityBar && (
        <div className="flex flex-col items-center gap-0.5 w-10 shrink-0 border-r border-border py-1 bg-bg0">
          {panels.map((p) => {
            const Icon = PANEL_ICONS[p];
            const active = dock.activePanel === p;
            return (
              <button
                key={p}
                onClick={() => setPanel(p)}
                title={PANEL_LABELS[p]}
                className={cn(
                  "w-8 h-8 flex items-center justify-center rounded transition-colors",
                  active
                    ? "text-accent bg-accent/10"
                    : "text-t4 hover:text-t2 hover:bg-hover"
                )}
              >
                <Icon size={16} />
              </button>
            );
          })}
        </div>
      )}

      <div className="flex-1 min-w-0 min-h-0 overflow-hidden relative">
        {/* Keep BrowserPanel always mounted to preserve iframe state */}
        {hasBrowser && (
          <div className={cn("w-full h-full", dock.activePanel !== "browser" && "hidden")}>
            <BrowserPanel />
          </div>
        )}
        {dock.activePanel !== "browser" && (
          <PanelContent panel={dock.activePanel} />
        )}
      </div>
    </div>
  );
}
