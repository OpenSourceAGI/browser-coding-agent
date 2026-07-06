"use client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./DropdownMenu";

export interface ContextMenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick?: () => void;
}

export interface ContextMenuSection {
  items: ContextMenuItem[];
}

interface ContextMenuProps {
  x: number;
  y: number;
  sections: ContextMenuSection[];
  onClose: () => void;
}

export function ContextMenu({ x, y, sections, onClose }: ContextMenuProps) {
  return (
    <DropdownMenu open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DropdownMenuContent
        fixed
        style={{ left: x, top: y }}
        className="min-w-[220px]"
      >
        {sections.map((section, si) => (
          <div key={si}>
            {si > 0 && <DropdownMenuSeparator />}
            {section.items.map((item, ii) => (
              <DropdownMenuItem
                key={ii}
                disabled={item.disabled}
                onSelect={item.onClick}
                shortcut={item.shortcut}
              >
                {item.label}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
