import type { Settings } from "@meetcat/settings";
import { DEFAULT_TAURI_SETTINGS } from "@meetcat/settings";

export type TrayDisplayMode =
  | "iconOnly"
  | "iconWithTime"
  | "iconWithCountdown";

export function getTrayDisplayMode(settings: Settings): TrayDisplayMode {
  return settings.tauri?.trayDisplayMode ?? DEFAULT_TAURI_SETTINGS.trayDisplayMode;
}

export function getTrayShowMeetingTitle(settings: Settings): boolean {
  return (
    settings.tauri?.trayShowMeetingTitle ??
    DEFAULT_TAURI_SETTINGS.trayShowMeetingTitle
  );
}

export function canShowTrayTitle(mode: TrayDisplayMode): boolean {
  return mode !== "iconOnly";
}

export function applyTrayDisplayModeChange(
  settings: Settings,
  nextMode: TrayDisplayMode
): Settings {
  const currentMode = getTrayDisplayMode(settings);
  const currentShowTitle = getTrayShowMeetingTitle(settings);
  const nextShowTitle =
    nextMode === "iconOnly"
      ? false
      : currentMode === "iconOnly"
        ? false
        : currentShowTitle;

  return {
    ...settings,
    tauri: {
      ...DEFAULT_TAURI_SETTINGS,
      ...settings.tauri,
      trayDisplayMode: nextMode,
      trayShowMeetingTitle: nextShowTitle,
    },
  };
}
