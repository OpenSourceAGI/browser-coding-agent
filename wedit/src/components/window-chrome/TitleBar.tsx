/**
 * TitleBar
 * Top application title bar with window controls, quick actions, and menus.
 */
"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from '@/lib/shared-utilities/cn';
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useNodepodStore } from "@/stores/nodepod-store";
import {
  PanelLeft,
  PanelRight,
  PanelBottom,
  Settings,
  Palette,
  Keyboard,
  Bug,
  Home,
  ChevronRight,
  Save,
  Share2,
  Check,
  Search,
} from "lucide-react";
import { BugReportModal } from "@/components/modal-dialogs/BugReportModal";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/user-interface/DropdownMenu";
import { themes } from '@/lib/theme-management/themes';
import { useSettingsStore } from "@/stores/settings-store";

export function TitleBar() {
  const leftDockVisible = useWorkspaceStore((s) => s.leftDock.visible);
  const rightDockVisible = useWorkspaceStore((s) => s.rightDock.visible);
  const bottomDockVisible = useWorkspaceStore((s) => s.bottomDock.visible);
  const toggleLeftDock = useWorkspaceStore((s) => s.toggleLeftDock);
  const toggleRightDock = useWorkspaceStore((s) => s.toggleRightDock);
  const toggleBottomDock = useWorkspaceStore((s) => s.toggleBottomDock);
  const showHomeScreen = useWorkspaceStore((s) => s.showHomeScreen);
  const homeSearch = useWorkspaceStore((s) => s.homeSearch);
  const setHomeSearch = useWorkspaceStore((s) => s.setHomeSearch);
  const currentProject = useWorkspaceStore((s) => s.currentProject);
  const goHome = useWorkspaceStore((s) => s.goHome);
  const activeFileName = useWorkspaceStore((s) => {
    const pane = s.panes[s.activePaneId];
    const tab = pane?.activeTab;
    return tab ? (s.openFiles[tab]?.name ?? null) : null;
  });
  const userMenuOpen = useWorkspaceStore((s) => s.userMenuOpen);
  const toggleUserMenu = useWorkspaceStore((s) => s.toggleUserMenu);
  const toggleSettings = useWorkspaceStore((s) => s.toggleSettings);
  const toggleKeymapEditor = useWorkspaceStore((s) => s.toggleKeymapEditor);
  const toggleThemePicker = useWorkspaceStore((s) => s.toggleThemePicker);
  const activeTheme = useSettingsStore((s) => s.settings.theme);
  const setTheme = useSettingsStore((s) => s.set);
  const bugReportOpen = useWorkspaceStore((s) => s.bugReportOpen);
  const toggleBugReport = useWorkspaceStore((s) => s.toggleBugReport);
  const saveSnapshot = useNodepodStore((s) => s.saveSnapshot);
  const dirty = useNodepodStore((s) => s.dirty);
  const getShareUrl = useNodepodStore((s) => s.getShareUrl);

  const [saving, setSaving] = useState(false);
  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveSnapshot();
    } finally {
      setSaving(false);
    }
  }, [saving, saveSnapshot]);

  const [shareState, setShareState] = useState<"idle" | "loading" | "copied" | "error">("idle");
  const [shareError, setShareError] = useState("");
  const shareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (shareTimer.current) clearTimeout(shareTimer.current); };
  }, []);
  const handleShare = useCallback(async () => {
    if (shareState === "loading") return;
    setShareState("loading");
    try {
      const result = await getShareUrl();
      if (!result) {
        setShareState("error");
        setShareError("No project open");
        if (shareTimer.current) clearTimeout(shareTimer.current);
        shareTimer.current = setTimeout(() => setShareState("idle"), 3000);
        return;
      }
      if ("error" in result) {
        setShareState("error");
        setShareError(result.error);
        if (shareTimer.current) clearTimeout(shareTimer.current);
        shareTimer.current = setTimeout(() => setShareState("idle"), 3000);
        return;
      }
      await navigator.clipboard.writeText(result.url);
      setShareState("copied");
      if (shareTimer.current) clearTimeout(shareTimer.current);
      shareTimer.current = setTimeout(() => setShareState("idle"), 2000);
    } catch {
      setShareState("error");
      setShareError("Failed to copy");
      if (shareTimer.current) clearTimeout(shareTimer.current);
      shareTimer.current = setTimeout(() => setShareState("idle"), 2000);
    }
  }, [shareState, getShareUrl]);

  return (
    <div
      className={cn(
        "h-[38px] flex items-center justify-between px-3 select-none shrink-0",
        "bg-bg0 border-b border-border",
        "app-drag-region"
      )}
    >
      {/* Left: App name + home + project breadcrumb */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-[12px] text-t1 font-medium ml-2">Wedit</span>
        {!showHomeScreen && (
          <>
            <button
              onClick={goHome}
              className="p-1 rounded hover:bg-hover transition-colors text-t4 hover:text-t2 ml-1"
              title="Home"
            >
              <Home size={13} />
            </button>
            {currentProject && (
              <>
                <ChevronRight size={11} className="text-t5" />
                <span className="text-[11px] text-t3 truncate max-w-[140px]">
                  {currentProject.name}
                </span>
              </>
            )}
          </>
        )}
      </div>

      {/* Center */}
      {showHomeScreen ? (
        <div className="absolute left-1/2 -translate-x-1/2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-t5" />
            <input
              type="text"
              value={homeSearch}
              onChange={(e) => setHomeSearch(e.target.value)}
              placeholder="Search projects..."
              className="w-[280px] text-[12px] bg-bg1 border border-border rounded-md pl-8 pr-3 py-1 text-t2 placeholder:text-t5 outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>
      ) : (
        <div className="text-[11px] text-t4 font-medium absolute left-1/2 -translate-x-1/2 pointer-events-none">
          {activeFileName ? `${activeFileName} — Wedit` : "Wedit"}
        </div>
      )}

      {/* Right: Panel toggles + save + user */}
      <div className="flex items-center gap-1">
        {!showHomeScreen && (
          <>
            <button
              onClick={toggleLeftDock}
              className={cn(
                "p-1.5 rounded hover:bg-hover transition-colors",
                leftDockVisible ? "text-accent" : "text-t4"
              )}
              title="Toggle Left Panel"
            >
              <PanelLeft size={15} />
            </button>
            <button
              onClick={toggleBottomDock}
              className={cn(
                "p-1.5 rounded hover:bg-hover transition-colors",
                bottomDockVisible ? "text-accent" : "text-t4"
              )}
              title="Toggle Bottom Panel"
            >
              <PanelBottom size={15} />
            </button>
            <button
              onClick={toggleRightDock}
              className={cn(
                "p-1.5 rounded hover:bg-hover transition-colors",
                rightDockVisible ? "text-accent" : "text-t4"
              )}
              title="Toggle AI Panel"
            >
              <PanelRight size={15} />
            </button>

            <button
              onClick={toggleBugReport}
              className="p-1.5 rounded hover:bg-hover transition-colors text-t4 hover:text-warning"
              title="Report a Bug"
            >
              <Bug size={15} />
            </button>

            <div className="w-px h-4 bg-border mx-1" />

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
                saving
                  ? "bg-accent/20 text-accent animate-pulse cursor-default"
                  : !dirty
                    ? "bg-bg2 text-t5 cursor-default"
                    : "bg-accent/10 text-accent hover:bg-accent/20"
              )}
              title="Save project (Ctrl+S)"
            >
              <Save size={13} />
              {saving ? "Saving..." : "Save"}
            </button>

            {/* Share button */}
            <button
              onClick={handleShare}
              disabled={shareState === "loading"}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors max-w-[200px]",
                shareState === "copied"
                  ? "bg-added/20 text-added"
                  : shareState === "error"
                    ? "bg-deleted/20 text-deleted"
                    : shareState === "loading"
                      ? "bg-bg2 text-t4 animate-pulse cursor-default"
                      : "bg-bg2 text-t3 hover:bg-hover"
              )}
              title={shareState === "error" ? shareError : "Copy share link to clipboard"}
            >
              {shareState === "copied" ? <Check size={13} /> : <Share2 size={13} />}
              <span className="truncate">
                {shareState === "copied" ? "Copied!" : shareState === "error" ? "Too large" : "Share"}
              </span>
            </button>
          </>
        )}

        <div className="w-px h-4 bg-border mx-1" />

        {/* User avatar + dropdown */}
        <DropdownMenu open={userMenuOpen} onOpenChange={(v) => { if (v !== userMenuOpen) toggleUserMenu(); }}>
          <DropdownMenuTrigger
            className="w-6 h-6 rounded-full ml-1 flex items-center justify-center text-[10px] font-bold text-white hover:ring-1 hover:ring-accent/50"
            style={{
              background: "radial-gradient(at 25% 25%, var(--accent), var(--purple) 75%)",
            }}
          >
            Z
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-[220px]">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span className="text-t1 font-medium">User</span>
              <span className="text-[10px] text-t4 bg-bg0 px-1.5 py-0.5 rounded">Free</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={toggleSettings} shortcut="Ctrl-,">
              <Settings size={13} className="text-t4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={toggleKeymapEditor}>
              <Keyboard size={13} className="text-t4" />
              Key Bindings
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Palette size={13} className="text-t4" />
                Themes
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-[360px] overflow-y-auto">
                {(["dark", "light"] as const).map((appearance, i) => (
                  <div key={appearance}>
                    {i > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel className="uppercase tracking-wider text-[10px]">
                      {appearance}
                    </DropdownMenuLabel>
                    {themes.filter((t) => t.appearance === appearance).map((t) => (
                      <DropdownMenuItem
                        key={t.name}
                        onSelect={() => setTheme("theme", t.name)}
                      >
                        {activeTheme === t.name
                          ? <Check size={13} className="text-accent" />
                          : <span className="w-[13px]" />
                        }
                        {t.name}
                      </DropdownMenuItem>
                    ))}
                  </div>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {bugReportOpen && <BugReportModal onClose={toggleBugReport} />}
    </div>
  );
}
