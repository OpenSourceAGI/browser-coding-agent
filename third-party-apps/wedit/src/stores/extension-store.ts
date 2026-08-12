/**
 * Extension state management store
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LoadedExtension } from '@/lib/extension-system/extension-types';
import { extensionHost } from '@/lib/extension-system/extension-host';

interface ExtensionStore {
  // State
  extensions: LoadedExtension[];
  enabledExtensions: string[]; // IDs of enabled extensions
  loading: boolean;
  error: string | null;

  // Actions
  setExtensions: (extensions: LoadedExtension[]) => void;
  addExtension: (extension: LoadedExtension) => void;
  removeExtension: (extensionId: string) => void;
  enableExtension: (extensionId: string) => Promise<void>;
  disableExtension: (extensionId: string) => Promise<void>;
  toggleExtension: (extensionId: string) => Promise<void>;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  refreshExtensions: () => void;
}

export const useExtensionStore = create<ExtensionStore>()(
  persist(
    (set, get) => ({
      // Initial state
      extensions: [],
      enabledExtensions: [],
      loading: false,
      error: null,

      // Actions
      setExtensions: (extensions) => set({ extensions }),

      addExtension: (extension) =>
        set((state) => ({
          extensions: [...state.extensions.filter(e => e.id !== extension.id), extension],
        })),

      removeExtension: (extensionId) =>
        set((state) => ({
          extensions: state.extensions.filter((e) => e.id !== extensionId),
          enabledExtensions: state.enabledExtensions.filter((id) => id !== extensionId),
        })),

      enableExtension: async (extensionId) => {
        try {
          await extensionHost.activateExtension(extensionId);
          set((state) => ({
            enabledExtensions: Array.from(new Set([...state.enabledExtensions, extensionId])),
            error: null,
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set({ error: `Failed to enable ${extensionId}: ${message}` });
          throw error;
        }
      },

      disableExtension: async (extensionId) => {
        try {
          await extensionHost.deactivateExtension(extensionId);
          set((state) => ({
            enabledExtensions: state.enabledExtensions.filter((id) => id !== extensionId),
            error: null,
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set({ error: `Failed to disable ${extensionId}: ${message}` });
          throw error;
        }
      },

      toggleExtension: async (extensionId) => {
        const { enabledExtensions } = get();
        if (enabledExtensions.includes(extensionId)) {
          await get().disableExtension(extensionId);
        } else {
          await get().enableExtension(extensionId);
        }
      },

      setLoading: (loading) => set({ loading }),

      setError: (error) => set({ error }),

      refreshExtensions: () => {
        const extensions = extensionHost.getExtensions();
        set({ extensions });
      },
    }),
    {
      name: "weditor-extensions",
      partialize: (state) => ({
        enabledExtensions: state.enabledExtensions,
      }),
    }
  )
);
