/**
 * FileTree
 * Recursive project file tree view used by ProjectPanel and explorer.
 */
"use client";
import { useState, useCallback, useRef, useEffect, memo } from "react";
import { cn } from '@/lib/shared-utilities/cn';
import { FileIcon, FolderIcon } from "@/components/user-interface/FileIcon";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { FileNode } from '@/lib/mock-testing/mock-data';
import { useWorkspaceStore } from "@/stores/workspace-store";
import { ContextMenu, type ContextMenuSection } from "@/components/user-interface/ContextMenu";

interface ContextMenuState {
  x: number;
  y: number;
  sections: ContextMenuSection[];
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

interface FileMenuActions {
  openTab: (filePath: string) => void;
  openSearch: () => void;
  openTerminal: () => void;
  startRename: (nodePath: string) => void;
  deleteNode: (nodePath: string) => void;
  duplicateFile: (filePath: string) => void;
  createFile: (parentPath: string | null) => void;
  createFolder: (parentPath: string | null) => void;
  collapseAll: () => void;
}

function getFileContextMenu(node: FileNode, actions: FileMenuActions, parentPath: string | null): ContextMenuSection[] {
  const nodePath = node.path!;
  return [
    { items: [{ label: "Open", onClick: () => actions.openTab(nodePath) }] },
    { items: [
      { label: "New File...", onClick: () => actions.createFile(parentPath) },
      { label: "New Folder...", onClick: () => actions.createFolder(parentPath) },
    ] },
    { items: [
      { label: "Duplicate", onClick: () => actions.duplicateFile(nodePath) },
      { label: "Rename", shortcut: "F2", onClick: () => actions.startRename(nodePath) },
    ] },
    { items: [
      { label: "Copy Name", onClick: () => copyToClipboard(node.name) },
      { label: "Copy Path", shortcut: "Alt-Shift-C", onClick: () => copyToClipboard(nodePath) },
    ] },
    { items: [
      { label: "Find in Folder", shortcut: "Alt-Shift-F", onClick: actions.openSearch },
      { label: "Open in Terminal", onClick: actions.openTerminal },
    ] },
    { items: [{ label: "Delete", shortcut: "Del", onClick: () => actions.deleteNode(nodePath) }] },
  ];
}

function getFolderContextMenu(node: FileNode, actions: FileMenuActions): ContextMenuSection[] {
  const nodePath = node.path!;
  return [
    { items: [
      { label: "New File...", onClick: () => actions.createFile(nodePath) },
      { label: "New Folder...", onClick: () => actions.createFolder(nodePath) },
    ] },
    { items: [{ label: "Rename", shortcut: "F2", onClick: () => actions.startRename(nodePath) }] },
    { items: [{ label: "Copy Name", onClick: () => copyToClipboard(node.name) }] },
    { items: [
      { label: "Find in Folder", shortcut: "Alt-Shift-F", onClick: actions.openSearch },
      { label: "Open in Terminal", onClick: actions.openTerminal },
    ] },
    { items: [{ label: "Collapse All", onClick: actions.collapseAll }] },
    { items: [{ label: "Delete", shortcut: "Del", onClick: () => actions.deleteNode(nodePath) }] },
  ];
}

function getBackgroundContextMenu(actions: FileMenuActions): ContextMenuSection[] {
  return [
    { items: [
      { label: "New File...", onClick: () => actions.createFile(null) },
      { label: "New Folder...", onClick: () => actions.createFolder(null) },
    ] },
    { items: [{ label: "Collapse All", onClick: actions.collapseAll }] },
  ];
}

function InlineRenameInput({ name, onCommit, onCancel }: { name: string; onCommit: (newName: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const dotIdx = name.lastIndexOf(".");
    el.setSelectionRange(0, dotIdx > 0 ? dotIdx : name.length);
  }, [name]);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== name) {
      onCommit(trimmed);
    } else {
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        e.stopPropagation();
      }}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      className="bg-bg0 border border-focus rounded px-1 py-0 text-[13px] text-t1 outline-none w-full min-w-0"
    />
  );
}

function InlineCreateInput({ placeholder, onCommit, onCancel }: { placeholder: string; onCommit: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed) {
      onCommit(trimmed);
    } else {
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        e.stopPropagation();
      }}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      className="bg-bg0 border border-focus rounded px-1 py-0 text-[13px] text-t1 outline-none w-full min-w-0"
    />
  );
}

// Drop position: "into" a folder, or "above"/"below" for reordering at the same level
type TreeDropPosition = "above" | "below" | "into" | null;

const TREE_DND_TYPE = "application/weditor-tree-node";

interface CreatingState {
  type: "file" | "folder";
  parentPath: string | null;  // full VFS path of parent folder, or null for root
}

interface FileTreeItemProps {
  node: FileNode;
  depth?: number;
  defaultOpen?: boolean;
  onContextMenu: (e: React.MouseEvent, node: FileNode, parentPath: string | null) => void;
  renamingPath: string | null;
  onRenameCommit: (oldPath: string, newName: string) => void;
  onRenameCancel: () => void;
  parentPath: string | null;
  creating: CreatingState | null;
  onCreateCommit: (name: string) => void;
  onCreateCancel: () => void;
  forceCollapsed: number;
}

const FileTreeItem = memo(function FileTreeItem({ node, depth = 0, defaultOpen, onContextMenu, renamingPath, onRenameCommit, onRenameCancel, parentPath, creating, onCreateCommit, onCreateCancel, forceCollapsed }: FileTreeItemProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen ?? false);
  const openTab = useWorkspaceStore((s) => s.openTab);
  const moveNode = useWorkspaceStore((s) => s.moveNode);
  // Narrow selector: only subscribe to the active file path, not the entire panes object
  const activeFilePath = useWorkspaceStore((s) => {
    const pane = s.panes[s.activePaneId];
    return pane?.activeTab ?? "";
  });
  const rowRef = useRef<HTMLDivElement>(null);
  const [dropPos, setDropPos] = useState<TreeDropPosition>(null);

  const nodePath = node.path!;

  // Collapse when forceCollapsed counter changes
  useEffect(() => {
    if (forceCollapsed > 0) setIsOpen(false);
  }, [forceCollapsed]);

  // Auto-expand when creating inside this folder
  useEffect(() => {
    if (creating && creating.parentPath === nodePath && node.type === "folder") {
      setIsOpen(true);
    }
  }, [creating, nodePath, node.type]);

  const isActive = node.type === "file" && activeFilePath === nodePath;
  const isRenaming = renamingPath === nodePath;

  const handleClick = useCallback(() => {
    if (isRenaming) return;
    if (node.type === "folder") {
      setIsOpen(!isOpen);
    } else {
      openTab(nodePath);
    }
  }, [node, isOpen, openTab, isRenaming, nodePath]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData(TREE_DND_TYPE, nodePath);
    if (node.type === "file") {
      e.dataTransfer.setData("application/weditor-file", nodePath);
    }
    e.dataTransfer.effectAllowed = "move";
    e.stopPropagation();
  }, [node, nodePath]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(TREE_DND_TYPE)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";

    const el = rowRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;

    if (node.type === "folder") {
      if (y < h * 0.25) setDropPos("above");
      else if (y > h * 0.75) setDropPos("below");
      else setDropPos("into");
    } else {
      setDropPos(y < h / 2 ? "above" : "below");
    }
  }, [node.type]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (rowRef.current && !rowRef.current.contains(e.relatedTarget as Node)) {
      setDropPos(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = dropPos;
    setDropPos(null);

    const draggedPath = e.dataTransfer.getData(TREE_DND_TYPE);
    if (!draggedPath || draggedPath === nodePath) return;

    if (pos === "into" && node.type === "folder") {
      moveNode(draggedPath, nodePath);
      setIsOpen(true);
    } else if (pos === "above" || pos === "below") {
      moveNode(draggedPath, parentPath);
    }
  }, [dropPos, node, moveNode, parentPath, nodePath]);

  const paddingLeft = depth * 12 + 8;

  const showCreateInside = creating && creating.parentPath === nodePath && node.type === "folder";

  return (
    <div>
      <div
        ref={rowRef}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, node, parentPath)}
        draggable={!isRenaming}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex items-center gap-1.5 py-[3px] pr-2 cursor-pointer select-none text-[13px] group relative",
          "hover:bg-hover",
          isActive ? "bg-hover text-t1" : "text-t3",
          dropPos === "into" && "bg-accent/15"
        )}
        style={{ paddingLeft }}
      >
        {dropPos === "above" && (
          <div className="absolute left-0 right-0 top-0 h-[2px] bg-accent rounded-full z-10" style={{ marginLeft: paddingLeft }} />
        )}
        {dropPos === "below" && (
          <div className="absolute left-0 right-0 bottom-0 h-[2px] bg-accent rounded-full z-10" style={{ marginLeft: paddingLeft }} />
        )}

        {depth > 0 && Array.from({ length: depth }).map((_, i) => (
          <div key={i} className="absolute top-0 bottom-0 w-px bg-border" style={{ left: i * 12 + 20 }} />
        ))}

        {node.type === "folder" ? (
          <span className="text-t4 w-4 flex items-center justify-center flex-shrink-0">
            {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        {node.type === "folder" ? <FolderIcon open={isOpen} size={14} /> : <FileIcon name={node.name} size={14} />}

        {isRenaming ? (
          <InlineRenameInput
            name={node.name}
            onCommit={(newName) => onRenameCommit(nodePath, newName)}
            onCancel={onRenameCancel}
          />
        ) : (
          <span className="truncate text-[13px]">{node.name}</span>
        )}
      </div>

      {node.type === "folder" && isOpen && (
        <div>
          {node.children?.map((child, idx) => (
            <FileTreeItem
              key={child.path || idx}
              node={child}
              depth={depth + 1}
              defaultOpen={
                child.name === "crates" ||
                child.name === "zed" ||
                child.name === "src"
              }
              onContextMenu={onContextMenu}
              renamingPath={renamingPath}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
              parentPath={nodePath}
              creating={creating}
              onCreateCommit={onCreateCommit}
              onCreateCancel={onCreateCancel}
              forceCollapsed={forceCollapsed}
            />
          ))}
          {showCreateInside && (
            <div
              className="flex items-center gap-1.5 py-[3px] pr-2 text-[13px]"
              style={{ paddingLeft: (depth + 1) * 12 + 8 }}
            >
              <span className="w-4 flex-shrink-0" />
              {creating.type === "folder" ? <FolderIcon open={false} size={14} /> : <FileIcon name="untitled" size={14} />}
              <InlineCreateInput
                placeholder={creating.type === "file" ? "filename" : "folder name"}
                onCommit={onCreateCommit}
                onCancel={onCreateCancel}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export function FileTree({ files }: { files: FileNode[] }) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [creating, setCreating] = useState<CreatingState | null>(null);
  const [rootDragOver, setRootDragOver] = useState(false);
  const forceCollapsed = useWorkspaceStore((s) => s.collapseCounter);
  const openTab = useWorkspaceStore((s) => s.openTab);
  const setLeftPanel = useWorkspaceStore((s) => s.setLeftPanel);
  const setBottomPanel = useWorkspaceStore((s) => s.setBottomPanel);
  const renameFile = useWorkspaceStore((s) => s.renameFile);
  const moveNode = useWorkspaceStore((s) => s.moveNode);
  const createFile = useWorkspaceStore((s) => s.createFile);
  const createFolder = useWorkspaceStore((s) => s.createFolder);
  const deleteNode = useWorkspaceStore((s) => s.deleteNode);
  const duplicateFile = useWorkspaceStore((s) => s.duplicateFile);
  const collapseAll = useWorkspaceStore((s) => s.collapseAll);

  const menuActions: FileMenuActions = {
    openTab,
    openSearch: () => setLeftPanel("search"),
    openTerminal: () => setBottomPanel("terminal"),
    startRename: (nodePath: string) => setRenamingPath(nodePath),
    deleteNode,
    duplicateFile,
    createFile: (parentPath: string | null) => setCreating({ type: "file", parentPath }),
    createFolder: (parentPath: string | null) => setCreating({ type: "folder", parentPath }),
    collapseAll,
  };

  const handleItemContextMenu = useCallback((e: React.MouseEvent, node: FileNode, parentPath: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    const sections = node.type === "file"
      ? getFileContextMenu(node, menuActions, parentPath)
      : getFolderContextMenu(node, menuActions);
    setContextMenu({ x: e.clientX, y: e.clientY, sections });
  }, [openTab, setLeftPanel, setBottomPanel, deleteNode, duplicateFile]);

  const handleBackgroundContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, sections: getBackgroundContextMenu(menuActions) });
  }, []);

  const handleRenameCommit = useCallback((oldPath: string, newName: string) => {
    renameFile(oldPath, newName);
    setRenamingPath(null);
  }, [renameFile]);

  const handleRenameCancel = useCallback(() => {
    setRenamingPath(null);
  }, []);

  const handleCreateCommit = useCallback((name: string) => {
    if (!creating) return;
    if (creating.type === "file") {
      createFile(name, creating.parentPath);
    } else {
      createFolder(name, creating.parentPath);
    }
    setCreating(null);
  }, [creating, createFile, createFolder]);

  const handleCreateCancel = useCallback(() => {
    setCreating(null);
  }, []);

  const handleRootDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(TREE_DND_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleRootDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setRootDragOver(false);
    const draggedPath = e.dataTransfer.getData(TREE_DND_TYPE);
    if (draggedPath) {
      moveNode(draggedPath, null);
    }
  }, [moveNode]);

  const showRootCreate = creating && creating.parentPath === null;

  return (
    <div
      className={cn("py-1 min-h-full", rootDragOver && "bg-accent/10")}
      onContextMenu={handleBackgroundContextMenu}
      onDragOver={(e) => {
        handleRootDragOver(e);
        if (e.dataTransfer.types.includes(TREE_DND_TYPE)) setRootDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setRootDragOver(false);
      }}
      onDrop={handleRootDrop}
    >
      {files.length === 0 && !showRootCreate && (
        <div className="px-3 py-4 text-t4 text-xs text-center">
          No files yet. Open a project or use the terminal.
        </div>
      )}
      {files.map((node, idx) => (
        <FileTreeItem
          key={node.path || idx}
          node={node}
          defaultOpen={node.type === "folder"}
          onContextMenu={handleItemContextMenu}
          renamingPath={renamingPath}
          onRenameCommit={handleRenameCommit}
          onRenameCancel={handleRenameCancel}
          parentPath={null}
          creating={creating}
          onCreateCommit={handleCreateCommit}
          onCreateCancel={handleCreateCancel}
          forceCollapsed={forceCollapsed}
        />
      ))}

      {showRootCreate && (
        <div className="flex items-center gap-1.5 py-[3px] pr-2 text-[13px]" style={{ paddingLeft: 8 }}>
          <span className="w-4 flex-shrink-0" />
          {creating.type === "folder" ? <FolderIcon open={false} size={14} /> : <FileIcon name="untitled" size={14} />}
          <InlineCreateInput
            placeholder={creating.type === "file" ? "filename" : "folder name"}
            onCommit={handleCreateCommit}
            onCancel={handleCreateCancel}
          />
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          sections={contextMenu.sections}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
