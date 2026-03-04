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
IFS=" " read -r -a targets <<< "$BUILD_TARGETS"
AUTO_COMMITTED_RELEASE_CHANGES=0

RELEASE_ALLOWED_DIRTY_FILES=(
  "CHANGELOG.md"
  "package.json"
  "packages/core/package.json"
  "packages/settings/package.json"
  "packages/settings-ui/package.json"
  "packages/extension/package.json"
  "packages/tauri/package.json"
  "packages/extension/public/manifest.json"
  "packages/tauri/src-tauri/tauri.conf.json"
  "packages/tauri/src-tauri/Cargo.toml"
  "packages/tauri/src-tauri/Cargo.lock"
)

collect_dirty_files() {
  {
    git diff --name-only
    git diff --cached --name-only
    git ls-files --others --exclude-standard
  } | awk 'NF' | sort -u
}

is_allowed_dirty_file() {
  local file_path="$1"
  local allowed=""
  for allowed in "${RELEASE_ALLOWED_DIRTY_FILES[@]}"; do
    if [[ "$file_path" == "$allowed" ]]; then
      return 0
    fi
  done
  return 1
}

validate_dirty_files_for_release() {
  local blocked=()
  local file_path=""
  for file_path in "$@"; do
    if [[ -z "$file_path" ]]; then
      continue
    fi
    if ! is_allowed_dirty_file "$file_path"; then
      blocked+=("$file_path")
    fi
  done

  if [[ ${#blocked[@]} -gt 0 ]]; then
    echo "[release] Working tree contains non-release changes." >&2
    echo "[release] Commit or stash these files before release:" >&2
    printf '  - %s\n' "${blocked[@]}" >&2
    echo "[release] Set ALLOW_DIRTY=1 to bypass this guard (not recommended)." >&2
    exit 1
  fi
}

auto_commit_release_changes_if_needed() {
  if [[ "$ALLOW_DIRTY" -eq 1 ]]; then
    return
  fi

  local dirty_files=()
  readarray -t dirty_files < <(collect_dirty_files)
  if [[ ${#dirty_files[@]} -eq 0 ]]; then
    return
  fi

  validate_dirty_files_for_release "${dirty_files[@]}"

  echo "[release] Auto-committing release preparation changes..."
  git add -- "${dirty_files[@]}"
  if git diff --cached --quiet; then
    return
  fi

  git commit -m "chore(release): prepare ${VERSION}"
  AUTO_COMMITTED_RELEASE_CHANGES=1
}

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

validate_targets_selection() {
  local has_universal=0
  local target=""
  for target in "${targets[@]}"; do
    if [[ "$target" == "universal-apple-darwin" ]]; then
      has_universal=1
      break
    fi
  done

  if [[ $has_universal -eq 1 && ${#targets[@]} -gt 1 ]]; then
    echo "[release] BUILD_TARGETS cannot mix universal-apple-darwin with single-arch targets."
    echo "[release] Current BUILD_TARGETS: $BUILD_TARGETS"
    exit 1
  fi
}

read_plist_short_version() {
  local plist_path="$1"
  if [[ -x "/usr/libexec/PlistBuddy" ]]; then
    /usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$plist_path" 2>/dev/null
    return
  fi
  if command -v plutil >/dev/null 2>&1; then
    plutil -extract CFBundleShortVersionString raw -o - "$plist_path" 2>/dev/null
    return
  fi
  echo ""
}

verify_updater_asset_version() {
  local updater_path="$1"
  local expected_version="$2"

  local plist_entry=""
  plist_entry="$(tar -tzf "$updater_path" | rg 'MeetCat\.app/Contents/Info\.plist$' | head -n1)"
  if [[ -z "$plist_entry" ]]; then
    echo "[release] Cannot locate Info.plist in updater archive: $updater_path" >&2
    exit 1
  fi

  local tmp_plist
  tmp_plist="$(mktemp)"
  tar -xzf "$updater_path" -O "$plist_entry" > "$tmp_plist"

  local found_version=""
  found_version="$(read_plist_short_version "$tmp_plist" || true)"
  rm -f "$tmp_plist"

  if [[ -z "$found_version" ]]; then
    echo "[release] Cannot read CFBundleShortVersionString from updater archive: $updater_path" >&2
    exit 1
  fi

  if [[ "$found_version" != "$expected_version" ]]; then
    echo "[release] Updater archive version mismatch: $updater_path" >&2
    echo "[release] Expected version: $expected_version"
    echo "[release] Found version: $found_version"
    exit 1
  fi
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

if [[ "$ALLOW_DIRTY" -ne 1 ]]; then
  readarray -t initial_dirty_files < <(collect_dirty_files)
  validate_dirty_files_for_release "${initial_dirty_files[@]}"
fi

validate_targets_selection

echo "[release] Syncing changelog date for version: $VERSION"
node "$ROOT_DIR/scripts/update-changelog-release-date.mjs" "$VERSION"
auto_commit_release_changes_if_needed

if [[ "$ALLOW_DIRTY" -ne 1 ]]; then
  readarray -t remaining_dirty_files < <(collect_dirty_files)
  if [[ ${#remaining_dirty_files[@]} -gt 0 ]]; then
    echo "[release] Working tree is still dirty after auto-commit." >&2
    printf '  - %s\n' "${remaining_dirty_files[@]}" >&2
    exit 1
  fi
fi

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
  if [[ "$SKIP_BUILD" -eq 1 ]]; then
    verify_updater_asset_version "$updater_path" "$VERSION"
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

if [[ "$AUTO_COMMITTED_RELEASE_CHANGES" -eq 1 ]]; then
  current_branch="$(git branch --show-current)"
  if [[ -z "$current_branch" ]]; then
    echo "[release] Auto-commit created on detached HEAD. Push branch manually before tagging." >&2
    exit 1
  fi
  git push origin "$current_branch"
fi

git push origin "$TAG"

if gh release view "$TAG" >/dev/null 2>&1; then
  gh release edit "$TAG" --title "MeetCat $VERSION" --notes-file "$NOTES_PATH"
  gh release upload "$TAG" "${ASSET_PATHS[@]}" --clobber
else
  gh release create "$TAG" "${ASSET_PATHS[@]}" --title "MeetCat $VERSION" --notes-file "$NOTES_PATH"
fi

echo "[release] Done."
