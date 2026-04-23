# MeetCat URL Scheme Reference

MeetCat's desktop app registers the `meetcat://` custom URL scheme so other
apps, shortcuts, scripts, and launchers (Alfred, Raycast, etc.) can drive it.

> **Platform**: macOS only at this time. Registration happens via
> `CFBundleURLTypes` in `Info.plist` and is bound to an installed app bundle
> (LaunchServices). Dev builds (`pnpm run dev`) are usually not registered —
> install a release build once before manual testing.

---

## Actions

| URL | Action | Notes |
| --- | --- | --- |
| `meetcat://meet.google.com/<code>` | Join meeting `<code>` | "Replace `https` with `meetcat`" mirror form. `<code>` must match `xxx-xxxx-xxx`. |
| `meetcat://meet.google.com/lookup/<id>` | Join via Meet lookup link | `<id>` allows `[A-Za-z0-9_-]`. |
| `meetcat://join?id=<code>` | Join meeting `<code>` (query form) | `code=<code>` is accepted as an alias for `id=`. |
| `meetcat://join/<code>` | Join meeting `<code>` (path form) | Convenient for launchers. |
| `meetcat://home` | Navigate main window to Google Meet home | Equivalent to the *Back to Google Meet Home* menu item. |
| `meetcat://settings` | Open the Settings window | Equivalent to `⌘,`. |
| `meetcat://new` | Start a new instant meeting | Navigates to `https://meet.google.com/new`; Google creates the room. |
| `meetcat://check-update` | Trigger a manual update check | Same code path as the Settings → Check for Updates button. |

**Aliases.** The `join` host also accepts `open` and `openMeet` for
readability in handwritten links or third-party integrations:

```
meetcat://open?id=xrs-dpxg-hsw
meetcat://openMeet?id=xrs-dpxg-hsw
```

The `check-update` action also accepts `checkupdate` (no dash).

---

## Query parameters

### `skipPreview`

Only meaningful on join actions. Controls whether MeetCat stops on Google
Meet's green-room / preview page or jumps straight into the meeting.

| Value | Meaning |
| --- | --- |
| absent (default) | Navigate to the preview page so the user can confirm mic/camera. |
| `1`, `true`, `yes`, `on`, `y`, or empty (`?skipPreview`) | Skip the preview and auto-join immediately. |
| `0`, `false`, `no` | Explicitly disabled (same as absent). |

Parsing is lenient:

- Case-insensitive on both the key and the value (`SkipPreview=TRUE` works).
- `skip_preview` (snake_case) and `skippreview` (no separator) are also accepted.

Under the hood, `skipPreview=1` reuses the daemon's `navigate-and-join`
event channel with a per-call settings override (`autoClickJoin=true`,
`joinCountdownSeconds=0`). The user's persisted settings are **not**
modified.

---

## Examples

```bash
# Open the Google Meet home page
open "meetcat://home"

# Open the settings window
open "meetcat://settings"

# Join a meeting, stop on the preview page
open "meetcat://join?id=xrs-dpxg-hsw"

# Join a meeting, skip the preview page
open "meetcat://join?id=xrs-dpxg-hsw&skipPreview=1"

# Mirror form
open "meetcat://meet.google.com/xrs-dpxg-hsw"
open "meetcat://meet.google.com/xrs-dpxg-hsw?skipPreview=1"

# Path form (nice for shell scripts)
open "meetcat://join/xrs-dpxg-hsw"

# Start a new instant meeting
open "meetcat://new"

# Manually check for updates
open "meetcat://check-update"
```

In AppleScript / shortcuts:

```applescript
do shell script "open 'meetcat://join?id=xrs-dpxg-hsw&skipPreview=1'"
```

From another app (Node):

```ts
import { shell } from "electron";
await shell.openExternal("meetcat://join?id=xrs-dpxg-hsw&skipPreview=1");
```

---

## Behavior details

- **Focus**: any valid URL shows, unminimizes, and focuses the main window
  before applying its action. Invalid URLs only focus the window (so the
  user sees something happened) and log a warning under `deep_link.parse.unknown`.
- **Cold start**: if the app is launched *by* a URL, MeetCat drains the
  pending URL from the deep-link plugin as soon as the handler is registered
  during setup, so the action runs once the window is ready.
- **Warm activation**: if the app is already running, macOS routes the URL
  through the standard `on_open_url` callback.
- **Invalid meeting codes**: rejected at parse time; no navigation happens.
- **Unknown hosts** (e.g. `meetcat://foo`): logged and ignored, window is focused.

---

## Adding a new action

1. Extend `DeepLinkAction` in `packages/tauri/src-tauri/src/url_scheme.rs`.
2. Add a branch to `parse()` and cover it with unit tests.
3. Handle the new variant in `dispatch_deep_link()` in
   `packages/tauri/src-tauri/src/lib.rs`.
4. Document the action in this file.

---

## Platform notes

- **macOS** — registered via `CFBundleURLTypes` in
  `packages/tauri/src-tauri/Info.plist`. System-level binding requires the
  app bundle to have been launched at least once.
- **Windows / Linux** — not wired up yet. When added, `tauri-plugin-deep-link`
  requires pairing with `tauri-plugin-single-instance` so the URL is forwarded
  to an already-running instance instead of spawning a second one.
