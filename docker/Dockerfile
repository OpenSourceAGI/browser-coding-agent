# Container image for the *optional* cloud terminal and full editor.
#
# Nothing in the editor needs this image. It is pulled the first time a user
# opens a "bash (cloud sandbox)" terminal or "Open Full Editor in Cloud
# Sandbox", and stays cold for every user who only edits, browses, searches
# and saves.
#
# It carries a full openvscode-server so the same workspace can also be opened
# with a real Node.js extension host (native modules, debuggers, ripgrep, real
# marketplace extensions) when the browser-only workbench is not enough.
# `openEditor()` in `src/server/sandbox.ts` starts it on demand and exposes it
# through the Sandbox SDK's public preview URL; `procps` (installed above) is
# what lets that call check whether a server is already running via `pgrep`
# before starting a second one.

FROM docker.io/cloudflare/sandbox:0.12.5

ARG OPENVSCODE_VERSION=1.91.1
ARG TARGETARCH=x64

USER root

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git openssh-client ripgrep python3 build-essential procps \
    && rm -rf /var/lib/apt/lists/*

# openvscode-server: used for `openvscode-server --host 0.0.0.0` inside the
# container, and for its bundled CLI (`code` / `openvscode-server --version`).
RUN set -eux; \
    url="https://github.com/gitpod-io/openvscode-server/releases/download/openvscode-server-v${OPENVSCODE_VERSION}/openvscode-server-v${OPENVSCODE_VERSION}-linux-${TARGETARCH}.tar.gz"; \
    curl -fsSL "$url" -o /tmp/openvscode.tar.gz; \
    mkdir -p /opt/openvscode-server; \
    tar -xzf /tmp/openvscode.tar.gz -C /opt/openvscode-server --strip-components=1; \
    rm /tmp/openvscode.tar.gz; \
    ln -sf /opt/openvscode-server/bin/openvscode-server /usr/local/bin/openvscode-server

# `/workspace` is a symlink to the caller's own prefix inside the mounted R2
# bucket, created per-session by createCloudflareSandbox(). Creating it here
# means the shell has a valid cwd even before the mount lands.
RUN mkdir -p /workspace /mnt/r2

ENV WORKSPACE=/workspace \
    SHELL=/bin/bash \
    TERM=xterm-256color \
    NODE_ENV=development \
    PATH="/opt/openvscode-server/bin:${PATH}"

WORKDIR /workspace

# The Sandbox SDK supervises the process; this only sets the default for an
# image run directly, e.g. when testing with `docker run -it`.
CMD ["/bin/bash"]
