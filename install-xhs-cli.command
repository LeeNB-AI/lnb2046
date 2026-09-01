#!/bin/zsh
set -e

cd "$(dirname "$0")"

echo "XHS local helper"
echo "This script installs uv if needed, installs xiaohongshu-cli, tests it, starts QR login when needed, then starts the local helper for the online workbench."
echo ""
echo "Recommendation: use a Xiaohongshu account that is not your main daily account."
echo ""

if ! command -v uv >/dev/null 2>&1; then
  echo "Installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

echo "Installing xiaohongshu-cli..."
uv tool install xiaohongshu-cli --force

echo "Checking xhs..."
xhs --help >/dev/null

echo "Testing Xiaohongshu CLI login status..."
if xhs status --json; then
  echo "XHS status check finished."
else
  echo ""
  echo "XHS account is not logged in or status check failed."
  echo "Opening QR login now. Please scan with the Xiaohongshu app."
  echo "Recommendation: use a Xiaohongshu account that is not your main daily account."
  echo ""
  xhs login --qrcode
  echo "Testing login status again..."
  xhs status --json || true
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required for the browser-to-CLI helper."
  echo "Please install Node.js from https://nodejs.org/ and run this installer again."
  exit 1
fi

HELPER_URL="${XHS_WORKBENCH_HELPER_URL:-https://temporary-spry-viola-wnmndj6.vercel.app/xhs-local-helper.cjs}"
HELPER_DIR="$HOME/.xhs-workbench"
HELPER_FILE="$HELPER_DIR/xhs-local-helper.cjs"

mkdir -p "$HELPER_DIR"
echo "Downloading local helper..."
curl -L "$HELPER_URL" -o "$HELPER_FILE"
chmod +x "$HELPER_FILE"

echo ""
echo "Starting local helper at http://127.0.0.1:4789/"
echo "Keep this Terminal window open while using the online workbench."
echo ""
node "$HELPER_FILE"
