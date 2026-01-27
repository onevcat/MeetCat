export {
  SettingsSchema,
  ExtensionSettingsSchema,
  TauriSettingsSchema,
  MediaStateSchema,
  type Settings,
  type ExtensionSettings,
  type TauriSettings,
  type MediaState,
} from "./schema.js";

export {
  DEFAULT_SETTINGS,
  DEFAULT_EXTENSION_SETTINGS,
  DEFAULT_TAURI_SETTINGS,
  getExtensionDefaults,
  getTauriDefaults,
} from "./defaults.js";
