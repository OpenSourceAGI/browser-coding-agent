// Route handler that serves the Nodepod IDE HTML with COOP/COEP headers.
// The /vscode page embeds this as a same-origin iframe.

import { readFileSync } from "fs";
import { resolve } from "path";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(_req: NextRequest) {
  const html = readFileSync(
    resolve(process.cwd(), "public", "vscode.html"),
    "utf-8",
  );
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
      "Cache-Control": "no-store",
    },
  });
}
