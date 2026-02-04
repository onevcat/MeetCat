import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const packageJsonPath = resolve(root, "packages/tauri/package.json");
const cargoTomlPath = resolve(root, "packages/tauri/src-tauri/Cargo.toml");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readFile(path) {
  return readFileSync(path, "utf8");
}

function extractVersion(value) {
  if (!value) return null;
  const match = String(value).match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    full: match[0],
    majorMinor: `${match[1]}.${match[2]}`,
  };
}

function extractCargoVersion(content, crateName) {
  const directPattern = new RegExp(`^${crateName}\\s*=\\s*\"([^\"]+)\"`, "m");
  const inlinePattern = new RegExp(
    `^${crateName}\\s*=\\s*\\{[^}]*version\\s*=\\s*\"([^\"]+)\"`,
    "m"
  );
  const match = content.match(directPattern) ?? content.match(inlinePattern);
  if (!match) return null;
  return extractVersion(match[1]);
}

const pkg = readJson(packageJsonPath);
const apiVersion = extractVersion(pkg.dependencies?.["@tauri-apps/api"]);
const cargoContent = readFile(cargoTomlPath);
const tauriVersion = extractCargoVersion(cargoContent, "tauri");

if (!apiVersion || !tauriVersion) {
  console.error("[check:tauri-version] Failed to read versions for @tauri-apps/api or tauri.");
  process.exit(1);
}

if (apiVersion.majorMinor !== tauriVersion.majorMinor) {
  console.error(
    `[check:tauri-version] Version mismatch: @tauri-apps/api ${apiVersion.full} vs tauri ${tauriVersion.full}`
  );
  process.exit(1);
}

console.log(
  `[check:tauri-version] OK: @tauri-apps/api ${apiVersion.full} matches tauri ${tauriVersion.full}`
);
