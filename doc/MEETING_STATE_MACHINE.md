# Meeting State Machine

This document defines the meeting state machine used by the homepage overlay and auto-join scheduling. It is shared by both the Chrome extension and the Tauri app.

## Terms

- `startAt`: meeting begin time.
- `endAt`: meeting end time.
- `joinBeforeMinutes`: user setting. The auto-open trigger is scheduled before the meeting starts.
- `triggerAt`: `startAt - joinBeforeMinutes`.

## Core Rules

### Hard filters

1. **Ended meetings are ignored**
   - `now >= endAt` → meeting is excluded from all selection and scheduling.

2. **Suppressed meetings are ignored after trigger time**
   - If a meeting is marked as suppressed and `now >= triggerAt`, it is excluded.

3. **Joined meetings are ignored only after meeting starts**
   - If a meeting is marked as joined and `now >= startAt`, it is excluded.
   - If `now < startAt`, it remains eligible for countdown and scheduling.

### Suppression rule (anti-reopen)

A meeting becomes **suppressed** when the user closes the meeting page **after** `triggerAt`.

- Close **before** `triggerAt` → do not suppress (treat as not joined).
- Close **after** `triggerAt` → suppress (do not auto-open again and do not show in overlay).

This rule guarantees: after the user exits a meeting during the auto-join window, we never reopen the same meeting again.

## State Machine

We track per-meeting flags and evaluate the state at runtime:

- `Scheduled`:
  - `now < triggerAt`
  - Eligible for overlay countdown.

- `PrejoinWindow`:
  - `triggerAt <= now < endAt`
  - Eligible for overlay (shows `In progress` after start) and auto-open.

- `Suppressed`:
  - `closedAt >= triggerAt`
  - Excluded from overlay and auto-open.

- `Joined`:
  - Join action confirmed (auto or manual).
  - Excluded **only when** `now >= startAt`.

- `Ended`:
  - `now >= endAt`
  - Always excluded.

## Example Timelines

### Example A

- Now: `12:00`, meeting `12:10`, `joinBefore=1` → `triggerAt=12:09`
- User opens then closes at `12:00:30` (< triggerAt)
  - Not suppressed → overlay continues countdown → auto-open at 12:09

### Example B

- Now: `12:09`, meeting `12:10`, `joinBefore=1` → in prejoin window
- User closes at `12:09:30` (>= triggerAt)
  - Suppressed → no further auto-open and no overlay display

### Example C

- Now: `12:08`, meeting `12:10`, `joinBefore=1`
- User opens at `12:08` and closes at `12:09:10` (>= triggerAt)
  - Suppressed → no further auto-open and no overlay display
- User closes at `12:08:30` (< triggerAt)
  - Not suppressed → still eligible for auto-open at 12:09

## Implementation Notes

- **Extension**
  - `MEETING_JOINED` records joined meetings (auto and manual).
  - `MEETING_CLOSED` records suppression when closed after `triggerAt`.
  - Suppressed/joined sets are pruned when meetings end.

- **Tauri**
  - WebView reports `meeting_closed` with timestamp.
  - Rust daemon stores joined + suppressed sets and applies the same filters.
  - Suppressed/joined sets are pruned when meetings end.

## Future Changes

If changing behavior, update this document and keep both surfaces (Extension + Tauri) aligned.
