/**
 * MarketplacePanel
 * Lists extensions from the Zed marketplace, supports search, filters,
 * and installing extensions into the local environment.
 */
"use client";
import { useState, useEffect } from "react";
import { useExtensionStore } from "@/stores/extension-store";
import {
  fetchZedMarketplaceExtensions,
  searchExtensions,
  filterExtensionsByCategory,
  getExtensionDetails,
  isExtensionCompatible,
  resolveExtensionManifest,
  getExtensionDownloadUrl,
  type ZedMarketplaceExtension,
} from '@/lib/marketplace-api/zed-marketplace';
import { loadExtensionFromUrl, parseExtensionToml } from '@/lib/extension-system/extension-loader';
import { extensionHost } from '@/lib/extension-system/extension-host';
import {
  Search,
  Download,
  Package,
  RefreshCw,
  ExternalLink,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Filter,
} from "lucide-react";

type Category = "all" | "language" | "theme" | "tool";

export function MarketplacePanel() {
  const [extensions, setExtensions] = useState<ZedMarketplaceExtension[]>([]);
  const [filteredExtensions, setFilteredExtensions] = useState<ZedMarketplaceExtension[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [installing, setInstalling] = useState<string | null>(null);
  const [selectedExtension, setSelectedExtension] = useState<ZedMarketplaceExtension | null>(null);

  const installedExtensions = useExtensionStore((s) => s.extensions);
  const refreshExtensions = useExtensionStore((s) => s.refreshExtensions);

  // Fetch marketplace extensions
  useEffect(() => {
    loadMarketplace();
  }, []);

  // Apply search and filters
  useEffect(() => {
    let result = extensions;

    // Filter by category
    result = filterExtensionsByCategory(result, category);

    // Search
    if (searchQuery.trim()) {
      result = searchExtensions(result, searchQuery);
    }

    setFilteredExtensions(result);
  }, [extensions, searchQuery, category]);

  const loadMarketplace = async () => {
    setLoading(true);
    setError(null);

    try {
      const exts = await fetchZedMarketplaceExtensions();
      setExtensions(exts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async (ext: ZedMarketplaceExtension) => {
    setInstalling(ext.id);
    setError(null);

    try {
      // Check compatibility
      const compat = isExtensionCompatible(ext);
      if (!compat.compatible) {
        setError(`Cannot install: ${compat.reason}`);
        setInstalling(null);
        return;
      }

      // Resolve extension manifest location from repository URL
      const resolved = await resolveExtensionManifest(ext);

      // Try to fetch manifest from resolved location
      let manifestText: string | undefined;
      let baseUrl: string | undefined;

      for (const manifestUrl of resolved.manifestUrls) {
        try {
          const response = await fetch(manifestUrl);
          if (response.ok) {
            manifestText = await response.text();
            // Extract base URL (remove /extension.toml)
            baseUrl = manifestUrl.replace(/\/extension\.toml$/, "/");
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!manifestText || !baseUrl) {
        throw new Error(`Could not fetch extension.toml from any candidate URL`);
      }

      // Parse manifest
      const manifest = parseExtensionToml(manifestText);

      // Load extension from resolved base URL
      const { module } = await loadExtensionFromUrl(baseUrl);

      await extensionHost.loadExtension(manifest, module, baseUrl);
      refreshExtensions();

      alert(`Successfully installed ${ext.name}!`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(`Failed to install ${ext.name}: ${message}`);
    } finally {
      setInstalling(null);
    }
  };

  const handleViewDetails = async (ext: ZedMarketplaceExtension) => {
    try {
      const details = await getExtensionDetails(ext);
      if (details) setSelectedExtension(details);
    } catch (e) {
      console.error("Failed to load extension details:", e);
    }
  };

  const isInstalled = (extId: string) => {
    return installedExtensions.some((e) => e.id === extId || e.id.includes(extId));
  };

  return (
    <div className="h-full flex flex-col bg-bg2 text-t3">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Package size={16} className="text-t4" />
          <span className="text-sm font-medium">Zed Marketplace</span>
          <span className="text-xs text-t5">
            ({filteredExtensions.length} {category !== "all" && category})
          </span>
        </div>
        <button
          onClick={loadMarketplace}
          disabled={loading}
          className="p-1 hover:bg-hover rounded text-t4 hover:text-t3"
          title="Refresh marketplace"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Search and filters */}
      <div className="px-4 py-3 border-b border-border space-y-2">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-t5" />
          <input
            type="text"
            placeholder="Search extensions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-bg3 border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* Category filters */}
        <div className="flex gap-2 text-xs">
          {(["all", "language", "theme", "tool"] as Category[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-2 py-1 rounded transition-colors ${
                category === cat
                  ? "bg-accent text-white"
                  : "bg-bg3 text-t4 hover:bg-hover hover:text-t3"
              }`}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-4 mt-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && !extensions.length && (
        <div className="flex flex-col items-center justify-center h-full text-t4 text-sm">
          <RefreshCw size={32} className="mb-2 animate-spin" />
          <p>Loading marketplace...</p>
        </div>
      )}

      {/* Extensions list */}
      {!loading && filteredExtensions.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-t4 text-sm">
          <Search size={32} className="mb-2 opacity-50" />
          <p>No extensions found</p>
          {searchQuery && <p className="text-xs text-t5 mt-1">Try a different search term</p>}
        </div>
      )}

      {!loading && filteredExtensions.length > 0 && (
        <div className="flex-1 overflow-y-auto">
          <div className="py-2">
            {filteredExtensions.slice(0, 100).map((ext) => {
              const installed = isInstalled(ext.id);
              const compat = isExtensionCompatible(ext);
              const isInstalling = installing === ext.id;

              return (
                <div
                  key={ext.id}
                  className="px-4 py-3 hover:bg-hover border-b border-border/50 cursor-pointer"
                  onClick={() => handleViewDetails(ext)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{ext.name}</span>
                        <span className="text-xs text-t5">{ext.version}</span>

                        {installed && (
                          <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded flex items-center gap-1">
                            <CheckCircle size={10} />
                            Installed
                          </span>
                        )}

                        {!compat.compatible && (
                          <span
                            className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded flex items-center gap-1"
                            title={compat.reason}
                          >
                            <AlertTriangle size={10} />
                            Limited
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-t4 mt-1 line-clamp-2">
                        {ext.description || "No description available"}
                      </p>

                      <div className="flex items-center gap-3 mt-1 text-xs text-t5">
                        {ext.authors && ext.authors.length > 0 && (
                          <span>by {ext.authors.slice(0, 2).join(", ")}</span>
                        )}
                        {ext.download_count && (
                          <span>{ext.download_count.toLocaleString()} downloads</span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {ext.repository && (
                        <a
                          href={ext.repository}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 hover:bg-bg3 rounded text-t4 hover:text-t3"
                          title="View repository"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}

                      {!installed && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInstall(ext);
                          }}
                          disabled={isInstalling || !compat.compatible}
                          className={`
                            flex items-center gap-1.5 px-2.5 py-1 text-xs rounded
                            transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                            ${
                              compat.compatible
                                ? "bg-accent text-white hover:bg-accent/90"
                                : "bg-bg3 text-t5"
                            }
                          `}
                          title={!compat.compatible ? compat.reason : "Install extension"}
                        >
                          {isInstalling ? (
                            <RefreshCw size={12} className="animate-spin" />
                          ) : (
                            <Download size={12} />
                          )}
                          {isInstalling ? "Installing..." : "Install"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredExtensions.length > 100 && (
              <div className="px-4 py-3 text-center text-xs text-t5">
                Showing first 100 results. Refine your search to see more.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border text-xs text-t5">
        <div className="flex items-center justify-between">
          <span>
            {extensions.length} extension{extensions.length !== 1 ? "s" : ""} available
          </span>
          <a
            href="https://zed.dev/extensions"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-t3 hover:underline flex items-center gap-1"
          >
            Browse on zed.dev
            <ExternalLink size={10} />
          </a>
        </div>
      </div>
    </div>
  );
}
