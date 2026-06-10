// Minimal, dependency-free syntax highlighter for the editor overlay.
// Produces HTML-escaped <span class="tok-*"> markup. Unknown languages
// fall back to plain escaped text, so worst case is no colors — never
// broken markup.

export type HighlightLanguage =
  | "javascript"
  | "typescript"
  | "json"
  | "css"
  | "html"
  | "markdown"
  | "shell"
  | "plain";

const EXTENSION_LANGUAGES: Record<string, HighlightLanguage> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  css: "css",
  html: "html",
  htm: "html",
  md: "markdown",
  markdown: "markdown",
  sh: "shell",
  bash: "shell",
};

export function languageFromPath(path: string): HighlightLanguage {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return "plain";
  const ext = path.slice(dot + 1).toLowerCase();
  return EXTENSION_LANGUAGES[ext] ?? "plain";
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const JS_KEYWORDS = new Set([
  "async", "await", "break", "case", "catch", "class", "const", "continue",
  "debugger", "default", "delete", "do", "else", "export", "extends",
  "finally", "for", "from", "function", "if", "import", "in", "instanceof",
  "let", "new", "of", "return", "static", "super", "switch", "this",
  "throw", "try", "typeof", "var", "void", "while", "with", "yield",
  // TS extras — harmless for plain JS
  "interface", "type", "enum", "implements", "declare", "readonly",
  "namespace", "abstract", "as", "satisfies", "keyof", "is", "public",
  "private", "protected",
]);

const JS_LITERALS = new Set(["true", "false", "null", "undefined", "NaN", "Infinity"]);

interface TokenRule {
  pattern: RegExp;
  className: string | ((match: string) => string);
}

// Each rule's regex must be sticky-compatible (used with lastIndex). Order
// matters: first match at the current position wins.
const TOKEN_RULES: Record<string, TokenRule[]> = {
  javascript: [
    { pattern: /\/\/[^\n]*/y, className: "tok-comment" },
    { pattern: /\/\*[\s\S]*?(?:\*\/|$)/y, className: "tok-comment" },
    { pattern: /`(?:\\[\s\S]|[^\\`])*(?:`|$)/y, className: "tok-string" },
    { pattern: /"(?:\\.|[^\\"\n])*(?:"|$)/y, className: "tok-string" },
    { pattern: /'(?:\\.|[^\\'\n])*(?:'|$)/y, className: "tok-string" },
    { pattern: /\b\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?n?\b|\b0[xXbBoO][\da-fA-F_]+n?\b/y, className: "tok-number" },
    {
      pattern: /[A-Za-z_$][\w$]*/y,
      className: (word) =>
        JS_KEYWORDS.has(word)
          ? "tok-keyword"
          : JS_LITERALS.has(word)
            ? "tok-literal"
            : "",
    },
  ],
  json: [
    { pattern: /"(?:\\.|[^\\"\n])*"(?=\s*:)/y, className: "tok-property" },
    { pattern: /"(?:\\.|[^\\"\n])*(?:"|$)/y, className: "tok-string" },
    { pattern: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y, className: "tok-number" },
    { pattern: /\b(?:true|false|null)\b/y, className: "tok-literal" },
  ],
  css: [
    { pattern: /\/\*[\s\S]*?(?:\*\/|$)/y, className: "tok-comment" },
    { pattern: /"(?:\\.|[^\\"\n])*(?:"|$)|'(?:\\.|[^\\'\n])*(?:'|$)/y, className: "tok-string" },
    { pattern: /#[\da-fA-F]{3,8}\b/y, className: "tok-number" },
    { pattern: /\b\d+(?:\.\d+)?(?:px|em|rem|vh|vw|%|s|ms|fr|deg)?\b/y, className: "tok-number" },
    { pattern: /[.#][A-Za-z_-][\w-]*/y, className: "tok-property" },
    { pattern: /@[A-Za-z-]+/y, className: "tok-keyword" },
  ],
  html: [
    { pattern: /<!--[\s\S]*?(?:-->|$)/y, className: "tok-comment" },
    { pattern: /<\/?[A-Za-z][\w-]*|\/?>/y, className: "tok-keyword" },
    { pattern: /"[^"\n]*(?:"|$)|'[^'\n]*(?:'|$)/y, className: "tok-string" },
    { pattern: /\b[A-Za-z-]+(?==)/y, className: "tok-property" },
  ],
  markdown: [
    { pattern: /^#{1,6}[^\n]*/my, className: "tok-keyword" },
    { pattern: /`[^`\n]*(?:`|$)/y, className: "tok-string" },
    { pattern: /\*\*[^*\n]+\*\*/y, className: "tok-property" },
  ],
  shell: [
    { pattern: /#[^\n]*/y, className: "tok-comment" },
    { pattern: /"(?:\\.|[^\\"\n])*(?:"|$)|'[^'\n]*(?:'|$)/y, className: "tok-string" },
    { pattern: /\$\{?[A-Za-z_]\w*\}?/y, className: "tok-property" },
  ],
};

TOKEN_RULES.typescript = TOKEN_RULES.javascript;

/**
 * Tokenize `code` and return escaped HTML. Linear single pass: at each
 * position try the language rules in order; on a match emit a span and
 * advance, otherwise emit the raw character.
 */
export function highlightToHtml(code: string, lang: HighlightLanguage): string {
  const rules = TOKEN_RULES[lang];
  if (!rules) return escapeHtml(code);

  let html = "";
  let pos = 0;
  let plainStart = 0;

  const flushPlain = (until: number) => {
    if (until > plainStart) html += escapeHtml(code.slice(plainStart, until));
  };

  while (pos < code.length) {
    let matched = false;
    for (const rule of rules) {
      rule.pattern.lastIndex = pos;
      const match = rule.pattern.exec(code);
      if (!match || match.index !== pos || match[0].length === 0) continue;
      const className =
        typeof rule.className === "function"
          ? rule.className(match[0])
          : rule.className;
      flushPlain(pos);
      if (className) {
        html += `<span class="${className}">${escapeHtml(match[0])}</span>`;
      } else {
        html += escapeHtml(match[0]);
      }
      pos += match[0].length;
      plainStart = pos;
      matched = true;
      break;
    }
    if (!matched) pos += 1;
  }
  flushPlain(code.length);
  return html;
}
