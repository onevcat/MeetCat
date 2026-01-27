#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[meetcat] dev-tauri.sh is kept for compatibility."
echo "[meetcat] Running bootstrap + app..."

bash scripts/bootstrap.sh
bash scripts/app.sh
