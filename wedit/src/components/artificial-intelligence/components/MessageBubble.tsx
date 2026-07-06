/**
 * MessageBubble Component
 * Displays individual text and tool call messages
 */
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/shared-utilities/cn";
import type { UIMessage } from "../types";
import { ToolCallBlock } from "./ToolCallBlock";

interface MessageBubbleProps {
  message: UIMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.kind === "tool_call") {
    return <ToolCallBlock message={message} />;
  }

  return (
    <div className="flex gap-2.5 items-start group">
      <div
        className={cn(
          "w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 transition-colors",
          message.role === "assistant"
            ? "bg-purple/15 text-purple group-hover:bg-purple/20"
            : "bg-accent/15 text-accent group-hover:bg-accent/20"
        )}
      >
        {message.role === "assistant" ? <Bot size={14} /> : <User size={14} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] text-t2 leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </div>
        {message.timestamp && (
          <div className="text-[10px] text-t6 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {new Date(message.timestamp).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}
