# MeetCat Release Guide

This document describes the macOS (Tauri) release flow for MeetCat. The Chrome extension release remains separate.

## Goals

- Produce a notarized DMG (Universal by default).
- Publish a Git tag and GitHub release.
- Upload stable-named artifacts so the download links never change.

## Prerequisites

- macOS with Xcode Command Line Tools installed.
- `pnpm`, `gh`, `git`, and Rust toolchain available.
- Apple notarization credentials configured (either a keychain profile or Apple ID/password).

## Workflow

1. Update `CHANGELOG.md` with user-facing changes.
2. Ensure the working tree is clean.
3. Run the release script:

```bash
pnpm run release:tauri
```

The script will:

- Build shared packages and the Tauri app (default target: `universal-apple-darwin`).
- Notarize the DMG.
- Copy artifacts into `release/` with stable names.
- Create/push the version tag (e.g. `0.0.1`).
- Create/edit the GitHub release and upload artifacts.
- The GitHub UI always exposes a `latest` release endpoint, so stable links can use `/releases/latest/download/...`.

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
