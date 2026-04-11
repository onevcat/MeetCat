#!/usr/bin/env bash
set -euo pipefail

# Publish a built extension zip to the Chrome Web Store.
# Requires environment variables: CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN
# Usage: publish-extension.sh <path-to-zip>

# Load .env from project root if present
ENV_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

EXTENSION_ID="ochakcekieihhfoefaokllabgkgbcedf"

ZIP_PATH="${1:-}"
if [ -z "$ZIP_PATH" ] || [ ! -f "$ZIP_PATH" ]; then
  echo "[MeetCat] Error: zip file not found: $ZIP_PATH" >&2
  exit 1
fi

for var in CWS_CLIENT_ID CWS_CLIENT_SECRET CWS_REFRESH_TOKEN; do
  if [ -z "${!var:-}" ]; then
    echo "[MeetCat] Error: $var is not set" >&2
    exit 1
  fi
done

echo "[MeetCat] Uploading $ZIP_PATH to Chrome Web Store..."
npx chrome-webstore-upload-cli upload \
  --source "$ZIP_PATH" \
  --extension-id "$EXTENSION_ID" \
  --client-id "$CWS_CLIENT_ID" \
  --client-secret "$CWS_CLIENT_SECRET" \
  --refresh-token "$CWS_REFRESH_TOKEN"

echo "[MeetCat] Publishing extension..."
npx chrome-webstore-upload-cli publish \
  --extension-id "$EXTENSION_ID" \
  --client-id "$CWS_CLIENT_ID" \
  --client-secret "$CWS_CLIENT_SECRET" \
  --refresh-token "$CWS_REFRESH_TOKEN"

echo "[MeetCat] Extension published to Chrome Web Store."
