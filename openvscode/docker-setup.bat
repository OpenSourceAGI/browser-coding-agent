@echo off
REM OpenVSCode Server Docker Setup Script for Windows
REM This script builds and runs the OpenVSCode Server in Docker

setlocal enabledelayedexpansion

echo.
echo ====================================
echo OpenVSCode Server Docker Setup
echo ====================================
echo.

REM Check if Docker is installed
docker --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker is not installed or not in PATH
    echo Please install Docker Desktop from https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

echo Docker found: %errorlevel%
docker --version
echo.

REM Get the script directory
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

echo Current directory: %cd%
echo.

REM Check if docker-compose.yml exists
if not exist "docker-compose.yml" (
    echo ERROR: docker-compose.yml not found
    echo Please run this script from the openvscode-server directory
    pause
    exit /b 1
)

echo ====================================
echo Available Options:
echo ====================================
echo 1. Build and run with full Dockerfile (longer build time)
echo 2. Build and run with simple Dockerfile (faster)
echo 3. Build only
echo 4. Run existing container
echo 5. Stop and remove container
echo 6. View logs
echo 0. Exit
echo.

set /p CHOICE="Enter your choice (0-6): "

if "%CHOICE%"=="1" (
    goto BUILD_FULL
) else if "%CHOICE%"=="2" (
    goto BUILD_SIMPLE
) else if "%CHOICE%"=="3" (
    goto BUILD_ONLY
) else if "%CHOICE%"=="4" (
    goto RUN_ONLY
) else if "%CHOICE%"=="5" (
    goto STOP_REMOVE
) else if "%CHOICE%"=="6" (
    goto VIEW_LOGS
) else if "%CHOICE%"=="0" (
    exit /b 0
) else (
    echo Invalid choice. Exiting.
    exit /b 1
)

:BUILD_FULL
echo.
echo Building with full Dockerfile...
echo.
docker build -t openvscode-server:full .
if errorlevel 1 (
    echo Build failed. Trying simple Dockerfile...
    goto BUILD_SIMPLE
)
docker compose up -d
echo.
echo Container started. Access OpenVSCode at:
echo   - http://localhost (via Nginx)
echo   - http://localhost:9000 (direct)
echo.
pause
exit /b 0

:BUILD_SIMPLE
echo.
echo Building with simple Dockerfile...
echo.
docker build -f Dockerfile.simple -t openvscode-server:simple .
if errorlevel 1 (
    echo Build failed. Exiting.
    pause
    exit /b 1
)
echo.
echo Starting container...
docker compose up -d
echo.
echo Container started. Access OpenVSCode at:
echo   - http://localhost:9000
echo.
pause
exit /b 0

:BUILD_ONLY
echo.
echo Building image only...
echo.
docker build -f Dockerfile.simple -t openvscode-server:latest .
echo.
echo Build complete. Run with "docker compose up -d"
echo.
pause
exit /b 0

:RUN_ONLY
echo.
echo Starting existing container...
echo.
docker compose up -d
echo.
echo Container started. Access OpenVSCode at http://localhost:9000
echo.
pause
exit /b 0

:STOP_REMOVE
echo.
echo Stopping and removing container...
echo.
docker compose down
echo.
echo Container stopped and removed.
echo.
pause
exit /b 0

:VIEW_LOGS
echo.
echo Showing container logs (press Ctrl+C to exit)...
echo.
docker compose logs -f openvscode-server
pause
exit /b 0
