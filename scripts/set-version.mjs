import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const nextVersion = process.argv[2];

if (!nextVersion) {
  console.error("Usage: node scripts/set-version.mjs <version>");
  process.exit(1);
}

function updateText(filePath, replacer) {
  const fullPath = resolve(root, filePath);
  const raw = readFileSync(fullPath, "utf8");
  const updated = replacer(raw);
  writeFileSync(fullPath, updated);
}

const packageJsonFiles = [
  "package.json",
  "packages/core/package.json",
  "packages/settings/package.json",
  "packages/extension/package.json",
  "packages/tauri/package.json",
];

for (const file of packageJsonFiles) {
  updateText(file, (content) =>
    content.replace(/\"version\":\\s*\".*?\"/g, `"version": "${nextVersion}"`)
  );
}

updateText("packages/extension/public/manifest.json", (content) =>
  content.replace(/\"version\":\\s*\".*?\"/g, `"version": "${nextVersion}"`)
);

updateText("packages/tauri/src-tauri/tauri.conf.json", (content) =>
  content.replace(/\"version\":\\s*\".*?\"/g, `"version": "${nextVersion}"`)
);

updateText("packages/tauri/src-tauri/Cargo.toml", (content) =>
  content.replace(/^version = ".*"$/m, `version = "${nextVersion}"`)
);

updateText("packages/tauri/src-tauri/Cargo.lock", (content) => {
  const lines = content.split("\n");
  let inMeetcatPackage = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (line.startsWith("[[package]]")) {
      inMeetcatPackage = false;
      continue;
    }

    if (line === 'name = "meetcat"' || line === 'name = "meetcat_lib"') {
      inMeetcatPackage = true;
      continue;
    }

    if (inMeetcatPackage && line.startsWith("version = ")) {
      lines[i] = `version = "${nextVersion}"`;
      inMeetcatPackage = false;
    }
  }

  return lines.join("\n");
});

console.log(`[meetcat] version updated to ${nextVersion}`);
