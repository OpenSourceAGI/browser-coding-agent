import { createOpenDSHandlers } from "@opensourceagi/opends-code/next";
import { S3Store } from "@opensourceagi/opends-code/server";

/**
 * Every OpenDS server route, mounted at /api/opends/*.
 *
 * On Node hosts (Vercel, a container, `next start`) R2 is reached through its
 * S3-compatible API. On Cloudflare, swap `S3Store` for
 * `new R2BindingStore(env.WORKSPACES)` — the routes are identical either way.
 */
const store = new S3Store({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  bucket: process.env.R2_BUCKET!,
  accessKeyId: process.env.R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
});

export const { GET, POST, PUT, DELETE } = createOpenDSHandlers({
  /**
   * The only authentication seam. Return `null` to reject, or a stable
   * `userId` — which becomes the storage prefix, so it must identify exactly
   * one tenant.
   */
  async authorize(request) {
    const session = await getSession(request); // your login, unchanged
    if (!session) return null;
    return { userId: session.userId };
  },

  store,
  basePath: "/api/opends",
  workbenchBaseUrl: "/vscode",
  bridgeExtensionUrl: "/opends/extension",
});

declare function getSession(
  request: Request,
): Promise<{ userId: string } | null>;
