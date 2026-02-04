import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const changelogPath = resolve(root, "CHANGELOG.md");
const version = process.argv[2];

if (!version) {
  console.error("Usage: node scripts/extract-release-notes.mjs <version>");
  process.exit(1);
}

const content = readFileSync(changelogPath, "utf8");
const lines = content.split(/\r?\n/);

const header = `## [${version}]`;
let found = false;
const output = [];

for (const line of lines) {
  if (!found) {
    if (line.startsWith(header)) {
      found = true;
      continue;
    }
    continue;
  }

  if (line.startsWith("## [")) {
    break;
  }

  output.push(line);
}

const notes = output.join("\n").trim();
if (!notes) {
  console.error(`[extract-release-notes] No notes found for ${version}.`);
  process.exit(2);
}

process.stdout.write(notes + "\n");
