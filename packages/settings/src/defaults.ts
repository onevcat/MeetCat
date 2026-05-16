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

// Freeze the exported singletons so accidental mutations throw in strict mode
// instead of silently corrupting defaults for every later reader. Callers that
// need a mutable copy should spread them or use the getXxxDefaults factories.
function freezeSettings(settings: Settings): Settings {
  Object.freeze(settings.titleExcludeFilters);
  return Object.freeze(settings);
}

/**
 * Default settings values (frozen — spread or use a factory for mutations)
 */
export const DEFAULT_SETTINGS: Settings = freezeSettings(createDefaultSettings());

/**
 * Default extension settings (frozen — spread for mutations)
 */
export const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = Object.freeze({
  ...DEFAULTS.extension,
});

/**
 * Default Tauri settings (frozen — spread for mutations)
 */
export const DEFAULT_TAURI_SETTINGS: TauriSettings = Object.freeze({
  ...DEFAULTS.tauri,
});

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
