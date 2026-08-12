# Container image for the optional "Cloudflare Sandbox" terminal profile.
#
# The tag must match the @cloudflare/sandbox version in package.json — the SDK
# in the Worker and the server inside the container speak a versioned
# protocol, and a mismatch shows up as a terminal that connects and then
# immediately closes.
FROM docker.io/cloudflare/sandbox:0.12.5

# The workspace the IDE mirrors into. Created up front so the first push does
# not race the first `mkdir`.
RUN mkdir -p /workspace
WORKDIR /workspace

# The sandbox server's control port.
EXPOSE 3000
