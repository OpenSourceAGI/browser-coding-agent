// Converts Zed theme format to Wedit ThemeColors
/**
 * Converts Zed theme format to Wedit ThemeColors format
 */

import type { Theme, ThemeColors } from "./themes";

interface ZedTheme {
  name: string;
  author?: string;
  appearance?: "light" | "dark";
  style?: {
    background?: string;
    foreground?: string;
    border?: string;
    cursor?: string;
    selection?: string;

    // Syntax
    comment?: string;
    keyword?: string;
    string?: string;
    number?: string;
    function?: string;
    type?: string;
    variable?: string;
    operator?: string;

    // UI elements
    panel?: {
      background?: string;
      border?: string;
    };
    editor?: {
      background?: string;
      foreground?: string;
      gutter?: string;
      line_number?: string;
      active_line_background?: string;
    };
    terminal?: {
      background?: string;
      foreground?: string;
    };
    status_bar?: {
      background?: string;
      foreground?: string;
    };
    tab_bar?: {
      background?: string;
    };

    // Additional colors
    error?: string;
    warning?: string;
    info?: string;
    hint?: string;
    link?: string;

    players?: Array<{
      cursor?: string;
      selection?: string;
    }>;
  };
}

/**
 * Convert Zed theme to Wedit ThemeColors
 */
export function convertZedTheme(zedTheme: ZedTheme): Theme {
  const style = zedTheme.style || {};
  const appearance = zedTheme.appearance || "dark";

  // Helper to darken/lighten colors
  const adjustBrightness = (color: string, amount: number): string => {
    if (!color || !color.startsWith("#")) return color;

    const hex = color.replace("#", "");
    const r = Math.max(0, Math.min(255, parseInt(hex.slice(0, 2), 16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(hex.slice(2, 4), 16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(hex.slice(4, 6), 16) + amount));

    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  };

  const bg = style.background || (appearance === "dark" ? "#1e1e1e" : "#ffffff");
  const fg = style.foreground || (appearance === "dark" ? "#d4d4d4" : "#1e1e1e");
  const editorBg = style.editor?.background || bg;
  const accent = style.link || "#007acc";

  const colors: ThemeColors = {
    // Backgrounds - create a scale from base background
    bg0: style.panel?.background || bg,
    bg1: adjustBrightness(bg, appearance === "dark" ? 5 : -5),
    bg2: editorBg,
    bg3: adjustBrightness(bg, appearance === "dark" ? 15 : -15),
    bg4: style.editor?.active_line_background || adjustBrightness(editorBg, appearance === "dark" ? 10 : -10),
    border: style.border || adjustBrightness(bg, appearance === "dark" ? 30 : -30),
    hover: adjustBrightness(bg, appearance === "dark" ? 20 : -20),
    selection: style.selection || adjustBrightness(accent, appearance === "dark" ? -30 : 30),

    // Text colors
    text1: fg,
    text2: adjustBrightness(fg, appearance === "dark" ? -20 : 20),
    text3: adjustBrightness(fg, appearance === "dark" ? -40 : 40),
    text4: adjustBrightness(fg, appearance === "dark" ? -60 : 60),
    text5: adjustBrightness(fg, appearance === "dark" ? -80 : 80),

    // Accent
    accent: accent,
    accentHover: adjustBrightness(accent, appearance === "dark" ? 20 : -20),
    focus: accent,

    // Semantic
    added: style.info || "#4ec9b0",
    modified: accent,
    deleted: style.error || "#f48771",
    warning: style.warning || "#cca700",

    // Syntax highlighting
    syntaxComment: style.comment || (appearance === "dark" ? "#6a9955" : "#008000"),
    syntaxKeyword: style.keyword || (appearance === "dark" ? "#569cd6" : "#0000ff"),
    syntaxString: style.string || (appearance === "dark" ? "#ce9178" : "#a31515"),
    syntaxNumber: style.number || (appearance === "dark" ? "#b5cea8" : "#098658"),
    syntaxType: style.type || (appearance === "dark" ? "#4ec9b0" : "#267f99"),
    syntaxFunction: style.function || (appearance === "dark" ? "#dcdcaa" : "#795e26"),
    syntaxVariable: style.variable || fg,
    syntaxOperator: style.operator || fg,
    syntaxDelimiter: adjustBrightness(fg, appearance === "dark" ? -30 : 30),
    syntaxAttribute: style.function || (appearance === "dark" ? "#9cdcfe" : "#0070c1"),
    syntaxTag: style.keyword || (appearance === "dark" ? "#569cd6" : "#0000ff"),
    syntaxMacro: style.keyword || (appearance === "dark" ? "#569cd6" : "#0000ff"),
    syntaxConstant: style.number || (appearance === "dark" ? "#4fc1ff" : "#0070c1"),
    syntaxNamespace: style.type || (appearance === "dark" ? "#4ec9b0" : "#267f99"),

    // Special
    gitBranch: accent,

    // Additional colors (for compatibility)
    purple: style.keyword || (appearance === "dark" ? "#c678dd" : "#a626a4"),
    scrollThumb: adjustBrightness(bg, appearance === "dark" ? 40 : -40),
    scrollThumbHover: adjustBrightness(bg, appearance === "dark" ? 50 : -50),
  };

  return {
    name: zedTheme.name,
    appearance: appearance,
    colors,
  };
}

/**
 * Fetch and parse a Zed theme JSON file from a URL
 */
export async function fetchZedThemeJson(url: string): Promise<ZedTheme | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const theme = await response.json();
    return theme as ZedTheme;
  } catch (e) {
    console.error(`Failed to fetch Zed theme from ${url}:`, e);
    return null;
  }
}

/**
 * Load themes from a Zed theme extension
 * Fetches all JSON files from the themes/ directory
 */
export async function loadExtensionThemes(
  repoUrl: string,
  branch: string = "main",
  basePath: string = ""
): Promise<Theme[]> {
  const themes: Theme[] = [];

  // Build themes directory URL
  const m = repoUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/);
  if (!m) return themes;

  const [, owner, repo] = m;
  const pathPrefix = basePath ? `${basePath}/` : "";
  const themesPath = `${pathPrefix}themes`;

  // Try to list themes directory via GitHub API
  try {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${themesPath}?ref=${branch}`;
    const response = await fetch(apiUrl);

    if (!response.ok) {
      // Try master branch as fallback
      if (branch === "main") {
        return loadExtensionThemes(repoUrl, "master", basePath);
      }
      return themes;
    }

    const files = await response.json();

    // Filter JSON files
    const themeFiles = files.filter((f: any) => f.name.endsWith(".json"));

    // Fetch and convert each theme
    for (const file of themeFiles) {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${themesPath}/${file.name}`;
      const zedTheme = await fetchZedThemeJson(rawUrl);

      if (zedTheme) {
        const theme = convertZedTheme(zedTheme);
        themes.push(theme);
      }
    }
  } catch (e) {
    console.error(`Failed to load themes from ${repoUrl}:`, e);
  }

  return themes;
}
