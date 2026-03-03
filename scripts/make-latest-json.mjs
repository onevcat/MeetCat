#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      if (!(key in args)) args[key] = true;
      continue;
    }
    if (key in args) {
      if (Array.isArray(args[key])) {
        args[key].push(value);
      } else {
        args[key] = [args[key], value];
      }
    } else {
      args[key] = value;
    }
    i += 1;
  }
  return args;
}

function requireArg(args, key) {
  const value = args[key];
  if (!value || value === true) {
    throw new Error(`Missing required argument: --${key}`);
  }
  return value;
}

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8").trim();
}

function ensureOutputDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function parsePlatformArg(raw) {
  const parts = raw.split("|");
  if (parts.length !== 3) {
    throw new Error(
      `Invalid --platform value "${raw}". Expected format: target|url|sig_file`
    );
  }
  const [target, url, signaturePath] = parts.map((item) => item.trim());
  if (!target || !url || !signaturePath) {
    throw new Error(`Invalid --platform value "${raw}"`);
  }
  return { target, url, signaturePath };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const version = requireArg(args, "version");
  const out = requireArg(args, "out");
  const pubDate =
    (typeof args["pub-date"] === "string" && args["pub-date"]) ||
    new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const notesFile = typeof args["notes-file"] === "string" ? args["notes-file"] : null;
  const platformArgs = asArray(args.platform);
  if (platformArgs.length === 0) {
    throw new Error("At least one --platform is required");
  }

  const platforms = {};
  for (const raw of platformArgs) {
    const { target, url, signaturePath } = parsePlatformArg(raw);
    platforms[target] = {
      url,
      signature: readText(signaturePath),
    };
  }

  const payload = {
    version,
    pub_date: pubDate,
    platforms,
  };
  if (notesFile) {
    const notes = readText(notesFile);
    if (notes) {
      payload.notes = notes;
    }
  }

  ensureOutputDir(out);
  fs.writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

try {
  main();
} catch (error) {
  console.error(error?.message ?? String(error));
  process.exit(1);
}
