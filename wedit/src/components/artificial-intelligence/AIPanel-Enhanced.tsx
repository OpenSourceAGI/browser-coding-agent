/**
 * AIPanel (Enhanced) — Claudix-inspired for weditor AI panel
 *
 * New in this version:
 *  - Sessions page (conversation history + search)
 *  - Claudix-style toolbar: mode selector · model selector | thinking toggle · attach · send
 *  - Permission-mode cycle (default → plan → auto)
 *  - Thinking toggle with glow badge
 *  - Markdown-aware message rendering (code blocks, inline code, bold)
 *  - Improved empty state with animated wordmark
 *  - Smooth page-slide transitions
 *  - Better tool-call blocks (pill layout)
 */
"use client";
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  memo,
} from "react";
import { cn } from "@/lib/shared-utilities/cn";
import {
  Bot,
  Plus,
  KeyRound,
  ChevronDown,
  Search,
  Check,
  Sparkles,
  Paperclip,
  Send,
  Square,
  Loader2,
  Brain,
  ChevronRight,
  CheckCircle2,
  XCircle,
  X,
  FileText,
  Image as ImageIcon,
  File,
  User,
  Wrench,
  ArrowLeft,
  MessageSquare,
  Clock,
  Wand2,
  Shield,
  ListTodo,
} from "lucide-react";
import { WarperComponent } from "@itsmeadarsh/warper";
import { useSettingsStore } from "@/stores/settings-store";
import { useNodepodStore } from "@/stores/nodepod-store";
import {
  type ChatMessage,
  type ToolCallInfo,
  type OpenRouterModel,
  type ErrorReportData,
  runAgentTurn,
  createNodepodToolExecutor,
  fetchOpenRouterModels,
} from "@/lib/artificial-intelligence/ai-sdk";
import { ErrorReportModal } from "@/components/modal-dialogs/ErrorReportModal";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/user-interface/DropdownMenu";
import type { UIMessage, AttachmentItem } from "./types";

/* ─────────────────────────────────────────────────────────────
   Types
   ───────────────────────────────────────────────────────────── */

type PermissionMode = "default" | "plan" | "auto";
type Page = "chat" | "sessions";

interface StoredSession {
  id: string;
  title: string;
  messages: UIMessage[];
  chatHistory: ChatMessage[];
  lastModified: number;
}

/* ─────────────────────────────────────────────────────────────
   Persisted state (module-level, survives panel re-mounts)
   ───────────────────────────────────────────────────────────── */
let _persistedMessages: UIMessage[] = [];
let _persistedChatHistory: ChatMessage[] = [];
let _abortController: AbortController | null = null;
let _persistedSessions: StoredSession[] = [];
const SESSION_STORE_KEY = "weditor_ai_sessions";

function loadSessions(): StoredSession[] {
  try {
    const raw = localStorage.getItem(SESSION_STORE_KEY);
    if (raw) return JSON.parse(raw) as StoredSession[];
  } catch {}
  return [];
}

function saveSessions(sessions: StoredSession[]) {
  try {
    // Keep last 50 sessions
    const trimmed = sessions.slice(0, 50);
    localStorage.setItem(SESSION_STORE_KEY, JSON.stringify(trimmed));
  } catch {}
}

/* ─────────────────────────────────────────────────────────────
   Model selector constants
   ───────────────────────────────────────────────────────────── */
const POPOVER_WIDTH = 320;
const POPOVER_HEIGHT = 340;
const MODEL_ROW_HEIGHT = 40;

/* ─────────────────────────────────────────────────────────────
   Utility helpers
   ───────────────────────────────────────────────────────────── */
function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  const days = Math.round(diff / 86_400_000);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function extractSessionTitle(messages: UIMessage[]): string {
  const first = messages.find((m) => m.kind === "text" && m.role === "user");
  if (!first || first.kind !== "text") return "New Conversation";
  return first.content.slice(0, 48) + (first.content.length > 48 ? "…" : "");
}

/* ─────────────────────────────────────────────────────────────
   Markdown-lite renderer
   ───────────────────────────────────────────────────────────── */
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const result: React.ReactNode[] = [];
  let inCode = false;
  let codeLang = "";
  let codeLines: string[] = [];
  let key = 0;

  const flushCode = () => {
    if (codeLines.length > 0) {
      result.push(
        <pre
          key={`code-${key++}`}
          className="my-2 p-2.5 bg-bg0 border border-border rounded-md text-[10.5px] text-t2 font-mono overflow-x-auto max-h-[300px] whitespace-pre scrollbar-thin"
        >
          {codeLang && (
            <div className="text-[9px] text-t5 uppercase tracking-wider mb-1.5 font-sans">
              {codeLang}
            </div>
          )}
          {codeLines.join("\n")}
        </pre>
      );
    }
    codeLines = [];
    codeLang = "";
  };

  const renderInline = (s: string, k: number): React.ReactNode => {
    // Bold **text**
    const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    if (parts.length === 1) return s;
    return (
      <span key={k}>
        {parts.map((p, i) => {
          if (p.startsWith("**") && p.endsWith("**"))
            return <strong key={i} className="text-t1 font-semibold">{p.slice(2, -2)}</strong>;
          if (p.startsWith("`") && p.endsWith("`"))
            return (
              <code key={i} className="px-1 py-0.5 bg-bg0 border border-border rounded text-[10.5px] font-mono text-accent">
                {p.slice(1, -1)}
              </code>
            );
          return p;
        })}
      </span>
    );
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        inCode = true;
        codeLang = line.slice(3).trim();
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (line === "") {
      result.push(<div key={`br-${key++}`} className="h-2" />);
      continue;
    }

    // Headings
    if (line.startsWith("### ")) {
      result.push(<p key={key++} className="text-[12px] font-semibold text-t1 mt-2 mb-0.5">{line.slice(4)}</p>);
      continue;
    }
    if (line.startsWith("## ")) {
      result.push(<p key={key++} className="text-[12.5px] font-semibold text-t1 mt-2 mb-1">{line.slice(3)}</p>);
      continue;
    }

    // Bullet list
    if (/^[-*•] /.test(line)) {
      result.push(
        <div key={key++} className="flex gap-1.5 leading-relaxed">
          <span className="text-t5 shrink-0 mt-0.5">•</span>
          <span>{renderInline(line.replace(/^[-*•] /, ""), key++)}</span>
        </div>
      );
      continue;
    }

    // Numbered list
    if (/^\d+\. /.test(line)) {
      const m = line.match(/^(\d+)\. (.*)/);
      if (m) {
        result.push(
          <div key={key++} className="flex gap-1.5 leading-relaxed">
            <span className="text-t5 shrink-0 mt-0.5 tabular-nums">{m[1]}.</span>
            <span>{renderInline(m[2], key++)}</span>
          </div>
        );
        continue;
      }
    }

    result.push(<p key={key++} className="leading-relaxed">{renderInline(line, key++)}</p>);
  }

  if (inCode) flushCode();
  return result;
}

/* ─────────────────────────────────────────────────────────────
   Virtual model list
   ───────────────────────────────────────────────────────────── */
function VirtualModelList({
  models,
  selectedId,
  height,
  onSelect,
  formatPrice,
}: {
  models: OpenRouterModel[];
  selectedId: string;
  height: number;
  onSelect: (id: string) => void;
  formatPrice: (p: string) => string;
}) {
  return (
    <WarperComponent
      itemCount={models.length}
      estimateSize={() => MODEL_ROW_HEIGHT}
      overscan={5}
      height={height}
      className="scrollbar-thin"
    >
      {(index) => {
        const m = models[index];
        if (!m) return null;
        const isSelected = m.id === selectedId;
        return (
          <button
            onClick={() => onSelect(m.id)}
            className={cn(
              "w-full flex items-center gap-2 px-2.5 text-left rounded-sm hover:bg-hover transition-colors",
              isSelected && "bg-accent/10"
            )}
            style={{ height: MODEL_ROW_HEIGHT, pointerEvents: "auto" }}
          >
            <span className="w-3.5 shrink-0 flex items-center justify-center">
              {isSelected && <Check size={11} className="text-accent" />}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-t2 truncate leading-tight">{m.name}</div>
              <div className="text-[10px] text-t5 truncate leading-tight">
                {m.id} · {(m.context_length / 1000).toFixed(0)}k
              </div>
            </div>
            <div className="text-[10px] text-t5 shrink-0 text-right leading-tight">
              <div>{formatPrice(m.pricing.prompt)}/M in</div>
              <div>{formatPrice(m.pricing.completion)}/M out</div>
            </div>
          </button>
        );
      }}
    </WarperComponent>
  );
}

/* ─────────────────────────────────────────────────────────────
   Model Selector
   ───────────────────────────────────────────────────────────── */
function ModelSelector({
  model,
  apiKey,
  onSelect,
}: {
  model: string;
  apiKey: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !apiKey) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchOpenRouterModels(apiKey)
      .then((m) => { if (!cancelled) { setModels(m); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message || "Failed to load models"); setLoading(false); } });
    return () => { cancelled = true; };
  }, [open, apiKey]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => searchRef.current?.focus());
    else setSearch("");
  }, [open]);

  const filtered = useMemo(
    () => search
      ? models.filter((m) =>
          m.name.toLowerCase().includes(search.toLowerCase()) ||
          m.id.toLowerCase().includes(search.toLowerCase())
        )
      : models,
    [models, search]
  );

  const displayName = model.includes("/") ? (model.split("/").pop() ?? model) : model;

  const formatPrice = (p: string) => {
    const n = parseFloat(p);
    if (!n || isNaN(n)) return "free";
    const perM = n * 1_000_000;
    if (perM < 0.01) return "<$0.01";
    if (perM >= 100) return `$${perM.toFixed(0)}`;
    if (perM >= 1) return `$${perM.toFixed(2)}`;
    return `$${perM.toFixed(3)}`;
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger className="flex items-center gap-1 bg-transparent text-[11px] text-t4 outline-none cursor-pointer hover:text-t3 px-1.5 py-1 rounded hover:bg-hover max-w-[160px] transition-colors">
        <Sparkles size={10} className="shrink-0 opacity-70" />
        <span className="truncate">{displayName || "Select model"}</span>
        <ChevronDown size={9} className="shrink-0 opacity-60" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="top"
        align="start"
        className="overflow-hidden bg-bg1 border-border"
        style={{ width: POPOVER_WIDTH, height: POPOVER_HEIGHT }}
      >
        <div className="flex items-center gap-1.5 px-2.5 py-1.5">
          <Search size={12} className="text-t5 shrink-0" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models..."
            className="flex-1 bg-transparent text-[12px] text-t1 placeholder-t5 outline-none min-w-0"
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        <div className="w-full h-px border-t border-border my-1" />
        <div style={{ height: POPOVER_HEIGHT - 52 }}>
          {loading ? (
            <div className="p-1.5 space-y-0.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-2 rounded">
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-bg3 rounded animate-pulse" style={{ width: `${60 + (i % 3) * 15}%` }} />
                    <div className="h-2.5 bg-bg3/60 rounded animate-pulse" style={{ width: `${40 + (i % 4) * 10}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="px-3 py-4 text-center">
              <p className="text-[11px] text-red-400">{error}</p>
              <button
                onClick={() => { setLoading(true); setError(""); fetchOpenRouterModels(apiKey).then(setModels).catch((e) => setError(e.message)).finally(() => setLoading(false)); }}
                className="mt-2 text-[11px] text-accent hover:underline"
              >Retry</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-[11px] text-t5">
              No models match &ldquo;{search}&rdquo;
            </div>
          ) : (
            <VirtualModelList
              models={filtered}
              selectedId={model}
              height={POPOVER_HEIGHT - 52}
              onSelect={(id) => { onSelect(id); setOpen(false); }}
              formatPrice={formatPrice}
            />
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─────────────────────────────────────────────────────────────
   Permission Mode Selector
   ───────────────────────────────────────────────────────────── */
const PERMISSION_MODES: { id: PermissionMode; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: "default", label: "Auto", icon: <Wand2 size={11} />, desc: "AI decides when to act" },
  { id: "plan",    label: "Plan",  icon: <ListTodo size={11} />, desc: "Plan before executing" },
  { id: "auto",   label: "Max",   icon: <Shield size={11} />, desc: "Maximum autonomy" },
];

function ModeSelector({
  mode,
  onSelect,
}: {
  mode: PermissionMode;
  onSelect: (m: PermissionMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = PERMISSION_MODES.find((m) => m.id === mode) ?? PERMISSION_MODES[0];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger className="flex items-center gap-1 bg-transparent text-[11px] text-t4 outline-none cursor-pointer hover:text-t3 px-1.5 py-1 rounded hover:bg-hover transition-colors">
        {current.icon}
        <span>{current.label}</span>
        <ChevronDown size={9} className="opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="bg-bg1 border-border p-1" style={{ width: 180 }}>
        {PERMISSION_MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => { onSelect(m.id); setOpen(false); }}
            className={cn(
              "w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-left transition-colors",
              m.id === mode ? "bg-accent/10 text-t1" : "hover:bg-hover text-t3"
            )}
          >
            <span className={cn("shrink-0", m.id === mode ? "text-accent" : "text-t4")}>{m.icon}</span>
            <div>
              <div className="text-[11.5px] font-medium">{m.label}</div>
              <div className="text-[10px] text-t5">{m.desc}</div>
            </div>
            {m.id === mode && <Check size={10} className="text-accent ml-auto shrink-0" />}
          </button>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─────────────────────────────────────────────────────────────
   Message Bubble
   ───────────────────────────────────────────────────────────── */
const MessageBubble = memo(function MessageBubble({ message }: { message: UIMessage }) {
  if (message.kind === "tool_call") {
    return <ToolCallBlock message={message} />;
  }

  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-2.5 items-start group", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 transition-colors",
          isUser
            ? "bg-accent/15 text-accent group-hover:bg-accent/25"
            : "bg-purple/15 text-purple group-hover:bg-purple/25"
        )}
      >
        {isUser ? <User size={13} /> : <Bot size={13} />}
      </div>
      <div className={cn("flex-1 min-w-0", isUser && "flex flex-col items-end")}>
        {isUser ? (
          <div className="inline-block max-w-[85%] px-3 py-2 bg-bg2 border border-border rounded-lg text-[12.5px] text-t1 leading-relaxed whitespace-pre-wrap break-words">
            {message.content}
          </div>
        ) : (
          <div className="text-[12.5px] text-t2 leading-relaxed break-words">
            {renderMarkdown(message.content)}
          </div>
        )}
        {message.timestamp && (
          <div className="text-[10px] text-t6 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {new Date(message.timestamp).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
});

/* ─────────────────────────────────────────────────────────────
   Tool Call Block
   ───────────────────────────────────────────────────────────── */
function ToolCallBlock({ message }: { message: Extract<UIMessage, { kind: "tool_call" }> }) {
  const [collapsed, setCollapsed] = useState(message.collapsed ?? true);

  let parsedArgs = "";
  try {
    const obj = JSON.parse(message.args);
    parsedArgs = Object.entries(obj)
      .map(([k, v]) => {
        const valueStr = typeof v === "string" && v.length > 60 ? v.slice(0, 60) + "…" : JSON.stringify(v);
        return `${k}: ${valueStr}`;
      })
      .join(", ");
  } catch {
    parsedArgs = message.args.slice(0, 80);
  }

  const status = message.status || (message.result ? "success" : "running");

  const statusIcon =
    status === "success" ? <CheckCircle2 size={12} /> :
    status === "error"   ? <XCircle size={12} /> :
                           <Loader2 size={12} className="animate-spin" />;

  const statusColors = {
    success: "bg-green-500/15 text-green-500 border-green-500/20",
    error:   "bg-red-500/15 text-red-500 border-red-500/20",
    running: "bg-warning/15 text-warning border-warning/20",
  };

  return (
    <div className="flex gap-2.5 items-start group min-w-0">
      <div
        className={cn(
          "w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 border transition-colors",
          statusColors[status]
        )}
      >
        {statusIcon}
      </div>
      <div className="flex-1 min-w-0">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1.5 w-full text-left hover:text-t1 transition-colors min-w-0"
        >
          {collapsed
            ? <ChevronRight size={10} className="shrink-0 text-t5" />
            : <ChevronDown size={10} className="shrink-0 text-t5" />
          }
          <span className="font-mono text-[11px] font-semibold text-t2 shrink-0">{message.name}</span>
          {parsedArgs && (
            <span className="text-[10px] text-t5 truncate font-mono">({parsedArgs})</span>
          )}
        </button>
        {!collapsed && message.result && (
          <pre className="mt-2 p-2.5 bg-bg0 border border-border rounded-md text-[10.5px] text-t3 font-mono overflow-x-auto max-h-[200px] whitespace-pre-wrap break-all scrollbar-thin">
            {message.result}
          </pre>
        )}
        {!collapsed && status === "running" && !message.result && (
          <div className="mt-2 p-2 bg-bg0 border border-border rounded-md text-[10.5px] text-t5 italic">
            Executing…
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Attachment Pill
   ───────────────────────────────────────────────────────────── */
function AttachmentPill({ att, onRemove }: { att: AttachmentItem; onRemove: (id: string) => void }) {
  const icon = att.mimeType?.startsWith("image/")
    ? <ImageIcon size={11} />
    : att.mimeType?.includes("text") || /\.(txt|md|json|js|ts|tsx|jsx|css|html)$/i.test(att.fileName)
    ? <FileText size={11} />
    : <File size={11} />;

  const size = att.fileSize
    ? att.fileSize < 1024 ? `${att.fileSize}B`
    : att.fileSize < 1024 * 1024 ? `${(att.fileSize / 1024).toFixed(1)}KB`
    : `${(att.fileSize / (1024 * 1024)).toFixed(1)}MB`
    : "";

  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-bg2 border border-border rounded-md hover:bg-bg3 transition-colors group text-t4">
      {icon}
      <span className="text-[11px] text-t2 max-w-[120px] truncate">{att.fileName}</span>
      {size && <span className="text-[10px] text-t5">{size}</span>}
      <button
        onClick={() => onRemove(att.id)}
        className="text-t5 hover:text-t2 rounded p-0.5 transition-colors"
        aria-label={`Remove ${att.fileName}`}
      >
        <X size={10} />
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Token Indicator
   ───────────────────────────────────────────────────────────── */
function TokenIndicator({ percentage, totalTokens, contextWindow = 200_000 }: {
  percentage: number;
  totalTokens?: number;
  contextWindow?: number;
}) {
  const fmt = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K`
    : `${n}`;

  const label = totalTokens !== undefined
    ? `${fmt(totalTokens)} / ${fmt(contextWindow)}`
    : `${percentage.toFixed(1)}%`;

  const barColor =
    percentage < 50 ? "bg-green-500"
    : percentage < 75 ? "bg-yellow-400"
    : percentage < 90 ? "bg-orange-400"
    : "bg-red-500";

  return (
    <div
      className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-hover transition-colors group cursor-default"
      title={`${percentage.toFixed(1)}% of context used`}
    >
      <div className="w-12 h-1 bg-bg3 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor)}
          style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
        />
      </div>
      <span className="text-[10px] text-t5 font-mono group-hover:text-t4 transition-colors whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Claudix-style Input Toolbar
   ───────────────────────────────────────────────────────────── */
function InputToolbar({
  value,
  onChange,
  onSubmit,
  onStop,
  onAttach,
  disabled,
  placeholder,
  isRunning,
  attachments,
  onRemoveAttachment,
  tokenPercentage,
  totalTokens,
  contextWindow,
  model,
  apiKey,
  onModelSelect,
  permissionMode,
  onPermissionModeSelect,
  thinkingOn,
  onThinkingToggle,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  onAttach?: (files: FileList) => void;
  disabled?: boolean;
  placeholder?: string;
  isRunning?: boolean;
  attachments?: AttachmentItem[];
  onRemoveAttachment?: (id: string) => void;
  tokenPercentage?: number;
  totalTokens?: number;
  contextWindow?: number;
  model: string;
  apiKey: string;
  onModelSelect: (id: string) => void;
  permissionMode: PermissionMode;
  onPermissionModeSelect: (m: PermissionMode) => void;
  thinkingOn: boolean;
  onThinkingToggle: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!disabled && value.trim() && !isRunning) onSubmit();
      }
    },
    [disabled, value, isRunning, onSubmit]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
      const t = e.target;
      t.style.height = "auto";
      t.style.height = Math.min(t.scrollHeight, 200) + "px";
    },
    [onChange]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === "file") {
          const f = items[i].getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0 && onAttach) {
        e.preventDefault();
        const dt = new DataTransfer();
        files.forEach((f) => dt.items.add(f));
        onAttach(dt.files);
      }
    },
    [onAttach]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0 && onAttach) onAttach(files);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [onAttach]
  );

  return (
    <div className="border-t border-border shrink-0 bg-bg1 min-w-0">
      {/* Attachments */}
      {attachments && attachments.length > 0 && (
        <div className="px-3 pt-2 pb-1 flex flex-wrap gap-1.5">
          {attachments.map((att) => (
            <AttachmentPill key={att.id} att={att} onRemove={onRemoveAttachment || (() => {})} />
          ))}
        </div>
      )}

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={placeholder}
        disabled={disabled}
        rows={3}
        className="w-full bg-transparent text-[12.5px] text-t1 placeholder-t5 outline-none resize-none min-h-[60px] px-3 pt-2.5 pb-1"
      />

      {/* Claudix-style bottom bar: left=mode+model | right=token+thinking+attach+send */}
      <div className="flex items-center h-[30px] px-2 gap-1">
        {/* Left: Mode + Model */}
        <ModeSelector mode={permissionMode} onSelect={onPermissionModeSelect} />
        <div className="w-px h-3 bg-border mx-0.5" />
        <ModelSelector model={model} apiKey={apiKey} onSelect={onModelSelect} />

        <div className="flex-1" />

        {/* Right: Token + Thinking + Attach + Send/Stop */}
        {tokenPercentage !== undefined && (
          <TokenIndicator
            percentage={tokenPercentage}
            totalTokens={totalTokens}
            contextWindow={contextWindow}
          />
        )}

        <button
          onClick={onThinkingToggle}
          title={thinkingOn ? "Thinking on" : "Thinking off"}
          className={cn(
            "p-1.5 rounded transition-colors",
            thinkingOn
              ? "text-purple bg-purple/10 hover:bg-purple/20"
              : "text-t5 hover:text-t3 hover:bg-hover"
          )}
        >
          <Brain size={13} />
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 rounded text-t5 hover:text-t3 hover:bg-hover transition-colors"
          title="Attach files"
          disabled={disabled}
        >
          <Paperclip size={13} />
        </button>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />

        {isRunning ? (
          <button
            onClick={onStop}
            className="w-6 h-6 flex items-center justify-center rounded bg-t2/80 text-bg0 hover:bg-t1 transition-colors shrink-0"
            title="Stop"
          >
            <Square size={10} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={onSubmit}
            disabled={disabled || !value.trim()}
            className={cn(
              "w-6 h-6 flex items-center justify-center rounded transition-colors shrink-0",
              value.trim() && !disabled
                ? "bg-t2/80 text-bg0 hover:bg-t1"
                : "bg-t2/20 text-t5 cursor-not-allowed"
            )}
            title="Send (Enter)"
          >
            <Send size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Sessions Page
   ───────────────────────────────────────────────────────────── */
function SessionsPage({
  sessions,
  onOpen,
  onNew,
  onBack,
  onDelete,
}: {
  sessions: StoredSession[];
  onOpen: (id: string) => void;
  onNew: () => void;
  onBack: () => void;
  onDelete: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showSearch) {
      requestAnimationFrame(() => searchRef.current?.focus());
    } else {
      setSearch("");
    }
  }, [showSearch]);

  const filtered = useMemo(
    () =>
      search
        ? sessions.filter(
            (s) =>
              s.title.toLowerCase().includes(search.toLowerCase())
          )
        : sessions,
    [sessions, search]
  );

  return (
    <div className="flex flex-col h-full w-full min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center h-[36px] px-2 border-b border-border shrink-0 gap-1">
        <button
          onClick={onBack}
          className="p-1.5 rounded text-t5 hover:text-t3 hover:bg-hover transition-colors"
          title="Back to chat"
        >
          <ArrowLeft size={13} />
        </button>
        <span className="text-[11.5px] font-semibold text-t2 flex-1">History</span>
        <button
          onClick={() => setShowSearch((v) => !v)}
          className={cn(
            "p-1.5 rounded transition-colors",
            showSearch ? "text-accent bg-accent/10" : "text-t5 hover:text-t3 hover:bg-hover"
          )}
          title="Search"
        >
          <Search size={12} />
        </button>
        <button
          onClick={onNew}
          className="p-1.5 rounded text-t5 hover:text-t3 hover:bg-hover transition-colors"
          title="New conversation"
        >
          <Plus size={12} />
        </button>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="px-3 py-1.5 border-b border-border shrink-0 bg-bg0">
          <div className="flex items-center gap-1.5 bg-bg2 border border-border rounded px-2 py-1">
            <Search size={11} className="text-t5 shrink-0" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="flex-1 bg-transparent text-[12px] text-t1 placeholder-t5 outline-none"
              onKeyDown={(e) => { if (e.key === "Escape") { setShowSearch(false); } }}
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-t5 hover:text-t3">
                <X size={11} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Session list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1 min-h-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-50 gap-3 py-8">
            <MessageSquare size={36} className="text-t5" />
            <p className="text-[12px] text-t4">
              {search ? "No conversations match your search" : "No conversation history yet"}
            </p>
            {!search && (
              <button
                onClick={onNew}
                className="px-3 py-1.5 bg-accent/15 text-accent hover:bg-accent/25 rounded text-[11.5px] transition-colors"
              >
                Start a conversation
              </button>
            )}
          </div>
        ) : (
          filtered.map((s) => (
            <div
              key={s.id}
              onClick={() => onOpen(s.id)}
              className="group flex items-start gap-2 px-2.5 py-2 rounded-md hover:bg-hover cursor-pointer border border-transparent hover:border-border transition-all"
            >
              <MessageSquare size={13} className="text-t5 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-t2 truncate font-medium">{s.title}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <Clock size={10} className="text-t6" />
                  <span className="text-[10px] text-t5">{formatRelativeTime(s.lastModified)}</span>
                  <span className="text-[10px] text-t6">
                    {s.messages.filter((m) => m.kind === "text").length} msgs
                  </span>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-t5 hover:text-red-400 rounded transition-all shrink-0"
                title="Delete"
              >
                <X size={11} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Animated Wordmark (empty state)
   ───────────────────────────────────────────────────────────── */
function AiWordmark() {
  return (
    <div className="flex flex-col items-center gap-3 select-none">
      <div className="relative">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple/30 to-accent/30 flex items-center justify-center border border-purple/20">
          <Bot size={28} className="text-purple" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-accent flex items-center justify-center border-2 border-bg0">
          <Sparkles size={8} className="text-bg0" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-[13px] font-semibold text-t2">weditor AI</p>
        <p className="text-[11px] text-t5 mt-0.5">Powered by OpenRouter</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Streaming cursor
   ───────────────────────────────────────────────────────────── */
function StreamingMessage({ content }: { content: string }) {
  return (
    <div className="flex gap-2.5 items-start">
      <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 bg-purple/15 text-purple">
        <Bot size={13} />
      </div>
      <div className="flex-1 min-w-0 text-[12.5px] text-t2 leading-relaxed break-words">
        {renderMarkdown(content)}
        <span className="inline-block w-[2px] h-4 bg-accent ml-0.5 align-middle animate-pulse" />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Main AIPanel
   ───────────────────────────────────────────────────────────── */
export function AIPanel() {
  // ── Page routing
  const [page, setPage] = useState<Page>("chat");

  // ── Chat state
  const [messages, setMessages] = useState<UIMessage[]>(_persistedMessages);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(_persistedChatHistory);
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [errorReport, setErrorReport] = useState<{
    data: ErrorReportData;
    resolve: (reported: boolean) => void;
  } | null>(null);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [tokenUsage, setTokenUsage] = useState({ used: 0, total: 200_000 });

  // ── UI state
  const [showConfig, setShowConfig] = useState(
    !useSettingsStore.getState().settings.openrouter_api_key
  );
  const [permissionMode, setPermissionMode] = useState<PermissionMode>("default");
  const [thinkingOn, setThinkingOn] = useState(true);

  // ── Sessions
  const [sessions, setSessions] = useState<StoredSession[]>(() => {
    _persistedSessions = loadSessions();
    return _persistedSessions;
  });

  // ── Settings
  const apiKey = useSettingsStore((s) => s.settings.openrouter_api_key);
  const model = useSettingsStore((s) => s.settings.openrouter_model);
  const setSetting = useSettingsStore((s) => s.set);
  const nodepod = useNodepodStore((s) => s.instance);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Persist messages
  useEffect(() => { _persistedMessages = messages; }, [messages]);
  useEffect(() => { _persistedChatHistory = chatHistory; }, [chatHistory]);

  // Auto-scroll
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    if (streamingContent) {
      scrollTimerRef.current = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
      }, 80);
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    return () => { if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current); };
  }, [messages, streamingContent]);

  useEffect(() => {
    if (apiKey) setShowConfig(false);
    else setShowConfig(true);
  }, [apiKey]);

  // ── Session helpers
  const saveCurrentSession = useCallback((msgs: UIMessage[], hist: ChatMessage[]) => {
    if (msgs.length === 0) return;
    const title = extractSessionTitle(msgs);
    const existing = _persistedSessions.find((s) =>
      s.messages[0]?.kind === "text" && s.messages[0].role === "user" &&
      msgs[0]?.kind === "text" && msgs[0].role === "user" &&
      s.messages[0].content === msgs[0].content
    );
    if (existing) {
      existing.messages = msgs;
      existing.chatHistory = hist;
      existing.lastModified = Date.now();
      existing.title = title;
      const updated = [existing, ..._persistedSessions.filter((s) => s.id !== existing.id)];
      _persistedSessions = updated;
    } else {
      const newSession: StoredSession = {
        id: Math.random().toString(36).slice(2),
        title,
        messages: msgs,
        chatHistory: hist,
        lastModified: Date.now(),
      };
      _persistedSessions = [newSession, ..._persistedSessions];
    }
    saveSessions(_persistedSessions);
    setSessions([..._persistedSessions]);
  }, []);

  // ── Send handler
  const handleSend = useCallback(async () => {
    if (!input.trim() || isRunning) return;
    if (!apiKey) { setShowConfig(true); return; }

    const userMessage = input.trim();
    setInput("");
    setIsRunning(true);
    setStreamingContent("");

    const newUIMessages: UIMessage[] = [
      ...messages,
      { kind: "text", role: "user", content: userMessage, timestamp: Date.now() },
    ];
    setMessages(newUIMessages);

    const newHistory: ChatMessage[] = [...chatHistory, { role: "user", content: userMessage }];
    setChatHistory(newHistory);

    const toolExecutor = nodepod
      ? createNodepodToolExecutor(nodepod, {
          onReportError: (data) =>
            new Promise<boolean>((resolve) => { setErrorReport({ data, resolve }); }),
        })
      : async () => "Error: Nodepod not available";

    _abortController = new AbortController();

    let currentContent = "";
    const uiUpdates: UIMessage[] = [...newUIMessages];

    try {
      const finalHistory = await runAgentTurn(
        apiKey,
        model,
        newHistory,
        toolExecutor,
        {
          onToken: (token) => {
            currentContent += token;
            setStreamingContent(currentContent);
          },
          onToolCall: (call) => {
            if (currentContent) {
              uiUpdates.push({ kind: "text", role: "assistant", content: currentContent, timestamp: Date.now() });
              currentContent = "";
              setStreamingContent("");
            }
            let argsStr = call.function.arguments;
            try { argsStr = JSON.stringify(JSON.parse(call.function.arguments), null, 2); } catch {}
            uiUpdates.push({
              kind: "tool_call",
              callId: call.id,
              name: call.function.name,
              args: argsStr,
              status: "running",
              timestamp: Date.now(),
            });
            setMessages([...uiUpdates]);
          },
          onToolResult: (callId, _name, result) => {
            const idx = uiUpdates.findIndex((m) => m.kind === "tool_call" && m.callId === callId);
            if (idx >= 0) {
              (uiUpdates[idx] as any).result = result;
              (uiUpdates[idx] as any).status = "success";
              setMessages([...uiUpdates]);
            }
          },
          onComplete: (assistantMsg) => {
            if (assistantMsg.content && !assistantMsg.tool_calls?.length) {
              uiUpdates.push({ kind: "text", role: "assistant", content: assistantMsg.content, timestamp: Date.now() });
              currentContent = "";
              setStreamingContent("");
              setMessages([...uiUpdates]);
            }
          },
          onError: (error) => {
            uiUpdates.push({ kind: "text", role: "assistant", content: `Error: ${error}`, timestamp: Date.now() });
            setMessages([...uiUpdates]);
          },
        },
        _abortController.signal
      );

      setChatHistory(finalHistory);
      if (currentContent) {
        uiUpdates.push({ kind: "text", role: "assistant", content: currentContent, timestamp: Date.now() });
        setStreamingContent("");
        setMessages([...uiUpdates]);
      }

      saveCurrentSession(uiUpdates, finalHistory);
    } catch (e: unknown) {
      const errMsg = e instanceof Error && e.name === "AbortError"
        ? "(Cancelled)"
        : `Error: ${e instanceof Error ? e.message : "Unknown error"}`;
      uiUpdates.push({ kind: "text", role: "assistant", content: errMsg, timestamp: Date.now() });
      setMessages([...uiUpdates]);
      setStreamingContent("");
    } finally {
      setIsRunning(false);
      _abortController = null;
      setErrorReport(null);
    }
  }, [input, isRunning, apiKey, model, nodepod, messages, chatHistory, saveCurrentSession]);

  const handleStop = () => { if (_abortController) _abortController.abort(); };

  const handleClear = () => {
    if (messages.length > 0) saveCurrentSession(messages, chatHistory);
    setMessages([]);
    setChatHistory([]);
    setStreamingContent("");
    setAttachments([]);
    _persistedMessages = [];
    _persistedChatHistory = [];
  };

  const handleAttach = useCallback((files: FileList) => {
    const newAtts: AttachmentItem[] = Array.from(files).map((f) => ({
      id: Math.random().toString(36).slice(2, 11),
      fileName: f.name,
      fileSize: f.size,
      mimeType: f.type,
    }));
    setAttachments((prev) => [...prev, ...newAtts]);
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const tokenPercentage = useMemo(() => (tokenUsage.used / tokenUsage.total) * 100, [tokenUsage]);

  // ── Sessions page handlers
  const handleOpenSession = useCallback((id: string) => {
    // Save current before switching
    if (messages.length > 0) saveCurrentSession(messages, chatHistory);
    const s = _persistedSessions.find((x) => x.id === id);
    if (!s) return;
    setMessages(s.messages);
    setChatHistory(s.chatHistory);
    _persistedMessages = s.messages;
    _persistedChatHistory = s.chatHistory;
    setPage("chat");
  }, [messages, chatHistory, saveCurrentSession]);

  const handleDeleteSession = useCallback((id: string) => {
    _persistedSessions = _persistedSessions.filter((s) => s.id !== id);
    saveSessions(_persistedSessions);
    setSessions([..._persistedSessions]);
  }, []);

  const handleNewSession = useCallback(() => {
    if (messages.length > 0) saveCurrentSession(messages, chatHistory);
    handleClear();
    setPage("chat");
  }, [messages, chatHistory, saveCurrentSession]);

  /* ── Sessions Page */
  if (page === "sessions") {
    return (
      <SessionsPage
        sessions={sessions}
        onOpen={handleOpenSession}
        onNew={handleNewSession}
        onBack={() => setPage("chat")}
        onDelete={handleDeleteSession}
      />
    );
  }

  /* ── Chat Page */
  return (
    <div className="flex flex-col h-full w-full min-w-0 overflow-hidden bg-bg0">
      {/* Header */}
      <div className="flex items-center h-[36px] px-2 border-b border-border shrink-0 gap-1">
        <button
          onClick={() => setPage("sessions")}
          className="p-1.5 rounded text-t5 hover:text-t3 hover:bg-hover transition-colors"
          title="View history"
        >
          <MessageSquare size={13} />
        </button>
        <Bot size={13} className="text-purple mx-0.5 shrink-0" />
        <span className="text-[11.5px] font-semibold text-t2 flex-1 truncate">
          {messages.length > 0 ? extractSessionTitle(messages) : "AI Assistant"}
        </span>
        <button
          onClick={() => setShowConfig(!showConfig)}
          className={cn(
            "p-1.5 rounded transition-colors",
            showConfig ? "text-accent bg-accent/10" : "text-t5 hover:text-t3 hover:bg-hover"
          )}
          title="API Key"
        >
          <KeyRound size={12} />
        </button>
        <button
          onClick={handleClear}
          className="p-1.5 rounded text-t5 hover:text-t3 hover:bg-hover transition-colors"
          title="New thread"
        >
          <Plus size={12} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin p-3 space-y-4 min-h-0">
        {messages.length === 0 && !streamingContent && (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-70 gap-6">
            <AiWordmark />
            <div className="space-y-1">
              <p className="text-[12.5px] text-t3">Start a conversation</p>
              <p className="text-[11px] text-t5">
                Ask questions, write code, or get help with tasks
              </p>
            </div>
            {/* Quick prompts */}
            <div className="flex flex-wrap justify-center gap-2 max-w-[260px]">
              {[
                "Explain this code",
                "Write a function",
                "Debug my error",
                "Suggest improvements",
              ].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => setInput(prompt)}
                  className="px-2.5 py-1 text-[11px] text-t4 bg-bg2 border border-border rounded-full hover:bg-bg3 hover:text-t3 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        {streamingContent && <StreamingMessage content={streamingContent} />}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <InputToolbar
        value={input}
        onChange={setInput}
        onSubmit={handleSend}
        onStop={handleStop}
        onAttach={handleAttach}
        disabled={!apiKey}
        placeholder={
          apiKey
            ? "Message AI… (@ files, / commands)"
            : "Set your API key first…"
        }
        isRunning={isRunning}
        attachments={attachments}
        onRemoveAttachment={handleRemoveAttachment}
        tokenPercentage={tokenPercentage}
        totalTokens={tokenUsage.used}
        contextWindow={tokenUsage.total}
        model={model}
        apiKey={apiKey}
        onModelSelect={(id) => setSetting("openrouter_model", id)}
        permissionMode={permissionMode}
        onPermissionModeSelect={setPermissionMode}
        thinkingOn={thinkingOn}
        onThinkingToggle={() => setThinkingOn((v) => !v)}
      />

      {/* Config panel */}
      {showConfig && (
        <div className="px-3 py-2.5 border-t border-border bg-bg0 shrink-0 min-w-0">
          <label className="block text-[10px] text-t4 uppercase tracking-wider font-semibold mb-1.5">
            OpenRouter API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setSetting("openrouter_api_key", e.target.value)}
            placeholder="sk-or-..."
            className="w-full bg-bg3 border border-border rounded px-2.5 py-1.5 text-[12px] text-t1 placeholder-t5 outline-none focus:border-focus font-mono"
          />
          <p className="text-[10px] text-t5 mt-1.5">
            Get your key at{" "}
            <a
              href="https://openrouter.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              openrouter.ai
            </a>
          </p>
        </div>
      )}

      {errorReport && (
        <ErrorReportModal
          data={errorReport.data}
          onConfirm={() => { errorReport.resolve(true); setErrorReport(null); }}
          onDismiss={() => { errorReport.resolve(false); setErrorReport(null); }}
        />
      )}
    </div>
  );
}
