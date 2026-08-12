/**
 * TabBar
 * Renders editor tabs, supports dragging, reordering, and context actions.
 */
"use client";
import { useRef, useState, useEffect, useCallback, memo } from "react";
import { cn } from '@/lib/shared-utilities/cn';
import { FileIcon } from "@/components/user-interface/FileIcon";
import { X, Maximize2, Minimize2, ChevronLeft, ChevronRight, Keyboard, Globe, Sparkles } from "lucide-react";
import { useWorkspaceStore, getTabType, getTabLabel, isSpecialTab, type TabType } from "@/stores/workspace-store";
import { useShallow } from "zustand/react/shallow";
import { ContextMenu, type ContextMenuSection } from "@/components/user-interface/ContextMenu";

function SpecialTabIcon({ type, size = 13 }: { type: TabType; size?: number }) {
  switch (type) {
    case "keymap": return <Keyboard size={size} className="text-accent shrink-0" />;
    case "browser": return <Globe size={size} className="text-accent shrink-0" />;
    case "ai": return <Sparkles size={size} className="text-purple shrink-0" />;
    default: return null;
  }
}

type DropSide = "left" | "right" | null;

interface TabProps {
  fileName: string;
  paneId: string;
  active: boolean;
  modified?: boolean;
  index: number;
  onContextMenu: (e: React.MouseEvent, fileName: string) => void;
}

const Tab = memo(function Tab({ fileName, paneId, active, modified, index, onContextMenu }: TabProps) {
  const tabRef = useRef<HTMLDivElement>(null);
  const [dropSide, setDropSide] = useState<DropSide>(null);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/weditor-tab", JSON.stringify({ paneId, fileName, index }));
    e.dataTransfer.effectAllowed = "move";
    useWorkspaceStore.getState().startTabDrag(fileName, paneId);
  };

  const handleDragEnd = () => {
    useWorkspaceStore.getState().endTabDrag();
  };

  const handleDragOver = (e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    if (!types.includes("application/weditor-tab") && !types.includes("application/weditor-file")) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";

    const el = tabRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    setDropSide(e.clientX < midX ? "left" : "right");
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (tabRef.current && !tabRef.current.contains(e.relatedTarget as Node)) {
      setDropSide(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const side = dropSide;
    setDropSide(null);

    const tabData = e.dataTransfer.getData("application/weditor-tab");
    if (tabData) {
      const data = JSON.parse(tabData);
      if (data.paneId === paneId) {
        // Same pane reorder: compute target index based on drop side
        const targetIdx = side === "left" ? index : index + 1;
        // Adjust if dragging from before the target
        const adjustedTarget = data.index < targetIdx ? targetIdx - 1 : targetIdx;
        if (data.index !== adjustedTarget) {
          useWorkspaceStore.getState().reorderTab(paneId, data.index, adjustedTarget);
        }
      } else {
        const moveTabToPane = useWorkspaceStore.getState().moveTabToPane;
        moveTabToPane(data.fileName, data.paneId, paneId);
        // After move, reorder to correct position
        const state = useWorkspaceStore.getState();
        const pane = state.panes[paneId];
        if (pane) {
          const movedIdx = pane.tabs.indexOf(data.fileName);
          const targetIdx = side === "left" ? index : index + 1;
          if (movedIdx >= 0 && movedIdx !== targetIdx) {
            const adjusted = movedIdx < targetIdx ? targetIdx - 1 : targetIdx;
            useWorkspaceStore.getState().reorderTab(paneId, movedIdx, adjusted);
          }
        }
      }
    }

    const fileData = e.dataTransfer.getData("application/weditor-file");
    if (fileData) {
      const openTab = useWorkspaceStore.getState().openTab;
      openTab(fileData, paneId);
      // After open, reorder to correct position
      const state = useWorkspaceStore.getState();
      const pane = state.panes[paneId];
      if (pane) {
        const movedIdx = pane.tabs.indexOf(fileData);
        const targetIdx = side === "left" ? index : index + 1;
        if (movedIdx >= 0 && movedIdx !== targetIdx) {
          const adjusted = movedIdx < targetIdx ? targetIdx - 1 : targetIdx;
          state.reorderTab(paneId, movedIdx, adjusted);
        }
      }
    }

    useWorkspaceStore.getState().endTabDrag();
  };

  return (
    <div
      ref={tabRef}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={(e) => onContextMenu(e, fileName)}
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          useWorkspaceStore.getState().closeTab(paneId, fileName);
        }
      }}
      onClick={() => useWorkspaceStore.getState().setActiveTab(paneId, fileName)}
      className={cn(
        "flex items-center gap-1.5 px-3 min-w-[100px] max-w-[180px] cursor-pointer select-none group relative",
        "border-r border-border transition-colors",
        active
          ? "bg-bg2 text-t1 h-[calc(100%+1px)]"
          : "bg-bg0 text-t4 hover:text-t3 hover:bg-bg1 h-full",
      )}
    >
      {/* Drop indicator — left edge */}
      {dropSide === "left" && (
        <div className="absolute left-0 top-[4px] bottom-[4px] w-[2px] bg-accent rounded-full z-10" />
      )}
      {/* Drop indicator — right edge */}
      {dropSide === "right" && (
        <div className="absolute right-0 top-[4px] bottom-[4px] w-[2px] bg-accent rounded-full z-10" />
      )}

      {getTabType(fileName) === "file" ? (
        <FileIcon name={fileName.split("/").pop() || fileName} size={13} />
      ) : (
        <SpecialTabIcon type={getTabType(fileName)} size={13} />
      )}
      <span className="truncate flex-1 text-[12px]">{getTabLabel(fileName)}</span>

      <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
        {modified && !active ? (
          <div className="w-2 h-2 rounded-full bg-warning" />
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              useWorkspaceStore.getState().closeTab(paneId, fileName);
            }}
            className={cn(
              "rounded hover:bg-hover p-0.5",
              active ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-60 hover:!opacity-100"
            )}
          >
            <X size={11} />
          </button>
        )}
      </div>
    </div>
  );
});

interface TabBarProps {
  paneId: string;
}

interface TabContextMenuState {
  x: number;
  y: number;
  sections: ContextMenuSection[];
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

export const TabBar = memo(function TabBar({ paneId }: TabBarProps) {
  const pane = useWorkspaceStore((s) => s.panes[paneId]);
  const tabModifiedMap = useWorkspaceStore(useShallow((s) => {
    const p = s.panes[paneId];
    if (!p) return null;
    const map: Record<string, boolean> = {};
    for (const tab of p.tabs) {
      map[tab] = s.openFiles[tab]?.modified ?? false;
    }
    return map;
  }));
  const maximizedPaneId = useWorkspaceStore((s) => s.maximizedPaneId);
  const historyIndex = useWorkspaceStore((s) => s.panes[paneId]?.historyIndex ?? 0);
  const historyLength = useWorkspaceStore((s) => s.panes[paneId]?.tabHistory.length ?? 0);
  const isMaximized = maximizedPaneId === paneId;
  const [tabContextMenu, setTabContextMenu] = useState<TabContextMenuState | null>(null);
  const [emptyDragOver, setEmptyDragOver] = useState(false);
  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < historyLength - 1;
  const tabsRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  const checkOverflow = useCallback(() => {
    const el = tabsRef.current;
    if (el) setIsOverflowing(el.scrollWidth > el.clientWidth);
  }, []);

  useEffect(() => {
    checkOverflow();
    const el = tabsRef.current;
    if (!el) return;
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(el);
    return () => observer.disconnect();
  }, [checkOverflow, pane?.tabs.length]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    const el = tabsRef.current;
    if (!el || !isOverflowing) return;
    e.preventDefault();
    el.scrollLeft += e.deltaY || e.deltaX;
  }, [isOverflowing]);

  const handleTabContextMenu = useCallback((e: React.MouseEvent, fileName: string) => {
    e.preventDefault();
    e.stopPropagation();
    const tabs = pane?.tabs || [];
    const idx = tabs.indexOf(fileName);
    const file = useWorkspaceStore.getState().openFiles[fileName];
    const path = file?.path || fileName;

    const isSpecial = isSpecialTab(fileName);
    const s = useWorkspaceStore.getState();
    const sections: ContextMenuSection[] = [
      {
        items: [
          { label: "Close", shortcut: "Ctrl-W", onClick: () => s.closeTab(paneId, fileName) },
          { label: "Close Others", onClick: () => s.closeOtherTabs(paneId, fileName) },
          { label: "Close Left", onClick: () => s.closeTabsToLeft(paneId, fileName), disabled: idx <= 0 },
          { label: "Close Right", onClick: () => s.closeTabsToRight(paneId, fileName), disabled: idx >= tabs.length - 1 },
          { label: "Close All", onClick: () => s.closeAllTabs(paneId) },
        ],
      },
      ...(!isSpecial ? [
        {
          items: [
            { label: "Copy Path", onClick: () => copyToClipboard(path) },
            { label: "Copy Relative Path", onClick: () => copyToClipboard(path) },
          ],
        },
        {
          items: [
            { label: "Reveal in Project Panel", onClick: () => s.revealInProjectPanel(fileName) },
            { label: "Open in Terminal", onClick: () => s.setBottomPanel("terminal") },
          ],
        },
      ] : []),
    ];
    setTabContextMenu({ x: e.clientX, y: e.clientY, sections });
  }, [pane?.tabs, paneId]);

  if (!pane) return null;

  // Drop on empty space — append tab at end
  const handleEmptyDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEmptyDragOver(false);

    const tabData = e.dataTransfer.getData("application/weditor-tab");
    if (tabData) {
      const data = JSON.parse(tabData);
      if (data.paneId === paneId) {
        // Same pane — move tab to end
        const state = useWorkspaceStore.getState();
        const currentPane = state.panes[paneId];
        if (currentPane) {
          const lastIdx = currentPane.tabs.length - 1;
          if (data.index < lastIdx) {
            state.reorderTab(paneId, data.index, lastIdx);
          }
        }
      } else {
        // Cross-pane move
        const moveTabToPane = useWorkspaceStore.getState().moveTabToPane;
        moveTabToPane(data.fileName, data.paneId, paneId);
      }
    }

    const fileData = e.dataTransfer.getData("application/weditor-file");
    if (fileData) {
      const openTab = useWorkspaceStore.getState().openTab;
      openTab(fileData, paneId);
    }
    useWorkspaceStore.getState().endTabDrag();
  };

  return (
    <>
    <div className="flex items-center h-[35px] bg-bg0 border-b border-border shrink-0">
      {/* Back / Forward */}
      <div className="flex items-center gap-0 px-1 h-full border-r border-border shrink-0">
        <button
          onClick={() => useWorkspaceStore.getState().navigateBack(paneId)}
          disabled={!canGoBack}
          className={cn("p-1 rounded", canGoBack ? "text-t4 hover:text-t3 hover:bg-hover" : "text-t5 cursor-default")}
        >
          <ChevronLeft size={14} />
        </button>
        <button
          onClick={() => useWorkspaceStore.getState().navigateForward(paneId)}
          disabled={!canGoForward}
          className={cn("p-1 rounded", canGoForward ? "text-t4 hover:text-t3 hover:bg-hover" : "text-t5 cursor-default")}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Tabs area */}
      <div
        ref={tabsRef}
        className={cn(
          "flex items-center h-full overflow-x-auto flex-1",
          isOverflowing ? "tabbar-scroll" : "scrollbar-none"
        )}
        onWheel={handleWheel}
      >
        {pane.tabs.map((fileName, idx) => (
          <Tab
            key={fileName}
            fileName={fileName}
            paneId={paneId}
            active={pane.activeTab === fileName}
            modified={tabModifiedMap?.[fileName]}
            index={idx}
            onContextMenu={handleTabContextMenu}
          />
        ))}

        {/* Empty drop zone — fills remaining space */}
        <div
          className={cn(
            "flex-1 min-w-[40px] h-full transition-colors",
            emptyDragOver && "bg-accent/15"
          )}
          onDragOver={(e) => {
            const types = e.dataTransfer.types;
            if (!types.includes("application/weditor-tab") && !types.includes("application/weditor-file")) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            setEmptyDragOver(true);
          }}
          onDragLeave={() => {
            setEmptyDragOver(false);
          }}
          onDrop={handleEmptyDrop}
        />
      </div>

      <div className="flex items-center gap-0.5 px-2 h-full border-l border-border">
        <button
          onClick={() => useWorkspaceStore.getState().splitActivePane("row")}
          className="p-1 rounded text-t4 hover:text-t3 hover:bg-hover"
          title="Split Right"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
            <rect x="1" y="2" width="14" height="12" rx="1" />
            <line x1="8" y1="2" x2="8" y2="14" />
          </svg>
        </button>
        <button
          onClick={() => useWorkspaceStore.getState().toggleMaximizePane(paneId)}
          className={cn(
            "p-1 rounded hover:bg-hover",
            isMaximized ? "text-accent" : "text-t4 hover:text-t3"
          )}
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      </div>
    </div>

    {tabContextMenu && (
      <ContextMenu
        x={tabContextMenu.x}
        y={tabContextMenu.y}
        sections={tabContextMenu.sections}
        onClose={() => setTabContextMenu(null)}
      />
    )}
    </>
  );
});
