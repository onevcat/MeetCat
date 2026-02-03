#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

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
