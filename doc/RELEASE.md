# MeetCat Release Guide

This document describes the release flow for MeetCat (macOS app + Chrome extension).

## Goals

- Produce a notarized DMG (Universal by default).
- Publish a Git tag and GitHub release for the macOS app.
- Package the Chrome extension as a zip bundle.
- Upload stable-named artifacts so the download links never change.

## Prerequisites

- macOS with Xcode Command Line Tools installed.
- `pnpm`, `gh`, `git`, and Rust toolchain available.
- Apple notarization credentials configured (either a keychain profile or Apple ID/password).

## Workflow

1. Update `CHANGELOG.md` with user-facing changes.
2. Ensure the working tree is clean.
3. Run the combined release script:

```bash
pnpm run release
```

The script will:

- Build shared packages and the Tauri app (default target: `universal-apple-darwin`).
- Notarize the DMG.
- Copy artifacts into `release/` with stable names.
- Create/push the version tag (e.g. `0.0.2`).
- Create/edit the GitHub release and upload artifacts.
- Build the Chrome extension and zip it into `release/`.
- The GitHub UI always exposes a `latest` release endpoint, so stable links can use `/releases/latest/download/...`.

## Split Releases

- App only (build + tag + GitHub release):

```bash
pnpm run release:app
```

- Extension only (zip only, no tag):

```bash
pnpm run release:extension
```

## Stable Download Links

These links are backed by the GitHub `latest` release endpoint and do not change between versions:

- `https://github.com/onevcat/MeetCat/releases/latest/download/MeetCat_macos_universal.dmg`

## Environment Variables

- `BUILD_TARGETS`: Space-separated list of targets (default: `universal-apple-darwin`).
- `SKIP_BUILD=1`: Skip the build/notarization step (useful if you already have artifacts).
- `ALLOW_DIRTY=1`: Allow running the release script with a dirty working tree.

## Build-Only

To build and notarize the DMG without publishing a GitHub release:

```bash
pnpm run release:tauri:build
```

## Tauri Version Upgrades

Tauri requires the Rust crate and the NPM API package to stay on the same major/minor.
To upgrade safely:

1. Update `packages/tauri/package.json`:
   - `@tauri-apps/api` and `@tauri-apps/cli` to the target version.
2. Update root `package.json` overrides:
   - `pnpm.overrides` for `@tauri-apps/api` and `@tauri-apps/cli`.
3. Update `packages/tauri/src-tauri/Cargo.toml`:
   - `tauri` and `tauri-build` to the same target version.
4. Install and update locks:
   - `pnpm install`
   - (optional) `cargo update -p tauri -p tauri-build`
5. Run `pnpm run check:tauri-version` (also runs before build/test).
