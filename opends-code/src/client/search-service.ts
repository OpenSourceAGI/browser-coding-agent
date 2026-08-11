import {
  DEFAULT_SEARCH_EXCLUDES,
  isExcludedDirectory,
  matchesAnyGlob,
} from "../protocol/paths.js";
import type {
  FileSearchQueryDTO,
  TextSearchHitDTO,
  TextSearchQueryDTO,
} from "../protocol/messages.js";
import type { FileSystemService } from "./fs-service.js";

const DEFAULT_MAX_FILE_SIZE = 8 * 1024 * 1024;
const PREVIEW_CLIP = 512;

/**
 * Quick Open (Ctrl+P) and global search (Ctrl+Shift+F) go through VS Code's
 * `FileSearchProvider` / `TextSearchProvider` in a virtual workspace — ripgrep
 * is not available, so the work happens here against the in-memory VFS.
 */
export class SearchService {
  private readonly _fs: FileSystemService;
  private _cachedFiles: string[] | null = null;
  private _cacheStamp = 0;

  constructor(fs: FileSystemService) {
    this._fs = fs;
  }

  /** Called on any mutation so the next search re-walks the tree. */
  invalidate(): void {
    this._cachedFiles = null;
  }

  async searchFiles(query: FileSearchQueryDTO): Promise<string[]> {
    const files = await this._listFiles(query.includes, query.excludes);
    const pattern = query.pattern?.trim() ?? "";
    const limit = query.maxResults ?? 512;

    if (!pattern) return files.slice(0, limit);

    const scored: Array<{ path: string; score: number }> = [];
    const needle = pattern.toLowerCase();

    for (const path of files) {
      const score = fuzzyScore(path.toLowerCase(), needle);
      if (score >= 0) scored.push({ path, score });
    }

    scored.sort((a, b) => b.score - a.score || a.path.length - b.path.length);
    return scored.slice(0, limit).map((entry) => entry.path);
  }

  async searchText(query: TextSearchQueryDTO): Promise<TextSearchHitDTO[]> {
    const regex = buildSearchRegExp(query);
    if (!regex) return [];

    const files = await this._listFiles(query.includes, query.excludes);
    const maxResults = query.maxResults ?? 2000;
    const maxFileSize = query.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
    const hits: TextSearchHitDTO[] = [];

    for (const path of files) {
      if (hits.length >= maxResults) break;

      let text: string;
      try {
        const bytes = await this._fs.readFile(path);
        if (bytes.byteLength > maxFileSize) continue;
        if (looksBinary(bytes)) continue;
        text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      } catch {
        continue;
      }

      const lines = text.split("\n");
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        if (hits.length >= maxResults) break;
        const line = lines[lineIndex]!;
        const ranges = matchRanges(regex, line);
        if (ranges.length === 0) continue;
        hits.push({
          path,
          line: lineIndex,
          preview: line.length > PREVIEW_CLIP ? line.slice(0, PREVIEW_CLIP) : line,
          ranges: ranges.filter(([start]) => start < PREVIEW_CLIP),
        });
      }
    }

    return hits;
  }

  private async _listFiles(
    includes?: string[],
    excludes?: string[],
  ): Promise<string[]> {
    const all = await this._allFiles();
    const effectiveExcludes = [...DEFAULT_SEARCH_EXCLUDES, ...(excludes ?? [])];

    return all.filter((path) => {
      const relative = path.slice(1);
      if (matchesAnyGlob(relative, effectiveExcludes)) return false;
      if (matchesAnyGlob(path, effectiveExcludes)) return false;
      if (includes && includes.length > 0) {
        return matchesAnyGlob(relative, includes) || matchesAnyGlob(path, includes);
      }
      return true;
    });
  }

  private async _allFiles(): Promise<string[]> {
    // A 2s TTL keeps repeated keystrokes in Quick Open from re-walking the tree
    // while still picking up files created by a build running in the terminal.
    const fresh = this._cachedFiles && Date.now() - this._cacheStamp < 2000;
    if (fresh) return this._cachedFiles!;

    const files = await this._fs.listRecursive("/", {
      skip: (relative) => isExcludedDirectory(relative, DEFAULT_SEARCH_EXCLUDES),
    });
    this._cachedFiles = files;
    this._cacheStamp = Date.now();
    return files;
  }
}

/* -------------------------------------------------------------------------- */

export function buildSearchRegExp(query: TextSearchQueryDTO): RegExp | null {
  const source = query.isRegExp
    ? query.pattern
    : query.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!source) return null;

  const wrapped = query.isWordMatch ? `\\b(?:${source})\\b` : source;
  const flags = query.isCaseSensitive ? "gd" : "gid";

  try {
    return new RegExp(wrapped, flags);
  } catch {
    try {
      // `d` (indices) is not universally available; the fallback still works
      // because `matchRanges` derives offsets from `lastIndex`.
      return new RegExp(wrapped, query.isCaseSensitive ? "g" : "gi");
    } catch {
      return null;
    }
  }
}

function matchRanges(regex: RegExp, line: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  let guard = 0;

  while ((match = regex.exec(line)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    ranges.push([start, end]);

    // A zero-length match (e.g. `a*`) would spin forever without this nudge.
    if (match[0].length === 0) regex.lastIndex++;
    if (++guard > 1000) break;
  }
  return ranges;
}

/**
 * Subsequence match with bonuses for consecutive characters and matches right
 * after a path separator — the behaviour people expect from Quick Open, without
 * pulling in a fuzzy-search dependency.
 */
export function fuzzyScore(haystack: string, needle: string): number {
  if (!needle) return 0;

  let score = 0;
  let hayIndex = 0;
  let consecutive = 0;

  for (let i = 0; i < needle.length; i++) {
    const char = needle[i]!;
    const found = haystack.indexOf(char, hayIndex);
    if (found === -1) return -1;

    if (found === hayIndex && i > 0) {
      consecutive++;
      score += 5 + consecutive * 2;
    } else {
      consecutive = 0;
      score += 1;
    }
    if (found === 0 || haystack[found - 1] === "/") score += 8;
    hayIndex = found + 1;
  }

  // Prefer matches concentrated in the file name over ones spread across dirs.
  const lastSlash = haystack.lastIndexOf("/");
  if (lastSlash !== -1 && haystack.slice(lastSlash + 1).includes(needle)) {
    score += 20;
  }
  return score;
}

function looksBinary(bytes: Uint8Array): boolean {
  const sample = Math.min(bytes.byteLength, 1024);
  for (let i = 0; i < sample; i++) {
    if (bytes[i] === 0) return true;
  }
  return false;
}
