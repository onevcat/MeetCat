---
name: change-log
description: Generate a full, user-facing changelog for the current in-development app version by comparing with the previous release tag (including uncommitted changes), and update the appropriate CHANGELOG.md accordingly.
---

## Goal
Produce a complete, user-facing changelog for the current in-development app version and update the appropriate `CHANGELOG.md` accordingly.

## When to use
- You need to generate or refresh the changelog for the current dev version.
- The summary must include all changes since the previous release tag, including uncommitted work.

## Inputs and sources
- App version (heuristic):
  1) `crates/app/tauri.conf.json` (`version`).
  2) `packages/tauri/src-tauri/tauri.conf.json` (`version`).
  3) `tauri.conf.json` (repo root or first match via search).
  4) `package.json` (`version`) as a fallback when no Tauri config exists.
- Previous release tag: the latest reachable release tag in git history.
- Changes since tag: commit logs + file diffs + uncommitted working tree changes.
- Changelog file (heuristic):
  1) `crates/app/CHANGELOG.md`.
  2) `CHANGELOG.md` at repo root.
  3) `packages/tauri/CHANGELOG.md` or `packages/app/CHANGELOG.md` if present.

## Workflow
1. Read the current app version using the heuristic order above. This is the target section in the changelog.
2. Identify the previous release tag.
   - Preferred: `git describe --tags --abbrev=0`.
   - If ambiguous or no tag is found, list tags with `git tag --sort=-creatordate` and ask the user to pick the correct release tag.
3. Collect the full change set (including uncommitted changes).
   - Commit log: `git log <tag>..HEAD --reverse`.
   - File-level changes: `git log <tag>..HEAD --name-status`.
   - Diff for details: `git diff <tag>..HEAD`.
   - Uncommitted changes: `git status --porcelain`, `git diff`, `git diff --staged`.
4. Summarize changes into user-facing items only.
   - Include only changes that impact users (features, UI, behavior, fixes).
   - Exclude internal-only work (tests, refactors without behavior change, tooling, CI, internal-only docs).
5. Update the selected `CHANGELOG.md`.
   - If the target version section already exists, replace it with a full, up-to-date section. Each invocation must be a full refresh for that version.
   - Keep the version order descending (newest first) and follow the existing formatting style.

## Categorization rules
Use these sections in this order and omit any empty section:
1. Added
2. Changed
3. Fixed

Guidance:
- Added: new capabilities, new screens, new features users can now use.
- Changed: behavior or UX changes, settings changes, performance improvements users can notice.
- Fixed: bug fixes or incorrect behavior users might have experienced.
- If a change cannot be clearly categorized, ask the user to choose the section.

## Highlight rule
If there is a major milestone or standout feature, add a short highlight paragraph directly under the version header and above any section headers.

## Output format
Follow the existing Markdown style in the selected `CHANGELOG.md`.

Example skeleton:

```
## 0.0.x

A short highlight paragraph (only if truly major).

### Added

- User-facing addition.

### Changed

- User-facing change.

### Fixed

- User-facing fix.
```

## Links
Use Markdown links if an item needs more explanation. The update dialog supports links.

## Notes
- Always include uncommitted changes in the summary. If the inclusion is uncertain, confirm with the user.
- Do not invent changes. Every bullet must be traceable to the collected logs/diffs.
