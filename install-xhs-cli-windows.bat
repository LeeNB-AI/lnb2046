@echo off
setlocal
cd /d "%~dp0"

echo XHS local helper
echo This script installs uv if needed, installs xiaohongshu-cli, then starts the local workbench.

where uv >nul 2>nul
if errorlevel 1 (
  echo Installing uv...
  powershell -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"
  set "PATH=%USERPROFILE%\.local\bin;%PATH%"
)

echo Installing xiaohongshu-cli...
uv tool install xiaohongshu-cli --force
if errorlevel 1 goto failed

echo Checking xhs...
xhs --help >nul
if errorlevel 1 goto failed

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20+ is required. Please install it from https://nodejs.org/
  pause
  exit /b 1
)

if not exist node_modules (
  npm install
)

echo Starting local workbench at http://127.0.0.1:4173/
npm run start:web
pause
exit /b 0

:failed
echo Failed to install or detect xhs CLI. Please check the network and try again.
pause
exit /b 1
