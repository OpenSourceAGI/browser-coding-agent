/**
 * Posix path helpers shared by every layer of the bridge.
 *
 * VS Code hands us `Uri.path` (always posix, always leading slash), Nodepod's
 * VFS is posix, and R2 keys are posix-ish — so one small module keeps the three
 * from drifting. Normalisation also rejects `..` traversal, which matters on the
 * server where a path arrives straight off the wire.
 */

export const WORKSPACE_ROOT = "/workspace";

export class InvalidPathError extends Error {
  constructor(path: string) {
    super(`invalid path: ${path}`);
    this.name = "InvalidPathError";
  }
}

/**
 * Collapses `.`, rejects `..`, strips duplicate and trailing slashes, and
 * guarantees a leading slash. `normalizePath("/a//b/")` -> `"/a/b"`.
 */
export function normalizePath(input: string | undefined | null): string {
  const raw = String(input ?? "/");
  const segments: string[] = [];
  for (const segment of raw.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") throw new InvalidPathError(raw);
    segments.push(segment);
  }
  return `/${segments.join("/")}`;
}

export function dirname(path: string): string {
  const normalized = normalizePath(path);
  if (normalized === "/") return "/";
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? "/" : normalized.slice(0, index);
}

export function basename(path: string): string {
  const normalized = normalizePath(path);
  if (normalized === "/") return "";
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

export function extname(path: string): string {
  const name = basename(path);
  const index = name.lastIndexOf(".");
  return index <= 0 ? "" : name.slice(index);
}

export function joinPath(...parts: Array<string | undefined>): string {
  return normalizePath(parts.filter(Boolean).join("/"));
}

/** True when `child` is `parent` itself or lives underneath it. */
export function isUnder(parent: string, child: string): boolean {
  const p = normalizePath(parent);
  const c = normalizePath(child);
  if (p === "/") return true;
  return c === p || c.startsWith(`${p}/`);
}

/** `relativePath("/workspace", "/workspace/src/a.ts")` -> `"src/a.ts"`. */
export function relativePath(from: string, to: string): string {
  const base = normalizePath(from);
  const target = normalizePath(to);
  if (base === "/") return target.slice(1);
  if (target === base) return "";
  if (!target.startsWith(`${base}/`)) return target.slice(1);
  return target.slice(base.length + 1);
}

/* -------------------------------------------------------------------------- */
/* Glob matching                                                               */
/* -------------------------------------------------------------------------- */

const globCache = new Map<string, RegExp>();

/**
 * Compiles the glob subset VS Code's search `includes`/`excludes` actually use:
 * `**`, `*`, `?`, and `{a,b}` alternation. Anything fancier (extglob, negation)
 * is deliberately not supported — the search providers treat an unmatched
 * pattern as "no filter" rather than silently dropping results.
 */
export function globToRegExp(glob: string): RegExp {
  const cached = globCache.get(glob);
  if (cached) return cached;

  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*") {
      if (glob[i + 1] === "*") {
        // `**/` should also match zero directories, so make the slash optional.
        if (glob[i + 2] === "/") {
          out += "(?:.*/)?";
          i += 2;
        } else {
          out += ".*";
          i += 1;
        }
      } else {
        out += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      out += "[^/]";
      continue;
    }
    if (char === "{") {
      out += "(?:";
      continue;
    }
    if (char === "}") {
      out += ")";
      continue;
    }
    if (char === ",") {
      out += "|";
      continue;
    }
    out += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }

  const regex = new RegExp(`^${out}$`);
  globCache.set(glob, regex);
  return regex;
}

export function matchesAnyGlob(
  relative: string,
  globs: string[] | undefined,
): boolean {
  if (!globs || globs.length === 0) return false;
  return globs.some((glob) => {
    try {
      return globToRegExp(glob).test(relative);
    } catch {
      return false;
    }
  });
}

/**
 * Whether a *directory* is excluded, i.e. whether it is worth descending into.
 *
 * `**` + `/` + `**` patterns like `**‍/node_modules/**` describe the contents of
 * a directory, not the directory itself, so testing the bare name never matches
 * and a tree walk would happily recurse into `node_modules`. Testing the name
 * with a trailing slash makes the trailing `**` match the empty remainder.
 */
export function isExcludedDirectory(
  relative: string,
  globs: string[] | undefined,
): boolean {
  return (
    matchesAnyGlob(relative, globs) || matchesAnyGlob(`${relative}/`, globs)
  );
}

/** Directories that never carry user intent and dominate a naive walk. */
export const DEFAULT_SEARCH_EXCLUDES = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/out/**",
  "**/coverage/**",
  "**/.cache/**",
];
