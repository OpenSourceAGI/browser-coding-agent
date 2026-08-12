# OpenVSCode Server - Docker Setup

This Docker setup runs the entire OpenVSCode Server in a containerized environment with a web UI.

## Prerequisites

- Docker and Docker Compose installed
- At least 4GB of available RAM
- 10GB of disk space for the build

## Quick Start

### Option 1: Using Docker Compose (Recommended)

```bash
# Build and start the services
docker-compose up --build

# Or for background execution
docker-compose up -d --build

# View logs
docker-compose logs -f openvscode-server
```

The web UI will be available at:
- **Port 80 (Nginx)**: http://localhost
- **Port 9000 (Direct)**: http://localhost:9000

### Option 2: Using Docker CLI

```bash
# Build the image
docker build -t openvscode-server .

# Run the container
docker run -d \
  --name openvscode-server \
  -p 9000:9000 \
  -p 80:80 \
  -v workspace:/workspace \
  openvscode-server
```

### Option 3: Using the Simple Dockerfile (Faster)

```bash
# Build using the simple Dockerfile
docker build -f Dockerfile.simple -t openvscode-server:simple .

# Run it
docker run -d \
  --name openvscode-server \
  -p 9000:9000 \
  openvscode-server:simple
```

## Accessing the Server

Once running, access OpenVSCode Server at:

- **Web UI**: http://localhost:9000
- **Via Nginx**: http://localhost (port 80)

## Stopping the Services

```bash
# Using Docker Compose
docker-compose down

# Remove volumes
docker-compose down -v

# Using Docker CLI
docker stop openvscode-server
docker rm openvscode-server
```

## Environment Variables

You can customize the build and runtime with environment variables:

```bash
# In docker-compose.yml or via -e flag
docker run -e NODE_ENV=production \
           -e PORT=9000 \
           -e HOST=0.0.0.0 \
           openvscode-server
```

## Volumes

The setup includes the following volumes:

- `./out`: Build output directory
- `./extensions`: VSCode extensions
- `workspace-volume`: Workspace data (persistent)

To use a local workspace directory:

```bash
docker run -v /path/to/workspace:/workspace openvscode-server
```

## Building with Custom Dockerfile

If you need to use the standard (full-featured) Dockerfile:

```bash
docker build -f Dockerfile -t openvscode-server:full .
```

For a quicker build, use the simple version:

```bash
docker build -f Dockerfile.simple -t openvscode-server:simple .
```

## Troubleshooting

### Port Already in Use

If port 9000 or 80 is already in use:

```bash
# Change the port mapping in docker-compose.yml or:
docker run -p 8080:9000 openvscode-server
```

### Build Fails

1. Try the simple Dockerfile first: `docker build -f Dockerfile.simple`
2. Check available disk space and RAM
3. Review build logs: `docker build --no-cache -t openvscode-server .`

### Connection Refused

Ensure the container is running:

```bash
docker ps
docker logs openvscode-server
```

## Performance Tips

1. Use a Docker volume for workspace to improve I/O
2. Allocate sufficient resources: `docker run --cpus="2.0" --memory="4g"`
3. Enable BuildKit for faster builds: `DOCKER_BUILDKIT=1 docker build ...`

## Advanced Usage

### Custom Port

In `docker-compose.yml`, modify:
```yaml
ports:
  - "8080:9000"  # Access at localhost:8080
```

### Enable HTTPS

1. Place certificates in `./certs/`
2. Uncomment the HTTPS section in `nginx.conf`
3. Update `docker-compose.yml` to mount the certs volume

### Persistent Extensions

```yaml
volumes:
  - ./extensions:/app/extensions
  - /app/node_modules  # Keep node_modules in container
```

## Documentation

- [OpenVSCode Repository](https://github.com/microsoft/openvscode-server)
- [VSCode Documentation](https://code.visualstudio.com/docs)
