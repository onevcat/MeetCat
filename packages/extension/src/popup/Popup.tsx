import type { Settings } from "@meetcat/settings";
import { DEFAULT_SETTINGS } from "@meetcat/settings";
import { SettingsContainer, type SettingsAdapter } from "@meetcat/settings-ui";

const STORAGE_KEY = "meetcat_settings";

export function getExtensionVersion(): string | null {
  try {
    if (typeof chrome === "undefined") return null;
    if (!chrome.runtime?.getManifest) return null;
    return chrome.runtime.getManifest().version || null;
  } catch {
    return null;
  }
}

const resolveSettings = (loaded: Settings | null): Settings => {
  return {
    ...DEFAULT_SETTINGS,
    ...loaded,
    titleExcludeFilters:
      loaded?.titleExcludeFilters ?? DEFAULT_SETTINGS.titleExcludeFilters,
  };
};

const adapter: SettingsAdapter = {
  capabilities: {
    showSavingIndicator: false,
  },
  getDefaultSettings: () => DEFAULT_SETTINGS,
  resolveSettings,
  loadSettings: async () => {
    if (typeof chrome === "undefined" || !chrome.storage?.sync) {
      return DEFAULT_SETTINGS;
    }

    const result = await chrome.storage.sync.get(STORAGE_KEY);
    return (result[STORAGE_KEY] as Settings | undefined) ?? null;
  },
  saveSettings: async (settings) => {
    if (typeof chrome === "undefined" || !chrome.storage?.sync) return;
    await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
  },
  getVersion: () => getExtensionVersion(),
};

export function Popup() {
  return (
    <SettingsContainer
      adapter={adapter}
      headerTitle="MeetCat Settings"
      headerIconSrc="/icons/icon48.png"
      appName="MeetCat"
    />
  );
}
