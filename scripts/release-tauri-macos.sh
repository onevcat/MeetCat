#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEAM_ID="${APPLE_TEAM_ID:-A4YJ9MRZ66}"
SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:-Developer ID Application: Wei Wang (A4YJ9MRZ66)}"
KEYCHAIN_PROFILE="${APPLE_NOTARY_KEYCHAIN_PROFILE:-meetcat-notary}"
APPLE_ID_INPUT="${APPLE_ID:-}"
APPLE_PASSWORD_INPUT="${APPLE_PASSWORD:-}"

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

echo "[release] Building signed Tauri app..."
(
  cd "$ROOT_DIR"
  export APPLE_SIGNING_IDENTITY="$SIGNING_IDENTITY"
  export APPLE_TEAM_ID="$TEAM_ID"
  unset APPLE_ID
  unset APPLE_PASSWORD
  pnpm run build:tauri
)

DMG_DIR="$ROOT_DIR/packages/tauri/src-tauri/target/release/bundle/dmg"
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

echo "[release] Notarizing: $DMG_PATH"
if submit_with_keychain_profile "$DMG_PATH"; then
  echo "[release] Used keychain profile: $KEYCHAIN_PROFILE"
else
  notary_status=$?
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

  xcrun notarytool submit "$DMG_PATH" \
    --keychain-profile "$KEYCHAIN_PROFILE" \
    --wait
fi

echo "[release] Stapling ticket..."
xcrun stapler staple "$DMG_PATH"

echo "[release] Validating notarization..."
xcrun stapler validate "$DMG_PATH"

echo "[release] Done."
echo "[release] Signed identity: $SIGNING_IDENTITY"
echo "[release] Notarized DMG: $DMG_PATH"
