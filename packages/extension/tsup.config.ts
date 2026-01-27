import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "content-homepage": "src/content-scripts/homepage.ts",
    "content-meeting": "src/content-scripts/meeting.ts",
    "service-worker": "src/service-worker/index.ts",
  },
  outDir: "dist",
  format: ["iife"],
  globalName: "MeetCat",
  clean: false, // Don't clean, vite will add popup files
  sourcemap: false,
  splitting: false,
  treeshake: true,
  minify: true,
  // Bundle all dependencies
  noExternal: [/@meetcat\/.*/],
  esbuildOptions(options) {
    // Ensure no top-level variables leak
    options.banner = {
      js: '"use strict";',
    };
  },
});
