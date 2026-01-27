import { defineConfig } from "tsup";

export default defineConfig([
  // ESM modules for library usage
  {
    entry: [
      "src/index.ts",
      "src/parser/index.ts",
      "src/controller/index.ts",
      "src/scheduler/index.ts",
      "src/ui/index.ts",
      "src/tauri-bridge.ts",
    ],
    format: ["esm"],
    dts: true,
    clean: true,
    sourcemap: true,
  },
  // IIFE bundle for Tauri WebView injection
  {
    entry: {
      "meetcat-inject": "src/inject.ts",
    },
    format: ["iife"],
    globalName: "MeetCatInject",
    dts: false,
    clean: false,
    sourcemap: false,
    minify: true,
    noExternal: [/.*/],
  },
]);
