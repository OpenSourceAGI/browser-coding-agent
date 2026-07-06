/**
 * ProjectPanel
 * Displays the project file tree and provides project-level actions
 * like import, reveal, and navigation.
 */
"use client";
import { useState, useMemo, useRef, useCallback } from "react";
import { cn } from '@/lib/shared-utilities/cn';
import { FileTree } from "./FileTree";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useNodepodStore } from "@/stores/nodepod-store";
import { Search, FileUp, FolderUp, Loader2 } from "lucide-react";
import type { FileNode } from '@/lib/mock-testing/mock-data';

function filterTree(nodes: FileNode[], filter: string): FileNode[] {
  const lower = filter.toLowerCase();
  const result: FileNode[] = [];
  for (const node of nodes) {
    if (node.type === "folder") {
      const filteredChildren = filterTree(node.children ?? [], filter);
      // Keep folder if any child matches
      if (filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren });
      }
    } else {
      if (node.name.toLowerCase().includes(lower)) {
        result.push(node);
      }
    }
  }
  return result;
}

export function ProjectPanel() {
  const [filterText, setFilterText] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [importing, setImporting] = useState(false);
  const projectFiles = useWorkspaceStore((s) => s.projectFiles);
  const instance = useNodepodStore((s) => s.instance);
  const refreshFileTree = useNodepodStore((s) => s.refreshFileTree);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const filteredFiles = useMemo(() => {
    if (!filterText.trim()) return projectFiles;
    return filterTree(projectFiles, filterText.trim());
  }, [projectFiles, filterText]);

  const handleImportFiles = useCallback(async (files: FileList | null) => {
    if (!files || !instance) return;
    setImporting(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const relativePath = (file as any).webkitRelativePath || file.name;
        const targetPath = `/project/${relativePath}`;

        // Ensure parent directory exists
        const parentDir = targetPath.substring(0, targetPath.lastIndexOf("/"));
        if (parentDir && parentDir !== "/project") {
          try { await instance.fs.mkdir(parentDir, { recursive: true }); } catch { /* exists */ }
        }

        const content = await file.text();
        await instance.fs.writeFile(targetPath, content);

        if ((i + 1) % 10 === 0) {
          await new Promise<void>((r) => setTimeout(r, 0));
        }
      }
      await refreshFileTree();
    } finally {
      setImporting(false);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
  }, [instance, refreshFileTree]);

  return (
    <div className="flex flex-col h-full">
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleImportFiles(e.target.files)}
      />
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        onChange={(e) => handleImportFiles(e.target.files)}
        // eslint-disable-next-line react/no-unknown-property
        {...{ webkitdirectory: "" } as any}
      />

      {/* Panel header */}
      <div className="flex items-center justify-between h-[35px] px-3 shrink-0 border-b border-border">
        <span className="text-[11px] font-semibold tracking-wider text-t4 uppercase">
          Project
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1 rounded text-t4 hover:text-t3 hover:bg-hover"
            title="Import files"
          >
            <FileUp size={12} />
          </button>
          <button
            onClick={() => folderInputRef.current?.click()}
            className="p-1 rounded text-t4 hover:text-t3 hover:bg-hover"
            title="Import folder"
          >
            <FolderUp size={12} />
          </button>
          <button
            onClick={() => setShowFilter(!showFilter)}
            className={cn("p-1 rounded hover:bg-hover", showFilter ? "text-accent" : "text-t4 hover:text-t3")}
          >
            <Search size={12} />
          </button>
        </div>
      </div>

      {/* Filter input */}
      {showFilter && (
        <div className="px-2 py-1.5 border-b border-border">
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter files..."
            autoFocus
            className="w-full bg-bg3 border border-border rounded px-2 py-1 text-[12px] text-t1 placeholder-t4 outline-none focus:border-focus"
          />
        </div>
      )}

      {/* File tree */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
        {importing && (
          <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-t4 border-b border-border">
            <Loader2 size={12} className="animate-spin" />
            Importing files...
          </div>
        )}
        <FileTree files={filteredFiles} />
      </div>

    </div>
  );
}
