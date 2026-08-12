import { openDSHeaders } from "@opensourceagi/opends-code/next";

/**
 * The cross-origin isolation headers are not optional in practice.
 *
 * Nodepod uses `SharedArrayBuffer` for synchronous filesystem access from
 * worker threads and for WASI-based toolchains. Without COOP/COEP the browser
 * withholds `SharedArrayBuffer`, the runtime silently falls back to a slower
 * message-passing path, and `execSync`-style calls fail outright.
 *
 * @type {import('next').NextConfig}
 */
export default {
  async headers() {
    return openDSHeaders();
  },
};
