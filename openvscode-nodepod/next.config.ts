import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},

  // The Worker sets these on every response too. Having them here as well
  // keeps `next dev` and any non-Worker host cross-origin isolated, which
  // SharedArrayBuffer (and therefore Nodepod's sync VFS) requires.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
    ];
  },
};

export default nextConfig;
