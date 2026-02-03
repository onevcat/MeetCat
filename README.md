<p align="center">
  <img src="resource/logo.png" alt="MeetCat" width="360" />
</p>

<p align="center">
  <strong>Never miss a Google Meet again.</strong><br />
  Auto-detect schedules, count down, and join on time.
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/ochakcekieihhfoefaokllabgkgbcedf">Chrome Extension</a>
  ·
  <a href="https://github.com/onevcat/MeetCat/releases/latest/download/MeetCat_macos_universal.dmg">Download macOS (Universal)</a>
  ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="doc/README_CN.md">简体中文</a> · <a href="doc/README_JP.md">日本語</a> · <a href="doc/README_KO.md">한국어</a>
</p>

> [!NOTE]
> MeetCat is free, open source, and lightweight. Windows is planned.

> [!IMPORTANT]
> Privacy-first by design: no data collection, no analytics, no tracking.

---

## Why MeetCat

MeetCat keeps your Google Meet schedule calm and predictable. It reads the next meeting from the Meet homepage, shows a gentle countdown, opens the meeting page early, and joins automatically based on your settings.

## Highlights

- Auto-detects upcoming meetings on the Meet homepage.
- Countdown overlay with cancel/adjust before joining.
- Microphone/camera default states applied before entry.
- Filter meetings you never want to auto-join.
- Two surfaces: Chrome extension + macOS desktop app.

<p align="center">
  <img src="resource/icon-color.png" alt="MeetCat Icon" width="120" />
</p>

## Download

- macOS (Universal): https://github.com/onevcat/MeetCat/releases/latest/download/MeetCat_macos_universal.dmg
- Chrome Extension: https://chromewebstore.google.com/detail/ochakcekieihhfoefaokllabgkgbcedf

> [!TIP]
> Open the Google Meet homepage once to verify the overlay appears. It confirms your schedule has been detected.

## How It Works

1. Open Google Meet (browser or app) so MeetCat can detect your next meeting.
2. MeetCat starts a quiet countdown when it is time to join.
3. The meeting opens, mic/camera settings apply, and auto-join triggers.

## Platforms

**Chrome Extension**
- Lightweight in-browser experience.
- Homepage overlays and auto-open meeting page.

**macOS App (Tauri)**
- Desktop experience with tray status.
- Everything from the extension, plus always-on availability.

## For Developers (Quick Start)

```bash
pnpm install
pnpm run dev
```

That is enough to preview the app locally. For full workflows, see `doc/RELEASE.md`.

## License

TBD.
