import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Add COOP/COEP headers to every response so that SharedArrayBuffer
// (required by Nodepod's WASM threading) is available both in the main
// page and in same-origin iframes (e.g. the /vscode.html embedded IDE).
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Embedder-Policy", "credentialless");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
