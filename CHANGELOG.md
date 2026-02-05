# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.4] - 2026-02-05

### Added
- macOS app menu now includes a Refresh Home command with Cmd+R, and the Meet homepage listens for the shortcut.

### Fixed
- Auto-join now stops once the meeting is entered, preventing countdowns from persisting or triggering an unintended leave click.

## [0.0.3] - 2026-02-05

Improves homepage meeting parsing reliability and meeting close detection.

### Changed
- Homepage meeting parsing now derives display time from the meeting start time and uses aria-label text when titles are missing, making it more resilient to Meet UI changes.
- Hidden or aria-hidden meeting cards are ignored so overlays only reflect visible meetings.

### Fixed
- Meeting close is reported on page hide so suppression state updates reliably when leaving a meeting.

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
