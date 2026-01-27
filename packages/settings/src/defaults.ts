import type { Settings, ExtensionSettings, TauriSettings } from "./schema.js";

/**
 * Default settings values
 */
export const DEFAULT_SETTINGS: Settings = {
  // Timing
  checkIntervalSeconds: 30,
  joinBeforeMinutes: 1,

  // Join behavior
  autoClickJoin: true,
  joinCountdownSeconds: 30,
  titleExcludeFilters: [],

  // Media defaults
  defaultMicState: "muted",
  defaultCameraState: "muted",

  // UI
  showNotifications: true,
  showCountdownOverlay: true,
};

/**
 * Default extension settings
 */
export const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = {
  openInNewTab: true,
};

/**
 * Default Tauri settings
 */
export const DEFAULT_TAURI_SETTINGS: TauriSettings = {
  runInBackground: true,
  startAtLogin: false,
  showTrayIcon: true,
};

/**
 * Get complete default settings for extension platform
 */
export function getExtensionDefaults(): Settings {
  return {
    ...DEFAULT_SETTINGS,
    extension: DEFAULT_EXTENSION_SETTINGS,
  };
}

/**
 * Get complete default settings for Tauri platform
 */
export function getTauriDefaults(): Settings {
  return {
    ...DEFAULT_SETTINGS,
    tauri: DEFAULT_TAURI_SETTINGS,
  };
}
