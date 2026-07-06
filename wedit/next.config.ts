import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",

  // Empty turbopack config to silence Next.js 16 warning
  turbopack: {},

  // Required for SharedArrayBuffer support (nodepod worker threading)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
