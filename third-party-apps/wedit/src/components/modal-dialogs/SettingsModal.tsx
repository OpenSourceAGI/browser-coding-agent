"use client";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useSettingsStore, DEFAULT_SETTINGS } from "@/stores/settings-store";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/shared-utilities/cn";
import { themes } from "@/lib/theme-management/themes";

export function SettingsModal() {
  const settingsOpen = useWorkspaceStore((s) => s.settingsOpen);
  const toggleSettings = useWorkspaceStore((s) => s.toggleSettings);
  const settings = useSettingsStore((s) => s.settings);
  const setSetting = useSettingsStore((s) => s.set);
  const resetSettings = useSettingsStore((s) => s.reset);

  if (!settingsOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      toggleSettings();
    }
  };

  const content = (
    <div
      className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-bg1 rounded-lg shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-t1">Settings</h2>
          <button
            onClick={toggleSettings}
            className="p-1 rounded hover:bg-hover text-t4 hover:text-t1"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-6">
            {/* Appearance */}
            <Section title="Appearance">
              <SelectSetting
                label="Theme"
                value={settings.theme}
                onChange={(v) => setSetting("theme", v)}
                options={themes.map((t) => ({ value: t.name, label: t.name }))}
              />
              <NumberSetting
                label="UI Font Size"
                value={settings.ui_font_size}
                onChange={(v) => setSetting("ui_font_size", v)}
                min={10}
                max={24}
              />
              <TextSetting
                label="UI Font Family"
                value={settings.ui_font_family}
                onChange={(v) => setSetting("ui_font_family", v)}
              />
            </Section>

            {/* Editor */}
            <Section title="Editor">
              <NumberSetting
                label="Editor Font Size"
                value={settings.buffer_font_size}
                onChange={(v) => setSetting("buffer_font_size", v)}
                min={8}
                max={32}
              />
              <TextSetting
                label="Editor Font Family"
                value={settings.buffer_font_family}
                onChange={(v) => setSetting("buffer_font_family", v)}
              />
              <SelectSetting
                label="Line Numbers"
                value={settings.line_numbers}
                onChange={(v) => setSetting("line_numbers", v as any)}
                options={[
                  { value: "off", label: "Off" },
                  { value: "on", label: "On" },
                  { value: "relative", label: "Relative" },
                ]}
              />
              <SelectSetting
                label="Word Wrap"
                value={settings.word_wrap}
                onChange={(v) => setSetting("word_wrap", v as any)}
                options={[
                  { value: "off", label: "Off" },
                  { value: "editor_width", label: "Editor Width" },
                  { value: "preferred_line_length", label: "Preferred Line Length" },
                ]}
              />
              <NumberSetting
                label="Tab Size"
                value={settings.tab_size}
                onChange={(v) => setSetting("tab_size", v)}
                min={1}
                max={8}
              />
              <CheckboxSetting
                label="Minimap"
                checked={settings.minimap}
                onChange={(v) => setSetting("minimap", v)}
              />
              <CheckboxSetting
                label="Indent Guides"
                checked={settings.indent_guides}
                onChange={(v) => setSetting("indent_guides", v)}
              />
              <CheckboxSetting
                label="Inlay Hints"
                checked={settings.inlay_hints}
                onChange={(v) => setSetting("inlay_hints", v)}
              />
              <CheckboxSetting
                label="Inline Completions"
                checked={settings.inline_completions}
                onChange={(v) => setSetting("inline_completions", v)}
              />
              <SelectSetting
                label="Cursor Shape"
                value={settings.cursor_shape}
                onChange={(v) => setSetting("cursor_shape", v as any)}
                options={[
                  { value: "bar", label: "Bar" },
                  { value: "block", label: "Block" },
                  { value: "underline", label: "Underline" },
                ]}
              />
              <SelectSetting
                label="Cursor Blink"
                value={settings.cursor_blink}
                onChange={(v) => setSetting("cursor_blink", v as any)}
                options={[
                  { value: "solid", label: "Solid" },
                  { value: "blink", label: "Blink" },
                  { value: "smooth", label: "Smooth" },
                  { value: "phase", label: "Phase" },
                  { value: "expand", label: "Expand" },
                ]}
              />
            </Section>

            {/* File Management */}
            <Section title="File Management">
              <SelectSetting
                label="Auto Save"
                value={settings.auto_save}
                onChange={(v) => setSetting("auto_save", v as any)}
                options={[
                  { value: "off", label: "Off" },
                  { value: "afterDelay", label: "After Delay" },
                  { value: "onFocusChange", label: "On Focus Change" },
                ]}
              />
              <CheckboxSetting
                label="Format on Save"
                checked={settings.format_on_save}
                onChange={(v) => setSetting("format_on_save", v)}
              />
              <CheckboxSetting
                label="Trim Whitespace"
                checked={settings.trim_whitespace}
                onChange={(v) => setSetting("trim_whitespace", v)}
              />
              <CheckboxSetting
                label="Final Newline"
                checked={settings.final_newline}
                onChange={(v) => setSetting("final_newline", v)}
              />
            </Section>

            {/* Terminal */}
            <Section title="Terminal">
              <NumberSetting
                label="Terminal Font Size"
                value={settings.terminal_font_size}
                onChange={(v) => setSetting("terminal_font_size", v)}
                min={8}
                max={32}
              />
              <TextSetting
                label="Terminal Font Family"
                value={settings.terminal_font_family}
                onChange={(v) => setSetting("terminal_font_family", v)}
              />
              <SelectSetting
                label="Terminal Cursor"
                value={settings.terminal_cursor}
                onChange={(v) => setSetting("terminal_cursor", v as any)}
                options={[
                  { value: "block", label: "Block" },
                  { value: "underline", label: "Underline" },
                  { value: "bar", label: "Bar" },
                ]}
              />
              <CheckboxSetting
                label="Terminal Blinking"
                checked={settings.terminal_blinking}
                onChange={(v) => setSetting("terminal_blinking", v)}
              />
            </Section>

            {/* AI & Integrations */}
            <Section title="AI & Integrations">
              <TextSetting
                label="OpenRouter API Key"
                value={settings.openrouter_api_key}
                onChange={(v) => setSetting("openrouter_api_key", v)}
                type="password"
              />
              <TextSetting
                label="OpenRouter Model"
                value={settings.openrouter_model}
                onChange={(v) => setSetting("openrouter_model", v)}
              />
              <TextSetting
                label="GitHub Token"
                value={settings.github_token}
                onChange={(v) => setSetting("github_token", v)}
                type="password"
              />
            </Section>

            {/* Privacy */}
            <Section title="Privacy">
              <CheckboxSetting
                label="Redact Private Information"
                checked={settings.redact_private}
                onChange={(v) => setSetting("redact_private", v)}
              />
              <CheckboxSetting
                label="Telemetry"
                checked={settings.telemetry}
                onChange={(v) => setSetting("telemetry", v)}
              />
            </Section>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button
            onClick={resetSettings}
            className="px-4 py-2 rounded-md text-sm font-medium bg-bg2 text-t3 hover:bg-hover transition-colors"
          >
            Reset to Defaults
          </button>
          <button
            onClick={toggleSettings}
            className="px-4 py-2 rounded-md text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-t1 mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function CheckboxSetting({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-border bg-bg2 checked:bg-accent checked:border-accent"
      />
      <span className="text-sm text-t3">{label}</span>
    </label>
  );
}

function NumberSetting({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-t3">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        className="w-20 px-2 py-1 text-sm rounded border border-border bg-bg2 text-t2 outline-none focus:border-accent"
      />
    </div>
  );
}

function TextSetting({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "password";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm text-t3">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 text-sm rounded border border-border bg-bg2 text-t2 outline-none focus:border-accent"
      />
    </div>
  );
}

function SelectSetting({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-t3">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-1.5 text-sm rounded border border-border bg-bg2 text-t2 outline-none focus:border-accent cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
