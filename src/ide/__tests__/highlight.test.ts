// Highlighter safety/correctness and the editor's pure tab-model helpers.

import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  highlightToHtml,
  languageFromPath,
} from "../highlight";
import { isTabDirty, lineColumnAt, nextActivePath } from "../components/editor";

describe("languageFromPath", () => {
  it("maps common extensions", () => {
    expect(languageFromPath("/a/server.js")).toBe("javascript");
    expect(languageFromPath("/a/app.ts")).toBe("typescript");
    expect(languageFromPath("/package.json")).toBe("json");
    expect(languageFromPath("/style.css")).toBe("css");
    expect(languageFromPath("/index.html")).toBe("html");
    expect(languageFromPath("/README.md")).toBe("markdown");
    expect(languageFromPath("/run.sh")).toBe("shell");
    expect(languageFromPath("/Makefile")).toBe("plain");
    expect(languageFromPath("/data.xyz")).toBe("plain");
  });
});

describe("highlightToHtml", () => {
  it("always escapes HTML, including inside tokens", () => {
    const html = highlightToHtml(`const x = "<script>alert(1)</script>";`, "javascript");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes plain text for unknown languages", () => {
    expect(highlightToHtml("<b>&</b>", "plain")).toBe("&lt;b&gt;&amp;&lt;/b&gt;");
  });

  it("marks keywords, strings, numbers and comments in JS", () => {
    const html = highlightToHtml(
      `// note\nconst n = 42; let s = 'hi';`,
      "javascript",
    );
    expect(html).toContain(`<span class="tok-comment">// note</span>`);
    expect(html).toContain(`<span class="tok-keyword">const</span>`);
    expect(html).toContain(`<span class="tok-number">42</span>`);
    expect(html).toContain(`<span class="tok-string">'hi'</span>`);
  });

  it("distinguishes JSON property names from string values", () => {
    const html = highlightToHtml(`{"name": "app"}`, "json");
    expect(html).toContain(`<span class="tok-property">&quot;name&quot;</span>`);
    expect(html).toContain(`<span class="tok-string">&quot;app&quot;</span>`);
  });

  it("handles unterminated strings without hanging or breaking markup", () => {
    const html = highlightToHtml(`const s = "never closed`, "javascript");
    expect(html).toContain(`<span class="tok-string">&quot;never closed</span>`);
    // balanced spans: every opening tag is closed
    expect(html.split("<span").length).toBe(html.split("</span>").length);
  });
});

describe("escapeHtml", () => {
  it("escapes the four risky characters", () => {
    expect(escapeHtml(`<a href="x">&</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;",
    );
  });
});

describe("editor tab model", () => {
  it("nextActivePath picks the right neighbor, then left, then none", () => {
    const paths = ["/a", "/b", "/c"];
    expect(nextActivePath(paths, "/b", "/b")).toBe("/c");
    expect(nextActivePath(paths, "/c", "/c")).toBe("/b");
    expect(nextActivePath(["/only"], "/only", "/only")).toBeNull();
  });

  it("nextActivePath keeps the current tab when closing another", () => {
    expect(nextActivePath(["/a", "/b"], "/b", "/a")).toBe("/a");
  });

  it("lineColumnAt computes 1-based line and column", () => {
    const text = "first\nsecond\nthird";
    expect(lineColumnAt(text, 0)).toEqual({ line: 1, column: 1 });
    expect(lineColumnAt(text, 6)).toEqual({ line: 2, column: 1 });
    expect(lineColumnAt(text, text.length)).toEqual({ line: 3, column: 6 });
  });

  it("isTabDirty compares content to last saved content", () => {
    expect(isTabDirty({ path: "/a", content: "x", savedContent: "x" })).toBe(false);
    expect(isTabDirty({ path: "/a", content: "y", savedContent: "x" })).toBe(true);
  });
});
