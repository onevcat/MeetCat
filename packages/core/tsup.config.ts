import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/parser/index.ts",
    "src/controller/index.ts",
    "src/scheduler/index.ts",
    "src/ui/index.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
});
