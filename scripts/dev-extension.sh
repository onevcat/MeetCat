#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[meetcat] pnpm not found. Please install pnpm >= 9." >&2
  exit 1
fi

echo "[meetcat] Building shared packages (@meetcat/settings -> @meetcat/settings-ui -> @meetcat/core)..."
pnpm --filter @meetcat/settings build
pnpm --filter @meetcat/settings-ui build
pnpm --filter @meetcat/core build

echo "[meetcat] Starting shared package watchers..."
pnpm -r --parallel \
  --filter @meetcat/settings \
  --filter @meetcat/settings-ui \
  --filter @meetcat/core \
  dev &
SHARED_PID=$!

cleanup() {
  if kill -0 "$SHARED_PID" >/dev/null 2>&1; then
    kill "$SHARED_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

echo "[meetcat] Starting extension dev build..."
pnpm --filter @meetcat/extension dev
