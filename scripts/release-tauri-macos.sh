#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEAM_ID="${APPLE_TEAM_ID:-A4YJ9MRZ66}"
SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:-Developer ID Application: Wei Wang (A4YJ9MRZ66)}"
KEYCHAIN_PROFILE="${APPLE_NOTARY_KEYCHAIN_PROFILE:-meetcat-notary}"
APPLE_ID_INPUT="${APPLE_ID:-}"
APPLE_PASSWORD_INPUT="${APPLE_PASSWORD:-}"
BUILD_TARGETS="${BUILD_TARGETS:-universal-apple-darwin}"
RELEASE_DIR="${RELEASE_DIR:-$ROOT_DIR/release}"
ASSET_LIST_PATH="${ASSET_LIST_PATH:-$RELEASE_DIR/tauri-assets.txt}"

submit_with_keychain_profile() {
  local dmg_path="$1"
  local output

  set +e
  output="$(xcrun notarytool submit "$dmg_path" --keychain-profile "$KEYCHAIN_PROFILE" --wait 2>&1)"
  local status=$?
  set -e

  if [[ $status -eq 0 ]]; then
    echo "$output"
    return 0
  fi

  echo "$output" >&2

  if [[ "$output" == *"No Keychain password item found for profile"* ]] || [[ "$output" == *"profile"* && "$output" == *"not found"* ]]; then
    return 2
  fi

  return $status
}

notarize_dmg() {
  local dmg_path="$1"

  echo "[release] Notarizing: $dmg_path"
  if submit_with_keychain_profile "$dmg_path"; then
    echo "[release] Used keychain profile: $KEYCHAIN_PROFILE"
  else
    local notary_status=$?
    if [[ $notary_status -ne 2 ]]; then
      exit "$notary_status"
    fi

    echo "[release] Keychain profile not found: $KEYCHAIN_PROFILE"

    if [[ -z "$APPLE_ID_INPUT" ]]; then
      read -r -p "Apple ID email for notarization: " APPLE_ID_INPUT
    fi

    if [[ -z "$APPLE_ID_INPUT" ]]; then
      echo "[release] Apple ID cannot be empty."
      exit 1
    fi

    if [[ -z "$APPLE_PASSWORD_INPUT" ]]; then
      read -r -s -p "App-specific password (input hidden): " APPLE_PASSWORD_INPUT
      echo
    fi

    if [[ -z "$APPLE_PASSWORD_INPUT" ]]; then
      echo "[release] App-specific password cannot be empty."
      exit 1
    fi

    echo "[release] Storing credentials to keychain profile: $KEYCHAIN_PROFILE"
    xcrun notarytool store-credentials "$KEYCHAIN_PROFILE" \
      --apple-id "$APPLE_ID_INPUT" \
      --password "$APPLE_PASSWORD_INPUT" \
      --team-id "$TEAM_ID"

    xcrun notarytool submit "$dmg_path" \
      --keychain-profile "$KEYCHAIN_PROFILE" \
      --wait
  fi

  echo "[release] Stapling ticket..."
  xcrun stapler staple "$dmg_path"

  echo "[release] Validating notarization..."
  xcrun stapler validate "$dmg_path"
}

stable_name_for_target() {
  local target="$1"
  case "$target" in
    universal-apple-darwin)
      echo "MeetCat_macos_universal.dmg"
      ;;
    *)
      echo "MeetCat_macos_${target}.dmg"
      ;;
  esac
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[release] This script only supports macOS."
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[release] pnpm is required."
  exit 1
fi

if ! command -v xcrun >/dev/null 2>&1; then
  echo "[release] xcrun is required (Xcode Command Line Tools)."
  exit 1
fi

echo "[release] Building shared packages..."
(
  cd "$ROOT_DIR"
  pnpm run build:shared
)

echo "[release] Building signed Tauri app..."
(
  cd "$ROOT_DIR"
  export APPLE_SIGNING_IDENTITY="$SIGNING_IDENTITY"
  export APPLE_TEAM_ID="$TEAM_ID"
  unset APPLE_ID
  unset APPLE_PASSWORD
  IFS=" " read -r -a targets <<< "$BUILD_TARGETS"
  for target in "${targets[@]}"; do
    echo "[release] Building target: $target"
    pnpm --filter @meetcat/tauri tauri build --target "$target"
  done
)

mkdir -p "$RELEASE_DIR"
rm -f "$ASSET_LIST_PATH"

IFS=" " read -r -a targets <<< "$BUILD_TARGETS"
for target in "${targets[@]}"; do
  DMG_DIR="$ROOT_DIR/packages/tauri/src-tauri/target/$target/release/bundle/dmg"
  if [[ ! -d "$DMG_DIR" ]]; then
    echo "[release] DMG output directory not found: $DMG_DIR"
    exit 1
  fi

  shopt -s nullglob
  DMG_CANDIDATES=("$DMG_DIR"/*.dmg)
  shopt -u nullglob

  if [[ ${#DMG_CANDIDATES[@]} -eq 0 ]]; then
    echo "[release] No DMG found in: $DMG_DIR"
    exit 1
  fi

  DMG_PATH="$(ls -t "${DMG_CANDIDATES[@]}" | head -n 1)"
  notarize_dmg "$DMG_PATH"

  stable_name="$(stable_name_for_target "$target")"
  stable_path="$RELEASE_DIR/$stable_name"
  cp -f "$DMG_PATH" "$stable_path"
  echo "$stable_path" >> "$ASSET_LIST_PATH"
  echo "[release] Copied artifact: $stable_path"
done

echo "[release] Done."
echo "[release] Signed identity: $SIGNING_IDENTITY"
echo "[release] Artifacts list: $ASSET_LIST_PATH"
