#!/bin/bash

# OpenVSCode Server Docker Setup Script for Linux/macOS
# This script builds and runs the OpenVSCode Server in Docker

set -e

echo ""
echo "===================================="
echo "OpenVSCode Server Docker Setup"
echo "===================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed or not in PATH"
    echo "Please install Docker from https://docs.docker.com/get-docker/"
    exit 1
fi

echo "Docker found:"
docker --version
echo ""

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "Current directory: $(pwd)"
echo ""

# Check if docker-compose.yml exists
if [ ! -f "docker-compose.yml" ]; then
    echo "ERROR: docker-compose.yml not found"
    echo "Please run this script from the openvscode-server directory"
    exit 1
fi

# Menu
show_menu() {
    echo "===================================="
    echo "Available Options:"
    echo "===================================="
    echo "1. Build and run with full Dockerfile (longer build time)"
    echo "2. Build and run with simple Dockerfile (faster)"
    echo "3. Build only"
    echo "4. Run existing container"
    echo "5. Stop and remove container"
    echo "6. View logs"
    echo "0. Exit"
    echo ""
}

build_full() {
    echo ""
    echo "Building with full Dockerfile..."
    echo ""
    
    if ! docker build -t openvscode-server:full .; then
        echo "Build failed. Trying simple Dockerfile..."
        build_simple
        return
    fi
    
    echo ""
    echo "Starting services..."
    docker compose up -d
    
    echo ""
    echo "Container started. Access OpenVSCode at:"
    echo "  - http://localhost (via Nginx)"
    echo "  - http://localhost:9000 (direct)"
    echo ""
}

build_simple() {
    echo ""
    echo "Building with simple Dockerfile..."
    echo ""
    
    if ! docker build -f Dockerfile.simple -t openvscode-server:simple .; then
        echo "Build failed. Exiting."
        exit 1
    fi
    
    echo ""
    echo "Starting container..."
    docker compose up -d
    
    echo ""
    echo "Container started. Access OpenVSCode at:"
    echo "  - http://localhost:9000"
    echo ""
}

build_only() {
    echo ""
    echo "Building image only..."
    echo ""
    
    docker build -f Dockerfile.simple -t openvscode-server:latest .
    
    echo ""
    echo "Build complete. Run with 'docker compose up -d'"
    echo ""
}

run_only() {
    echo ""
    echo "Starting existing container..."
    echo ""
    
    docker compose up -d
    
    echo ""
    echo "Container started. Access OpenVSCode at http://localhost:9000"
    echo ""
}

stop_remove() {
    echo ""
    echo "Stopping and removing container..."
    echo ""
    
    docker compose down
    
    echo ""
    echo "Container stopped and removed."
    echo ""
}

view_logs() {
    echo ""
    echo "Showing container logs (press Ctrl+C to exit)..."
    echo ""
    
    docker compose logs -f openvscode-server
}

# Main loop
while true; do
    show_menu
    read -p "Enter your choice (0-6): " choice
    
    case $choice in
        1) build_full ;;
        2) build_simple ;;
        3) build_only ;;
        4) run_only ;;
        5) stop_remove ;;
        6) view_logs ;;
        0) exit 0 ;;
        *) echo "Invalid choice. Please try again." ;;
    esac
done
