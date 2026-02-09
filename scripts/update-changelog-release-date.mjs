import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const changelogPath = resolve(root, "CHANGELOG.md");
const version = process.argv[2];
const inputDate = process.argv[3];

if (!version) {
  console.error("Usage: node scripts/update-changelog-release-date.mjs <version> [date]");
  process.exit(1);
}

function toDateString(date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

const today = inputDate ?? toDateString(new Date());
if (!isValidDateString(today)) {
  console.error(`[update-changelog-release-date] Invalid date: ${today}`);
  process.exit(1);
}

const content = readFileSync(changelogPath, "utf8");
const lines = content.split(/\r?\n/);
const sectionPattern = /^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?\s*$/;

let found = false;
let changed = false;

for (let i = 0; i < lines.length; i += 1) {
  const match = sectionPattern.exec(lines[i]);
  if (!match) {
    continue;
  }

  const currentVersion = match[1];
  if (currentVersion !== version) {
    continue;
  }

  found = true;
  const updatedLine = `## [${version}] - ${today}`;
  if (lines[i] !== updatedLine) {
    lines[i] = updatedLine;
    changed = true;
  }
  break;
}

if (!found) {
  console.error(`[update-changelog-release-date] Version ${version} not found in CHANGELOG.md`);
  process.exit(2);
}

if (!changed) {
  console.log(`[update-changelog-release-date] CHANGELOG date is already ${today} for ${version}`);
  process.exit(0);
}

writeFileSync(changelogPath, lines.join("\n"));
console.log(`[update-changelog-release-date] Updated ${version} date to ${today}`);
