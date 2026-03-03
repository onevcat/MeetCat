#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.updater-e2e.env"
DEFAULT_WORKTREE="$(cd "$ROOT_DIR/.." && pwd)/MeetCat-updater-e2e"
DEFAULT_SIGNING_KEY_PATH="${HOME}/.tauri/meetcat-updater.key"

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/updater-e2e.sh prepare
  bash scripts/updater-e2e.sh publish
  bash scripts/updater-e2e.sh finish

Optional env vars for prepare:
  E2E_BRANCH      default: feat/tauri-manual-updater
  E2E_WORKTREE    default: ../MeetCat-updater-e2e
  E2E_TAG         default: updater-e2e-<timestamp>
  E2E_V1          default: 0.0.90-e2e.1
  E2E_V2          default: 0.0.90-e2e.2
  E2E_TARGET      default: universal-apple-darwin
  E2E_RELEASE_REPO default: onevcat/MeetCat
USAGE
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[e2e] Required command missing: $cmd" >&2
    exit 1
  fi
}

load_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "[e2e] Missing $ENV_FILE. Run prepare first." >&2
    exit 1
  fi
  # shellcheck disable=SC1090
  source "$ENV_FILE"
}

write_env() {
  cat > "$ENV_FILE" <<ENV
E2E_BRANCH="$E2E_BRANCH"
E2E_WORKTREE="$E2E_WORKTREE"
E2E_TAG="$E2E_TAG"
E2E_V1="$E2E_V1"
E2E_V2="$E2E_V2"
E2E_TARGET="$E2E_TARGET"
E2E_RELEASE_REPO="$E2E_RELEASE_REPO"
E2E_ENDPOINT="$E2E_ENDPOINT"
ENV
}

ensure_worktree() {
  # Clean stale worktree registrations first.
  git -C "$ROOT_DIR" worktree prune --expire now >/dev/null 2>&1 || true

  if [[ -d "$E2E_WORKTREE/.git" ]]; then
    echo "[e2e] Worktree already exists: $E2E_WORKTREE"
    return
  fi

  if [[ -e "$E2E_WORKTREE" ]]; then
    echo "[e2e] Path exists but is not a git worktree: $E2E_WORKTREE" >&2
    echo "[e2e] Remove it first, then retry." >&2
    exit 1
  fi

  git -C "$ROOT_DIR" fetch origin "$E2E_BRANCH" >/dev/null 2>&1 || true
  if git -C "$ROOT_DIR" worktree add "$E2E_WORKTREE" "$E2E_BRANCH"; then
    return
  fi

  # When the branch is already checked out in another worktree (for example current repo),
  # create a detached worktree at that branch HEAD.
  local branch_ref="$E2E_BRANCH"
  if ! git -C "$ROOT_DIR" rev-parse --verify "$branch_ref" >/dev/null 2>&1; then
    branch_ref="origin/$E2E_BRANCH"
  fi
  local branch_head
  branch_head="$(git -C "$ROOT_DIR" rev-parse "$branch_ref")"
  echo "[e2e] Branch is busy in another worktree, using detached HEAD: $branch_head"
  if git -C "$ROOT_DIR" worktree add --detach "$E2E_WORKTREE" "$branch_head"; then
    return
  fi

  # If a missing-but-registered path still exists, remove the registration and retry once.
  git -C "$ROOT_DIR" worktree remove --force "$E2E_WORKTREE" >/dev/null 2>&1 || true
  git -C "$ROOT_DIR" worktree prune --expire now >/dev/null 2>&1 || true
  git -C "$ROOT_DIR" worktree add --detach "$E2E_WORKTREE" "$branch_head"
}

update_endpoint() {
  local endpoint="$1"
  node -e '
const fs = require("fs");
const path = process.argv[1];
const endpoint = process.argv[2];
const config = JSON.parse(fs.readFileSync(path, "utf8"));
config.plugins = config.plugins || {};
config.plugins.updater = config.plugins.updater || {};
config.plugins.updater.endpoints = [endpoint];
fs.writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
' "$E2E_WORKTREE/packages/tauri/src-tauri/tauri.conf.json" "$endpoint"
}

ensure_worktree_dependencies() {
  if [[ -d "$E2E_WORKTREE/node_modules" ]]; then
    return
  fi

  echo "[e2e] Installing dependencies in worktree..."
  (
    cd "$E2E_WORKTREE"
    pnpm install --frozen-lockfile
  )
}

stable_updater_name_for_target() {
  local target="$1"
  case "$target" in
    universal-apple-darwin)
      echo "MeetCat_macos_universal.app.tar.gz"
      ;;
    *)
      echo "MeetCat_macos_${target}.app.tar.gz"
      ;;
  esac
}

build_tauri_for_target() {
  (
    cd "$E2E_WORKTREE"
    pnpm run version:set "$1"
    pnpm run check:tauri-version
    pnpm run build:shared
    rm -rf "packages/tauri/src-tauri/target/$E2E_TARGET/release/bundle"
    pnpm --filter @meetcat/tauri tauri build --target "$E2E_TARGET"
  )
}

setup_signing_env() {
  local key_path
  local key_content
  local key_password

  key_path="${TAURI_SIGNING_PRIVATE_KEY_PATH:-${TAURI_PRIVATE_KEY_PATH:-$DEFAULT_SIGNING_KEY_PATH}}"
  key_content="${TAURI_SIGNING_PRIVATE_KEY:-${TAURI_PRIVATE_KEY:-}}"

  if [[ -z "$key_content" ]]; then
    if [[ ! -f "$key_path" ]]; then
      echo "[e2e] Updater signing key not found: $key_path" >&2
      echo "[e2e] Set TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH." >&2
      exit 1
    fi
    key_content="$(cat "$key_path")"
  fi

  key_password="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-${TAURI_PRIVATE_KEY_PASSWORD:-}}"
  if [[ -z "$key_password" ]]; then
    if [[ -t 0 ]]; then
      read -r -s -p "Updater signing key password (input hidden): " key_password
      echo
    else
      echo "[e2e] Missing TAURI_SIGNING_PRIVATE_KEY_PASSWORD in non-interactive mode." >&2
      exit 1
    fi
  fi

  export TAURI_SIGNING_PRIVATE_KEY="$key_content"
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$key_password"
  export TAURI_PRIVATE_KEY="$key_content"
  export TAURI_PRIVATE_KEY_PASSWORD="$key_password"
}

prepare() {
  require_cmd git
  require_cmd node
  require_cmd pnpm
  setup_signing_env

  E2E_BRANCH="${E2E_BRANCH:-feat/tauri-manual-updater}"
  E2E_WORKTREE="${E2E_WORKTREE:-$DEFAULT_WORKTREE}"
  E2E_TAG="${E2E_TAG:-updater-e2e-$(date +%Y%m%d-%H%M)}"
  E2E_V1="${E2E_V1:-0.0.90-e2e.1}"
  E2E_V2="${E2E_V2:-0.0.90-e2e.2}"
  E2E_TARGET="${E2E_TARGET:-universal-apple-darwin}"
  E2E_RELEASE_REPO="${E2E_RELEASE_REPO:-onevcat/MeetCat}"
  E2E_ENDPOINT="https://github.com/${E2E_RELEASE_REPO}/releases/download/${E2E_TAG}/version.json"

  write_env
  ensure_worktree

  echo "[e2e] Using tag: $E2E_TAG"
  echo "[e2e] Using endpoint: $E2E_ENDPOINT"

  update_endpoint "$E2E_ENDPOINT"
  ensure_worktree_dependencies

  build_tauri_for_target "$E2E_V1"

  local dmg_path
  dmg_path="$(ls -t "$E2E_WORKTREE"/packages/tauri/src-tauri/target/"$E2E_TARGET"/release/bundle/dmg/*.dmg 2>/dev/null | head -n1)"
  if [[ -z "$dmg_path" ]]; then
    echo "[e2e] Failed to find V1 DMG for target: $E2E_TARGET" >&2
    echo "[e2e] Expected path: $E2E_WORKTREE/packages/tauri/src-tauri/target/$E2E_TARGET/release/bundle/dmg" >&2
    exit 1
  fi

  echo "[e2e] V1 DMG ready: $dmg_path"
  if [[ "$(uname -s)" == "Darwin" ]] && command -v open >/dev/null 2>&1; then
    open "$dmg_path"
  fi

  cat <<NEXT
[e2e] Next step:
  bash scripts/updater-e2e.sh publish
NEXT
}

publish() {
  require_cmd git
  require_cmd node
  require_cmd pnpm
  require_cmd gh
  setup_signing_env

  load_env

  if ! gh auth status >/dev/null 2>&1; then
    echo "[e2e] gh is not authenticated. Run: gh auth login" >&2
    exit 1
  fi

  (
    cd "$E2E_WORKTREE"
    build_tauri_for_target "$E2E_V2"

    mkdir -p release

    local updater_name
    updater_name="$(stable_updater_name_for_target "$E2E_TARGET")"

    local tar_path
    tar_path="$(ls -t "packages/tauri/src-tauri/target/$E2E_TARGET/release/bundle/macos/"*.app.tar.gz 2>/dev/null | head -n1)"
    local sig_path="${tar_path}.sig"

    if [[ ! -f "$tar_path" || ! -f "$sig_path" ]]; then
      echo "[e2e] Missing updater tarball or signature for target: $E2E_TARGET" >&2
      echo "[e2e] Expected path: packages/tauri/src-tauri/target/$E2E_TARGET/release/bundle/macos" >&2
      exit 1
    fi

    cp -f "$tar_path" "release/${updater_name}"
    cp -f "$sig_path" "release/${updater_name}.sig"

    cat > release/e2e-notes.md <<NOTES
- Updater E2E validation release.
- Requires explicit user consent before installation.
NOTES

    node scripts/make-latest-json.mjs \
      --version "$E2E_V2" \
      --notes-file release/e2e-notes.md \
      --out release/version.json \
      --platform "$E2E_TARGET|https://github.com/$E2E_RELEASE_REPO/releases/download/$E2E_TAG/$updater_name|release/${updater_name}.sig"

    gh release delete "$E2E_TAG" --repo "$E2E_RELEASE_REPO" --yes --cleanup-tag >/dev/null 2>&1 || true

    gh release create "$E2E_TAG" \
      --repo "$E2E_RELEASE_REPO" \
      --prerelease \
      --target "$(git rev-parse HEAD)" \
      --title "Updater E2E $E2E_TAG" \
      --notes "Updater E2E only. Do not use in production." \
      "release/${updater_name}" \
      "release/${updater_name}.sig" \
      release/version.json
  )

  cat <<NEXT
[e2e] Pre-release published.
[e2e] Verify in V1 app now:
  1) Tray -> Check for updates...
  2) Confirm notes + install consent dialog
  3) Wait download/install/restart to V2 ($E2E_V2)

[e2e] Final cleanup:
  bash scripts/updater-e2e.sh finish
NEXT
}

finish() {
  require_cmd gh
  load_env

  if ! gh auth status >/dev/null 2>&1; then
    echo "[e2e] gh is not authenticated. Run: gh auth login" >&2
    exit 1
  fi

  gh release delete "$E2E_TAG" --repo "$E2E_RELEASE_REPO" --yes --cleanup-tag
  rm -f "$ENV_FILE"

  cat <<NEXT
[e2e] Deleted pre-release/tag: $E2E_TAG
[e2e] If needed, manually clean worktree:
  git worktree remove "$E2E_WORKTREE"
NEXT
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    prepare)
      prepare
      ;;
    publish)
      publish
      ;;
    finish)
      finish
      ;;
    -h|--help|help|"")
      usage
      ;;
    *)
      echo "[e2e] Unknown command: $cmd" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
