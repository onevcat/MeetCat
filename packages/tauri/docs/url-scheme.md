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
| `meetcat://meet.google.com/<code>` | Open meeting `<code>` | "Replace `https` with `meetcat`" mirror form. `<code>` must match `xxx-xxxx-xxx`. |
| `meetcat://meet.google.com/lookup/<id>` | Join via Meet lookup link | `<id>` allows `[A-Za-z0-9_-]`. |
| `meetcat://join?id=<code>` | Open meeting `<code>` (query form) | `code=<code>` is accepted as an alias for `id=`. |
| `meetcat://join/<code>` | Open meeting `<code>` (path form) | Convenient for launchers. |
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

## Join behavior

Join URLs are normalized to Google Meet URLs and loaded in the main window.
For example, `meetcat://join?id=xrs-dpxg-hsw` navigates to
`https://meet.google.com/xrs-dpxg-hsw`.

This keeps deep links reliable across cold start, warm activation, Google
account selection, and sign-in redirects.

If MeetCat's **Auto-click Join** setting is enabled, URL Scheme joins append
the same `meetcatAuto=1` marker used by scheduled joins. Once Google Meet's
preview page loads, the existing MeetCat injection applies the configured
mic/camera defaults and starts the configured join countdown. If Auto-click
Join is disabled, MeetCat opens the meeting without the marker and leaves the
user on the preview page.

URL Scheme joins do not support a per-link `skipPreview` override and do not
bypass the Google Meet preview page directly.

---

## Examples

```bash
# Open the Google Meet home page
open "meetcat://home"

# Open the settings window
open "meetcat://settings"

# Open a meeting
open "meetcat://join?id=xrs-dpxg-hsw"

# Mirror form
open "meetcat://meet.google.com/xrs-dpxg-hsw"

# Path form (nice for shell scripts)
open "meetcat://join/xrs-dpxg-hsw"

# Start a new instant meeting
open "meetcat://new"

# Manually check for updates
open "meetcat://check-update"
```

In AppleScript / shortcuts:

```applescript
do shell script "open 'meetcat://join?id=xrs-dpxg-hsw'"
```

From another app (Node):

```ts
import { shell } from "electron";
await shell.openExternal("meetcat://join?id=xrs-dpxg-hsw");
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
- **Join actions**: `meetcat://join...` and `meetcat://meet.google.com...`
  only navigate the main window to the equivalent `https://meet.google.com/...`
  URL. When Auto-click Join is enabled, the URL includes `meetcatAuto=1` so
  the existing preview-page countdown can run after Google Meet loads.
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
