import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.tsx", "src/tray-settings.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["react", "react-dom"],
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
});
