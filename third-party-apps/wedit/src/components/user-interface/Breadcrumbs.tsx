"use client";
import { useState, useRef, useMemo, useCallback } from "react";
import { ChevronRight, ChevronDown, Search, X, CaseSensitive, WholeWord, Regex, Replace, ReplaceAll } from "lucide-react";
import { cn } from '@/lib/shared-utilities/cn';
import { useWorkspaceStore } from "@/stores/workspace-store";

export function Breadcrumbs({ paneId }: { paneId: string }) {
  const pane = useWorkspaceStore((s) => s.panes[paneId]);
  const activeTab = pane?.activeTab ?? "";
  const file = useWorkspaceStore((s) => activeTab ? s.openFiles[activeTab] : undefined);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const updateFileContent = useWorkspaceStore((s) => s.updateFileContent);

  const buildRegex = useCallback(() => {
    if (!searchQuery) return null;
    try {
      let flags = "g";
      if (!caseSensitive) flags += "i";
      let pattern = useRegex ? searchQuery : searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (wholeWord) pattern = `\\b${pattern}\\b`;
      return new RegExp(pattern, flags);
    } catch {
      return null;
    }
  }, [searchQuery, caseSensitive, wholeWord, useRegex]);

  const matchCount = useMemo(() => {
    if (!searchQuery || !file?.content) return 0;
    try {
      let flags = "g";
      if (!caseSensitive) flags += "i";
      let pattern = useRegex ? searchQuery : searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (wholeWord) pattern = `\\b${pattern}\\b`;
      const re = new RegExp(pattern, flags);
      const matches = file.content.match(re);
      return matches ? matches.length : 0;
    } catch {
      return 0;
    }
  }, [searchQuery, file?.content, caseSensitive, wholeWord, useRegex]);

  const handleReplace = useCallback(() => {
    if (!pane || !file?.content) return;
    const re = buildRegex();
    if (!re) return;
    // Replace only the first match — build a non-global version
    const firstRe = new RegExp(re.source, re.flags.replace("g", ""));
    const newContent = file.content.replace(firstRe, replaceText);
    if (newContent !== file.content) {
      updateFileContent(activeTab, newContent);
    }
  }, [activeTab, file, buildRegex, replaceText, updateFileContent]);

  const handleReplaceAll = useCallback(() => {
    if (!pane || !file?.content) return;
    const re = buildRegex();
    if (!re) return;
    const newContent = file.content.replace(re, replaceText);
    if (newContent !== file.content) {
      updateFileContent(activeTab, newContent);
    }
  }, [activeTab, file, buildRegex, replaceText, updateFileContent]);

  if (!pane || !file) return null;

  const pathParts = file.path.split("/");

  const openSearch = () => {
    setSearchOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
    setReplaceText("");
    setShowReplace(false);
  };

  return (
    <>
      {/* Breadcrumb bar */}
      <div className="flex items-center h-[28px] px-3 text-[12px] shrink-0 bg-bg2 border-b border-border">
        <div className="flex items-center gap-1 flex-1 min-w-0 text-t4">
          {pathParts.map((part, idx) => (
            <span key={idx} className="flex items-center gap-1 shrink-0">
              {idx > 0 && <ChevronRight size={10} className="text-t5" />}
              <span
                className={cn(
                  "hover:text-t3 cursor-pointer",
                  idx === pathParts.length - 1 && "text-t1"
                )}
              >
                {part}
              </span>
            </span>
          ))}
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={searchOpen ? closeSearch : openSearch}
            className={cn(
              "p-1 rounded hover:bg-hover",
              searchOpen ? "text-accent" : "text-t4 hover:text-t3"
            )}
          >
            <Search size={12} />
          </button>
        </div>
      </div>

      {/* In-file search bar */}
      {searchOpen && (
        <div className="flex items-start gap-2 px-3 py-1.5 bg-bg2 border-b border-border shrink-0">
          {/* Replace toggle */}
          <button
            onClick={() => setShowReplace(!showReplace)}
            className={cn(
              "p-0.5 rounded mt-[3px] shrink-0",
              showReplace ? "text-accent" : "text-t4 hover:text-t3"
            )}
            title="Toggle Replace"
          >
            {showReplace ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>

          <div className="flex-1 min-w-0">
            {/* Find row */}
            <div className="flex items-center gap-1.5">
              <div className="flex-1 min-w-0 flex items-center bg-bg0 border border-scroll-thumb rounded focus-within:border-focus">
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") closeSearch();
                  }}
                  placeholder="Find"
                  className="flex-1 min-w-0 bg-transparent px-2 py-[3px] text-[12px] text-t1 placeholder-t5 outline-none"
                  autoFocus
                />
                <div className="flex items-center gap-0.5 pr-1">
                  <button
                    onClick={() => setCaseSensitive(!caseSensitive)}
                    className={cn(
                      "p-0.5 rounded",
                      caseSensitive ? "text-accent bg-accent/10" : "text-t4 hover:text-t3"
                    )}
                    title="Match Case"
                  >
                    <CaseSensitive size={14} />
                  </button>
                  <button
                    onClick={() => setWholeWord(!wholeWord)}
                    className={cn(
                      "p-0.5 rounded",
                      wholeWord ? "text-accent bg-accent/10" : "text-t4 hover:text-t3"
                    )}
                    title="Match Whole Word"
                  >
                    <WholeWord size={14} />
                  </button>
                  <button
                    onClick={() => setUseRegex(!useRegex)}
                    className={cn(
                      "p-0.5 rounded",
                      useRegex ? "text-accent bg-accent/10" : "text-t4 hover:text-t3"
                    )}
                    title="Use Regular Expression"
                  >
                    <Regex size={14} />
                  </button>
                </div>
              </div>

              {/* Match count */}
              <span className="text-[11px] text-t4 shrink-0 w-[60px] text-center">
                {searchQuery ? (matchCount > 0 ? `${matchCount} found` : "No results") : ""}
              </span>

              {/* Close */}
              <button
                onClick={closeSearch}
                className="p-0.5 rounded text-t4 hover:text-t3 hover:bg-hover"
              >
                <X size={14} />
              </button>
            </div>

            {/* Replace row */}
            {showReplace && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <div className="flex-1 min-w-0 flex items-center bg-bg0 border border-scroll-thumb rounded focus-within:border-focus">
                  <input
                    value={replaceText}
                    onChange={(e) => setReplaceText(e.target.value)}
                    placeholder="Replace"
                    className="flex-1 min-w-0 bg-transparent px-2 py-[3px] text-[12px] text-t1 placeholder-t5 outline-none"
                  />
                </div>

                {/* Replace / Replace All */}
                <button
                  onClick={handleReplace}
                  className="p-1 rounded text-t4 hover:text-t3 hover:bg-hover shrink-0"
                  title="Replace"
                >
                  <Replace size={14} />
                </button>
                <button
                  onClick={handleReplaceAll}
                  className="p-1 rounded text-t4 hover:text-t3 hover:bg-hover shrink-0"
                  title="Replace All"
                >
                  <ReplaceAll size={14} />
                </button>

                {/* Spacer to match close button width */}
                <div className="w-[20px] shrink-0" />
              </div>
            )}

          </div>
        </div>
      )}
    </>
  );
}
