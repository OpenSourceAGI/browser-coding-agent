# Docker Quick Start Guide - OpenVSCode Server

## What's Been Created

We've created a complete Docker setup for running OpenVSCode Server in a containerized environment with a web UI. Here's what was generated:

### Files Created
- **Dockerfile** - Full production build with compilation
- **Dockerfile.simple** - Simplified build for faster deployment
- **docker-compose.yml** - Multi-service orchestration (OpenVSCode + Nginx)
- **nginx.conf** - Reverse proxy configuration
- **.dockerignore** - Excludes unnecessary files from build context

### Setup Scripts (Choose One)
- **docker-setup.bat** - Windows Command Prompt
- **docker-setup.ps1** - Windows PowerShell
- **docker-setup.sh** - Linux/macOS Bash
- **Makefile.docker** - Unix Make (all platforms with Make installed)

## Prerequisites

### Windows
1. Install [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop)
2. Ensure WSL 2 backend is enabled (recommended)
3. Have at least 4GB RAM and 10GB disk space available

### macOS
1. Install [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop)
2. Allocate sufficient resources (4GB+ RAM, 10GB disk)

### Linux
1. Install Docker: `sudo apt install docker.io` (Ubuntu/Debian)
2. Install Docker Compose: `sudo apt install docker-compose`
3. Add user to docker group: `sudo usermod -aG docker $USER`

## Quick Start (Choose Your Platform)

### Windows CMD
```batch
cd openvscode-server
docker-setup.bat
```
Then select option 2 (simple build) for fastest results.

### Windows PowerShell
```powershell
cd openvscode-server
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope CurrentUser
.\docker-setup.ps1
```
Then select option 2.

### macOS/Linux
```bash
cd openvscode-server
chmod +x docker-setup.sh
./docker-setup.sh
```
Then select option 2.

### Using Make (All Platforms)
```bash
cd openvscode-server
make -f Makefile.docker build-simple
make -f Makefile.docker up
```

### Using Docker Compose Directly
```bash
cd openvscode-server

# Option 1: Build and run (recommended for first time)
docker compose up --build

# Option 2: Build only
docker compose build -f Dockerfile.simple

# Option 3: Run existing image
docker compose up -d
```

## Accessing OpenVSCode Server

Once the container is running, access it at:

- **Direct Connection**: http://localhost:9000
- **Via Nginx Proxy**: http://localhost (port 80)

The web UI should load with a clean editor interface.

## What Each Setup Script Does

### Option 1: Full Build
- Compiles the entire OpenVSCode source
- Includes all extensions and development tools
- Takes 10-30 minutes to build
- Best for production use

### Option 2: Simple Build (RECOMMENDED)
- Minimal build process
- Uses pre-existing dependencies
- Takes 2-5 minutes to build
- Best for development and testing
- **Use this if unsure**

### Option 3: Build Only
- Builds the Docker image without starting it
- Useful for CI/CD pipelines
- Start with `docker compose up -d` later

### Option 4: Run Existing Container
- Starts a previously built image
- Fast startup, no build needed
- Use after initial build

### Option 5: Stop and Remove
- Stops all containers
- Removes containers but keeps images
- Use `docker compose down -v` to remove volumes too

### Option 6: View Logs
- Shows real-time container logs
- Press Ctrl+C to exit
- Useful for debugging

## Common Commands

### View Running Containers
```bash
docker ps
```

### View All Containers
```bash
docker ps -a
```

### View Container Logs
```bash
docker logs -f openvscode-server
```

### Access Container Shell
```bash
docker exec -it openvscode-server /bin/bash
```

### Check Container Resources
```bash
docker stats openvscode-server
```

### Stop Container
```bash
docker stop openvscode-server
```

### Remove Container
```bash
docker rm openvscode-server
```

### Remove Image
```bash
docker rmi openvscode-server:simple
```

## Troubleshooting

### Port Already in Use
Edit `docker-compose.yml`:
```yaml
ports:
  - "8080:9000"  # Use 8080 instead of 9000
```

Then access at `http://localhost:8080`

### Docker Daemon Not Running (Windows)
1. Open Docker Desktop application
2. Wait for it to fully start
3. Try the setup script again

### Build Fails with Memory Error
Allocate more RAM to Docker:
1. Open Docker Desktop Settings
2. Go to Resources
3. Increase Memory slider
4. Apply and restart

### Container Exits Immediately
Check logs:
```bash
docker logs openvscode-server
```

Most common causes:
- Missing dependencies
- Port conflicts
- Insufficient resources

### Can't Connect to Container
1. Verify container is running: `docker ps`
2. Check port mapping: `docker port openvscode-server`
3. Try accessing from within container: `docker exec openvscode-server curl http://localhost:9000`

## Advanced Usage

### Custom Environment Variables
Add to `docker-compose.yml`:
```yaml
environment:
  - NODE_ENV=production
  - DEBUG=true
  - WORKSPACE_DIR=/custom/path
```

### Mount Local Workspace
Edit `docker-compose.yml`:
```yaml
volumes:
  - /home/user/my-workspace:/workspace
```

### Enable HTTPS
1. Place certificates in a `./certs/` directory
2. Uncomment HTTPS section in `nginx.conf`
3. Mount volume in `docker-compose.yml`:
```yaml
volumes:
  - ./certs:/etc/nginx/certs:ro
```

### Resource Limits
Add to `docker-compose.yml`:
```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 4G
    reservations:
      cpus: '1'
      memory: 2G
```

### Push to Registry
```bash
# Tag image
docker tag openvscode-server:simple myregistry.com/openvscode:latest

# Push to registry
docker push myregistry.com/openvscode:latest

# Use in docker-compose.yml
image: myregistry.com/openvscode:latest
```

## Performance Tips

1. **Use Simple Dockerfile** - Faster builds and smaller image size
2. **Enable BuildKit** - Faster builds:
   ```bash
   DOCKER_BUILDKIT=1 docker build .
   ```
3. **Use Named Volumes** - Better I/O performance
4. **Allocate Resources** - Give Docker sufficient CPU and RAM
5. **Clean Up** - Remove unused images and containers regularly:
   ```bash
   docker system prune -a
   ```

## Development Workflow

### Edit Code Locally
Files in the workspace volume are accessible from both your machine and the container.

### Rebuild After Changes
```bash
docker compose restart openvscode-server
# OR
docker compose down && docker compose up -d
```

### Watch for Changes
```bash
docker compose logs -f openvscode-server
```

## Cleanup

### Remove Container Only
```bash
docker compose down
```

### Remove Container and Volumes
```bash
docker compose down -v
```

### Remove All Images and Containers
```bash
docker system prune -a
```

### Clean Everything
```bash
docker compose down -v
docker rmi openvscode-server:simple openvscode-server:full 2>/dev/null || true
```

## Documentation

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [OpenVSCode Server GitHub](https://github.com/microsoft/openvscode-server)
- [Nginx Documentation](https://nginx.org/en/docs/)

## Next Steps

1. Run the setup script for your platform
2. Select option 2 (simple build) for fastest results
3. Wait for the build to complete
4. Open http://localhost:9000 in your browser
5. Start coding!

## Support

If you encounter issues:

1. Check the logs: `docker logs openvscode-server`
2. Verify Docker is running: `docker ps`
3. Ensure ports are available: `netstat -an | grep 9000` (Windows) or `lsof -i :9000` (Mac/Linux)
4. Check available disk space and RAM
5. Try the full build instead of simple build
6. Review the DOCKER_SETUP.md file for more details

## Useful Make Commands

```bash
# Build and start
make -f Makefile.docker build-simple && make -f Makefile.docker up

# View status
make -f Makefile.docker status

# Check health
make -f Makefile.docker health

# Open shell
make -f Makefile.docker shell

# Clean up
make -f Makefile.docker clean

# Rebuild everything
make -f Makefile.docker rebuild
```

---

**Enjoy your containerized OpenVSCode Server!**
