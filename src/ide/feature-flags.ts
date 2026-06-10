// Feature flags for gradual rollout of IDE features (plan steps 0.2 and
// 6.3). Defaults are overridden by a `?ff=` query parameter and/or a
// storage entry, so individual features can be toggled per-session
// without a redeploy: `?ff=ide.preview:off,ide.persistence:on`.

export type FlagMap = Record<string, boolean>;

export const DEFAULT_IDE_FLAGS: FlagMap = {
  "ide.terminal": true,
  "ide.preview": true,
  "ide.install": true,
  "ide.persistence": true,
};

export const FLAGS_QUERY_PARAM = "ff";
export const FLAGS_STORAGE_KEY = "nodepod-ide.flags";

/** Parse `?ff=a:on,b:off` (also accepts true/false/1/0) into a FlagMap. */
export function parseFlagOverrides(search: string): FlagMap {
  const flags: FlagMap = {};
  let raw: string | null = null;
  try {
    raw = new URLSearchParams(
      search.startsWith("?") ? search : `?${search}`,
    ).get(FLAGS_QUERY_PARAM);
  } catch {
    return flags;
  }
  if (!raw) return flags;
  for (const pair of raw.split(",")) {
    const [name, value] = pair.split(":").map((part) => part.trim());
    if (!name) continue;
    flags[name] = !["off", "false", "0"].includes((value ?? "on").toLowerCase());
  }
  return flags;
}

/** Read persisted overrides (JSON FlagMap) from a storage entry. */
export function flagsFromStorage(
  storage: { getItem(key: string): string | null } | null | undefined,
  key: string = FLAGS_STORAGE_KEY,
): FlagMap {
  if (!storage) return {};
  try {
    const raw = storage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const flags: FlagMap = {};
    for (const [name, value] of Object.entries(parsed)) {
      if (typeof value === "boolean") flags[name] = value;
    }
    return flags;
  } catch {
    return {};
  }
}

/** Merge flag sources left-to-right (later sources win). */
export function resolveFlags(
  defaults: FlagMap = DEFAULT_IDE_FLAGS,
  ...overrides: FlagMap[]
): FlagMap {
  return Object.assign({}, defaults, ...overrides);
}

export function isFlagEnabled(flags: FlagMap, name: string): boolean {
  return flags[name] !== false;
}
