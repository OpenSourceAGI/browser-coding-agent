/**
 * AttachmentPill Component
 * Displays file attachments as removable pills
 */
import { X, FileText, Image as ImageIcon, File } from "lucide-react";
import { cn } from "@/lib/shared-utilities/cn";
import type { AttachmentItem } from "../types";

interface AttachmentPillProps {
  attachment: AttachmentItem;
  onRemove: (id: string) => void;
}

export function AttachmentPill({ attachment, onRemove }: AttachmentPillProps) {
  const getIcon = () => {
    if (attachment.mimeType?.startsWith("image/")) {
      return <ImageIcon size={12} />;
    }
    if (attachment.mimeType?.includes("text") || attachment.fileName.match(/\.(txt|md|json|js|ts|tsx|jsx|css|html)$/i)) {
      return <FileText size={12} />;
    }
    return <File size={12} />;
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-bg2 border border-border rounded hover:bg-bg3 hover:border-focus transition-colors group">
      <div className="text-t4 group-hover:text-t3 transition-colors">
        {getIcon()}
      </div>
      <span className="text-[11px] text-t2 max-w-[150px] truncate">
        {attachment.fileName}
      </span>
      {attachment.fileSize && (
        <span className="text-[10px] text-t5">
          {formatSize(attachment.fileSize)}
        </span>
      )}
      <button
        onClick={() => onRemove(attachment.id)}
        className="text-t5 hover:text-t2 hover:bg-bg0 rounded p-0.5 transition-colors"
        aria-label={`Remove ${attachment.fileName}`}
      >
        <X size={11} />
      </button>
    </div>
  );
}
