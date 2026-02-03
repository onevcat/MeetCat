import { describe, it, expect } from "vitest";
import {
  SettingsSchema,
  MediaStateSchema,
  ExtensionSettingsSchema,
  TauriSettingsSchema,
  DEFAULT_SETTINGS,
} from "../src/index.js";

describe("Settings", () => {
  describe("MediaStateSchema", () => {
    it("should accept muted", () => {
      const result = MediaStateSchema.safeParse("muted");
      expect(result.success).toBe(true);
    });

    it("should accept unmuted", () => {
      const result = MediaStateSchema.safeParse("unmuted");
      expect(result.success).toBe(true);
    });

    it("should reject invalid values", () => {
      const result = MediaStateSchema.safeParse("invalid");
      expect(result.success).toBe(false);
    });
  });

  describe("ExtensionSettingsSchema", () => {
    it("should parse with default values", () => {
      const result = ExtensionSettingsSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.openInNewTab).toBe(true);
      }
    });

    it("should accept custom openInNewTab value", () => {
      const result = ExtensionSettingsSchema.safeParse({ openInNewTab: false });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.openInNewTab).toBe(false);
      }
    });
  });

  describe("TauriSettingsSchema", () => {
    it("should parse with default values", () => {
      const result = TauriSettingsSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.startAtLogin).toBe(false);
        expect(result.data.showTrayIcon).toBe(true);
        expect(result.data.trayDisplayMode).toBe("iconOnly");
        expect(result.data.trayShowMeetingTitle).toBe(false);
        expect(result.data.logCollectionEnabled).toBe(false);
        expect(result.data.logLevel).toBe("info");
      }
    });

    it("should accept custom values", () => {
      const result = TauriSettingsSchema.safeParse({
        startAtLogin: true,
        showTrayIcon: false,
        trayDisplayMode: "iconWithCountdown",
        trayShowMeetingTitle: true,
        logCollectionEnabled: true,
        logLevel: "debug",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.startAtLogin).toBe(true);
        expect(result.data.showTrayIcon).toBe(false);
        expect(result.data.trayDisplayMode).toBe("iconWithCountdown");
        expect(result.data.trayShowMeetingTitle).toBe(true);
        expect(result.data.logCollectionEnabled).toBe(true);
        expect(result.data.logLevel).toBe("debug");
      }
    });
  });

  describe("SettingsSchema", () => {
    it("should parse default settings", () => {
      const result = SettingsSchema.safeParse(DEFAULT_SETTINGS);
      expect(result.success).toBe(true);
    });

    it("should parse partial settings with defaults", () => {
      const result = SettingsSchema.safeParse({ joinBeforeMinutes: 5 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.joinBeforeMinutes).toBe(5);
        expect(result.data.autoClickJoin).toBe(DEFAULT_SETTINGS.autoClickJoin);
      }
    });

    it("should validate titleExcludeFilters as array of strings", () => {
      const result = SettingsSchema.safeParse({
        titleExcludeFilters: ["1:1", "Optional"],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.titleExcludeFilters).toEqual(["1:1", "Optional"]);
      }
    });

    it("should reject invalid joinBeforeMinutes", () => {
      const result = SettingsSchema.safeParse({ joinBeforeMinutes: -1 });
      expect(result.success).toBe(false);

      const tooLarge = SettingsSchema.safeParse({ joinBeforeMinutes: 50 });
      expect(tooLarge.success).toBe(false);
    });

    it("should reject invalid maxMinutesAfterStart", () => {
      const tooSmall = SettingsSchema.safeParse({ maxMinutesAfterStart: -1 });
      expect(tooSmall.success).toBe(false);

      const tooLarge = SettingsSchema.safeParse({ maxMinutesAfterStart: 60 });
      expect(tooLarge.success).toBe(false);
    });

    it("should reject invalid checkIntervalSeconds", () => {
      // Min is 30 (Chrome Alarms API limit since Chrome 120)
      const tooSmall = SettingsSchema.safeParse({ checkIntervalSeconds: 10 });
      expect(tooSmall.success).toBe(false);

      // Max is 120
      const tooLarge = SettingsSchema.safeParse({ checkIntervalSeconds: 150 });
      expect(tooLarge.success).toBe(false);
    });

    it("should reject invalid joinCountdownSeconds", () => {
      const tooSmall = SettingsSchema.safeParse({ joinCountdownSeconds: -1 });
      expect(tooSmall.success).toBe(false);

      const tooLarge = SettingsSchema.safeParse({ joinCountdownSeconds: 100 });
      expect(tooLarge.success).toBe(false);
    });

    it("should accept valid media states", () => {
      const result = SettingsSchema.safeParse({
        defaultMicState: "unmuted",
        defaultCameraState: "unmuted",
      });
      expect(result.success).toBe(true);
    });

    it("should accept extension settings", () => {
      const result = SettingsSchema.safeParse({
        extension: { openInNewTab: false },
      });
      expect(result.success).toBe(true);
    });

    it("should accept tauri settings", () => {
      const result = SettingsSchema.safeParse({
        tauri: {
          startAtLogin: true,
          showTrayIcon: true,
          trayDisplayMode: "iconWithTime",
          trayShowMeetingTitle: true,
        },
      });
      expect(result.success).toBe(true);
    });

    it("should parse empty object with all defaults", () => {
      const result = SettingsSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.checkIntervalSeconds).toBe(30);
        expect(result.data.joinBeforeMinutes).toBe(1);
        expect(result.data.autoClickJoin).toBe(true);
        expect(result.data.maxMinutesAfterStart).toBe(10);
        expect(result.data.joinCountdownSeconds).toBe(20);
        expect(result.data.showCountdownOverlay).toBe(true);
      }
    });
  });
});
