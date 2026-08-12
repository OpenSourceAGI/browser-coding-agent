"use client";
import { useState, useCallback, useRef } from "react";
import { Search, X, ChevronRight, ChevronDown, FileText } from "lucide-react";
import { useNodepodStore } from "@/stores/nodepod-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { cn } from "@/lib/shared-utilities/cn";

interface SearchMatch {
  path: string;
  line: number;
  text: string;
  start: number;
  end: number;
}

interface FileMatches {
  path: string;
  matches: SearchMatch[];
}

export function SearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileMatches[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const nodepod = useNodepodStore((s) => s.instance);
  const openTab = useWorkspaceStore((s) => s.openTab);
  const abortRef = useRef(false);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim() || !nodepod) {
      setResults([]);
      setSearched(false);
      return;
    }
    abortRef.current = true;
    abortRef.current = false;
    setSearching(true);
    setSearched(false);

    const fileResults: FileMatches[] = [];
    let regex: RegExp;
    try {
      regex = new RegExp(q, "gi");
    } catch {
      regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    }

    async function walk(dir: string) {
      if (abortRef.current) return;
      let entries: string[];
      try { entries = await nodepod!.fs.readdir(dir); } catch { return; }
      for (const entry of entries) {
        if (abortRef.current) return;
        if (entry === "node_modules" || entry === ".cache" || entry === ".npm" || entry === ".git" || entry === "dist") continue;
        const full = `${dir}/${entry}`;
        try {
          const st = await nodepod!.fs.stat(full);
          if (st.isDirectory) {
            await walk(full);
          } else {
            if (/\.(png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|mp3|mp4|zip|tar|gz|lock)$/i.test(entry)) continue;
            const content = await nodepod!.fs.readFile(full, "utf-8");
            if (typeof content !== "string") continue;
            const lines = content.split("\n");
            const matches: SearchMatch[] = [];
            for (let i = 0; i < lines.length && matches.length < 50; i++) {
              regex.lastIndex = 0;
              const m = regex.exec(lines[i]);
              if (m) {
                matches.push({ path: full, line: i + 1, text: lines[i].trim().slice(0, 200), start: m.index, end: m.index + m[0].length });
              }
            }
            if (matches.length > 0) fileResults.push({ path: full, matches });
          }
        } catch { /* skip */ }
      }
    }

    try {
      await walk("/project");
      if (!abortRef.current) setResults(fileResults);
    } finally {
      if (!abortRef.current) { setSearching(false); setSearched(true); }
    }
  }, [nodepod]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    if (!q.trim()) { setResults([]); setSearched(false); setSearching(false); abortRef.current = true; }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") runSearch(query);
  }, [query, runSearch]);

  const totalMatches = results.reduce((n, f) => n + f.matches.length, 0);
  const fileName = (p: string) => p.split("/").pop() ?? p;
  const dirName = (p: string) => {
    const parts = p.split("/");
    return parts.length > 2 ? parts.slice(0, -1).join("/").replace("/project", "") || "/" : "";
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-border shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-t4 mb-2">Search</p>
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-t5" />
          <input
            type="text"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Search files… (Enter)"
            className="w-full text-[11px] bg-bg1 border border-border rounded pl-6 pr-6 py-1 text-t2 placeholder:text-t5 outline-none focus:border-accent transition-colors"
          />
          {query && (
            <button onClick={() => { setQuery(""); setResults([]); setSearched(false); abortRef.current = true; }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-t5 hover:text-t2">
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {searching && (
          <p className="text-[11px] text-t4 px-3 py-2">Searching…</p>
        )}
        {!searching && searched && results.length === 0 && (
          <p className="text-[11px] text-t4 px-3 py-2">No results for "{query}"</p>
        )}
        {!searching && results.length > 0 && (
          <>
            <p className="text-[10px] text-t4 px-3 py-1.5 border-b border-border">
              {totalMatches} result{totalMatches !== 1 ? "s" : ""} in {results.length} file{results.length !== 1 ? "s" : ""}
            </p>
            {results.map((f) => {
              const open = !collapsed.has(f.path);
              return (
                <div key={f.path}>
                  <button
                    onClick={() => setCollapsed((s) => { const n = new Set(s); open ? n.add(f.path) : n.delete(f.path); return n; })}
                    className="w-full flex items-center gap-1 px-2 py-1 hover:bg-hover text-left"
                  >
                    {open ? <ChevronDown size={11} className="text-t4 shrink-0" /> : <ChevronRight size={11} className="text-t4 shrink-0" />}
                    <FileText size={12} className="text-t4 shrink-0" />
                    <span className="text-[11px] text-t2 font-medium truncate">{fileName(f.path)}</span>
                    <span className="text-[10px] text-t5 truncate ml-1">{dirName(f.path)}</span>
                    <span className="ml-auto text-[10px] bg-accent/20 text-accent rounded px-1">{f.matches.length}</span>
                  </button>
                  {open && f.matches.map((m, i) => (
                    <button
                      key={i}
                      onClick={() => openTab(f.path)}
                      className="w-full flex items-start gap-2 px-4 py-0.5 hover:bg-hover text-left group"
                    >
                      <span className="text-[10px] text-t5 w-6 shrink-0 text-right mt-0.5">{m.line}</span>
                      <span className="text-[11px] text-t3 truncate group-hover:text-t1">{m.text}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
