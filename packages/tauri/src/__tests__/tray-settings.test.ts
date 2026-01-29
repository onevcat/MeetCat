import { describe, it, expect } from "vitest";
import type { Settings } from "@meetcat/settings";
import {
  applyTrayDisplayModeChange,
  canShowTrayTitle,
  getTrayDisplayMode,
  getTrayShowMeetingTitle,
} from "../tray-settings";

function baseSettings(): Settings {
  return {
    checkIntervalSeconds: 30,
    joinBeforeMinutes: 1,
    maxMinutesAfterStart: 10,
    autoClickJoin: true,
    joinCountdownSeconds: 20,
    titleExcludeFilters: [],
    defaultMicState: "muted",
    defaultCameraState: "muted",
    showNotifications: true,
    showCountdownOverlay: true,
    tauri: {
      runInBackground: true,
      quitToHide: true,
      startAtLogin: false,
      showTrayIcon: true,
      trayDisplayMode: "iconOnly",
      trayShowMeetingTitle: false,
    },
  };
}

describe("tray settings helpers", () => {
  it("defaults to iconOnly when missing tauri settings", () => {
    const settings = baseSettings();
    settings.tauri = undefined;
    expect(getTrayDisplayMode(settings)).toBe("iconOnly");
    expect(getTrayShowMeetingTitle(settings)).toBe(false);
  });

  it("disables title when iconOnly is selected", () => {
    expect(canShowTrayTitle("iconOnly")).toBe(false);
    expect(canShowTrayTitle("iconWithTime")).toBe(true);
    expect(canShowTrayTitle("iconWithCountdown")).toBe(true);
  });

  it("resets title when switching to iconOnly", () => {
    const settings = baseSettings();
    settings.tauri = {
      ...settings.tauri,
      trayDisplayMode: "iconWithTime",
      trayShowMeetingTitle: true,
    };

    const next = applyTrayDisplayModeChange(settings, "iconOnly");
    expect(next.tauri?.trayDisplayMode).toBe("iconOnly");
    expect(next.tauri?.trayShowMeetingTitle).toBe(false);
  });

  it("keeps title disabled when switching from iconOnly to time", () => {
    const settings = baseSettings();
    const next = applyTrayDisplayModeChange(settings, "iconWithTime");
    expect(next.tauri?.trayDisplayMode).toBe("iconWithTime");
    expect(next.tauri?.trayShowMeetingTitle).toBe(false);
  });

  it("preserves title choice when switching between time modes", () => {
    const settings = baseSettings();
    settings.tauri = {
      ...settings.tauri,
      trayDisplayMode: "iconWithTime",
      trayShowMeetingTitle: true,
    };

    const next = applyTrayDisplayModeChange(settings, "iconWithCountdown");
    expect(next.tauri?.trayDisplayMode).toBe("iconWithCountdown");
    expect(next.tauri?.trayShowMeetingTitle).toBe(true);
  });
});
