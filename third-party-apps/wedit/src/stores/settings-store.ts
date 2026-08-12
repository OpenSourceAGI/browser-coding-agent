import { create } from "zustand";

export interface Settings {
  redact_private: boolean;
  telemetry: boolean;
  theme: string;
  icon_theme: string;
  ui_font_size: number;
  ui_font_family: string;
  buffer_font_size: number;
  buffer_font_family: string;
  base_keymap: string;
  line_numbers: "off" | "on" | "relative";
  minimap: boolean;
  word_wrap: "off" | "editor_width" | "preferred_line_length";
  indent_guides: boolean;
  tab_size: number;
  format_on_save: boolean;
  trim_whitespace: boolean;
  final_newline: boolean;
  cursor_blink: "blink" | "smooth" | "phase" | "expand" | "solid";
  cursor_shape: "bar" | "block" | "underline";
  inlay_hints: boolean;
  auto_save: "off" | "afterDelay" | "onFocusChange";
  terminal_font_size: number;
  terminal_font_family: string;
  terminal_cursor: "block" | "underline" | "bar";
  terminal_blinking: boolean;
  inline_completions: boolean;
  ai_provider: string;
  openrouter_api_key: string;
  openrouter_model: string;
  github_token: string;
}

export const DEFAULT_SETTINGS: Settings = {
  redact_private: false,
  telemetry: false,
  theme: "One Dark Pro",
  icon_theme: "Zed Icons",
  ui_font_size: 14,
  ui_font_family: "Zed Plex Sans",
  buffer_font_size: 14,
  buffer_font_family: "Zed Plex Mono",
  base_keymap: "VSCode",
  line_numbers: "on",
  minimap: false,
  word_wrap: "off",
  indent_guides: true,
  tab_size: 4,
  format_on_save: true,
  trim_whitespace: true,
  final_newline: true,
  cursor_blink: "smooth",
  cursor_shape: "bar",
  inlay_hints: false,
  auto_save: "afterDelay",
  terminal_font_size: 13,
  terminal_font_family: "Zed Plex Mono",
  terminal_cursor: "block",
  terminal_blinking: true,
  inline_completions: true,
  ai_provider: "Zed AI",
  openrouter_api_key: "",
  openrouter_model: "anthropic/claude-sonnet-4",
  github_token: "",
};

const STORAGE_KEY = "weditor-settings";

function loadFromStorage(): Partial<Settings> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function flushSettings() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(useSettingsStore.getState().settings));
  } catch { /* ignore */ }
}

interface SettingsState {
  settings: Settings;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: { ...DEFAULT_SETTINGS, ...loadFromStorage() },

  set: (key, value) =>
    set((s) => {
      const next = { ...s.settings, [key]: value };
      return { settings: next };
    }),

  reset: () =>
    set(() => {
      return { settings: { ...DEFAULT_SETTINGS } };
    }),
}));
