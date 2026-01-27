#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[meetcat] pnpm not found. Please install pnpm >= 9." >&2
  exit 1
fi

echo "[meetcat] Building shared packages (@meetcat/settings -> @meetcat/core)..."
pnpm --filter @meetcat/settings build
pnpm --filter @meetcat/core build

echo "[meetcat] Starting Tauri dev app..."
pnpm --filter @meetcat/tauri tauri dev
