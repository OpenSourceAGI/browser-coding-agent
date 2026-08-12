"use client";
import { useState, useEffect, useCallback } from "react";
import { GitBranch, FilePlus, FileMinus, FileEdit, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { useNodepodStore } from "@/stores/nodepod-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { cn } from "@/lib/shared-utilities/cn";

interface ChangedFile {
  path: string;
  status: "modified" | "added" | "deleted";
  content?: string;
  original?: string;
}

export function GitPanel() {
  const [changes, setChanges] = useState<ChangedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const nodepod = useNodepodStore((s) => s.instance);
  const openFiles = useWorkspaceStore((s) => s.openFiles);
  const openTab = useWorkspaceStore((s) => s.openTab);

  const refresh = useCallback(async () => {
    if (!nodepod) return;
    setLoading(true);
    try {
      // Compare in-memory open files (with `modified` flag) to what's on the VFS
      const modified: ChangedFile[] = [];
      for (const [path, file] of Object.entries(openFiles)) {
        if (file.modified) {
          try {
            const original = await nodepod.fs.readFile(path, "utf-8");
            modified.push({
              path,
              status: "modified",
              content: file.content,
              original: typeof original === "string" ? original : "",
            });
          } catch {
            modified.push({ path, status: "added", content: file.content });
          }
        }
      }
      setChanges(modified);
    } finally {
      setLoading(false);
    }
  }, [nodepod, openFiles]);

  useEffect(() => { refresh(); }, [refresh]);

  const fileName = (p: string) => p.split("/").pop() ?? p;
  const dirName = (p: string) => p.replace("/project", "").split("/").slice(0, -1).join("/") || "/";

  const StatusIcon = ({ status }: { status: ChangedFile["status"] }) => {
    if (status === "added") return <FilePlus size={12} className="text-added shrink-0" />;
    if (status === "deleted") return <FileMinus size={12} className="text-deleted shrink-0" />;
    return <FileEdit size={12} className="text-modified shrink-0" />;
  };

  const statusLabel = (s: ChangedFile["status"]) =>
    s === "added" ? "A" : s === "deleted" ? "D" : "M";

  const statusColor = (s: ChangedFile["status"]) =>
    s === "added" ? "text-added" : s === "deleted" ? "text-deleted" : "text-modified";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-border shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <GitBranch size={13} className="text-t4" />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-t4">Source Control</p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className={cn("p-1 rounded hover:bg-hover text-t4 hover:text-t2 transition-colors", loading && "animate-spin")}
          title="Refresh"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {!nodepod && (
          <p className="text-[11px] text-t5 px-3 py-2">No project open.</p>
        )}
        {nodepod && !loading && changes.length === 0 && (
          <p className="text-[11px] text-t4 px-3 py-2">No unsaved changes.</p>
        )}
        {changes.length > 0 && (
          <>
            <p className="text-[10px] text-t4 px-3 py-1.5 border-b border-border">
              {changes.length} unsaved file{changes.length !== 1 ? "s" : ""}
            </p>
            {changes.map((f) => {
              const open = expanded.has(f.path);
              const diffLines = f.content && f.original != null
                ? computeSimpleDiff(f.original, f.content)
                : null;
              return (
                <div key={f.path}>
                  <button
                    onClick={() => {
                      setExpanded((s) => { const n = new Set(s); open ? n.delete(f.path) : n.add(f.path); return n; });
                      openTab(f.path);
                    }}
                    className="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-hover text-left"
                  >
                    {diffLines
                      ? open ? <ChevronDown size={11} className="text-t4 shrink-0" /> : <ChevronRight size={11} className="text-t4 shrink-0" />
                      : <span className="w-[11px]" />}
                    <StatusIcon status={f.status} />
                    <span className="text-[11px] text-t2 truncate">{fileName(f.path)}</span>
                    <span className="text-[10px] text-t5 truncate ml-1">{dirName(f.path)}</span>
                    <span className={cn("ml-auto text-[10px] font-bold", statusColor(f.status))}>
                      {statusLabel(f.status)}
                    </span>
                  </button>
                  {open && diffLines && (
                    <div className="mx-2 mb-1 rounded overflow-hidden border border-border text-[10px] font-mono">
                      {diffLines.slice(0, 50).map((line, i) => (
                        <div
                          key={i}
                          className={cn(
                            "px-2 py-px whitespace-pre-wrap break-all leading-tight",
                            line.type === "add" && "bg-added/10 text-added",
                            line.type === "del" && "bg-deleted/10 text-deleted line-through",
                            line.type === "ctx" && "text-t4",
                          )}
                        >
                          {line.type === "add" ? "+ " : line.type === "del" ? "- " : "  "}{line.text}
                        </div>
                      ))}
                      {diffLines.length > 50 && (
                        <div className="px-2 py-px text-t5">… {diffLines.length - 50} more lines</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

interface DiffLine { type: "add" | "del" | "ctx"; text: string; }

function computeSimpleDiff(original: string, modified: string): DiffLine[] {
  const oldLines = original.split("\n");
  const newLines = modified.split("\n");
  const result: DiffLine[] = [];
  const maxCtx = 3;

  // Simple line-by-line diff (LCS would be better but overkill here)
  let oi = 0, ni = 0;
  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
      result.push({ type: "ctx", text: oldLines[oi] });
      oi++; ni++;
    } else {
      // Find next match within a small window
      let matched = false;
      for (let look = 1; look <= 6; look++) {
        if (ni + look < newLines.length && oi < oldLines.length && oldLines[oi] === newLines[ni + look]) {
          for (let k = 0; k < look; k++) result.push({ type: "add", text: newLines[ni + k] });
          ni += look; matched = true; break;
        }
        if (oi + look < oldLines.length && ni < newLines.length && oldLines[oi + look] === newLines[ni]) {
          for (let k = 0; k < look; k++) result.push({ type: "del", text: oldLines[oi + k] });
          oi += look; matched = true; break;
        }
      }
      if (!matched) {
        if (oi < oldLines.length) { result.push({ type: "del", text: oldLines[oi++] }); }
        if (ni < newLines.length) { result.push({ type: "add", text: newLines[ni++] }); }
      }
    }
    if (result.length > 200) break;
  }
  return result;
}
