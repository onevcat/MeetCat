import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS,
  DEFAULT_EXTENSION_SETTINGS,
  DEFAULT_TAURI_SETTINGS,
  getExtensionDefaults,
  getTauriDefaults,
} from "../src/defaults.js";
import { SettingsSchema } from "../src/schema.js";

describe("Settings Defaults", () => {
  describe("DEFAULT_SETTINGS", () => {
    it("should pass schema validation", () => {
      const result = SettingsSchema.safeParse(DEFAULT_SETTINGS);
      expect(result.success).toBe(true);
    });

    it("should have expected timing defaults", () => {
      expect(DEFAULT_SETTINGS.checkIntervalSeconds).toBe(30);
      expect(DEFAULT_SETTINGS.joinBeforeMinutes).toBe(1);
      expect(DEFAULT_SETTINGS.maxMinutesAfterStart).toBe(10);
    });

    it("should have expected join behavior defaults", () => {
      expect(DEFAULT_SETTINGS.autoClickJoin).toBe(true);
      expect(DEFAULT_SETTINGS.joinCountdownSeconds).toBe(20);
      expect(DEFAULT_SETTINGS.titleExcludeFilters).toEqual([]);
    });

    it("should have expected media defaults", () => {
      expect(DEFAULT_SETTINGS.defaultMicState).toBe("muted");
      expect(DEFAULT_SETTINGS.defaultCameraState).toBe("muted");
    });

    it("should have expected UI defaults", () => {
      expect(DEFAULT_SETTINGS.showCountdownOverlay).toBe(true);
    });
  });

  describe("DEFAULT_EXTENSION_SETTINGS", () => {
    it("should have openInNewTab enabled by default", () => {
      expect(DEFAULT_EXTENSION_SETTINGS.openInNewTab).toBe(true);
    });
  });

  describe("DEFAULT_TAURI_SETTINGS", () => {
    it("should have startAtLogin disabled by default", () => {
      expect(DEFAULT_TAURI_SETTINGS.startAtLogin).toBe(false);
    });

    it("should have showTrayIcon enabled by default", () => {
      expect(DEFAULT_TAURI_SETTINGS.showTrayIcon).toBe(true);
    });

    it("should have log collection disabled by default", () => {
      expect(DEFAULT_TAURI_SETTINGS.logCollectionEnabled).toBe(false);
    });

    it("should have log level set to info by default", () => {
      expect(DEFAULT_TAURI_SETTINGS.logLevel).toBe("info");
    });
  });

  describe("getExtensionDefaults", () => {
    it("should return complete settings with extension config", () => {
      const defaults = getExtensionDefaults();

      expect(defaults.checkIntervalSeconds).toBe(DEFAULT_SETTINGS.checkIntervalSeconds);
      expect(defaults.extension).toEqual(DEFAULT_EXTENSION_SETTINGS);
    });

    it("should pass schema validation", () => {
      const defaults = getExtensionDefaults();
      const result = SettingsSchema.safeParse(defaults);
      expect(result.success).toBe(true);
    });

    it("should not include tauri settings", () => {
      const defaults = getExtensionDefaults();
      expect(defaults.tauri).toBeUndefined();
    });
  });

  describe("getTauriDefaults", () => {
    it("should return complete settings with tauri config", () => {
      const defaults = getTauriDefaults();

      expect(defaults.checkIntervalSeconds).toBe(DEFAULT_SETTINGS.checkIntervalSeconds);
      expect(defaults.tauri).toEqual(DEFAULT_TAURI_SETTINGS);
    });

    it("should pass schema validation", () => {
      const defaults = getTauriDefaults();
      const result = SettingsSchema.safeParse(defaults);
      expect(result.success).toBe(true);
    });

    it("should not include extension settings", () => {
      const defaults = getTauriDefaults();
      expect(defaults.extension).toBeUndefined();
    });
  });
});
