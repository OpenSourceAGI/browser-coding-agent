/**
 * Zed Extensions Marketplace Integration
 * Fetches and parses extensions from the official Zed repository
 *
 * Resolution order:
 * 1. Parse extensions.toml for extension entry (submodule, path, version)
 * 2. Look up submodule in .gitmodules to get repo URL
 * 3. Combine repo URL + branch + optional path subdirectory
 * 4. Fetch extension.toml from resolved location
 * 5. Use Zed API download endpoint for installation
 */

export interface ZedMarketplaceExtension {
  id: string;
  name: string;
  version: string;
  description?: string;
  authors?: string[];
  repository?: string;
  submodule: string;
  path?: string; // Subdirectory within repo
  schema_version?: number;
  published_at?: string;
  download_count?: number;
}

interface ZedApiExtension {
  id: string;
  name?: string;
  version: string;
  description?: string;
  authors?: string[];
  repository?: string;
  published_at?: string;
  download_count?: number;
}

interface ExtensionTomlEntry {
  submodule: string;
  version?: string;
  path?: string; // Optional subdirectory
}

const GITMODULES_URL = "https://raw.githubusercontent.com/zed-industries/extensions/refs/heads/main/.gitmodules";
const EXTENSIONS_TOML_URL = "https://raw.githubusercontent.com/zed-industries/extensions/refs/heads/main/extensions.toml";
const ZED_API_URL = "https://api.zed.dev/extensions?max_schema_version=1";
const ZED_DOWNLOAD_URL = "https://api.zed.dev/extensions";

/**
 * Parse .gitmodules to get submodule path → repo URL mapping
 */
function parseGitmodules(text: string): Map<string, string> {
  const map = new Map<string, string>();
  const blocks = text.split(/\n(?=\[submodule\s")/g);

  for (const block of blocks) {
    const pathMatch = block.match(/^\s*path\s*=\s*(.+)\s*$/m);
    const urlMatch = block.match(/^\s*url\s*=\s*(.+)\s*$/m);

    if (pathMatch && urlMatch) {
      const path = pathMatch[1].trim();
      const url = urlMatch[1].trim().replace(/\.git$/, "");
      map.set(path, url);
    }
  }

  return map;
}

/**
 * Fetch .gitmodules and return submodule → repo URL mapping
 */
async function fetchGitmodules(): Promise<Map<string, string>> {
  try {
    const response = await fetch(GITMODULES_URL);
    if (!response.ok) throw new Error(`Failed to fetch .gitmodules: ${response.status}`);
    const text = await response.text();
    return parseGitmodules(text);
  } catch (e) {
    console.error("Failed to fetch .gitmodules:", e);
    return new Map();
  }
}

/**
 * Parse extensions.toml to get extension registry entries
 */
function parseExtensionsToml(toml: string): Map<string, ExtensionTomlEntry> {
  const result = new Map<string, ExtensionTomlEntry>();
  let currentId: string | null = null;
  let currentEntry: Partial<ExtensionTomlEntry> = {};

  for (const rawLine of toml.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    // Section header: [extension-id]
    const section = line.match(/^\[([^\]]+)\]$/);
    if (section) {
      // Save previous entry
      if (currentId && currentEntry.submodule) {
        result.set(currentId, currentEntry as ExtensionTomlEntry);
      }
      // Start new entry
      currentId = section[1];
      currentEntry = {};
      continue;
    }

    // Key-value pairs: key = "value"
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*=\s*"([^"]*)"$/);
    if (kv && currentId) {
      const [, key, value] = kv;
      if (key === "submodule") {
        currentEntry.submodule = value;
      } else if (key === "version") {
        currentEntry.version = value;
      } else if (key === "path") {
        currentEntry.path = value;
      }
    }
  }

  // Save last entry
  if (currentId && currentEntry.submodule) {
    result.set(currentId, currentEntry as ExtensionTomlEntry);
  }

  return result;
}

/**
 * Fetch extensions from Zed's internal API
 */
async function fetchFromZedApi(): Promise<ZedApiExtension[]> {
  try {
    const response = await fetch(ZED_API_URL);
    if (!response.ok) throw new Error(`API returned ${response.status}`);

    const data = await response.json();
    return data.data || data || [];
  } catch (e) {
    console.warn("Failed to fetch from Zed API:", e);
    return [];
  }
}

/**
 * Fetch extensions.toml from GitHub
 */
async function fetchExtensionsToml(): Promise<Map<string, ExtensionTomlEntry>> {
  try {
    const response = await fetch(EXTENSIONS_TOML_URL);
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);

    const toml = await response.text();
    return parseExtensionsToml(toml);
  } catch (e) {
    console.error("Failed to fetch extensions.toml:", e);
    throw e;
  }
}

/**
 * Convert GitHub repo URL to raw.githubusercontent.com base
 */
function githubRepoToRawBase(repoUrl: string, branch: string = "main"): string {
  const m = repoUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/);
  if (!m) throw new Error(`Unsupported GitHub repo URL: ${repoUrl}`);
  const [, owner, repo] = m;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;
}

/**
 * Merge data from extensions.toml, .gitmodules, and API
 */
function mergeExtensionData(
  tomlRegistry: Map<string, ExtensionTomlEntry>,
  gitmodules: Map<string, string>,
  apiExtensions: ZedApiExtension[]
): ZedMarketplaceExtension[] {
  const merged = new Map<string, ZedMarketplaceExtension>();

  // Start with extensions.toml entries
  for (const [id, entry] of tomlRegistry.entries()) {
    // Look up repo URL from gitmodules
    const repoUrl = gitmodules.get(entry.submodule);

    merged.set(id, {
      id,
      name: id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      version: entry.version || "unknown",
      submodule: entry.submodule,
      path: entry.path,
      repository: repoUrl,
    });
  }

  // Enhance with API data
  for (const apiExt of apiExtensions) {
    const existing = merged.get(apiExt.id);
    if (existing) {
      merged.set(apiExt.id, {
        ...existing,
        name: apiExt.name || existing.name,
        description: apiExt.description || existing.description,
        authors: apiExt.authors || existing.authors,
        version: apiExt.version || existing.version,
        published_at: apiExt.published_at,
        download_count: apiExt.download_count,
      });
    } else {
      // API-only extension (shouldn't happen, but handle it)
      merged.set(apiExt.id, {
        id: apiExt.id,
        name: apiExt.name || apiExt.id,
        version: apiExt.version,
        description: apiExt.description,
        authors: apiExt.authors,
        repository: apiExt.repository,
        submodule: "", // Unknown
        published_at: apiExt.published_at,
        download_count: apiExt.download_count,
      });
    }
  }

  return Array.from(merged.values());
}

/**
 * Fetch all Zed extensions from marketplace
 */
export async function fetchZedMarketplaceExtensions(): Promise<ZedMarketplaceExtension[]> {
  try {
    // Fetch from all sources in parallel
    const [tomlRegistry, gitmodules, apiExtensions] = await Promise.all([
      fetchExtensionsToml(),
      fetchGitmodules(),
      fetchFromZedApi(),
    ]);

    return mergeExtensionData(tomlRegistry, gitmodules, apiExtensions);
  } catch (e) {
    console.error("Failed to fetch marketplace extensions:", e);
    throw e;
  }
}

/**
 * Search extensions by query
 */
export function searchExtensions(
  extensions: ZedMarketplaceExtension[],
  query: string
): ZedMarketplaceExtension[] {
  if (!query.trim()) return extensions;

  const q = query.toLowerCase();

  return extensions
    .filter((ext) => {
      return (
        ext.id.toLowerCase().includes(q) ||
        ext.name.toLowerCase().includes(q) ||
        ext.description?.toLowerCase().includes(q) ||
        ext.authors?.some((a) => a.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      // Prioritize exact matches
      const aExact = a.id.toLowerCase() === q || a.name.toLowerCase() === q;
      const bExact = b.id.toLowerCase() === q || b.name.toLowerCase() === q;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;

      // Then by download count
      const aDownloads = a.download_count || 0;
      const bDownloads = b.download_count || 0;
      if (aDownloads !== bDownloads) return bDownloads - aDownloads;

      // Then alphabetically
      return a.name.localeCompare(b.name);
    });
}

/**
 * Filter extensions by category
 */
export function filterExtensionsByCategory(
  extensions: ZedMarketplaceExtension[],
  category: "all" | "language" | "theme" | "tool"
): ZedMarketplaceExtension[] {
  if (category === "all") return extensions;

  return extensions.filter((ext) => {
    const id = ext.id.toLowerCase();
    const name = ext.name.toLowerCase();

    switch (category) {
      case "language":
        // Language extensions typically don't have -theme suffix
        return !id.includes("theme") && !name.includes("theme");
      case "theme":
        return id.includes("theme") || name.includes("theme");
      case "tool":
        // Tools are typically utility extensions
        return (
          id.includes("lsp") ||
          id.includes("lint") ||
          id.includes("format") ||
          id.includes("mcp") ||
          id.includes("watch") ||
          id.includes("discord")
        );
      default:
        return true;
    }
  });
}

/**
 * Resolve extension manifest location using registry + gitmodules
 *
 * Resolution order:
 * 1. Get entry from extensions.toml (submodule, version, optional path)
 * 2. Look up repo URL in .gitmodules using submodule path
 * 3. Combine repo URL + branch + path subdirectory
 * 4. Return manifest URL candidates (main/master branches)
 */
export async function resolveExtensionManifest(
  extensionId: string
): Promise<{
  id: string;
  repoUrl: string;
  submodule: string;
  path: string;
  manifestUrls: string[];
}> {
  // Fetch registry and gitmodules
  const [tomlRegistry, gitmodules] = await Promise.all([
    fetchExtensionsToml(),
    fetchGitmodules(),
  ]);

  // Get extension entry from registry
  const entry = tomlRegistry.get(extensionId);
  if (!entry) {
    throw new Error(`Extension not found in registry: ${extensionId}`);
  }

  // Look up repo URL from gitmodules
  const repoUrl = gitmodules.get(entry.submodule);
  if (!repoUrl) {
    throw new Error(`No git URL for submodule: ${entry.submodule}`);
  }

  // Build subdirectory path if specified
  const subdir = entry.path ? `/${entry.path.replace(/^\/|\/$/g, "")}` : "";

  // Generate raw GitHub URLs for both main and master branches
  const rawBaseMain = githubRepoToRawBase(repoUrl, "main") + subdir;
  const rawBaseMaster = githubRepoToRawBase(repoUrl, "master") + subdir;

  const manifestUrls = [
    `${rawBaseMain}/extension.toml`,
    `${rawBaseMaster}/extension.toml`,
  ];

  return {
    id: extensionId,
    repoUrl,
    submodule: entry.submodule,
    path: entry.path || "",
    manifestUrls,
  };
}

/**
 * Get Zed API download URL for extension
 * This is the primary installation mechanism
 */
export function getExtensionDownloadUrl(extensionId: string): string {
  return `${ZED_DOWNLOAD_URL}/${extensionId}/download`;
}

/**
 * Fetch extension manifest from resolved location
 */
export async function fetchExtensionManifest(extensionId: string): Promise<{
  manifest: string;
  manifestUrl: string;
}> {
  const resolved = await resolveExtensionManifest(extensionId);

  for (const url of resolved.manifestUrls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const manifest = await response.text();
        return { manifest, manifestUrl: url };
      }
    } catch (e) {
      // Try next URL
      continue;
    }
  }

  throw new Error(
    `No extension.toml found for ${extensionId}. Tried:\n${resolved.manifestUrls.join("\n")}`
  );
}

/**
 * Get extension details including manifest
 */
export async function getExtensionDetails(
  extension: ZedMarketplaceExtension
): Promise<ZedMarketplaceExtension & { manifest?: string; manifestUrl?: string }> {
  try {
    const { manifest, manifestUrl } = await fetchExtensionManifest(extension.id);

    // Parse basic info from manifest
    const lines = manifest.split("\n");
    let name = extension.name;
    let version = extension.version || "unknown";
    let description = extension.description || "";
    const authors: string[] = extension.authors || [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.includes("=")) {
        const [key, ...valueParts] = trimmed.split("=");
        const k = key.trim();
        let value = valueParts.join("=").trim();

        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }

        if (k === "name") name = value;
        if (k === "version") version = value;
        if (k === "description") description = value;
        if (k === "authors" && value.startsWith("[")) {
          const authorList = value
            .slice(1, -1)
            .split(",")
            .map((a: string) => a.trim().replace(/"/g, ""));
          authors.push(...authorList);
        }
      }
    }

    return {
      ...extension,
      name,
      version,
      description,
      authors,
      manifest,
      manifestUrl,
    };
  } catch (e) {
    throw new Error(`Failed to get details for ${extension.id}: ${e}`);
  }
}

/**
 * Check if extension is compatible with Wedit
 */
export function isExtensionCompatible(extension: ZedMarketplaceExtension): {
  compatible: boolean;
  reason?: string;
} {
  // Check schema version
  if (extension.schema_version && extension.schema_version > 1) {
    return {
      compatible: false,
      reason: `Requires schema version ${extension.schema_version} (Wedit supports v1)`,
    };
  }

  // Language server extensions may not work in browser
  if (
    extension.id.includes("lsp") ||
    extension.description?.toLowerCase().includes("language server")
  ) {
    return {
      compatible: false,
      reason: "Language server extensions require native LSP support",
    };
  }

  // WASM extensions need special handling
  if (extension.description?.toLowerCase().includes("wasm")) {
    return {
      compatible: false,
      reason: "WASM extensions require additional loader support",
    };
  }

  return { compatible: true };
}
