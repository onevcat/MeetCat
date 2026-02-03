import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  enable as enableAutostart,
  disable as disableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import type { Settings } from "@meetcat/settings";
import { DEFAULT_TAURI_SETTINGS, getTauriDefaults } from "@meetcat/settings";
import { SettingsContainer, type SettingsAdapter } from "@meetcat/settings-ui";

const defaultSettings = getTauriDefaults();

const resolveSettings = (loaded: Settings | null): Settings => {
  return {
    ...defaultSettings,
    ...loaded,
    tauri: {
      ...DEFAULT_TAURI_SETTINGS,
      ...loaded?.tauri,
    },
  };
};

const adapter: SettingsAdapter = {
  capabilities: {
    startAtLogin: true,
    tray: true,
    showSavingIndicator: true,
    developer: true,
  },
  getDefaultSettings: () => resolveSettings(null),
  resolveSettings,
  loadSettings: async () => {
    const loadedSettings = await invoke<Settings>("get_settings");
    let resolvedSettings = resolveSettings(loadedSettings);

    try {
      const systemEnabled = await isAutostartEnabled();
      const currentEnabled =
        resolvedSettings.tauri?.startAtLogin ??
        DEFAULT_TAURI_SETTINGS.startAtLogin;

      if (systemEnabled !== currentEnabled) {
        resolvedSettings = {
          ...resolvedSettings,
          tauri: {
            ...DEFAULT_TAURI_SETTINGS,
            ...resolvedSettings.tauri,
            startAtLogin: systemEnabled,
          },
        };
        await invoke("save_settings", { settings: resolvedSettings });
      }
    } catch (e) {
      console.error("Failed to sync autostart status:", e);
    }

    return resolvedSettings;
  },
  saveSettings: async (settings) => {
    await invoke("save_settings", { settings });
  },
  subscribe: (handler) => {
    const unlisten = listen<Settings>("settings_changed", (event) => {
      handler(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  },
  updateStartAtLogin: async (enabled, settings) => {
    const isEnabled = await isAutostartEnabled();

    if (enabled) {
      if (!isEnabled) {
        await enableAutostart();
      }
    } else if (isEnabled) {
      await disableAutostart();
    }

    const updated = await isAutostartEnabled();
    return {
      ...settings,
      tauri: {
        ...DEFAULT_TAURI_SETTINGS,
        ...settings.tauri,
        startAtLogin: updated,
      },
    };
  },
  getVersion: async () => getVersion(),
};

/**
 * Settings window for MeetCat Tauri app
 */
export function App() {
  return (
    <SettingsContainer
      adapter={adapter}
      headerTitle="MeetCat Settings"
      headerIconSrc="/icons/icon-color.png"
      appName="MeetCat"
    />
  );
}
