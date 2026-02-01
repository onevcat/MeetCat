**MeetCat**

MeetCat is an auto-join assistant for Google Meet, built as:
- A Chrome extension for browser-based scheduling and auto-join.
- A Tauri desktop app that embeds Meet in a WebView with native controls.

**Requirements**
- Node.js >= 20
- pnpm >= 9
- Rust toolchain (for Tauri build and Rust tests)

**Quick Start (New Clone)**
1. Install dependencies:

```bash
pnpm install
```

2. Run the Tauri app in dev mode (shared packages will be built and watched):

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

- Run tests with coverage (includes Rust):

```bash
pnpm run test:cov
```

**Project Structure**
- `packages/settings`: Shared settings schema and defaults.
- `packages/core`: DOM parser, scheduler logic, UI overlays, and inject bundle.
- `packages/extension`: Chrome extension (content scripts, service worker, popup UI).
- `packages/tauri`: Desktop app (Tauri + React).

**Notes**
- `dev` and `build` are Tauri-first workflows by default.

**Join Button Detection**
Current strategy version: v1.
- Step 1: text pattern match against `JOIN_BUTTON_PATTERNS` using `button.textContent`.
- Step 2: heuristic fallback when no pattern matched:
  - Filter to visible, enabled buttons with accessible text.
  - Exclude menu buttons (`aria-haspopup` / `aria-expanded`).
  - Prefer candidates with `data-promo-anchor-id="w5gBed"` (weak signal).
  - Select by largest area, then longer accessible text as a tie-breaker.

**Updating Join Detection Strategy**
- Treat the existing v1 logic as a stable fallback. When adding a new strategy, run it first and keep v1 unchanged as the final fallback.
- Keep `JOIN_BUTTON_PATTERNS` additive (only remove entries when they are proven wrong).
- Prefer multi-signal heuristics over single fragile attributes (e.g., `jsname` or `jslog`).
- Add or update tests in `packages/core/__tests__/controller.test.ts` for every new heuristic or pattern.
- Validate on both surfaces (extension + Tauri) to avoid behavioral drift.
