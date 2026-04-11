#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Load .env from project root if present
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

pnpm run build:extension

RELEASE_DIR="$ROOT_DIR/release"
DIST_DIR="$ROOT_DIR/packages/extension/dist"
VERSION="$(node -p "require('./package.json').version")"
ZIP_NAME="meetcat-extension-${VERSION}.zip"

if [ ! -d "$DIST_DIR" ]; then
  echo "[MeetCat] Extension dist not found: $DIST_DIR" >&2
  exit 1
fi

mkdir -p "$RELEASE_DIR"
rm -f "$RELEASE_DIR/$ZIP_NAME"

(cd "$DIST_DIR" && zip -r "$RELEASE_DIR/$ZIP_NAME" .)

echo "[MeetCat] Extension release bundle created at $RELEASE_DIR/$ZIP_NAME"

# Publish to Chrome Web Store if credentials are available
if [ -n "${CWS_CLIENT_ID:-}" ] && [ -n "${CWS_CLIENT_SECRET:-}" ] && [ -n "${CWS_REFRESH_TOKEN:-}" ]; then
  bash "$ROOT_DIR/scripts/publish-extension.sh" "$RELEASE_DIR/$ZIP_NAME"
else
  echo "[MeetCat] CWS credentials not set, skipping Chrome Web Store publish."
  echo "[MeetCat] Set CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN to enable auto-publish."
fi
