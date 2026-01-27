#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[meetcat] pnpm not found. Please install pnpm >= 9." >&2
  exit 1
fi

echo "[meetcat] Installing workspace dependencies..."
pnpm install

if command -v cargo >/dev/null 2>&1; then
  echo "[meetcat] Fetching Rust dependencies for Tauri..."
  cargo fetch --manifest-path packages/tauri/src-tauri/Cargo.toml
else
  echo "[meetcat] cargo not found. Skipping Rust dependency fetch." >&2
fi

echo "[meetcat] Bootstrap complete. Run: pnpm run app"
