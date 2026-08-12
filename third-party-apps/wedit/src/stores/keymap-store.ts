import { create } from "zustand";

export interface KeyBinding {
  id: string;
  action: string;
  keys: string;
  context: string;
  source: "Default" | "User";
}

const DEFAULT_KEYBINDINGS: KeyBinding[] = [
  // file
  { id: "kb-1", action: "file: open", keys: "Ctrl-P", context: "Global", source: "Default" },
  { id: "kb-2", action: "file: save", keys: "Ctrl-S", context: "Editor", source: "Default" },
  { id: "kb-3", action: "file: save all", keys: "Ctrl-Shift-S", context: "Global", source: "Default" },
  { id: "kb-4", action: "file: new file", keys: "Ctrl-N", context: "Global", source: "Default" },

  // edit
  { id: "kb-5", action: "edit: undo", keys: "Ctrl-Z", context: "Editor", source: "Default" },
  { id: "kb-6", action: "edit: redo", keys: "Ctrl-Shift-Z", context: "Editor", source: "Default" },
  { id: "kb-7", action: "edit: find in file", keys: "Ctrl-F", context: "Editor", source: "Default" },
  { id: "kb-8", action: "edit: find and replace", keys: "Ctrl-H", context: "Editor", source: "Default" },
  { id: "kb-50", action: "edit: select all", keys: "Ctrl-A", context: "Editor", source: "Default" },
  { id: "kb-51", action: "edit: cut", keys: "Ctrl-X", context: "Editor", source: "Default" },
  { id: "kb-52", action: "edit: copy", keys: "Ctrl-C", context: "Editor", source: "Default" },
  { id: "kb-53", action: "edit: paste", keys: "Ctrl-V", context: "Editor", source: "Default" },

  // search
  { id: "kb-9", action: "search: project search", keys: "Ctrl-Shift-F", context: "Global", source: "Default" },
  { id: "kb-10", action: "search: go to symbol", keys: "Ctrl-T", context: "Global", source: "Default" },

  // panes + tabs
  { id: "kb-11", action: "editor: split right", keys: "Ctrl-K Ctrl-Right", context: "Editor", source: "Default" },
  { id: "kb-12", action: "editor: split down", keys: "Ctrl-K Ctrl-Down", context: "Editor", source: "Default" },
  { id: "kb-28", action: "editor: close tab", keys: "Ctrl-W", context: "Editor", source: "Default" },
  { id: "kb-29", action: "editor: next tab", keys: "Ctrl-Tab", context: "Editor", source: "Default" },
  { id: "kb-30", action: "editor: previous tab", keys: "Ctrl-Shift-Tab", context: "Editor", source: "Default" },
  { id: "kb-54", action: "editor: close all tabs", keys: "Ctrl-K Ctrl-W", context: "Editor", source: "Default" },
  { id: "kb-55", action: "editor: close other tabs", keys: "", context: "Editor", source: "Default" },
  { id: "kb-56", action: "editor: close pane", keys: "", context: "Editor", source: "Default" },
  { id: "kb-57", action: "editor: maximize pane", keys: "Ctrl-Shift-M", context: "Editor", source: "Default" },
  { id: "kb-70", action: "editor: go to tab 1", keys: "Ctrl-1", context: "Editor", source: "Default" },
  { id: "kb-71", action: "editor: go to tab 2", keys: "Ctrl-2", context: "Editor", source: "Default" },
  { id: "kb-72", action: "editor: go to tab 3", keys: "Ctrl-3", context: "Editor", source: "Default" },
  { id: "kb-73", action: "editor: go to tab 4", keys: "Ctrl-4", context: "Editor", source: "Default" },
  { id: "kb-74", action: "editor: go to tab 5", keys: "Ctrl-5", context: "Editor", source: "Default" },
  { id: "kb-75", action: "editor: go to tab 6", keys: "Ctrl-6", context: "Editor", source: "Default" },
  { id: "kb-76", action: "editor: go to tab 7", keys: "Ctrl-7", context: "Editor", source: "Default" },
  { id: "kb-77", action: "editor: go to tab 8", keys: "Ctrl-8", context: "Editor", source: "Default" },
  { id: "kb-78", action: "editor: go to last tab", keys: "Ctrl-9", context: "Editor", source: "Default" },

  // text editing
  { id: "kb-33", action: "editor: toggle comment", keys: "Ctrl-/", context: "Editor", source: "Default" },
  { id: "kb-34", action: "editor: indent line", keys: "Tab", context: "Editor", source: "Default" },
  { id: "kb-35", action: "editor: outdent line", keys: "Shift-Tab", context: "Editor", source: "Default" },
  { id: "kb-36", action: "editor: move line up", keys: "Alt-Up", context: "Editor", source: "Default" },
  { id: "kb-37", action: "editor: move line down", keys: "Alt-Down", context: "Editor", source: "Default" },
  { id: "kb-38", action: "editor: duplicate line", keys: "Shift-Alt-Down", context: "Editor", source: "Default" },
  { id: "kb-39", action: "editor: delete line", keys: "Ctrl-Shift-K", context: "Editor", source: "Default" },
  { id: "kb-40", action: "editor: select all occurrences", keys: "Ctrl-Shift-L", context: "Editor", source: "Default" },
  { id: "kb-41", action: "editor: add cursor above", keys: "Ctrl-Alt-Up", context: "Editor", source: "Default" },
  { id: "kb-42", action: "editor: add cursor below", keys: "Ctrl-Alt-Down", context: "Editor", source: "Default" },

  // view
  { id: "kb-13", action: "view: toggle terminal", keys: "Ctrl-`", context: "Global", source: "Default" },
  { id: "kb-14", action: "view: toggle sidebar", keys: "Ctrl-B", context: "Global", source: "Default" },
  { id: "kb-15", action: "view: command palette", keys: "Ctrl-Shift-P", context: "Global", source: "Default" },
  { id: "kb-16", action: "view: toggle minimap", keys: "", context: "Editor", source: "Default" },
  { id: "kb-17", action: "view: zoom in", keys: "Ctrl-=", context: "Global", source: "Default" },
  { id: "kb-18", action: "view: zoom out", keys: "Ctrl--", context: "Global", source: "Default" },
  { id: "kb-58", action: "view: reset zoom", keys: "Ctrl-0", context: "Global", source: "Default" },
  { id: "kb-31", action: "view: toggle right panel", keys: "Ctrl-Shift-B", context: "Global", source: "Default" },
  { id: "kb-32", action: "view: toggle bottom panel", keys: "Ctrl-J", context: "Global", source: "Default" },
  { id: "kb-59", action: "view: maximize panel", keys: "", context: "Global", source: "Default" },
  { id: "kb-60", action: "view: focus editor", keys: "", context: "Global", source: "Default" },
  { id: "kb-61", action: "view: focus terminal", keys: "", context: "Global", source: "Default" },

  // navigation
  { id: "kb-19", action: "go: definition", keys: "F12", context: "Editor", source: "Default" },
  { id: "kb-20", action: "go: references", keys: "Shift-F12", context: "Editor", source: "Default" },
  { id: "kb-21", action: "go: line", keys: "Ctrl-G", context: "Editor", source: "Default" },
  { id: "kb-62", action: "go: back", keys: "Alt-Left", context: "Editor", source: "Default" },
  { id: "kb-63", action: "go: forward", keys: "Alt-Right", context: "Editor", source: "Default" },
  { id: "kb-64", action: "go: home", keys: "", context: "Global", source: "Default" },

  // terminal
  { id: "kb-22", action: "terminal: new terminal", keys: "Ctrl-Shift-`", context: "Terminal", source: "Default" },

  // git
  { id: "kb-23", action: "git: commit", keys: "", context: "Global", source: "Default" },
  { id: "kb-24", action: "git: push", keys: "", context: "Global", source: "Default" },
  { id: "kb-25", action: "git: pull", keys: "", context: "Global", source: "Default" },
  { id: "kb-65", action: "git: focus", keys: "Ctrl-Shift-G", context: "Global", source: "Default" },

  // browser
  { id: "kb-79", action: "view: open browser tab", keys: "Ctrl-Shift-I", context: "Global", source: "Default" },

  // theme / settings
  { id: "kb-26", action: "theme: select theme", keys: "Ctrl-K Ctrl-T", context: "Global", source: "Default" },
  { id: "kb-27", action: "settings: open", keys: "Ctrl-,", context: "Global", source: "Default" },
  { id: "kb-66", action: "settings: open keymap", keys: "Ctrl-K Ctrl-S", context: "Global", source: "Default" },

  // project panel
  { id: "kb-67", action: "project: collapse all", keys: "", context: "Global", source: "Default" },
  { id: "kb-68", action: "project: reveal active file", keys: "Ctrl-Shift-.", context: "Global", source: "Default" },
  { id: "kb-69", action: "project: focus", keys: "Ctrl-Shift-E", context: "Global", source: "Default" },
];

const STORAGE_KEY = "weditor-keybindings";

function loadUserKeybindings(): KeyBinding[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function flushKeybindings() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(useKeymapStore.getState().userBindings));
  } catch { /* ignore */ }
}

function mergeBindings(defaults: KeyBinding[], userBindings: KeyBinding[]): KeyBinding[] {
  const result = defaults.map((d) => {
    const override = userBindings.find((u) => u.action === d.action && u.context === d.context);
    if (override) return { ...d, keys: override.keys, source: "User" as const };
    return d;
  });
  for (const u of userBindings) {
    if (!defaults.some((d) => d.action === u.action && d.context === u.context)) {
      result.push(u);
    }
  }
  return result;
}

interface KeymapState {
  bindings: KeyBinding[];
  userBindings: KeyBinding[];
  updateBinding: (id: string, keys: string) => void;
  addBinding: (action: string, keys: string, context: string) => void;
  removeUserBinding: (id: string) => void;
  resetBinding: (id: string) => void;
  getJSON: () => string;
}

function initNextId(bindings: KeyBinding[]): number {
  let max = 1000;
  for (const b of bindings) {
    const m = b.id.match(/^kb-user-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]) + 1);
  }
  return max;
}

export const useKeymapStore = create<KeymapState>((set, get) => {
  const userBindings = loadUserKeybindings();
  let _nextUserBindingId = initNextId(userBindings);
  return {
    bindings: mergeBindings(DEFAULT_KEYBINDINGS, userBindings),
    userBindings,

    updateBinding: (id, keys) => {
      const s = get();
      const binding = s.bindings.find((b) => b.id === id);
      if (!binding) return;

      const newUserBindings = [...s.userBindings];
      const existingIdx = newUserBindings.findIndex((u) => u.action === binding.action && u.context === binding.context);
      if (existingIdx >= 0) {
        newUserBindings[existingIdx] = { ...newUserBindings[existingIdx], keys };
      } else {
        newUserBindings.push({ ...binding, keys, source: "User" });
      }
      set({
        userBindings: newUserBindings,
        bindings: mergeBindings(DEFAULT_KEYBINDINGS, newUserBindings),
      });
    },

    addBinding: (action, keys, context) => {
      const id = `kb-user-${_nextUserBindingId++}`;
      const newBinding: KeyBinding = { id, action, keys, context, source: "User" };
      const newUserBindings = [...get().userBindings, newBinding];
      set({
        userBindings: newUserBindings,
        bindings: mergeBindings(DEFAULT_KEYBINDINGS, newUserBindings),
      });
    },

    removeUserBinding: (id) => {
      const s = get();
      const newUserBindings = s.userBindings.filter((u) => u.id !== id);
      set({
        userBindings: newUserBindings,
        bindings: mergeBindings(DEFAULT_KEYBINDINGS, newUserBindings),
      });
    },

    resetBinding: (id) => {
      const s = get();
      const binding = s.bindings.find((b) => b.id === id);
      if (!binding) return;
      const newUserBindings = s.userBindings.filter((u) => !(u.action === binding.action && u.context === binding.context));
      set({
        userBindings: newUserBindings,
        bindings: mergeBindings(DEFAULT_KEYBINDINGS, newUserBindings),
      });
    },

    getJSON: () => {
      return JSON.stringify(get().userBindings, null, 2);
    },
  };
});
