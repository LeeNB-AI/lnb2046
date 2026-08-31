#!/bin/zsh
set -e

cd "$(dirname "$0")"

echo "XHS local helper"
echo "This script installs uv if needed, installs xiaohongshu-cli, then starts the local workbench."

if ! command -v uv >/dev/null 2>&1; then
  echo "Installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

echo "Installing xiaohongshu-cli..."
uv tool install xiaohongshu-cli --force

echo "Checking xhs..."
xhs --help >/dev/null

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Please install Node.js 20+ from https://nodejs.org/"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  npm install
fi

echo "Starting local workbench at http://127.0.0.1:4173/"
npm run start:web
