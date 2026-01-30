# Repository Guidelines

## Platform Scope & Parity
- This repo ships two clients: a Tauri desktop app and a Chrome extension. Treat them as one product surface.
- When changing behavior, UI, or settings, review both `packages/tauri` and `packages/extension` to keep logic and UX aligned and avoid long-term drift.

## Project Structure & Module Organization
- `packages/core`: Shared DOM parsing, scheduler logic, UI overlays, and injection helpers.
- `packages/settings`: Zod-based settings schema and defaults used across apps.
- `packages/extension`: Chrome extension (content scripts, service worker, popup UI). Source in `packages/extension/src`, static assets in `packages/extension/public`, icons in `packages/extension/icons`.
- `packages/tauri`: Desktop app (Tauri + React). Frontend in `packages/tauri/src`, Rust backend in `packages/tauri/src-tauri`.
- `scripts`: Workspace helpers for dev workflows.

## Build, Test, and Development Commands
- `pnpm run dev`: Launch the Tauri app in dev mode (builds and watches shared packages).
- `pnpm run dev:extension`: Build and watch the extension.
- `pnpm run build`: Build the Tauri app (runs `build:tauri`).
- `pnpm run build:extension`: Build the extension into `packages/extension/dist`.
- `pnpm run test`: Run all JS/TS and Rust tests.
- `pnpm run test:cov`: Run all JS/TS tests with coverage (and Rust tests).
- `pnpm run clean` / `pnpm run clean:all`: Remove build artifacts (the latter also clears `node_modules`).

## Coding Style & Naming Conventions
- TypeScript/React code uses ES modules, double quotes, semicolons, and 2-space indentation.
- Prefer `camelCase` for functions/variables, `PascalCase` for React components, and `kebab-case` for file names like `tauri-bridge.ts`.
- No repo-wide formatter or linter is configured; follow the surrounding style in each package.

## Testing Guidelines
- Unit tests use `vitest` with colocated `__tests__` directories across packages.
- Extension E2E uses `@playwright/test` from `packages/extension`.
- Rust tests live under `packages/tauri/src-tauri` and run via `cargo test` (triggered by `pnpm run test`).

## Commit & Pull Request Guidelines
- Commit messages follow Conventional Commits with scopes, e.g. `feat(tauri): add system tray module` or `chore(version): align packages`.
- PRs should include a concise summary, testing notes (commands + results), and screenshots or GIFs for UI changes (extension popup or Tauri screens).
- Link relevant issues or describe the problem being solved when no issue exists.

## Security & Configuration Tips
- Required toolchain: Node.js >= 20, pnpm >= 9, Rust for Tauri builds.
- Keep secrets out of the repo; prefer environment variables or OS keychains if needed for local testing.
