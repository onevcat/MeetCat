# Contributing to MeetCat

Thanks for your interest in contributing! This guide covers how to set up the project, understand the codebase, and submit changes.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 9
- [Rust](https://www.rust-lang.org/tools/install) toolchain (required for the Tauri desktop app)

## Setup

```bash
git clone https://github.com/onevcat/MeetCat.git
cd MeetCat
pnpm install
```

## Development

```bash
# Tauri desktop app (builds shared packages, watches for changes)
pnpm run dev

# Chrome extension (builds shared packages, watches for changes)
pnpm run dev:extension
```

Both commands automatically build shared dependencies and set up file watchers.

## Project Structure

This is a pnpm monorepo (`packages/*`):

```
packages/
├── core/          # Shared DOM parsing, scheduler, UI overlays, injection helpers
├── settings/      # Zod-based settings schema and defaults
├── settings-ui/   # Shared React settings UI components
├── i18n/          # Internationalization (EN, ZH, JA, KO)
├── extension/     # Chrome extension (content scripts, service worker, popup)
└── tauri/         # Desktop app — React frontend + Rust backend
    └── src-tauri/   # Rust side (Tauri commands, tray, updater)
scripts/           # Workspace helpers for dev, build, and release
```

**Dependency flow:**

```
settings, i18n
    ↓
core, settings-ui
    ↓
extension, tauri
```

Changes to a lower-level package (e.g. `settings`) may affect everything above it. The dev scripts handle rebuilds automatically during development.

## Testing

```bash
# Run all tests (JS/TS via Vitest + Rust via cargo test)
pnpm run test

# Run with coverage
pnpm run test:cov
```

- JS/TS tests use [Vitest](https://vitest.dev/) with colocated `__tests__` directories.
- Rust tests live under `packages/tauri/src-tauri` and run via `cargo test`.

## Building

```bash
# Tauri desktop app
pnpm run build

# Chrome extension → packages/extension/dist/
pnpm run build:extension
```

## Code Style

- TypeScript/React: ES modules, double quotes, semicolons, 2-space indentation.
- Naming: `camelCase` for functions/variables, `PascalCase` for React components, `kebab-case` for file names.
- No global formatter/linter — match the surrounding style in each package.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/) with a scope:

```
feat(tauri): add system tray module
fix(core): correct scheduler race condition
chore(version): align packages to 0.0.8
```

## Pull Requests

- Keep PRs focused — one logical change per PR.
- Include a concise summary and testing notes (commands + results).
- Add screenshots or GIFs for UI changes.
- Link relevant issues or describe the problem being solved.

## Platform Parity

MeetCat ships two clients: Chrome extension and Tauri desktop app. When changing behavior, UI, or settings, check both `packages/extension` and `packages/tauri` to keep logic and UX aligned.

## Questions?

Open an issue at https://github.com/onevcat/MeetCat/issues.
