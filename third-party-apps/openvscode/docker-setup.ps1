#!/usr/bin/env pwsh

# OpenVSCode Server Docker Setup Script for Windows (PowerShell)
# This script builds and runs the OpenVSCode Server in Docker

$ErrorActionPreference = "Continue"

Write-Host "`n===================================="
Write-Host "OpenVSCode Server Docker Setup"
Write-Host "====================================" -ForegroundColor Green
Write-Host ""

# Check if Docker is installed
try {
    $dockerVersion = docker --version
    Write-Host "Docker found: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Docker is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Docker Desktop from https://www.docker.com/products/docker-desktop"
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""

# Get the script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "Current directory: $(Get-Location)"
Write-Host ""

# Check if docker-compose.yml exists
if (-not (Test-Path "docker-compose.yml")) {
    Write-Host "ERROR: docker-compose.yml not found" -ForegroundColor Red
    Write-Host "Please run this script from the openvscode-server directory"
    Read-Host "Press Enter to exit"
    exit 1
}

# Menu
Write-Host "===================================="
Write-Host "Available Options:"
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "1. Build and run with full Dockerfile (longer build time)"
Write-Host "2. Build and run with simple Dockerfile (faster)" -ForegroundColor Yellow
Write-Host "3. Build only"
Write-Host "4. Run existing container"
Write-Host "5. Stop and remove container"
Write-Host "6. View logs"
Write-Host "0. Exit"
Write-Host ""

$choice = Read-Host "Enter your choice (0-6)"

switch ($choice) {
    "1" {
        BuildFull
    }
    "2" {
        BuildSimple
    }
    "3" {
        BuildOnly
    }
    "4" {
        RunOnly
    }
    "5" {
        StopRemove
    }
    "6" {
        ViewLogs
    }
    "0" {
        exit 0
    }
    default {
        Write-Host "Invalid choice. Exiting." -ForegroundColor Red
        exit 1
    }
}

function BuildFull {
    Write-Host "`nBuilding with full Dockerfile..." -ForegroundColor Yellow
    Write-Host ""
    
    docker build -t openvscode-server:full .
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed. Trying simple Dockerfile..." -ForegroundColor Yellow
        BuildSimple
        return
    }
    
    Write-Host "`nStarting services..." -ForegroundColor Yellow
    docker compose up -d
    
    Write-Host "`nContainer started. Access OpenVSCode at:" -ForegroundColor Green
    Write-Host "  - http://localhost (via Nginx)"
    Write-Host "  - http://localhost:9000 (direct)"
    Write-Host ""
    Read-Host "Press Enter to exit"
}

function BuildSimple {
    Write-Host "`nBuilding with simple Dockerfile..." -ForegroundColor Yellow
    Write-Host ""
    
    docker build -f Dockerfile.simple -t openvscode-server:simple .
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed. Exiting." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    
    Write-Host "`nStarting container..." -ForegroundColor Yellow
    docker compose up -d
    
    Write-Host "`nContainer started. Access OpenVSCode at:" -ForegroundColor Green
    Write-Host "  - http://localhost:9000"
    Write-Host ""
    Read-Host "Press Enter to exit"
}

function BuildOnly {
    Write-Host "`nBuilding image only..." -ForegroundColor Yellow
    Write-Host ""
    
    docker build -f Dockerfile.simple -t openvscode-server:latest .
    
    Write-Host "`nBuild complete. Run with 'docker compose up -d'" -ForegroundColor Green
    Write-Host ""
    Read-Host "Press Enter to exit"
}

function RunOnly {
    Write-Host "`nStarting existing container..." -ForegroundColor Yellow
    Write-Host ""
    
    docker compose up -d
    
    Write-Host "`nContainer started. Access OpenVSCode at http://localhost:9000" -ForegroundColor Green
    Write-Host ""
    Read-Host "Press Enter to exit"
}

function StopRemove {
    Write-Host "`nStopping and removing container..." -ForegroundColor Yellow
    Write-Host ""
    
    docker compose down
    
    Write-Host "`nContainer stopped and removed." -ForegroundColor Green
    Write-Host ""
    Read-Host "Press Enter to exit"
}

function ViewLogs {
    Write-Host "`nShowing container logs (press Ctrl+C to exit)..." -ForegroundColor Yellow
    Write-Host ""
    
    docker compose logs -f openvscode-server
    
    Read-Host "Press Enter to exit"
}
