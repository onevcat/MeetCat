import type { Settings, ExtensionSettings, TauriSettings } from "./schema.js";
import defaults from "./defaults.json";

type DefaultsJson = {
  checkIntervalSeconds: number;
  joinBeforeMinutes: number;
  maxMinutesAfterStart: number;
  autoClickJoin: boolean;
  joinCountdownSeconds: number;
  titleExcludeFilters: string[];
  defaultMicState: Settings["defaultMicState"];
  defaultCameraState: Settings["defaultCameraState"];
  showNotifications: boolean;
  showCountdownOverlay: boolean;
  extension: ExtensionSettings;
  tauri: TauriSettings;
};

const DEFAULTS = defaults as DefaultsJson;

/**
 * Default settings values
 */
export const DEFAULT_SETTINGS: Settings = {
  // Timing
  checkIntervalSeconds: DEFAULTS.checkIntervalSeconds,
  joinBeforeMinutes: DEFAULTS.joinBeforeMinutes,
  maxMinutesAfterStart: DEFAULTS.maxMinutesAfterStart,

  // Join behavior
  autoClickJoin: DEFAULTS.autoClickJoin,
  joinCountdownSeconds: DEFAULTS.joinCountdownSeconds,
  titleExcludeFilters: [...DEFAULTS.titleExcludeFilters],

  // Media defaults
  defaultMicState: DEFAULTS.defaultMicState,
  defaultCameraState: DEFAULTS.defaultCameraState,

  // UI
  showNotifications: DEFAULTS.showNotifications,
  showCountdownOverlay: DEFAULTS.showCountdownOverlay,
};

/**
 * Default extension settings
 */
export const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = {
  ...DEFAULTS.extension,
};

/**
 * Default Tauri settings
 */
export const DEFAULT_TAURI_SETTINGS: TauriSettings = {
  ...DEFAULTS.tauri,
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
