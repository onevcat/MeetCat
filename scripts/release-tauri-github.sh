#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(node -p "require('./package.json').version")"
TAG="${VERSION}"
CHANGELOG_PATH="$ROOT_DIR/CHANGELOG.md"
NOTES_PATH="$ROOT_DIR/release/notes-${VERSION}.md"
ASSET_LIST_PATH="$ROOT_DIR/release/tauri-assets.txt"
VERSION_JSON_PATH="$ROOT_DIR/release/version.json"

ALLOW_DIRTY="${ALLOW_DIRTY:-0}"
SKIP_BUILD="${SKIP_BUILD:-0}"
BUILD_TARGETS="${BUILD_TARGETS:-universal-apple-darwin}"

updater_platform_keys_for_target() {
  local target="$1"
  case "$target" in
    universal-apple-darwin)
      echo "darwin-aarch64-app darwin-aarch64 darwin-x86_64-app darwin-x86_64"
      ;;
    aarch64-apple-darwin)
      echo "darwin-aarch64-app darwin-aarch64"
      ;;
    x86_64-apple-darwin)
      echo "darwin-x86_64-app darwin-x86_64"
      ;;
    *)
      echo "$target"
      ;;
  esac
}

if ! command -v gh >/dev/null 2>&1; then
  echo "[release] gh CLI is required." >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "[release] git is required." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "[release] gh is not authenticated. Run: gh auth login" >&2
  exit 1
fi

if [[ ! -f "$CHANGELOG_PATH" ]]; then
  echo "[release] CHANGELOG.md not found." >&2
  exit 1
fi

if ! rg -q "^## \\[${VERSION}\\]" "$CHANGELOG_PATH"; then
  echo "[release] CHANGELOG.md missing section for ${VERSION}." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" && "$ALLOW_DIRTY" -ne 1 ]]; then
  echo "[release] Working tree is dirty. Commit changes or set ALLOW_DIRTY=1." >&2
  exit 1
fi

echo "[release] Syncing changelog date for version: $VERSION"
node "$ROOT_DIR/scripts/update-changelog-release-date.mjs" "$VERSION"

mkdir -p "$ROOT_DIR/release"

if [[ "$SKIP_BUILD" -ne 1 ]]; then
  bash "$ROOT_DIR/scripts/release-tauri-macos.sh"
fi

if [[ ! -f "$ASSET_LIST_PATH" ]]; then
  echo "[release] Asset list not found: $ASSET_LIST_PATH" >&2
  exit 1
fi

readarray -t ASSET_PATHS < "$ASSET_LIST_PATH"
if [[ ${#ASSET_PATHS[@]} -eq 0 ]]; then
  echo "[release] Asset list is empty: $ASSET_LIST_PATH" >&2
  exit 1
fi

echo "[release] Extracting notes for version: $VERSION"
node "$ROOT_DIR/scripts/extract-release-notes.mjs" "$VERSION" > "$NOTES_PATH"
echo "[release] Notes path: $NOTES_PATH"
echo "[release] Notes size: $(wc -c < "$NOTES_PATH" | tr -d " ") bytes"

if [[ ! -s "$NOTES_PATH" ]]; then
  echo "[release] Release notes are empty for ${VERSION}." >&2
  echo "[release] CHANGELOG headers:" >&2
  rg -n "^## \\[" "$CHANGELOG_PATH" >&2 || true
  echo "[release] First 120 lines of CHANGELOG.md:" >&2
  sed -n '1,120p' "$CHANGELOG_PATH" >&2
  exit 1
fi

IFS=" " read -r -a targets <<< "$BUILD_TARGETS"
PLATFORM_ARGS=()
for target in "${targets[@]}"; do
  case "$target" in
    universal-apple-darwin)
      updater_name="MeetCat_macos_universal.app.tar.gz"
      ;;
    *)
      updater_name="MeetCat_macos_${target}.app.tar.gz"
      ;;
  esac

  updater_path="$ROOT_DIR/release/$updater_name"
  updater_sig_path="${updater_path}.sig"
  if [[ ! -f "$updater_path" ]]; then
    echo "[release] Missing updater artifact: $updater_path" >&2
    exit 1
  fi
  if [[ ! -f "$updater_sig_path" ]]; then
    echo "[release] Missing updater signature: $updater_sig_path" >&2
    exit 1
  fi

  updater_url="https://github.com/onevcat/MeetCat/releases/download/${TAG}/${updater_name}"
  keys="$(updater_platform_keys_for_target "$target")"
  for key in $keys; do
    PLATFORM_ARGS+=(--platform "${key}|${updater_url}|${updater_sig_path}")
  done
done

echo "[release] Generating updater metadata: $VERSION_JSON_PATH"
node "$ROOT_DIR/scripts/make-latest-json.mjs" \
  --version "$VERSION" \
  --notes-file "$NOTES_PATH" \
  --out "$VERSION_JSON_PATH" \
  "${PLATFORM_ARGS[@]}"

ASSET_PATHS+=("$VERSION_JSON_PATH")

if git rev-parse "$TAG" >/dev/null 2>&1; then
  tag_commit="$(git rev-parse "$TAG")"
  head_commit="$(git rev-parse HEAD)"
  if [[ "$tag_commit" != "$head_commit" ]]; then
    echo "[release] Tag $TAG exists but is not on HEAD." >&2
    exit 1
  fi
else
  git tag -a "$TAG" -m "MeetCat $VERSION"
fi

git push origin "$TAG"

if gh release view "$TAG" >/dev/null 2>&1; then
  gh release edit "$TAG" --title "MeetCat $VERSION" --notes-file "$NOTES_PATH"
  gh release upload "$TAG" "${ASSET_PATHS[@]}" --clobber
else
  gh release create "$TAG" "${ASSET_PATHS[@]}" --title "MeetCat $VERSION" --notes-file "$NOTES_PATH"
fi

echo "[release] Done."
