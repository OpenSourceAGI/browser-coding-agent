/**
 * palette-history
 * Lightweight localStorage-backed usage history for the command palette.
 */
const STORAGE_KEY = "weditor-palette-history";
const MAX_ENTRIES = 200;

interface HistoryEntry {
  count: number;
  lastUsed: number;
}

type HistoryMap = Record<string, HistoryEntry>;

let _cache: HistoryMap | null = null;

function load(): HistoryMap {
  if (_cache) return _cache;
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    _cache = raw ? JSON.parse(raw) : {};
    return _cache!;
  } catch {
    _cache = {};
    return _cache;
  }
}

function save(map: HistoryMap) {
  _cache = map;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

export function recordUsage(id: string) {
  const map = { ...load() };
  const existing = map[id];
  map[id] = {
    count: (existing?.count ?? 0) + 1,
    lastUsed: Date.now(),
  };

  // prune if over limit
  const keys = Object.keys(map);
  if (keys.length > MAX_ENTRIES) {
    const sorted = keys.sort((a, b) => (map[a].lastUsed - map[b].lastUsed));
    for (let i = 0; i < keys.length - MAX_ENTRIES; i++) {
      delete map[sorted[i]];
    }
  }

  save(map);
}

export function getRecencyBoost(id: string): number {
  const entry = load()[id];
  if (!entry) return 0;

  const freqScore = Math.min(Math.log2(entry.count + 1) * 3, 10);

  const ageMs = Date.now() - entry.lastUsed;
  const ageHours = ageMs / (1000 * 60 * 60);
  const recencyScore = Math.max(10 - ageHours * 0.5, 0);

  return freqScore + recencyScore;
}

export function getRecentIds(limit = 10): string[] {
  const map = load();
  return Object.entries(map)
    .sort(([, a], [, b]) => b.lastUsed - a.lastUsed)
    .slice(0, limit)
    .map(([id]) => id);
}
