"use client";
import { cn } from '@/lib/shared-utilities/cn';
import { useResizable, type ResizeDirection } from "@/hooks/use-resizable";

interface ResizeHandleProps {
  direction: ResizeDirection;
  onDelta: (delta: number) => void;
}

export function ResizeHandle({ direction, onDelta }: ResizeHandleProps) {
  const onMouseDown = useResizable(direction, onDelta);

  // Full hit area is 9px but we use negative margins to only take 1px of layout space.
  // This keeps the visual 1px gap while having a generous click target.
  return (
    <div
      className={cn(
        "flex-shrink-0 relative z-20 flex items-center justify-center",
        direction === "horizontal"
          ? "w-[9px] -mx-[4px] cursor-col-resize"
          : "h-[9px] -my-[4px] cursor-row-resize",
      )}
      onMouseDown={onMouseDown}
    >
      {/* Visible 1px line */}
      <div
        className={cn(
          "bg-border transition-colors",
          direction === "horizontal"
            ? "w-[1px] h-full"
            : "h-[1px] w-full"
        )}
      />
      {/* Hover highlight — wider than the line */}
      <div
        className={cn(
          "absolute opacity-0 hover:opacity-100 transition-opacity",
          direction === "horizontal"
            ? "top-0 left-[2px] w-[5px] h-full bg-focus/40"
            : "left-0 top-[2px] h-[5px] w-full bg-focus/40"
        )}
      />
    </div>
  );
}
