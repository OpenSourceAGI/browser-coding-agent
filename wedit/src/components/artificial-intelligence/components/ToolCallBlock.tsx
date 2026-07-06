/**
 * ToolCallBlock Component
 * Displays tool call information with collapsible details
 */
import { useState } from "react";
import { Wrench, ChevronDown, ChevronRight, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/shared-utilities/cn";
import type { UIToolCallMessage } from "../types";

interface ToolCallBlockProps {
  message: UIToolCallMessage;
}

export function ToolCallBlock({ message }: ToolCallBlockProps) {
  const [collapsed, setCollapsed] = useState(message.collapsed ?? true);

  let parsedArgs = "";
  try {
    const obj = JSON.parse(message.args);
    parsedArgs = Object.entries(obj)
      .map(([k, v]) => {
        const valueStr =
          typeof v === "string" && v.length > 80
            ? v.slice(0, 80) + "..."
            : JSON.stringify(v);
        return `${k}: ${valueStr}`;
      })
      .join(", ");
  } catch {
    parsedArgs = message.args.slice(0, 100);
  }

  const status = message.status || (message.result ? "success" : "running");

  return (
    <div className="flex gap-2.5 items-start group min-w-0">
      <div
        className={cn(
          "w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 transition-colors",
          status === "success" && "bg-green-500/15 text-green-600 group-hover:bg-green-500/20",
          status === "error" && "bg-red-500/15 text-red-600 group-hover:bg-red-500/20",
          status === "running" && "bg-warning/15 text-warning group-hover:bg-warning/20"
        )}
      >
        {status === "success" && <CheckCircle2 size={13} />}
        {status === "error" && <XCircle size={13} />}
        {status === "running" && <Loader2 size={13} className="animate-spin" />}
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1.5 text-[11.5px] hover:text-t1 font-mono max-w-full transition-colors"
        >
          {collapsed ? (
            <ChevronRight size={11} className="shrink-0 text-t4" />
          ) : (
            <ChevronDown size={11} className="shrink-0 text-t4" />
          )}
          <span className="font-semibold shrink-0 text-t2">{message.name}</span>
          {parsedArgs && (
            <span className="text-t5 truncate text-[10.5px]">({parsedArgs})</span>
          )}
        </button>
        {!collapsed && message.result && (
          <div className="mt-2 relative">
            <pre className="p-2.5 bg-bg0 border border-border rounded-md text-[10.5px] text-t3 font-mono overflow-x-auto max-h-[300px] whitespace-pre-wrap break-all scrollbar-thin">
              {message.result}
            </pre>
          </div>
        )}
        {!collapsed && status === "running" && !message.result && (
          <div className="mt-2 p-2 bg-bg0 border border-border rounded-md text-[10.5px] text-t5 italic">
            Tool is executing...
          </div>
        )}
      </div>
    </div>
  );
}
