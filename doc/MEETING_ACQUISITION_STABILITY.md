# Meeting Acquisition Stability (v0.0.4)

This document records the reliability mechanisms introduced for meeting acquisition in the v0.0.4 cycle.
It is intended for maintainers and AI agents who modify homepage parsing, scheduling inputs, and recovery logic.

## Scope

- Product surfaces:
  - Chrome extension (`packages/extension`)
  - Tauri desktop app (`packages/tauri` + `@meetcat/core` injected script)
- Concern:
  - Keep homepage meeting data fresh and recover from stale/idle sessions.
  - Avoid accidental auto-join actions after already entering a meeting.

## Shared Reliability Building Blocks

Implemented in `@meetcat/core`:

- `createMeetingsFingerprint(meetings)` (`packages/core/src/utils/homepage-reload-watchdog.ts`)
  - Stable fingerprint from `callId`, `beginTime`, `endTime`, `eventId`, normalized `title`.
  - Excludes volatile fields like `startsInMinutes` so countdown ticks do not look like data changes.
- `HomepageReloadWatchdog`
  - Default stale threshold: `30 min`
  - **Force-stale threshold: `4 hours`** — overrides foreground deferral for prolonged staleness (e.g. overnight idle).
  - Backoff schedule: `30 -> 60 -> 120 min`
  - Daily reload cap: `8`
  - Foreground-aware: marks reload as pending while focused, triggers only after background/blur — unless force-stale threshold is exceeded.

## Extension: Stability Efforts in v0.0.4

Primary files:

- `packages/extension/src/service-worker/index.ts`
- `packages/extension/src/service-worker/homepage-recovery.ts`
- `packages/extension/src/content-scripts/homepage.ts`
- `packages/extension/src/content-scripts/meeting.ts`

### 1. Active parse pull from Service Worker

- Added periodic parse request alarm (`PARSE_REQUEST_ALARM`, every 30s).
- Service worker sends `REQUEST_MEETINGS_PARSE` to homepage content script.
- Content script parses immediately and pushes `MEETINGS_UPDATED` back.
- Parse request timeout (`15s`) increments failure counter.
- After `3` consecutive failures, service worker reloads homepage tab for self-healing.

### 2. Stale homepage watchdog in Service Worker

- `HomepageRecoveryController` wraps shared watchdog logic.
- Recovery is evaluated on:
  - new meetings update
  - periodic alarms
  - parse-request alarms
  - tab/window focus changes (flush pending deferred reload)
- Reload happens only when watchdog returns `action = "reload"`.

### 3. Auto-join safety guard on meeting page

- Meeting content script detects in-meeting state via leave button (`findLeaveButton`).
- If already in meeting:
  - blocks auto-join
  - destroys join countdown
  - reports joined state once

## Tauri App: Stability Efforts in v0.0.4

Primary files:

- `packages/core/src/inject.ts`
- `packages/tauri/src-tauri/src/lib.rs`

### 1. Homepage stale recovery in injected script

- Added same fingerprint watchdog flow as extension side.
- Evaluated after each homepage parse before reporting/scheduling updates.
- Reloads use `safeNavigateHome()` which calls the Rust `navigate_home` command instead of `location.reload()`. This ensures `setup_navigation_injection` detects a URL change and re-injects scripts. Background reloads (stale recovery, wake) pass `focus=false` to avoid stealing window focus; user-initiated reloads (Cmd+R) pass `focus=true`.
- Defers reload while homepage is foreground; flushes on `visibilitychange` and `window.blur`.
- **Force-stale override**: when data is unchanged for ≥ `4 hours` (`DEFAULT_HOMEPAGE_FORCE_STALE_THRESHOLD_MS`), the watchdog forces a reload even while the page is in the foreground. This covers the case where the Mac stays awake overnight without sleeping, the Google session expires, and a reload is necessary to detect the new session state. The force-stale threshold is always clamped to be ≥ the normal stale threshold.
- Adds recovery logs (`homepage.reload.*`) for operational diagnostics.

### 2. System wake detector

- Detects system sleep/wake via time-jump heuristic in the injected script (`inject.ts`).
- A `setInterval` ticks every `10s`; if elapsed time since last tick exceeds `60s`, the system likely just woke from sleep.
- On wake detection: stops the detector, waits `3s` for network reconnection, then calls `safeNavigateHome("wake")` which invokes the Rust `navigate_home` command (silent, no window focus). This causes a URL change that triggers `setup_navigation_injection` to re-inject scripts, avoiding the white-screen issue caused by `location.reload()` not changing the URL.
- A `reloadInFlight` flag deduplicates concurrent reload attempts from the wake detector and stale watchdog.
- Falls back to `location.reload()` if the Rust bridge call fails.
- Complements the force-stale watchdog: wake detector handles the common case (Mac sleeps overnight, wakes up) with immediate reload; force-stale handles the edge case (Mac stays awake overnight) with a delayed but guaranteed reload.
- Lifecycle: started in `initHomepage()`, cleaned up in `cleanup()`.
- Logs: `homepage.wake.detected`, `homepage.wake.reload`, `homepage.wake.start`, `homepage.wake.stop`, `reload.navigate_home`, `reload.deduplicated`.

### 3. Homepage refresh shortcut and app menu integration

- Homepage script listens for `Cmd+R` and calls `safeNavigateHome("shortcut", true)` with window focus enabled.
- macOS app menu adds `Refresh Home` with `Cmd+R`. Rust side directly calls `navigate_to_meet_home` (with show + focus) instead of synthesizing a KeyboardEvent.
- Both paths use `navigate_home` Rust command, which changes the URL and triggers script re-injection.
- Rust side enables/disables this menu item according to detected page type.

### 4. Auto-join safety guard

- Same in-meeting detection via leave button on Tauri webview page.
- Prevents repeated join attempts after already entering meeting.

## Current Known Risks

These are important when modifying or validating v0.0.4 behavior:

1. Extension homepage parse loop uses both 5s local parsing and 30s service-worker pull alarms. Reliability improved, but CPU wakeups are higher; keep this tradeoff in mind.

## Pre-release Fixes Applied (after initial 0.0.4 implementation)

1. Extension meeting script now imports `findJoinButton` correctly for manual join reporting.
2. Tauri page-type detection now reports `inject:init.page_detected` even when log collection is disabled, so macOS Refresh Home menu state can still be updated.

## Cross-Surface Invariants

When changing reliability logic, keep these invariants aligned:

- Same stale policy constants unless there is an explicit product reason.
- Same foreground deferral semantics (avoid visible forced reload while user is active), with same force-stale override threshold for prolonged staleness.
- Same joined/suppressed meeting filtering semantics for scheduling and overlay.
- Same leave-button based in-meeting detection to block duplicate auto-join attempts.

## Modification Checklist (for AI agents)

1. Update both surfaces (`packages/extension` and `packages/core`/`packages/tauri`) when behavior changes.
2. Add or update tests:
   - `packages/core/__tests__/homepage-reload-watchdog.test.ts`
   - `packages/extension/__tests__/service-worker/homepage-recovery.test.ts`
   - related inject/controller tests if join/leave detection changes
3. Re-check message contracts in `packages/extension/src/types.ts`.
4. Update `CHANGELOG.md` and this document together for user-visible reliability changes.
5. Keep `doc/MEETING_STATE_MACHINE.md` consistent if suppression/joined semantics change.
