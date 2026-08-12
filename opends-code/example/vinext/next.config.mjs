import { openDSHeaders } from "@opensourceagi/opends-code/next";

/**
 * Belt and braces for cross-origin isolation.
 *
 * The Worker already stamps these on every response it returns, and
 * `opendsVinext()` writes a `_headers` file for the assets the Worker never
 * sees. This covers the third case: running the same app anywhere that is
 * neither — `vinext start` on Node, a container, a preview host.
 *
 * @type {import('next').NextConfig}
 */
export default {
  async headers() {
    return openDSHeaders();
  },
};
