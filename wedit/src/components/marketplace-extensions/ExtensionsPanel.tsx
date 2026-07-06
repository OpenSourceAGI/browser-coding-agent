/**
 * ExtensionsPanel
 * Manages installed extensions: enable/disable, install from URL, and
 * refresh the extension list.
 */
"use client";
import { useExtensionStore } from "@/stores/extension-store";
import { useNodepodStore } from "@/stores/nodepod-store";
import { loadExtensionFromPath, loadExtensionFromUrl } from '@/lib/extension-system/extension-loader';
import { extensionHost } from '@/lib/extension-system/extension-host';
import { useState } from "react";
import { Package, Check, X, Download, RefreshCw } from "lucide-react";

export function ExtensionsPanel() {
  const extensions = useExtensionStore((s) => s.extensions);
  const enabledExtensions = useExtensionStore((s) => s.enabledExtensions);
  const toggleExtension = useExtensionStore((s) => s.toggleExtension);
  const refreshExtensions = useExtensionStore((s) => s.refreshExtensions);
  const nodepod = useNodepodStore((s) => s.instance);

  const [loading, setLoading] = useState(false);
  const [installUrl, setInstallUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async (extensionId: string) => {
    try {
      await toggleExtension(extensionId);
      refreshExtensions();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleInstallFromUrl = async () => {
    if (!installUrl.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const { manifest, module } = await loadExtensionFromUrl(installUrl);
      await extensionHost.loadExtension(manifest, module, installUrl);
      refreshExtensions();
      setInstallUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    setError(null);

    try {
      // Reload extensions from filesystem
      if (nodepod) {
        const { autoLoadExtensions } = await import("@/lib/extension-system/extension-loader");
        await autoLoadExtensions(nodepod);
        refreshExtensions();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-bg2 text-t3">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Package size={16} className="text-t4" />
          <span className="text-sm font-medium">Extensions</span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="p-1 hover:bg-hover rounded text-t4 hover:text-t3"
          title="Refresh extensions"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Install from URL */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Extension URL or path..."
            value={installUrl}
            onChange={(e) => setInstallUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleInstallFromUrl()}
            className="flex-1 px-2 py-1 text-sm bg-bg3 border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
            disabled={loading}
          />
          <button
            onClick={handleInstallFromUrl}
            disabled={loading || !installUrl.trim()}
            className="px-3 py-1 text-sm bg-accent text-white rounded hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <Download size={14} />
            Install
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-4 mt-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Extensions list */}
      <div className="flex-1 overflow-y-auto">
        {extensions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-t4 text-sm">
            <Package size={32} className="mb-2 opacity-50" />
            <p>No extensions installed</p>
            <p className="text-xs mt-1">Install extensions from URL or place them in</p>
            <p className="text-xs text-t5 font-mono">/project/.weditor/extensions/</p>
          </div>
        ) : (
          <div className="py-2">
            {extensions.map((ext) => {
              const isEnabled = enabledExtensions.includes(ext.id);
              const isActive = ext.active;

              return (
                <div
                  key={ext.id}
                  className="px-4 py-3 hover:bg-hover border-b border-border/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {ext.manifest.name}
                        </span>
                        <span className="text-xs text-t5">
                          v{ext.manifest.version}
                        </span>
                        {isActive && (
                          <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-t4 mt-1 truncate">
                        {ext.manifest.description || "No description"}
                      </p>
                      <p className="text-xs text-t5 mt-1 font-mono truncate">
                        {ext.id}
                      </p>
                    </div>

                    <button
                      onClick={() => handleToggle(ext.id)}
                      disabled={loading}
                      className={`
                        flex items-center gap-1.5 px-2.5 py-1 text-xs rounded
                        transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                        ${
                          isEnabled
                            ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                            : "bg-bg3 text-t4 hover:bg-hover"
                        }
                      `}
                    >
                      {isEnabled ? (
                        <>
                          <Check size={12} />
                          Enabled
                        </>
                      ) : (
                        <>
                          <X size={12} />
                          Disabled
                        </>
                      )}
                    </button>
                  </div>

                  {/* Extension metadata */}
                  {ext.manifest.authors && ext.manifest.authors.length > 0 && (
                    <div className="mt-2 text-xs text-t5">
                      by {ext.manifest.authors.join(", ")}
                    </div>
                  )}

                  {/* Commands */}
                  {ext.manifest.commands && Object.keys(ext.manifest.commands).length > 0 && (
                    <div className="mt-2">
                      <div className="text-xs text-t5 mb-1">Commands:</div>
                      <div className="space-y-1">
                        {Object.entries(ext.manifest.commands).map(([id, cmd]) => (
                          <div key={id} className="text-xs font-mono text-t4 pl-2">
                            • {cmd.label}
                            {cmd.keybinding && (
                              <span className="ml-2 text-t5">({cmd.keybinding})</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer info */}
      <div className="px-4 py-2 border-t border-border text-xs text-t5">
        {extensions.length} extension{extensions.length !== 1 ? "s" : ""} installed •{" "}
        {enabledExtensions.length} enabled
      </div>
    </div>
  );
}
