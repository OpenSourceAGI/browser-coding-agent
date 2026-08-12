const ZED_API_BASE = "https://api.zed.dev";
const ZED_MAX_SCHEMA_VERSION = 1;

export interface ZedMarketplaceExtension {
  id: string;
  name: string;
  description?: string;
  version?: string;
  authors?: string[];
  repository?: string;
  download_count?: number;
  provides?: string[];
  published_at?: string;
}

export interface ExtensionCompatibility {
  compatible: boolean;
  reason?: string;
}

export interface ResolvedExtensionManifest {
  manifestUrls: string[];
}

function mapApiExtension(raw: any): ZedMarketplaceExtension {
  return {
    id: raw.id,
    name: raw.manifest?.name ?? raw.id,
    description: raw.manifest?.description,
    version: raw.manifest?.version,
    authors: raw.manifest?.authors,
    repository: raw.manifest?.repository,
    download_count: raw.download_count,
    provides: raw.manifest?.provides ?? [],
    published_at: raw.published_at,
  };
}

export async function fetchZedMarketplaceExtensions(): Promise<ZedMarketplaceExtension[]> {
  const response = await fetch(
    `${ZED_API_BASE}/extensions?max_schema_version=${ZED_MAX_SCHEMA_VERSION}`
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch extensions: ${response.status} ${response.statusText}`);
  }
  const data = await response.json() as { data: any[] };
  return data.data.map(mapApiExtension);
}

export function searchExtensions(exts: ZedMarketplaceExtension[], query: string): ZedMarketplaceExtension[] {
  const q = query.toLowerCase().trim();
  if (!q) return exts;
  return exts.filter(
    (ext) =>
      ext.name.toLowerCase().includes(q) ||
      ext.id.toLowerCase().includes(q) ||
      ext.description?.toLowerCase().includes(q) ||
      ext.authors?.some((a) => a.toLowerCase().includes(q))
  );
}

const CATEGORY_PROVIDES: Record<string, string> = {
  language: "languages",
  theme: "themes",
  tool: "language-servers",
};

export function filterExtensionsByCategory(
  exts: ZedMarketplaceExtension[],
  category: string
): ZedMarketplaceExtension[] {
  if (category === "all") return exts;
  const provides = CATEGORY_PROVIDES[category];
  if (!provides) return exts;
  return exts.filter((ext) => ext.provides?.includes(provides));
}

export async function getExtensionDetails(
  ext: ZedMarketplaceExtension
): Promise<ZedMarketplaceExtension | null> {
  try {
    const response = await fetch(`${ZED_API_BASE}/extensions/${ext.id}`);
    if (!response.ok) return ext;
    const data = await response.json() as { data: any[] };
    if (!data.data.length) return ext;
    return mapApiExtension(data.data[0]);
  } catch {
    return ext;
  }
}

// Extensions with native executables (WASM language servers, debug adapters) can't
// run in the browser environment, so we mark them as incompatible.
const INCOMPATIBLE_PROVIDES = ["language-servers", "context-servers", "debug-adapters"];

export function isExtensionCompatible(ext: ZedMarketplaceExtension): ExtensionCompatibility {
  const hasNative = ext.provides?.some((p) => INCOMPATIBLE_PROVIDES.includes(p));
  if (hasNative) {
    return {
      compatible: false,
      reason: "Requires native execution (language server or debug adapter)",
    };
  }
  return { compatible: true };
}

export async function resolveExtensionManifest(
  ext: ZedMarketplaceExtension
): Promise<ResolvedExtensionManifest> {
  const repo = ext.repository;
  if (!repo) {
    throw new Error(`No repository URL for extension ${ext.id}`);
  }

  const rawBase = repo
    .replace("https://github.com/", "https://raw.githubusercontent.com/")
    .replace(/\/$/, "");

  return {
    manifestUrls: [
      `${rawBase}/HEAD/extension.toml`,
      `${rawBase}/main/extension.toml`,
      `${rawBase}/master/extension.toml`,
    ],
  };
}

export function getExtensionDownloadUrl(ext: ZedMarketplaceExtension): string {
  if (ext.version) {
    return `${ZED_API_BASE}/extensions/${ext.id}/${ext.version}/download`;
  }
  return `${ZED_API_BASE}/extensions/${ext.id}/download`;
}
