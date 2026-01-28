**MeetCat**

MeetCat is an auto-join assistant for Google Meet, built as:
- A Chrome extension for browser-based scheduling and auto-join.
- A Tauri desktop app that embeds Meet in a WebView with native controls.

**Requirements**
- Node.js >= 20
- pnpm >= 9
- Rust toolchain (for Tauri build and Rust tests)

**Quick Start (New Clone)**
1. Install dependencies and prepare the workspace:

```bash
pnpm run bootstrap
```

2. Run the Tauri app in dev mode:

```bash
pnpm run dev
```

You should see the desktop app open and load Google Meet.

**Scripts**
Build:
- Tauri app:

```bash
pnpm run build
```

- Chrome extension:

```bash
pnpm run build:extension
```

Development:
- Tauri app:

```bash
pnpm run dev
```

- Chrome extension:

```bash
pnpm run dev:extension
```

Testing:
- Run all tests (includes Rust):

```bash
pnpm run test
```

- Per package:

```bash
pnpm run test:core
pnpm run test:settings
pnpm run test:extension
pnpm run test:tauri
```

- Extension E2E (optional):

```bash
pnpm run test:extension:e2e
```

**Project Structure**
- `packages/settings`: Shared settings schema and defaults.
- `packages/core`: DOM parser, scheduler logic, UI overlays, and inject bundle.
- `packages/extension`: Chrome extension (content scripts, service worker, popup UI).
- `packages/tauri`: Desktop app (Tauri + React).

**Notes**
- `bootstrap` only installs dependencies and optionally fetches Rust crates.
- `dev` and `build` are Tauri-first workflows by default.
