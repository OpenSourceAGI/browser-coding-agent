FROM docker.io/cloudflare/sandbox:0.10.3

# toolchains for whatever users compile in the terminal
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3-pip git ripgrep jq \
 && rm -rf /var/lib/apt/lists/*
