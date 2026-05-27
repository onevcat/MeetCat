import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@meetcat/settings";
import { INJECT_FALLBACK_SETTINGS } from "../src/inject-defaults.js";

describe("inject fallback defaults", () => {
  it("matches shared settings defaults used by non-Tauri fallback paths", () => {
    expect(INJECT_FALLBACK_SETTINGS).toEqual({
      checkIntervalSeconds: DEFAULT_SETTINGS.checkIntervalSeconds,
      joinBeforeMinutes: DEFAULT_SETTINGS.joinBeforeMinutes,
      maxMinutesAfterStart: DEFAULT_SETTINGS.maxMinutesAfterStart,
      autoClickJoin: DEFAULT_SETTINGS.autoClickJoin,
      autoMaximizeInMeeting: DEFAULT_SETTINGS.autoMaximizeInMeeting,
      joinCountdownSeconds: DEFAULT_SETTINGS.joinCountdownSeconds,
      titleExcludeFilters: DEFAULT_SETTINGS.titleExcludeFilters,
      defaultMicState: DEFAULT_SETTINGS.defaultMicState,
      defaultCameraState: DEFAULT_SETTINGS.defaultCameraState,
      showCountdownOverlay: DEFAULT_SETTINGS.showCountdownOverlay,
    });
  });

  it("does not leave unresolved defaults imports in the built injection bundle", () => {
    const bundlePath = resolve("dist/meetcat-inject.global.js");
    if (!existsSync(bundlePath)) return;

    const bundle = readFileSync(bundlePath, "utf8");
    expect(bundle).not.toContain("(void 0).checkIntervalSeconds");
    expect(bundle).not.toContain("(void 0).joinBeforeMinutes");
    expect(bundle).not.toContain("(void 0).joinCountdownSeconds");
  });
});
