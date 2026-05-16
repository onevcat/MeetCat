import type { Settings, ExtensionSettings, TauriSettings } from "./schema.js";
import defaults from "./defaults.json";

type DefaultsJson = {
  language: "auto" | "en" | "zh" | "ja" | "ko";
  checkIntervalSeconds: number;
  joinBeforeMinutes: number;
  maxMinutesAfterStart: number;
  autoClickJoin: boolean;
  joinCountdownSeconds: number;
  titleExcludeFilters: string[];
  defaultMicState: Settings["defaultMicState"];
  defaultCameraState: Settings["defaultCameraState"];
  showCountdownOverlay: boolean;
  extension: ExtensionSettings;
  tauri: TauriSettings;
};

const DEFAULTS = defaults as DefaultsJson;

function createDefaultSettings(): Settings {
  return {
    // Language
    language: DEFAULTS.language,

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
    showCountdownOverlay: DEFAULTS.showCountdownOverlay,
  };
}

/**
 * Default settings values
 */
export const DEFAULT_SETTINGS: Settings = createDefaultSettings();

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
    ...createDefaultSettings(),
    extension: { ...DEFAULTS.extension },
  };
}

/**
 * Get complete default settings for Tauri platform
 */
export function getTauriDefaults(): Settings {
  return {
    ...createDefaultSettings(),
    tauri: { ...DEFAULTS.tauri },
  };
}
