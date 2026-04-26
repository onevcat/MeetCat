# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-04-26

First beta milestone. Brings a new meetcat:// URL Scheme for automation and tightens mic / camera defaults during cold-start joins.

### Added

- Added the `meetcat://` URL Scheme on macOS for driving MeetCat from other apps, scripts, and launchers like Alfred, Raycast, AppleScript, or Shortcuts. Supports joining meetings, opening the Meet home page, opening Settings, starting a new instant meeting, and triggering a manual update check.
- Added a Help menu in the macOS app menu bar with a "URL Scheme Guide" entry that opens the localized reference page.

### Fixed

- Fixed mic and camera default states occasionally not taking effect on cold-start joins. MeetCat now verifies the resulting state after each click and retries if needed.

### Changed

- Updated bundled dependencies to clear several known vulnerability advisories.

## [0.0.9] - 2026-04-11

Stability fix for homepage reload getting permanently stuck.

### Fixed

- Fixed homepage reload getting permanently locked when the reload flag was never cleared, requiring a restart to recover.

## [0.0.8] - 2026-03-18

Improved overnight reliability and reduced disruptive background refreshes.

### Fixed

- Fixed white screen after overnight sleep that required a restart to recover.
- Fixed background page refresh stealing window focus from other apps.
- Fixed unnecessary page refreshes every 30 minutes for users with few or no meetings.

## [0.0.7] - 2026-03-11

- Fixed update install button not reflecting correct state after triggering an update from the tray menu.

## [0.0.6] - 2026-03-11

Multi-language support across major MeetCat surfaces, a quicker Settings shortcut on macOS, and a fix for tray-triggered update checks.

### Added

- Added UI localization in English, Chinese, Japanese, and Korean across the tray menu, macOS app menu, settings screens, homepage overlay, join countdown, and Chrome extension popup.
- Added a language selector in Settings, with Auto detection plus English, Chinese, Japanese, and Korean options.
- Added a Settings menu item with the standard Cmd+, shortcut in the macOS app menu.

### Fixed

- Fixed update dialog not showing on first "Check for Updates" click from the tray menu.

## [0.0.5] - 2026-03-04

Auto updating support is now integrated for the macOS desktop app, with user-visible prompts across tray, settings, and overlay before installation.

### Added

- Added auto updating support for the macOS app, including startup/daily checks, tray/settings/overlay prompts, release notes, and explicit user-confirmed installation.

### Changed

- Changed stale-homepage recovery to detect wake-from-sleep and trigger controlled homepage refresh after wake.
- Changed stale-homepage policy to force refresh after long unchanged sessions (foreground included) for better overnight/session-long reliability.

### Fixed

- Fixed homepage freshness handling to reduce stale meeting lists during long-running sessions and after system wake.

## [0.0.4] - 2026-02-09

A reliability-focused release for homepage freshness and long-running stability across both the Chrome extension and the macOS app.

### Added

- macOS app menu now includes a Refresh Home command with Cmd+R, and the Meet homepage listens for the shortcut.

### Changed

- Homepage stale recovery now uses a fingerprint-based watchdog with foreground-aware behavior: while the homepage is focused, reloads are deferred until the tab or window loses focus.
- Repeated stale states now use exponential backoff (30 → 60 → 120 minutes) with a daily reload cap, improving stability without causing refresh loops.

### Fixed

- Auto-join now stops once the meeting is entered, preventing countdowns from persisting or triggering an unintended leave click.
- Homepage meeting list refreshes are more reliable, with background-triggered updates and automatic recovery after repeated parse failures.
- Long-idle and cross-day homepage sessions now recover automatically when meeting data remains unchanged for too long, reducing cases where stale meeting lists persist.

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
