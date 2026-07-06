/**
 * InputArea Component
 * Enhanced input area with slash commands and @ mentions
 */
import {
  useState,
  useRef,
  useCallback,
  KeyboardEvent,
  ChangeEvent,
  ClipboardEvent,
} from "react";
import { Send, Plus, Loader2, Square, Paperclip } from "lucide-react";
import { cn } from "@/lib/shared-utilities/cn";
import { AttachmentPill } from "./AttachmentPill";
import { TokenIndicator } from "./TokenIndicator";
import type { AttachmentItem } from "../types";

interface InputAreaProps {
  value: string;
  onChange: (value: string) => void;
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
}

export function InputArea({
  value,
  onChange,
  onSubmit,
  onStop,
  onAttach,
  disabled = false,
  placeholder = "Ask the AI to help... (@ for files, / for commands)",
  isRunning = false,
  attachments = [],
  onRemoveAttachment,
  tokenPercentage = 0,
  totalTokens,
  contextWindow,
}: InputAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!disabled && value.trim() && !isRunning) {
          onSubmit();
        }
      }
    },
    [disabled, value, isRunning, onSubmit]
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      onChange(newValue);

      // Auto-resize textarea
      const target = e.target;
      target.style.height = "auto";
      target.style.height = Math.min(target.scrollHeight, 200) + "px";
    },
    [onChange]
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length > 0 && onAttach) {
        e.preventDefault();
        const dataTransfer = new DataTransfer();
        files.forEach((file) => dataTransfer.items.add(file));
        onAttach(dataTransfer.files);
      }
    },
    [onAttach]
  );

  const handleFileSelect = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0 && onAttach) {
        onAttach(files);
      }
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [onAttach]
  );

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="border-t border-border shrink-0 bg-bg1 min-w-0 overflow-hidden">
      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="px-3 pt-2 pb-1">
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((att) => (
              <AttachmentPill
                key={att.id}
                attachment={att}
                onRemove={onRemoveAttachment || (() => {})}
              />
            ))}
          </div>
        </div>
      )}

      {/* Input */}
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

      {/* Actions */}
      <div className="flex items-center h-[32px] px-2 gap-1">
        <button
          onClick={handleAttachClick}
          className="p-1.5 rounded text-t5 hover:text-t3 hover:bg-hover transition-colors"
          title="Attach files"
          disabled={disabled}
        >
          <Paperclip size={14} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        <div className="flex-1" />

        {/* Token Indicator */}
        <TokenIndicator
          percentage={tokenPercentage}
          totalTokens={totalTokens}
          contextWindow={contextWindow}
        />

        {/* Submit/Stop Button */}
        {isRunning ? (
          <button
            onClick={onStop}
            className="p-1.5 rounded text-warning hover:bg-warning/10 shrink-0 transition-colors"
            title="Stop"
          >
            <Square size={14} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={onSubmit}
            disabled={disabled || !value.trim()}
            className={cn(
              "p-1.5 rounded shrink-0 transition-colors",
              value.trim() && !disabled
                ? "text-accent hover:bg-accent/10"
                : "text-t6 cursor-not-allowed"
            )}
            title="Send (Enter)"
          >
            <Send size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
