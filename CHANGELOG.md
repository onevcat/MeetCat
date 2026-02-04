# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.2] - 2026-02-04

First public release of MeetCat for Chrome and macOS.

### Added
- Chrome extension with homepage overlays, auto-join scheduling, and a settings popup.
- macOS Tauri desktop app with tray controls, auto-join support, and a full settings window.
- Join countdown overlay plus a separate homepage overlay with hide controls.
- Meeting suppression handling and smarter joinable meeting selection.
- Optional developer log collection controls.

### Changed
- Overlay icon now uses the MeetCat icon instead of the personal avatar.

### Fixed
- WebView script re-injection on page load to prevent missing overlays.
- Meeting links now open correctly in the intended browser or webview.
- Overlay z-index and settings window scrolling glitches.
