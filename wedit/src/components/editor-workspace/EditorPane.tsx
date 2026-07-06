"use client";
import { useRef, useCallback, memo, lazy, Suspense } from "react";
import { useWorkspaceStore, type SplitNode, isSpecialTab, getTabType } from "@/stores/workspace-store";
import { useSettingsStore } from "@/stores/settings-store";
import { TabBar } from "@/components/window-chrome/TabBar";
import { KeymapEditorContent as KeymapEditor } from "@/components/settings-configuration/KeymapEditor";
import { BrowserPanel } from "@/components/documentation-browser/BrowserPanel";
import { AIPanel } from "@/components/artificial-intelligence/AIPanel";

const MonacoEditor = lazy(() => import("@monaco-editor/react").then((m) => ({ default: m.default })));

// ── Special tab content ───────────────────────────────────────────────────────

function SpecialTabContent({ tabId }: { tabId: string }) {
  switch (getTabType(tabId)) {
    case "keymap": return <KeymapEditor />;
    case "browser": return <BrowserPanel />;
    case "ai": return <AIPanel />;
    default: return null;
  }
}

// ── Monaco file editor ────────────────────────────────────────────────────────

const FileEditor = memo(function FileEditor({ filePath }: { filePath: string }) {
  const file = useWorkspaceStore((s) => s.openFiles[filePath]);
  const updateFileContent = useWorkspaceStore((s) => s.updateFileContent);
  const theme = useSettingsStore((s) => s.theme);

  const handleChange = useCallback(
    (value: string | undefined) => updateFileContent(filePath, value ?? ""),
    [filePath, updateFileContent],
  );

  if (!file) {
    return (
      <div className="flex-1 flex items-center justify-center text-t5 text-sm select-none">
        Loading…
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="flex-1 bg-bg1" />}>
      <MonacoEditor
        className="flex-1 min-h-0"
        height="100%"
        language={file.language ?? "plaintext"}
        value={file.content}
        onChange={handleChange}
        theme={theme === "light" ? "vs" : "vs-dark"}
        options={{
          fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
          fontSize: 13,
          lineHeight: 20,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: "on",
          automaticLayout: true,
          renderLineHighlight: "gutter",
          smoothScrolling: true,
          cursorSmoothCaretAnimation: "on",
          tabSize: 2,
        }}
      />
    </Suspense>
  );
});

// ── Single pane ───────────────────────────────────────────────────────────────

const Pane = memo(function Pane({ paneId }: { paneId: string }) {
  const activeTab = useWorkspaceStore((s) => s.panes[paneId]?.activeTab ?? "");
  const activePaneId = useWorkspaceStore((s) => s.activePaneId);
  const setActivePaneId = useWorkspaceStore((s) => s.setActivePaneId);

  const isActive = activePaneId === paneId;

  return (
    <div
      className={`flex flex-col h-full w-full overflow-hidden border ${isActive ? "border-accent/30" : "border-transparent"}`}
      onMouseDown={() => { if (!isActive) setActivePaneId(paneId); }}
    >
      <TabBar paneId={paneId} />
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {activeTab === "" ? (
          <div className="flex h-full items-center justify-center text-t5 text-sm select-none">
            Open a file to start editing
          </div>
        ) : isSpecialTab(activeTab) ? (
          <SpecialTabContent tabId={activeTab} />
        ) : (
          <FileEditor filePath={activeTab} />
        )}
      </div>
    </div>
  );
});

// ── Recursive split layout renderer ──────────────────────────────────────────

const SplitView = memo(function SplitView({ node }: { node: SplitNode }) {
  if (node.type === "leaf") {
    return <Pane paneId={node.paneId!} />;
  }

  const isRow = node.type === "row";
  const children = node.children ?? [];
  const sizes = node.sizes ?? children.map(() => 100 / children.length);

  return (
    <div className={`flex ${isRow ? "flex-row" : "flex-col"} h-full w-full overflow-hidden`}>
      {children.map((child, i) => (
        <div
          key={child.id}
          style={{ flex: sizes[i] ?? 1 }}
          className="min-w-0 min-h-0 overflow-hidden"
        >
          <SplitView node={child} />
        </div>
      ))}
    </div>
  );
});

// ── Drop zone overlay for pane splitting ─────────────────────────────────────

function PaneDropTarget({ paneId }: { paneId: string }) {
  const ref = useRef<HTMLDivElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("application/weditor-file") && !e.dataTransfer.types.includes("application/weditor-tab")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const fileData = e.dataTransfer.getData("application/weditor-file");
    if (fileData) {
      useWorkspaceStore.getState().openTab(fileData, paneId);
    }
    const tabData = e.dataTransfer.getData("application/weditor-tab");
    if (tabData) {
      const { fileName, paneId: fromPaneId } = JSON.parse(tabData);
      if (fromPaneId !== paneId) {
        useWorkspaceStore.getState().moveTabToPane(fileName, fromPaneId, paneId);
      }
    }
  };

  return (
    <div
      ref={ref}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="absolute inset-0 z-0"
    />
  );
}

// ── Public exports ────────────────────────────────────────────────────────────

export function EditorArea() {
  const splitLayout = useWorkspaceStore((s) => s.splitLayout);
  return (
    <div className="h-full w-full overflow-hidden">
      <SplitView node={splitLayout} />
    </div>
  );
}

export function MaximizedPane({ paneId }: { paneId: string }) {
  return (
    <div className="absolute inset-0 z-50 bg-bg1 flex flex-col">
      <Pane paneId={paneId} />
    </div>
  );
}
