// Minimal ambient stub for 'next/server'. TypeScript uses this only when the
// real `next` package is not installed; when it is, node_modules/next types
// take precedence over ambient declarations.
declare module "next/server" {
  export class NextRequest extends Request {
    nextUrl: URL & { pathname: string };
  }
  export class NextResponse<Body = unknown> extends Response {
    constructor(body?: BodyInit | null, init?: ResponseInit);
  }
}
